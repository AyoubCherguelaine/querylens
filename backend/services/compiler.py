"""Compile a closed query language. Model output is never treated as SQL."""

from backend.schemas import Plan
from backend.services.catalog import TEMPORAL, TEXT


def quote(name):
    return '"' + name.replace('"', '""') + '"'


def compile_plan(cube: dict, plan: Plan, max_rows: int = 200):
    if plan.clarification:
        raise ValueError("The plan requires clarification")
    fields = {f["name"]: f for f in cube["fields"]}

    joins = cube.get("joins", [])
    used_aliases = set()

    def field(name):
        if name not in fields:
            raise ValueError(f"Unknown field: {name}")
        metadata = fields[name]
        alias = metadata.get("source_alias", "t0")
        used_aliases.add(alias)
        column = quote(metadata.get("source_column", name))
        return f"{quote(alias)}.{column}" if joins else column

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
            candidate = next(
                (m for m in cube["measures"] if m["field"] == name and m["aggregation"] == op), None
            )
            if candidate and candidate.get("recipe"):
                recipe = candidate["recipe"]
                if recipe["operation"] != "product" or len(recipe["fields"]) != 2:
                    raise ValueError("Unsupported calculated measure")
                column = "(" + " * ".join(f"({field(f)})::numeric" for f in recipe["fields"]) + ")"
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
    if joins:
        sql += ' AS "t0"'
        # Include ancestors of requested dimensions, but skip unrelated paths.
        for join in reversed(joins):
            if join["alias"] in used_aliases:
                used_aliases.add(join["source_alias"])
        for join in joins:
            if join["alias"] not in used_aliases:
                continue
            if join["cardinality"] != "many_to_one":
                raise ValueError("Only validated to-one joins preserve the cube grain")
            conditions = [
                f"{quote(join['source_alias'])}.{quote(source)} = {quote(join['alias'])}.{quote(target)}"
                for source, target in zip(join["columns"], join["target_columns"], strict=True)
            ]
            sql += (
                f" LEFT JOIN {quote(join['schema'])}.{quote(join['table'])} AS {quote(join['alias'])} ON "
                + " AND ".join(conditions)
            )
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
