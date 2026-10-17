"""Bounded, read-only file inspection. No uploaded DDL is executed in PostgreSQL."""

import csv
import hashlib
import io
import re
import sqlite3
import tempfile
import time
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

from backend.services.analysis import encode_value
from backend.services.compiler import quote


class ImportInvalid(ValueError):
    pass


def preview_value(value):
    if isinstance(value, bytes):
        return f"<{len(value)} bytes>"
    encoded = encode_value(value)
    return encoded[:300] + "…" if isinstance(encoded, str) and len(encoded) > 300 else encoded


def identifier(value: str, fallback="dataset") -> str:
    name = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    name = re.sub(r"[^a-z0-9]+", "_", name).strip("_") or fallback
    if (
        name[0].isdigit()
        or name.startswith("pg_")
        or name in {"chat_olap", "information_schema", "public"}
    ):
        name = "dataset_" + name
    return name[:48].rstrip("_")


@dataclass
class ImportTable:
    original_name: str
    name: str
    columns: list[dict]
    rows: list[tuple]
    primary_key: list[str] = field(default_factory=list)
    unique_keys: list[list[str]] = field(default_factory=list)
    foreign_keys: list[dict] = field(default_factory=list)

    def summary(self, samples=True):
        return {
            "original_name": self.original_name,
            "name": self.name,
            "columns": self.columns,
            "row_count": len(self.rows),
            "primary_key": self.primary_key,
            "unique_keys": self.unique_keys,
            "foreign_keys": self.foreign_keys,
            "sample_rows": [[preview_value(v) for v in row] for row in self.rows[:5]]
            if samples
            else [],
        }


@dataclass
class ParsedImport:
    filename: str
    kind: str
    schema_name: str
    tables: list[ImportTable]
    sha256: str
    warnings: list[str]

    def summary(self, samples=True):
        return {
            "filename": self.filename,
            "kind": self.kind,
            "suggested_schema": self.schema_name,
            "tables": [t.summary(samples) for t in self.tables],
            "sha256": self.sha256,
            "warnings": self.warnings,
        }


def infer_column(values, declared=""):
    present = [v for v in values if v is not None]
    declaration = declared.upper()
    if not present:
        if "INT" in declaration:
            kind = "int8"
        elif any(token in declaration for token in ("REAL", "FLOA", "DOUB", "NUM", "DEC")):
            kind = "numeric"
        elif declaration in {"BOOL", "BOOLEAN"}:
            kind = "bool"
        elif declaration == "DATE":
            kind = "date"
        elif declaration in {"TIMESTAMP", "DATETIME"}:
            kind = "timestamptz"
        elif declaration == "BLOB":
            kind = "bytea"
        else:
            kind = "text"
    elif any(isinstance(v, bytes) for v in present):
        if not all(isinstance(v, bytes) for v in present):
            raise ImportInvalid(
                "A column mixes binary and non-binary values; export it consistently first."
            )
        kind = "bytea"
    elif any(token in declaration for token in ("CHAR", "CLOB", "TEXT")):
        kind = "text"
    elif declaration in {"BOOL", "BOOLEAN"} and all(v in (0, 1) for v in present):
        kind = "bool"
    elif all(str(v).lower() in {"true", "false"} for v in present):
        kind = "bool"
    elif all(re.fullmatch(r"-?(?:0|[1-9][0-9]*)", str(v)) for v in present):
        kind = (
            "int8"
            if all(len(str(v).lstrip("-")) <= 19 and -(2**63) <= int(v) < 2**63 for v in present)
            else "numeric"
        )
    elif all(
        re.fullmatch(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?", str(v))
        for v in present
    ):
        try:
            if not all(
                Decimal(str(v)).is_finite() and abs(Decimal(str(v)).adjusted()) < 10000
                for v in present
            ):
                raise ImportInvalid("A number exceeds the supported numeric range.")
        except InvalidOperation as error:
            raise ImportInvalid("Invalid numeric value.") from error
        kind = "numeric"
    else:
        try:
            if all(
                re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(v)) and date.fromisoformat(str(v))
                for v in present
            ):
                kind = "date"
            elif all(
                re.match(r"\d{4}-\d{2}-\d{2}[T ]", str(v))
                and datetime.fromisoformat(str(v).replace("Z", "+00:00"))
                for v in present
            ):
                kind = "timestamptz"
            else:
                kind = "text"
        except ValueError:
            kind = "text"

    def convert(value):
        if value is None:
            return None
        if kind == "text":
            return str(value)
        if kind == "bool":
            return bool(value) if not isinstance(value, str) else value.lower() == "true"
        if kind == "int8":
            return int(value)
        if kind == "numeric":
            numeric = Decimal(str(value))
            if not numeric.is_finite() or abs(numeric.adjusted()) >= 10000:
                raise ImportInvalid("A number exceeds the supported numeric range.")
            return numeric
        if kind == "date":
            return date.fromisoformat(str(value))
        if kind == "timestamptz":
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed
        return value

    return kind, [convert(v) for v in values]


def typed_table(original, names, rows, nullable=None, declarations=None):
    normalized = [identifier(name, f"column_{i + 1}") for i, name in enumerate(names)]
    if len(set(normalized)) != len(names):
        raise ImportInvalid(
            f"Table {original}: column names collide after normalization. Rename the columns first."
        )
    columns, converted = [], []
    for i, name in enumerate(normalized):
        kind, values = infer_column(
            [row[i] for row in rows], declarations[i] if declarations else ""
        )
        columns.append(
            {
                "name": name,
                "original_name": names[i],
                "type": kind,
                "nullable": nullable[i] if nullable else True,
            }
        )
        converted.append(values)
    return ImportTable(
        original, identifier(original, "data"), columns, list(zip(*converted)) if rows else []
    )


def parse_csv(data, filename, settings):
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise ImportInvalid(
            "CSV must use UTF-8 encoding. Export it as UTF-8 and try again."
        ) from error
    if "\x00" in text:
        raise ImportInvalid("CSV contains NUL bytes; upload a valid text CSV.")
    try:
        dialect = csv.Sniffer().sniff(text[:65536], delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    reader = csv.reader(io.StringIO(text, newline=""), dialect, strict=True)
    try:
        headers = next(reader, None)
        if not headers or any(not h.strip() for h in headers):
            raise ImportInvalid("CSV requires a non-empty header for every column.")
        if len(headers) > settings.import_max_columns:
            raise ImportInvalid(
                f"At most {settings.import_max_columns} columns are supported per table."
            )
        rows = []
        for line, row in enumerate(reader, 2):
            if not row:
                continue
            if len(row) != len(headers):
                raise ImportInvalid(
                    f"CSV row {line} has {len(row)} cells; expected {len(headers)}."
                )
            if len(rows) >= settings.import_max_rows:
                raise ImportInvalid(f"Import exceeds the {settings.import_max_rows} row limit.")
            rows.append(tuple(None if value == "" else value for value in row))
    except csv.Error as error:
        raise ImportInvalid("CSV is malformed or contains an oversized cell.") from error
    table = typed_table("data", headers, rows)
    return [table], [
        "Types are inferred from all rows. Empty CSV cells become NULL; text identifiers with leading zeros remain text.",
        "Dates use ISO formats. Timestamps without a time zone are interpreted as UTC. No business keys are guessed.",
    ]


def parse_sqlite(data, settings):
    if not data.startswith(b"SQLite format 3\x00"):
        raise ImportInvalid(
            "This file is not a SQLite database. Upload the database file, not a SQL dump."
        )
    with tempfile.TemporaryDirectory(prefix="chat_olap_sqlite_") as directory:
        path = Path(directory) / "upload.sqlite"
        path.write_bytes(data)
        connection = sqlite3.connect(path.as_uri() + "?mode=ro&immutable=1", uri=True)
        connection.row_factory = sqlite3.Row
        deadline = time.monotonic() + 15
        connection.set_progress_handler(lambda: int(time.monotonic() > deadline), 10000)
        connection.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, 1024 * 1024)
        connection.setlimit(sqlite3.SQLITE_LIMIT_COLUMN, settings.import_max_columns)
        try:
            connection.execute("PRAGMA query_only=ON")
            connection.execute("PRAGMA trusted_schema=OFF")
            objects = connection.execute(
                "SELECT name,type,sql FROM sqlite_schema WHERE substr(name,1,7) != 'sqlite_' ORDER BY name"
            ).fetchall()
            if any(
                row["type"] == "table"
                and re.search(r"CREATE\s+VIRTUAL\s+TABLE", row["sql"] or "", re.I)
                for row in objects
            ):
                raise ImportInvalid(
                    "SQLite virtual tables are unsupported. Export ordinary tables to a new SQLite database first."
                )
            names = [row["name"] for row in objects if row["type"] == "table"]
            if not names:
                raise ImportInvalid("SQLite database contains no ordinary tables.")
            if len(names) > settings.import_max_tables:
                raise ImportInvalid(f"At most {settings.import_max_tables} tables are supported.")
            if len({identifier(n) for n in names}) != len(names):
                raise ImportInvalid(
                    "SQLite table names collide after normalization. Rename them first."
                )
            tables, total_rows = [], 0
            for name in names:
                info = connection.execute(f"PRAGMA table_xinfo({quote(name)})").fetchall()
                if not info or any(row["hidden"] for row in info):
                    raise ImportInvalid(
                        f"Table {name} contains generated or hidden columns. Materialize them in an ordinary table first."
                    )
                if len(info) > settings.import_max_columns:
                    raise ImportInvalid(
                        f"At most {settings.import_max_columns} columns are supported per table."
                    )
                columns = [row["name"] for row in info]
                cursor = connection.execute(
                    f"SELECT {', '.join(quote(c) for c in columns)} FROM {quote(name)}"
                )
                rows = [
                    tuple(row)
                    for row in cursor.fetchmany(settings.import_max_rows - total_rows + 1)
                ]
                total_rows += len(rows)
                if total_rows > settings.import_max_rows:
                    raise ImportInvalid(
                        f"Import exceeds the {settings.import_max_rows} total row limit."
                    )
                table = typed_table(
                    name,
                    columns,
                    rows,
                    [not row["notnull"] for row in info],
                    [row["type"] for row in info],
                )
                table.primary_key = [
                    identifier(row["name"])
                    for row in sorted(info, key=lambda r: r["pk"])
                    if row["pk"]
                ]
                indexes = connection.execute(f"PRAGMA index_list({quote(name)})").fetchall()
                for index in indexes:
                    if not index["unique"] or index["partial"] or index["origin"] == "pk":
                        continue
                    fields = connection.execute(
                        f"PRAGMA index_info({quote(index['name'])})"
                    ).fetchall()
                    if all(f["name"] is not None for f in fields):
                        table.unique_keys.append([identifier(f["name"]) for f in fields])
                foreign = connection.execute(f"PRAGMA foreign_key_list({quote(name)})").fetchall()
                for key_id in sorted({key["id"] for key in foreign}):
                    parts = sorted(
                        [key for key in foreign if key["id"] == key_id], key=lambda k: k["seq"]
                    )
                    table.foreign_keys.append(
                        {
                            "columns": [identifier(k["from"]) for k in parts],
                            "target_table": identifier(parts[0]["table"]),
                            "target_columns": [
                                identifier(k["to"]) if k["to"] else None for k in parts
                            ],
                            "on_update": parts[0]["on_update"],
                            "on_delete": parts[0]["on_delete"],
                        }
                    )
                tables.append(table)
            return tables, [
                "Imports stored values, primary keys, ordinary unique constraints and foreign keys. Views, triggers, defaults, CHECK constraints, collations and non-unique or partial/expression indexes are not copied.",
                "SQLite dynamic types are inferred from stored values; inconsistent PostgreSQL constraints cause a complete rollback.",
                "Upload a closed/checkpointed database: separate WAL files are not imported.",
            ]
        except sqlite3.Error as error:
            raise ImportInvalid(
                "SQLite inspection failed. The file may be corrupt, locked, too complex, or contain oversized values."
            ) from error
        finally:
            connection.close()


def parse_file(data: bytes, filename: str, settings) -> ParsedImport:
    filename = filename.replace("\\", "/").split("/")[-1][:200]
    suffix = Path(filename).suffix.lower()
    if not data:
        raise ImportInvalid("The uploaded file is empty.")
    if len(data) > settings.upload_max_bytes:
        raise ImportInvalid("The uploaded file exceeds the configured size limit.")
    if suffix == ".csv":
        tables, warnings = parse_csv(data, filename, settings)
        kind = "csv"
    elif suffix in {".db", ".sqlite", ".sqlite3"}:
        tables, warnings = parse_sqlite(data, settings)
        kind = "sqlite"
    else:
        raise ImportInvalid("Upload a .csv, .db, .sqlite or .sqlite3 file.")
    return ParsedImport(
        filename,
        kind,
        identifier(Path(filename).stem),
        tables,
        hashlib.sha256(data).hexdigest(),
        warnings,
    )
