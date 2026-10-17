import pytest
from pydantic import ValidationError

from backend.core.config import Settings
from backend.schemas import Plan
from backend.services.catalog import build_cube
from backend.services.compiler import compile_plan


def cube():
    return build_cube(
        "business",
        "sales",
        [
            {"name": name, "type": kind, "nullable": True, "key": key}
            for name, kind, key in [
                ("id", "int8", True),
                ("region", "text", False),
                ("amount", "numeric", False),
                ("sold_at", "timestamptz", False),
            ]
        ],
    )


def plan(**overrides):
    value = dict(
        clarification=None,
        groups=[],
        metrics=[{"field": None, "aggregation": "count"}],
        filters=[],
        order_by=None,
        descending=False,
        limit=20,
    )
    value.update(overrides)
    return Plan.model_validate(value)


def test_count_and_cap():
    sql, args, limit = compile_plan(cube(), plan(limit=1000), 30)
    assert "count(*)" in sql and sql.endswith("LIMIT 31")
    assert limit == 30 and args == []


def test_injection_is_bound():
    value = "x'; DROP TABLE sales; --"
    sql, args, _ = compile_plan(
        cube(), plan(filters=[{"field": "region", "operator": "eq", "value": value}])
    )
    assert value not in sql and args == [value]
    assert "$1::text::text" in sql


def test_monthly_aggregate():
    sql, _, _ = compile_plan(
        cube(),
        plan(
            groups=[{"field": "sold_at", "grain": "month"}],
            metrics=[{"field": "amount", "aggregation": "sum"}],
        ),
    )
    assert "date_trunc('month'" in sql and "GROUP BY" in sql and 'sum("amount")' in sql


@pytest.mark.parametrize(
    "change",
    [
        {"groups": [{"field": "invented", "grain": None}]},
        {"metrics": [{"field": "region", "aggregation": "sum"}]},
        {"metrics": [{"field": "id", "aggregation": "sum"}]},
        {"groups": [{"field": "region", "grain": "month"}]},
        {"metrics": []},
        {"order_by": "m0; DROP TABLE sales"},
        {"filters": [{"field": "amount", "operator": "contains", "value": "3"}]},
        {"filters": [{"field": "region", "operator": "eq", "value": None}]},
        {"clarification": "Which date?"},
    ],
)
def test_reject_unsupported(change):
    with pytest.raises(ValueError):
        compile_plan(cube(), plan(**change))


def test_unknown_properties_rejected():
    with pytest.raises(ValidationError):
        plan(sql="DROP TABLE sales")


def test_identifiers_are_quoted():
    c = cube()
    c["table"] = 'sales"; DROP TABLE users; --'
    assert '"sales""; DROP TABLE users; --"' in compile_plan(c, plan())[0]


def test_no_key_measures():
    assert all(m["field"] != "id" for m in cube()["measures"])


def test_settings_reject_sqlite_and_private_schema():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, database_url="sqlite:///x", jwt_secret="x" * 40)
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            database_url="postgresql://localhost/db",
            jwt_secret="x" * 40,
            analytics_schemas=["chat_olap"],
        )
    assert (
        Settings(
            _env_file=None,
            database_url="postgresql://localhost/db",
            jwt_secret="x" * 40,
            analytics_database_url="",
        ).analytics_database_url
        is None
    )


def test_result_values_preserve_precision_and_nonfinite():
    from decimal import Decimal

    from backend.services.analysis import encode_value

    assert encode_value(Decimal("1234567890.123456789")) == "1234567890.123456789"
    assert encode_value(9007199254740993) == "9007199254740993"
    assert encode_value(float("inf")) == "inf"
    assert encode_value(None) is None
