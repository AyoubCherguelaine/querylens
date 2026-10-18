"""Conservative PostgreSQL AST validation for source-scoped agent queries."""

import json
import time
from datetime import datetime, timezone

from pglast import parser

from backend.database.pool import readonly
from backend.services.analysis import encode_value

FUNCTIONS = set(
    """
count sum avg min max abs round ceil ceiling floor trunc power sqrt mod
lower upper length char_length trim btrim ltrim rtrim substring substr replace
concat concat_ws left right split_part strpos
coalesce nullif greatest least date_trunc date_part extract to_char to_date
now age make_date row_number rank dense_rank lag lead first_value last_value
ntile percent_rank cume_dist stddev stddev_pop stddev_samp variance var_pop var_samp
percentile_cont percentile_disc corr covar_pop covar_samp bool_and bool_or
string_agg array_agg unnest cardinality
""".split()
)
TYPES = set(
    """int2 int4 int8 smallint integer bigint numeric decimal float4 float8
real double precision text varchar bpchar char boolean bool date timestamp timestamptz
interval uuid time timetz""".split()
)
OPERATORS = set("= <> != < > <= >= + - * / % ^ ~~ ~~* !~~ !~~* ~ ~* !~ !~* ||".split())


def validate_sql(sql, definitions):
    if not isinstance(sql, str) or not sql.strip() or len(sql) > 20000:
        raise ValueError("Provide one SELECT query, up to 20,000 characters.")
    try:
        statements = json.loads(parser.parse_sql_json(sql))["stmts"]
    except (parser.ParseError, ValueError):
        raise ValueError("Invalid PostgreSQL SQL syntax.") from None
    if len(statements) != 1 or "SelectStmt" not in statements[0]["stmt"]:
        raise ValueError("Only one SELECT query is allowed.")
    allowed = {(d["schema"], d["table"]) for d in definitions}

    def names(parts):
        return [p.get("String", {}).get("sval", "") for p in parts]

    def visit(node, ctes=frozenset()):
        if isinstance(node, list):
            for value in node:
                visit(value, ctes)
        elif isinstance(node, dict):
            for kind, value in node.items():
                if kind == "SelectStmt":
                    if value.get("intoClause") or value.get("lockingClause"):
                        raise ValueError("SELECT INTO and row locking are not allowed.")
                    clause = value.get("withClause", {})
                    if clause.get("recursive"):
                        raise ValueError("Recursive CTEs are not supported.")
                    # A CTE sees outer CTEs and earlier siblings, never later ones.
                    visible = set(ctes)
                    for entry in clause.get("ctes", []):
                        visit(entry, frozenset(visible))
                        visible.add(entry["CommonTableExpr"]["ctename"])
                    for field, child in value.items():
                        if field != "withClause":
                            visit(child, frozenset(visible))
                    continue
                if kind.endswith("Stmt") and kind != "SelectStmt":
                    raise ValueError("Only SELECT statements are allowed, including in subqueries.")
                if kind == "RangeVar" and (
                    value.get("catalogname")
                    or (
                        (value.get("schemaname"), value.get("relname")) not in allowed
                        and not (not value.get("schemaname") and value.get("relname") in ctes)
                    )
                ):
                    raise ValueError(
                        "Use only fully schema-qualified tables listed by source_schema "
                        "or CTEs defined in this query."
                    )
                if kind == "FuncCall":
                    parts = names(value["funcname"])
                    if (
                        not (len(parts) == 1 or len(parts) == 2 and parts[0] == "pg_catalog")
                        or parts[-1] not in FUNCTIONS
                    ):
                        raise ValueError(
                            "Function is not in the supported analytics function allowlist."
                        )
                if kind in {"TypeName", "typeName"}:
                    parts = names(value.get("names", []))
                    if (
                        not parts
                        or parts[-1] not in TYPES
                        or (len(parts) > 1 and parts[:-1] != ["pg_catalog"])
                    ):
                        raise ValueError("Only built-in scalar analytics casts are allowed.")
                if kind == "A_Expr" and value.get("name"):
                    parts = names(value["name"])
                    if len(parts) != 1 or parts[0] not in OPERATORS:
                        raise ValueError("Unsupported SQL operator.")
                if kind in {"CollateClause", "RangeTableSample", "SQLValueFunction", "XmlExpr"}:
                    raise ValueError(f"Unsupported SQL construct: {kind}.")
                visit(value, ctes)

    visit(statements[0]["stmt"])
    return sql.strip().removesuffix(";")


async def query_source(pool, settings, definitions, sql):
    sql = validate_sql(sql, definitions)
    started = time.monotonic()
    async with readonly(pool, settings.query_timeout_ms) as connection:
        # Prevent unqualified function/operator resolution through source or public schemas.
        await connection.execute("SET LOCAL search_path = pg_catalog")
        statement = await connection.prepare(sql)
        attributes = statement.get_attributes()
        labels = [a.name for a in attributes]
        if len(labels) > 128:
            raise ValueError("Select at most 128 output columns.")
        if len(set(labels)) != len(labels):
            raise ValueError("Give every output column a unique alias.")
        # A cursor bounds fetching even for SELECT * or a query without LIMIT.
        cursor = await statement.cursor()
        records = await cursor.fetch(settings.max_result_rows + 1)
    clipped = False

    def cell(value):
        nonlocal clipped
        encoded = value.hex() if isinstance(value, bytes) else encode_value(value)
        text = encoded if isinstance(encoded, str) else json.dumps(encoded, default=str)
        if len(text) > 4000:
            clipped = True
            return text[:4000] + "… [cell truncated]"
        return encoded

    rows = [
        {key: cell(value) for key, value in r.items()} for r in records[: settings.max_result_rows]
    ]
    return {
        "sql": sql,
        "parameters": [],
        "rows": rows,
        "columns": [{"key": name, "label": name} for name in labels],
        "row_count": len(rows),
        "truncated": len(records) > settings.max_result_rows,
        "cells_truncated": clipped,
        "duration_ms": round((time.monotonic() - started) * 1000),
        "executed_at": datetime.now(timezone.utc).isoformat(),
    }
