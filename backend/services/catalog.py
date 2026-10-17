from collections import defaultdict

from backend.database.pool import readonly

NUMERIC = {"int2", "int4", "int8", "numeric", "float4", "float8"}
TEMPORAL = {"date", "timestamp", "timestamptz"}
TEXT = {"text", "varchar", "bpchar", "name"}
SUPPORTED = NUMERIC | TEMPORAL | TEXT | {"bool", "uuid"}


async def discover(pool, settings, schemas=None, connection=None):
    if connection is None:
        async with readonly(pool, settings.query_timeout_ms) as connection:
            return await discover(pool, settings, schemas, connection)
    return await _discover(
        connection, schemas if schemas is not None else settings.analytics_schemas
    )


async def _discover(connection, schemas):
    rows = await connection.fetch(
        """
        SELECT n.nspname AS schema, c.relname AS table, a.attname AS name,
               t.typname AS type, NOT a.attnotnull AS nullable,
               EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid=c.oid
                       AND k.contype IN ('p','f','u') AND a.attnum=ANY(k.conkey)) AS key,
               GREATEST(c.reltuples, 0)::bigint AS estimated_rows
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_attribute a ON a.attrelid=c.oid
        JOIN pg_type t ON t.oid=a.atttypid
        WHERE n.nspname=ANY($1::text[]) AND c.relkind IN ('r','p')
          AND NOT c.relispartition AND a.attnum>0 AND NOT a.attisdropped
          AND has_table_privilege(c.oid, 'SELECT')
        ORDER BY n.nspname, c.relname, a.attnum
    """,
        schemas,
    )
    tables = defaultdict(list)
    for row in rows:
        tables[(row["schema"], row["table"])].append(dict(row))
    return [build_cube(schema, table, columns) for (schema, table), columns in tables.items()]


def build_cube(schema, table, columns):
    fields = [
        {"name": c["name"], "type": c["type"], "nullable": c["nullable"], "key": c["key"]}
        for c in columns
        if c["type"] in SUPPORTED
    ]
    return {
        "name": table.replace("_", " ").title(),
        "schema": schema,
        "table": table,
        "grain": f"One row of {schema}.{table}",
        "fields": fields,
        "dimensions": [
            c["name"]
            for c in fields
            if c["type"] not in NUMERIC or c["key"] or c["name"].endswith("_id")
        ],
        "measures": [{"field": None, "aggregation": "count"}]
        + [
            {"field": c["name"], "aggregation": op}
            for c in fields
            if c["type"] in NUMERIC
            and not c["key"]
            and c["name"] != "id"
            and not c["name"].endswith("_id")
            for op in ("sum", "avg", "min", "max")
        ],
        "estimated_rows": columns[0].get("estimated_rows", 0) if columns else 0,
        "warnings": [
            "Numeric aggregates are candidates, not verified business metrics. Review units and additivity.",
            "Single-table grain. Joins and cross-table measures are not inferred.",
            "Row estimate comes from PostgreSQL statistics and may be stale.",
        ],
    }
