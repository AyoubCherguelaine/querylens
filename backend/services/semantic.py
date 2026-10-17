"""Evidence-based semantic modeling. No SQL or business rules are supplied by a model."""

import hashlib
import json
import re

NUMERIC = {"int2", "int4", "int8", "numeric", "float4", "float8"}
TEMPORAL = {"date", "timestamp", "timestamptz"}
TEXT = {"text", "varchar", "bpchar", "name"}
SUPPORTED = NUMERIC | TEMPORAL | TEXT | {"bool", "uuid"}


def label(name):
    return name.replace("_", " ").title()


def role(column):
    tokens = set(re.split(r"[_\W]+", column["name"].lower()))
    if column["key"] or tokens & {"id", "code", "zip", "postal", "phone", "year"}:
        return "identifier"
    if column["type"] in TEMPORAL:
        return "time"
    if column["type"] not in NUMERIC:
        return "dimension"
    if tokens & {"balance", "stock", "inventory", "headcount"}:
        return "snapshot"
    if tokens & {
        "price",
        "rate",
        "ratio",
        "percent",
        "percentage",
        "pct",
        "score",
        "latitude",
        "longitude",
        "age",
    }:
        return "non_additive"
    if tokens & {
        "amount",
        "revenue",
        "sales",
        "cost",
        "profit",
        "quantity",
        "qty",
        "units",
        "total",
        "subtotal",
        "fee",
        "tax",
        "discount",
        "duration",
        "hours",
    }:
        return "additive_candidate"
    return "numeric_attribute"


def build_cube(schema, table, columns, primary_key=None):
    fields = [
        {
            "name": c["name"],
            "type": c["type"],
            "nullable": c["nullable"],
            "key": c["key"],
            "role": role(c),
            "description": c.get("description") or "",
        }
        for c in columns
        if c["type"] in SUPPORTED
    ]
    measures = [
        {
            "field": None,
            "aggregation": "count",
            "label": f"{label(table)} Count",
            "description": "Number of records at the cube's base grain.",
            "additivity": "additive",
        }
    ]
    for field in fields:
        if field["type"] not in NUMERIC or field["role"] == "identifier":
            continue
        ops = (
            ("sum", "avg", "min", "max")
            if field["role"] == "additive_candidate"
            else ("avg", "min", "max")
        )
        for op in ops:
            measures.append(
                {
                    "field": field["name"],
                    "aggregation": op,
                    "label": f"{label(field['name'])} ({op})",
                    "description": field["description"]
                    or f"{op} of {field['name']} at the base grain.",
                    "additivity": field["role"],
                }
            )
    keys = primary_key or []
    grain = f"One record in {schema}.{table}"
    if keys:
        grain += f", uniquely identified by ({', '.join(keys)})"
    return {
        "name": label(table),
        "schema": schema,
        "table": table,
        "grain": grain,
        "fields": fields,
        "dimensions": [
            f["name"] for f in fields if f["role"] in {"identifier", "dimension", "time"}
        ],
        "measures": measures,
        "estimated_rows": columns[0].get("estimated_rows", 0) if columns else 0,
        "warnings": [
            "Business labels and additivity are inferred candidates; validate units, currencies, and accounting definitions.",
            "Row estimates and column statistics come from PostgreSQL statistics and may be stale.",
        ],
    }


def model_schema(tables, constraints):
    """Follow only declared, validated to-one FKs; never reverse a one-to-many edge."""
    primary = {}
    outgoing = {key: [] for key in tables}
    incoming = {key: [] for key in tables}
    for constraint in constraints:
        key = (constraint["schema"], constraint["table"])
        if key not in tables:
            continue
        if constraint["kind"] in {"p", "u"}:
            if constraint["kind"] == "p":
                primary[key] = constraint["columns"]
        elif constraint["kind"] == "f":
            target = (constraint["target_schema"], constraint["target_table"])
            # Both sides must be accessible and in this source; never cross an ownership scope.
            if target in tables and constraint["validated"]:
                outgoing[key].append(constraint)
                incoming[target].append(constraint)

    cubes = []
    for base, columns in tables.items():
        cube = build_cube(*base, columns, primary.get(base))
        fact_fields = [f for f in cube["fields"] if f["role"] == "additive_candidate"]
        snapshots = [f for f in cube["fields"] if f["role"] == "snapshot"]
        key_fields = {c for fk in outgoing[base] for c in fk["columns"]}
        if snapshots:
            kind, reason = (
                "snapshot",
                "Balance or inventory fields require an explicit time aggregation policy.",
            )
        elif fact_fields:
            kind, reason = (
                "fact",
                "Contains candidate event measures; related entities provide descriptive dimensions.",
            )
        elif len(outgoing[base]) >= 2 and set(primary.get(base, [])) == key_fields and key_fields:
            kind, reason = (
                "bridge",
                "Composite key connects entities; counts describe relationships, not either entity.",
            )
        else:
            kind, reason = (
                "entity",
                "Describes an entity; use record and distinct counts rather than summing numeric attributes.",
            )
        cube.update(
            model_version=2,
            kind=kind,
            description=columns[0].get("table_description") or reason,
            classification_reason=reason,
            primary_key=primary.get(base, []),
            joins=[],
            relationships=outgoing[base],
            time_dimensions=[f["name"] for f in cube["fields"] if f["role"] == "time"],
        )
        base_fields = {f["name"]: f for f in cube["fields"]}
        quantities = [
            n
            for n, f in base_fields.items()
            if n in {"quantity", "qty", "units"} and f["role"] == "additive_candidate"
        ]
        if (
            len(quantities) == 1
            and "unit_price" in base_fields
            and base_fields["unit_price"]["type"] in NUMERIC
        ):
            metric_name = "__extended_amount"
            if metric_name not in base_fields:
                cube["measures"].append(
                    {
                        "field": metric_name,
                        "aggregation": "sum",
                        "label": "Extended Line Amount",
                        "recipe": {"operation": "product", "fields": [quantities[0], "unit_price"]},
                        "description": f"Sum of {quantities[0]} × unit_price before discounts, tax, returns or currency conversion. Assumes unit_price applies to each quantity unit.",
                        "additivity": "additive_candidate",
                    }
                )
                cube["warnings"].append(
                    "Extended line amount is a candidate formula, not net revenue; confirm quantity units and price meaning."
                )
        cube["column_statistics"] = [
            {
                "field": c["name"],
                "null_fraction": c.get("null_fraction"),
                "distinct_estimate": c.get("distinct_estimate"),
            }
            for c in columns
        ]
        if not primary.get(base):
            cube["warnings"].append(
                "No declared primary key: business grain and record uniqueness need review."
            )
        if not outgoing[base]:
            cube["warnings"].append(
                "No accessible, validated outgoing foreign keys; related dimensions require declared relationships."
            )
        if incoming[base]:
            cube["warnings"].append(
                "Child collections are not joined into this grain; aggregate them separately to avoid double counting."
            )
        if snapshots:
            cube["warnings"].append(
                "Snapshot balances are not summed: choose an as-of date and review aggregation across entities."
            )
        # Deterministic breadth-first, role-playing paths. Cycles, graph explosion and fanout are bounded.
        queue = [(base, "t0", "", {base}, 0)]
        dependencies = {base}
        names = {f["name"] for f in cube["fields"]}
        while queue:
            source, source_alias, prefix, visited, depth = queue.pop(0)
            if depth >= 3:
                if outgoing[source]:
                    cube["warnings"].append(
                        "Relationship traversal stops at three hops; deeper paths need explicit modeling."
                    )
                continue
            for fk in sorted(outgoing[source], key=lambda f: f["name"]):
                target = (fk["target_schema"], fk["target_table"])
                if target in visited:
                    continue
                if len(cube["joins"]) >= 32 or len(cube["fields"]) >= 512:
                    cube["warnings"].append(
                        "Relationship expansion reached its size limit; model remaining paths explicitly."
                    )
                    continue
                alias = f"j{len(cube['joins'])}"
                route = (
                    fk["columns"][0].removesuffix("_id")
                    if len(fk["columns"]) == 1
                    else fk["target_table"]
                )
                path = prefix + route
                if any(j["path"] == path for j in cube["joins"]):
                    path += "_" + alias
                cube["joins"].append(
                    {
                        "alias": alias,
                        "source_alias": source_alias,
                        "schema": target[0],
                        "table": target[1],
                        "columns": fk["columns"],
                        "target_columns": fk["target_columns"],
                        "path": path,
                        "cardinality": "many_to_one",
                        "evidence": fk["name"],
                    }
                )
                dependencies.add(target)
                for column in tables[target]:
                    field_role = role(column)
                    # Parent amounts/prices are not repeated as fact measures or numeric attributes.
                    if column["type"] not in SUPPORTED or field_role not in {
                        "dimension",
                        "time",
                        "identifier",
                    }:
                        continue
                    name = path + "." + column["name"]
                    if name in names:
                        continue
                    names.add(name)
                    cube["fields"].append(
                        {
                            "name": name,
                            "type": column["type"],
                            "nullable": True,
                            "key": column["key"],
                            "role": field_role,
                            "description": column.get("description") or "",
                            "source_alias": alias,
                            "source_column": column["name"],
                        }
                    )
                    cube["dimensions"].append(name)
                    if field_role == "time":
                        cube["time_dimensions"].append(name)
                queue.append((target, alias, path + ".", visited | {target}, depth + 1))
        # Keep the exact declared grain and all dependencies for drift validation, excluding volatile stats.
        evidence = []
        for key in sorted(dependencies):
            evidence.append(
                {
                    "table": key,
                    "columns": [
                        {k: c.get(k) for k in ("name", "type", "nullable", "key", "description")}
                        for c in tables[key]
                    ],
                    "constraints": [
                        dict(c) for c in constraints if (c["schema"], c["table"]) == key
                    ],
                }
            )
        cube["schema_signature"] = hashlib.sha256(
            json.dumps(evidence, sort_keys=True).encode()
        ).hexdigest()
        business_measure = next(
            (m for m in cube["measures"] if m["aggregation"] == "sum"), cube["measures"][0]
        )
        cube["suggested_questions"] = []
        if cube["time_dimensions"]:
            cube["suggested_questions"].append(
                f"Show {business_measure['label']} by month using {cube['time_dimensions'][0]}."
            )
        descriptive = [f["name"] for f in cube["fields"] if f["role"] == "dimension"]
        if descriptive:
            cube["suggested_questions"].append(
                f"Compare {business_measure['label']} by {descriptive[0]}."
            )
        cube["warnings"] = list(dict.fromkeys(cube["warnings"]))
        cubes.append(cube)
    return cubes
