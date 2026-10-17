"""Read PostgreSQL metadata and build relationship-aware analytical models."""

from collections import defaultdict

from backend.database.pool import readonly
from backend.services.semantic import (  # re-exported for compiler and legacy callers
    NUMERIC,
    SUPPORTED,
    TEMPORAL,
    TEXT,
    build_cube,
    model_schema,
)

__all__ = ["NUMERIC", "SUPPORTED", "TEMPORAL", "TEXT", "build_cube", "discover"]


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
               GREATEST(c.reltuples, 0)::bigint AS estimated_rows,
               col_description(c.oid,a.attnum) AS description,
               obj_description(c.oid,'pg_class') AS table_description,
               s.null_frac AS null_fraction, s.n_distinct AS distinct_estimate
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_attribute a ON a.attrelid=c.oid
        JOIN pg_type t ON t.oid=a.atttypid
        LEFT JOIN pg_stats s ON s.schemaname=n.nspname AND s.tablename=c.relname
                            AND s.attname=a.attname AND NOT s.inherited
        WHERE n.nspname=ANY($1::text[]) AND c.relkind IN ('r','p')
          AND NOT c.relispartition AND a.attnum>0 AND NOT a.attisdropped
          AND has_table_privilege(c.oid, 'SELECT')
        ORDER BY n.nspname, c.relname, a.attnum
    """,
        schemas,
    )
    constraints = await connection.fetch(
        """
        SELECT n.nspname AS schema, c.relname AS table, k.conname AS name,
               k.contype::text AS kind, k.convalidated AS validated,
               ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY x(num,ord)
                     JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=x.num ORDER BY x.ord) AS columns,
               tn.nspname AS target_schema, tc.relname AS target_table,
               ARRAY(SELECT a.attname::text FROM unnest(k.confkey) WITH ORDINALITY x(num,ord)
                     JOIN pg_attribute a ON a.attrelid=tc.oid AND a.attnum=x.num ORDER BY x.ord) AS target_columns
        FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
        LEFT JOIN pg_class tc ON tc.oid=k.confrelid
        LEFT JOIN pg_namespace tn ON tn.oid=tc.relnamespace
        WHERE n.nspname=ANY($1::text[]) AND k.contype IN ('p','u','f')
          AND has_table_privilege(c.oid, 'SELECT')
        ORDER BY n.nspname,c.relname,k.conname
        """,
        schemas,
    )
    tables = defaultdict(list)
    for row in rows:
        tables[(row["schema"], row["table"])].append(dict(row))
    return model_schema(tables, [dict(row) for row in constraints])
