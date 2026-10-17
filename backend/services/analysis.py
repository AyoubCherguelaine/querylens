import logging
import time
from datetime import datetime, timezone

from fastapi.encoders import jsonable_encoder

from backend.database.pool import readonly
from backend.services.catalog import discover
from backend.services.compiler import compile_plan

logger = logging.getLogger(__name__)


def encode_value(value):
    # Preserve decimal precision; JSON floats can silently round financial amounts.
    import math
    from decimal import Decimal

    if isinstance(value, int) and abs(value) > 9007199254740991:
        return str(value)
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    if isinstance(value, Decimal):
        return str(value)
    return jsonable_encoder(value)


async def execute_plan(pool, settings, cube, plan):
    started = time.monotonic()
    # Detect stale schemas and reject old definitions instead of querying guessed fields.
    live = await discover(pool, settings, schemas=[cube["schema"]])
    fresh = next(
        (c for c in live if c["schema"] == cube["schema"] and c["table"] == cube["table"]), None
    )
    if fresh is None or (
        cube.get("model_version") != fresh.get("model_version")
        or fresh.get("schema_signature") != cube.get("schema_signature")
        or fresh["fields"] != cube["fields"]
        or fresh["measures"] != cube["measures"]
        or fresh.get("joins") != cube.get("joins")
    ):
        raise ValueError("Source schema changed. Rediscover cubes before running this analysis.")
    sql, parameters, limit = compile_plan(cube, plan, settings.max_result_rows)
    async with readonly(pool, settings.query_timeout_ms) as connection:
        records = await connection.fetch(sql, *parameters)
    truncated = len(records) > limit
    rows = [
        {key: encode_value(value) for key, value in record.items()} for record in records[:limit]
    ]
    columns = [
        {"key": f"g{i}", "label": group.field + (f" ({group.grain})" if group.grain else "")}
        for i, group in enumerate(plan.groups)
    ]
    measure_labels = {(m["field"], m["aggregation"]): m.get("label") for m in cube["measures"]}
    columns += [
        {
            "key": f"m{i}",
            "label": measure_labels.get((metric.field, metric.aggregation))
            or f"{metric.aggregation}({metric.field or '*'})",
        }
        for i, metric in enumerate(plan.metrics)
    ]
    answer = (
        "No matching groups were found."
        if not rows
        else f"Returned {len(rows)} {'groups' if plan.groups else 'aggregate row'} from {cube['schema']}.{cube['table']}."
    )
    if not plan.groups and rows and all(v is None or v == 0 for v in rows[0].values()):
        answer += " Zero counts and NULL aggregates may indicate no matching records."
    if truncated:
        answer += f" Showing the first {limit} groups; this is not the complete result."
    elapsed = round((time.monotonic() - started) * 1000)
    logger.info("analysis.executed", extra={"duration_ms": elapsed, "row_count": len(rows)})
    return {
        "status": "answered",
        "answer": answer,
        "rows": rows,
        "columns": columns,
        "sql": sql,
        "parameters": parameters,
        "plan": plan.model_dump(),
        "truncated": truncated,
        "row_count": len(rows),
        "duration_ms": elapsed,
        "executed_at": datetime.now(timezone.utc).isoformat(),
        "warnings": cube["warnings"],
    }


async def profile_cube(pool, settings, cube):
    from backend.services.compiler import quote

    # No row samples are sent to an LLM. This is an exact, timeout-bounded scan.
    fields = [f for f in cube["fields"] if not f.get("source_alias")][:64]
    expressions = ["count(*) AS total_rows"]
    for index, field in enumerate(fields):
        column = quote(field["name"])
        expressions += [
            f'count(*) - count({column}) AS "n{index}"',
            f'count(DISTINCT {column}) AS "d{index}"',
        ]
    sql = f"SELECT {', '.join(expressions)} FROM {quote(cube['schema'])}.{quote(cube['table'])}"
    async with readonly(pool, settings.query_timeout_ms) as connection:
        record = await connection.fetchrow(sql)
    return {
        "status": "answered",
        "answer": f"Profiled {record['total_rows']} source rows. Distinct counts exclude NULL. Up to 64 fields are profiled.",
        "columns": [
            {"key": "field", "label": "Field"},
            {"key": "null_count", "label": "NULL rows"},
            {"key": "distinct_count", "label": "Distinct values"},
        ],
        "rows": [
            {
                "field": field["name"],
                "null_count": record[f"n{i}"],
                "distinct_count": record[f"d{i}"],
            }
            for i, field in enumerate(fields)
        ],
        "sql": sql,
        "parameters": [],
        "executed_at": datetime.now(timezone.utc).isoformat(),
        "warnings": [
            "Exact profile scan; PostgreSQL statement timeout applies. Distinct counts may be expensive on large tables."
        ],
    }
