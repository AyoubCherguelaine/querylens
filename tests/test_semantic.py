"""Business-grain modeling and executable to-one relationship regression tests."""

from copy import deepcopy
from unittest.mock import AsyncMock

import pytest

from backend.services.analysis import execute_plan, profile_cube
from backend.services.compiler import compile_plan
from backend.services.semantic import model_schema
from tests.test_compiler import plan


def column(name, kind="int8", key=False):
    return {"name": name, "type": kind, "nullable": True, "key": key}


def constraint(table, columns, kind="p", target=None, target_columns=None, name=None):
    return {
        "schema": "shop",
        "table": table,
        "columns": columns,
        "kind": kind,
        "name": name or f"{table}_{'_'.join(columns)}_{kind}",
        "validated": True,
        "target_schema": "shop" if target else None,
        "target_table": target,
        "target_columns": target_columns or (["id"] if target else []),
    }


def shop():
    tables = {
        ("shop", "customers"): [
            column("id", key=True),
            column("name", "text"),
            column("balance", "numeric"),
        ],
        ("shop", "orders"): [
            column("id", key=True),
            column("customer_id", key=True),
            column("ordered_at", "date"),
            column("amount", "numeric"),
        ],
        ("shop", "lines"): [
            column("id", key=True),
            column("order_id", key=True),
            column("quantity"),
            column("unit_price", "numeric"),
        ],
    }
    constraints = [constraint(t, ["id"]) for _, t in tables]
    constraints += [
        constraint("orders", ["customer_id"], "f", "customers"),
        constraint("lines", ["order_id"], "f", "orders"),
    ]
    return tables, constraints


def models():
    return {c["table"]: c for c in model_schema(*shop())}


def test_grain_business_roles_and_safe_measures():
    m = models()
    assert m["lines"]["kind"] == "fact"
    assert m["customers"]["kind"] == "snapshot"
    assert "uniquely identified by (id)" in m["lines"]["grain"]
    assert ("unit_price", "sum") not in {
        (x["field"], x["aggregation"]) for x in m["lines"]["measures"]
    }
    assert ("balance", "sum") not in {
        (x["field"], x["aggregation"]) for x in m["customers"]["measures"]
    }
    assert m["lines"]["suggested_questions"]


def test_snowflake_dimensions_exclude_repeated_parent_measures():
    cube = models()["lines"]
    assert "order.customer.name" in cube["dimensions"]
    assert "order.ordered_at" in cube["time_dimensions"]
    assert "order.amount" not in {f["name"] for f in cube["fields"]}
    assert "order.customer.balance" not in {f["name"] for f in cube["fields"]}
    assert not models()["customers"]["joins"]  # never reverse a one-to-many edge


def test_executable_snowflake_formula_and_bound_filter():
    sql, args, _ = compile_plan(
        models()["lines"],
        plan(
            groups=[{"field": "order.customer.name", "grain": None}],
            metrics=[{"field": "__extended_amount", "aggregation": "sum"}],
            filters=[{"field": "order.customer.name", "operator": "eq", "value": "O'Reilly"}],
        ),
    )
    assert 'LEFT JOIN "shop"."orders" AS "j0"' in sql
    assert '"t0"."order_id" = "j0"."id"' in sql
    assert '"j0"."customer_id" = "j1"."id"' in sql
    assert 'sum((("t0"."quantity")::numeric * ("t0"."unit_price")::numeric))' in sql
    assert 'GROUP BY "j1"."name"' in sql
    assert args == ["O'Reilly"] and "O'Reilly" not in sql


def test_composite_fk_keeps_all_key_parts():
    tables = {
        ("shop", "customers"): [
            column("tenant", key=True),
            column("code", key=True),
            column("name", "text"),
        ],
        ("shop", "orders"): [
            column("id", key=True),
            column("tenant", key=True),
            column("customer_code", key=True),
        ],
    }
    constraints = [
        constraint("customers", ["tenant", "code"]),
        constraint("orders", ["id"]),
        constraint("orders", ["tenant", "customer_code"], "f", "customers", ["tenant", "code"]),
    ]
    cube = model_schema(tables, constraints)[1]
    sql, _, _ = compile_plan(cube, plan(groups=[{"field": "customers.name", "grain": None}]))
    assert '"t0"."tenant" = "j0"."tenant" AND "t0"."customer_code" = "j0"."code"' in sql


def test_role_playing_dimensions_and_cycles():
    tables, constraints = shop()
    tables[("shop", "orders")].append(column("billing_customer_id", key=True))
    constraints.append(constraint("orders", ["billing_customer_id"], "f", "customers"))
    tables[("shop", "customers")].append(column("latest_order_id", key=True))
    constraints.append(constraint("customers", ["latest_order_id"], "f", "orders"))
    cube = next(c for c in model_schema(tables, constraints) if c["table"] == "orders")
    assert {"customer.name", "billing_customer.name"} <= set(cube["dimensions"])
    assert len(cube["joins"]) == 2


@pytest.mark.parametrize("change", ["unvalidated", "inaccessible", "other_schema"])
def test_relationship_scope_and_validation(change):
    tables, constraints = shop()
    if change == "unvalidated":
        constraints[-1]["validated"] = False
    elif change == "inaccessible":
        del tables[("shop", "orders")]
    else:
        constraints[-1]["target_schema"] = "private"
    cube = next(c for c in model_schema(tables, constraints) if c["table"] == "lines")
    assert cube["joins"] == []


def test_bridge_and_unsupported_types():
    tables, constraints = shop()
    tables[("shop", "links")] = [
        column("customer_id", key=True),
        column("order_id", key=True),
        column("data", "jsonb"),
    ]
    constraints.extend(
        [
            constraint("links", ["customer_id", "order_id"]),
            constraint("links", ["customer_id"], "f", "customers"),
            constraint("links", ["order_id"], "f", "orders"),
        ]
    )
    cube = next(c for c in model_schema(tables, constraints) if c["table"] == "links")
    assert cube["kind"] == "bridge"
    assert "data" not in {f["name"] for f in cube["fields"]}


def test_schema_signature_ignores_statistics_but_tracks_related_schema():
    tables, constraints = shop()
    initial = model_schema(tables, constraints)[2]["schema_signature"]
    tables[("shop", "customers")][0]["estimated_rows"] = 999
    assert model_schema(tables, constraints)[2]["schema_signature"] == initial
    tables[("shop", "customers")][1]["type"] = "varchar"
    assert model_schema(tables, constraints)[2]["schema_signature"] != initial


@pytest.mark.asyncio
async def test_related_schema_drift_blocks_execution(monkeypatch):
    cube = models()["lines"]
    changed = deepcopy(cube)
    changed["schema_signature"] = "changed"
    monkeypatch.setattr("backend.services.analysis.discover", AsyncMock(return_value=[changed]))
    with pytest.raises(ValueError, match="Source schema changed"):
        await execute_plan(None, None, cube, plan())


@pytest.mark.asyncio
async def test_profile_excludes_semantic_paths(monkeypatch):
    from contextlib import asynccontextmanager
    from types import SimpleNamespace

    connection = AsyncMock()
    connection.fetchrow.return_value = {
        "total_rows": 1,
        **{f"{p}{i}": 0 for p in "nd" for i in range(4)},
    }

    @asynccontextmanager
    async def readonly(*args):
        yield connection

    monkeypatch.setattr("backend.services.analysis.readonly", readonly)
    await profile_cube(None, SimpleNamespace(query_timeout_ms=100), models()["lines"])
    sql = connection.fetchrow.call_args.args[0]
    assert '"quantity"' in sql and '"order.' not in sql


def test_unused_relationships_are_not_queried():
    cube = models()["lines"]
    sql, _, _ = compile_plan(cube, plan())
    assert "JOIN" not in sql
    sql, _, _ = compile_plan(cube, plan(groups=[{"field": "order.ordered_at", "grain": "month"}]))
    assert sql.count("LEFT JOIN") == 1
    assert '"shop"."customers"' not in sql
