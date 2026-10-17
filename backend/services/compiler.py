"""Compile a closed query language. Model output is never treated as SQL."""

from backend.schemas import Plan
from backend.services.catalog import TEMPORAL, TEXT


def quote(name):
    return '"' + name.replace('"', '""') + '"'


def compile_plan(cube: dict, plan: Plan, max_rows: int = 200):
    if plan.clarification:
        raise ValueError("The plan requires clarification")
    fields = {f["name"]: f for f in cube["fields"]}

    def field(name):
        if name not in fields:
            raise ValueError(f"Unknown field: {name}")
        return quote(name)

    if not plan.metrics:
        raise ValueError("Select at least one measure")
    selects, groups, parameters, predicates = [], [], [], []
    for i, group in enumerate(plan.groups):
        expression = field(group.field)
        if group.grain:
            if fields[group.field]["type"] not in TEMPORAL:
                raise ValueError("Time grain requires a date or timestamp")
            expression = f"date_trunc('{group.grain}', {expression})"
        groups.append(expression)
        selects.append(f'{expression} AS "g{i}"')
    candidates = {(m["field"], m["aggregation"]) for m in cube["measures"]}
    for i, metric in enumerate(plan.metrics):
        op, name = metric.aggregation, metric.field
        if name is None:
            if op != "count":
                raise ValueError("Only row count can omit a field")
            expression = "count(*)"
        else:
            column = field(name)
            if op in {"sum", "avg", "min", "max"} and (name, op) not in candidates:
                raise ValueError("Measure is not an approved cube candidate")
            expression = (
                f"count(DISTINCT {column})" if op == "count_distinct" else f"{op}({column})"
            )
        selects.append(f'{expression} AS "m{i}"')
    operators = {"eq": "=", "ne": "<>", "gt": ">", "gte": ">=", "lt": "<", "lte": "<="}
    for condition in plan.filters:
        column = field(condition.field)
        if condition.operator in {"is_null", "is_not_null"}:
            predicates.append(
                column + (" IS NULL" if condition.operator == "is_null" else " IS NOT NULL")
            )
            continue
        if condition.value is None:
            raise ValueError("Filter value is required; use is_null for NULL")
        kind = fields[condition.field]["type"]
        if condition.operator == "contains":
            if kind not in TEXT:
                raise ValueError("Contains requires a text field")
            parameters.append(
                condition.value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            )
            predicates.append(
                f"{column} ILIKE '%' || ${len(parameters)}::text || '%' ESCAPE E'\\\\'"
            )
        else:
            parameters.append(condition.value)
            # Text parameters explicitly cast by PostgreSQL; asyncpg receives strings only.
            predicates.append(
                f"{column} {operators[condition.operator]} ${len(parameters)}::text::{kind}"
            )
    sql = f"SELECT {', '.join(selects)} FROM {quote(cube['schema'])}.{quote(cube['table'])}"
    if predicates:
        sql += " WHERE " + " AND ".join(predicates)
    if groups:
        sql += " GROUP BY " + ", ".join(groups)
    aliases = [f"g{i}" for i in range(len(groups))] + [f"m{i}" for i in range(len(plan.metrics))]
    if plan.order_by and plan.order_by not in aliases:
        raise ValueError("Unknown sort field")
    order = plan.order_by or ("g0" if groups else "m0")
    sql += f" ORDER BY {quote(order)} {'DESC' if plan.descending else 'ASC'} NULLS LAST"
    # Secondary group order stabilizes ties for grouped queries.
    for alias in aliases[: len(groups)]:
        if alias != order:
            sql += f", {quote(alias)} ASC NULLS LAST"
    limit = min(plan.limit, max_rows)
    sql += f" LIMIT {limit + 1}"
    return sql, parameters, limit
