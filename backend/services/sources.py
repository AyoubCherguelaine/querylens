"""Source registry, transactional imports, and scoped cube discovery."""

import logging
from uuid import uuid4

from backend.services.catalog import discover
from backend.services.compiler import quote
from backend.services.import_parser import ImportInvalid, identifier

logger = logging.getLogger(__name__)


async def save_cubes(connection, user_id, source_id, definitions):
    for definition in definitions:
        await connection.execute(
            """INSERT INTO chat_olap.cubes(id,owner_id,source_id,source_schema,source_table,definition)
            VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(owner_id,source_schema,source_table)
            DO UPDATE SET definition=excluded.definition,source_id=excluded.source_id,updated_at=now()""",
            uuid4(),
            user_id,
            source_id,
            definition["schema"],
            definition["table"],
            definition,
        )


async def available_definitions(request):
    definitions = await discover(request.app.state.analytics, request.app.state.settings)
    async with request.app.state.db.acquire() as connection:
        reserved = {
            row["schema_name"]
            for row in await connection.fetch(
                "SELECT schema_name FROM chat_olap.sources WHERE kind IN ('csv','sqlite')"
            )
        }
    return [d for d in definitions if d["schema"] not in reserved]


async def connect_existing(request, user_id, schema_name):
    settings = request.app.state.settings
    if schema_name not in settings.analytics_schemas:
        raise ImportInvalid("This existing schema is not in the configured analytics allowlist.")
    definitions = [d for d in await available_definitions(request) if d["schema"] == schema_name]
    if not definitions:
        raise ImportInvalid("No accessible ordinary tables were found in this schema.")
    async with request.app.state.db.acquire() as connection:
        async with connection.transaction():
            source = await connection.fetchrow(
                """INSERT INTO chat_olap.sources(id,owner_id,name,schema_name,kind)
                VALUES($1,$2,$3,$3,'existing') ON CONFLICT(owner_id,schema_name)
                DO UPDATE SET name=chat_olap.sources.name RETURNING *""",
                uuid4(),
                user_id,
                schema_name,
            )
            if source["kind"] != "existing":
                raise ImportInvalid("This schema is already a private imported source.")
            await save_cubes(connection, user_id, source["id"], definitions)
    return dict(source)


async def import_dataset(
    pool, settings, user_id, parsed, schema_name, selected_tables, csv_table_name
):
    chosen = (
        parsed.tables
        if selected_tables is None
        else [t for t in parsed.tables if t.original_name in selected_tables]
    )
    if selected_tables is not None and (
        not selected_tables
        or len(set(selected_tables)) != len(selected_tables)
        or set(selected_tables) != {t.original_name for t in chosen}
    ):
        raise ImportInvalid("Select one or more valid tables from the preview.")
    if parsed.kind == "csv" and csv_table_name:
        chosen[0].name = identifier(csv_table_name, "data")
    selected_names = {t.name: t for t in chosen}
    for table in chosen:
        for foreign in table.foreign_keys:
            parent = selected_names.get(foreign["target_table"])
            if parent is None:
                raise ImportInvalid(
                    f"Table {table.original_name} references {foreign['target_table']}; select the referenced table too."
                )
            if any(name is None for name in foreign["target_columns"]):
                foreign["target_columns"] = parent.primary_key
            if not foreign["target_columns"] or len(foreign["columns"]) != len(
                foreign["target_columns"]
            ):
                raise ImportInvalid("A foreign key has an unresolved referenced key.")
    base = identifier(schema_name or parsed.schema_name)
    async with pool.acquire() as connection:
        async with connection.transaction():
            await connection.execute(
                "SELECT set_config('statement_timeout',$1,true)", str(settings.import_timeout_ms)
            )
            await connection.execute("SET LOCAL lock_timeout='5s'")
            # Serialize schema allocation to prevent simultaneous uploads choosing the same name.
            await connection.execute("SELECT pg_advisory_xact_lock(73012892)")
            count = await connection.fetchval(
                "SELECT count(*) FROM chat_olap.sources WHERE owner_id=$1 AND kind IN ('csv','sqlite')",
                user_id,
            )
            if count >= settings.max_imported_sources:
                raise ImportInvalid(
                    f"This account has reached the {settings.max_imported_sources} imported-source limit."
                )
            schema, suffix = base, 1
            while schema in settings.analytics_schemas or await connection.fetchval(
                "SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1) OR EXISTS(SELECT 1 FROM chat_olap.sources WHERE schema_name=$1)",
                schema,
            ):
                suffix += 1
                schema = f"{base}_{suffix}"
            await connection.execute(f"CREATE SCHEMA {quote(schema)}")
            for table in chosen:
                columns = [
                    f"{quote(c['name'])} {c['type']}{' NOT NULL' if not c['nullable'] else ''}"
                    for c in table.columns
                ]
                if table.primary_key:
                    columns.append(
                        "PRIMARY KEY (" + ", ".join(quote(c) for c in table.primary_key) + ")"
                    )
                columns += [
                    "UNIQUE (" + ", ".join(quote(c) for c in key) + ")" for key in table.unique_keys
                ]
                await connection.execute(
                    f"CREATE TABLE {quote(schema)}.{quote(table.name)} ({', '.join(columns)})"
                )
                if table.rows:
                    await connection.copy_records_to_table(
                        table.name,
                        schema_name=schema,
                        columns=[c["name"] for c in table.columns],
                        records=table.rows,
                        timeout=settings.import_timeout_ms / 1000,
                    )
            actions = {"NO ACTION", "RESTRICT", "CASCADE", "SET NULL", "SET DEFAULT"}
            for table in chosen:
                for foreign in table.foreign_keys:
                    if foreign["on_update"] not in actions or foreign["on_delete"] not in actions:
                        raise ImportInvalid("Unsupported foreign-key action.")
                    # DEFAULT expressions are not migrated, so SET DEFAULT cannot be faithfully preserved.
                    if "SET DEFAULT" in (foreign["on_update"], foreign["on_delete"]):
                        raise ImportInvalid(
                            "SET DEFAULT foreign keys require default expressions; export with a supported referential action first."
                        )
                    await connection.execute(
                        f"ALTER TABLE {quote(schema)}.{quote(table.name)} ADD FOREIGN KEY "
                        f"({', '.join(quote(c) for c in foreign['columns'])}) REFERENCES "
                        f"{quote(schema)}.{quote(foreign['target_table'])} ({', '.join(quote(c) for c in foreign['target_columns'])}) "
                        f"ON UPDATE {foreign['on_update']} ON DELETE {foreign['on_delete']} DEFERRABLE INITIALLY DEFERRED"
                    )
                await connection.execute(f"ANALYZE {quote(schema)}.{quote(table.name)}")
            manifest = {
                "tables": [t.summary(samples=False) for t in chosen],
                "warnings": parsed.warnings,
            }
            source = await connection.fetchrow(
                """INSERT INTO chat_olap.sources(id,owner_id,name,schema_name,kind,filename,file_sha256,manifest)
                VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *""",
                uuid4(),
                user_id,
                parsed.schema_name.replace("_", " ").title(),
                schema,
                parsed.kind,
                parsed.filename,
                parsed.sha256,
                manifest,
            )
            definitions = await discover(pool, settings, schemas=[schema], connection=connection)
            await save_cubes(connection, user_id, source["id"], definitions)
    logger.info("source.imported", extra={"row_count": sum(len(t.rows) for t in chosen)})
    return dict(source)
