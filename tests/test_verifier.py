import pytest
from backend.services.verifier import (
    extract_filters_and_assumptions,
    extract_tables_from_sql,
    verify_query_execution,
)


def test_extract_tables_from_sql():
    sql = 'SELECT o.id, c.name FROM "sales"."orders" o JOIN "sales"."customers" c ON o.customer_id = c.id'
    definitions = [
        {"schema": "sales", "table": "orders"},
        {"schema": "sales", "table": "customers"},
    ]
    tables = extract_tables_from_sql(sql, definitions)
    assert "sales.orders" in tables
    assert "sales.customers" in tables


def test_extract_filters_and_assumptions_from_plan():
    plan = {
        "groups": [{"field": "order_date", "grain": "month"}],
        "metrics": [{"field": "revenue", "aggregation": "sum"}],
        "filters": [{"field": "status", "operator": "eq", "value": "completed"}],
    }
    assumptions, filters = extract_filters_and_assumptions("", plan)
    assert any("status eq 'completed'" in a for a in assumptions)
    assert any("order_date (month)" in a for a in assumptions)
    assert any("SUM(revenue)" in a for a in assumptions)
    assert len(filters) == 1
    assert filters[0]["field"] == "status"


def test_verify_query_high_confidence():
    question = "Show me monthly sales revenue for 2026"
    sql = "SELECT date_trunc('month', order_date) AS m, sum(amount) AS total FROM sales.orders GROUP BY 1"
    rows = [{"m": "2026-01-01", "total": 15000}, {"m": "2026-02-01", "total": 18000}]
    columns = [{"key": "m", "label": "Month"}, {"key": "total", "label": "Total"}]

    res = verify_query_execution(question, sql, rows, columns, truncated=False)
    assert res["score"] >= 85
    assert res["grade"] == "high"
    assert len(res["caveats"]) == 0
    assert res["proof_of_work"]["ast_verified"] is True
    assert res["proof_of_work"]["read_only_enforced"] is True


def test_verify_query_temporal_mismatch_penalty():
    question = "Show me monthly sales trend"
    # SQL lacks any date grouping or date truncation
    sql = "SELECT region, sum(amount) AS total FROM sales.orders GROUP BY region"
    rows = [{"region": "North", "total": 5000}]
    columns = [{"key": "region", "label": "Region"}, {"key": "total", "label": "Total"}]

    res = verify_query_execution(question, sql, rows, columns, truncated=False)
    assert res["score"] < 90
    assert any("temporal" in c.lower() for c in res["caveats"])


def test_verify_query_empty_rows_penalty():
    question = "Total sales in Alaska"
    sql = "SELECT sum(amount) FROM sales.orders WHERE region = 'Alaska'"
    rows = []

    res = verify_query_execution(question, sql, rows, [], truncated=False)
    assert res["score"] <= 75
    assert any("zero matching rows" in c.lower() for c in res["caveats"])


def test_verify_query_truncated_penalty():
    question = "List all customer accounts"
    sql = "SELECT * FROM sales.customers"
    rows = [{"id": i} for i in range(100)]

    res = verify_query_execution(question, sql, rows, [{"key": "id", "label": "ID"}], truncated=True)
    assert any("truncated" in c.lower() or "maximum limit" in c.lower() for c in res["caveats"])


def test_verify_query_no_sql():
    res = verify_query_execution("Which month had highest sales?", None)
    assert res["score"] == 100
    assert len(res["caveats"]) == 0
    assert res["proof_of_work"]["ast_verified"] is False


def test_extract_tables_with_cte():
    sql = """
    WITH monthly_orders AS (
        SELECT customer_id, count(*) AS order_cnt
        FROM "sales"."orders"
        GROUP BY 1
    )
    SELECT c.name, m.order_cnt
    FROM "sales"."customers" c
    JOIN monthly_orders m ON c.id = m.customer_id
    """
    definitions = [
        {"schema": "sales", "table": "orders"},
        {"schema": "sales", "table": "customers"},
    ]
    tables = extract_tables_from_sql(sql, definitions)
    assert "sales.orders" in tables
    assert "sales.customers" in tables
    assert "monthly_orders" not in tables


def test_verify_query_ranking_check():
    question = "Who are our top 10 customers?"
    # SQL lacks order by
    sql = "SELECT name FROM sales.customers LIMIT 10"
    res = verify_query_execution(question, sql, [{"name": "Acme"}], [{"key": "name", "label": "Name"}])
    assert any("order by" in c.lower() for c in res["caveats"])
    assert res["score"] < 85


def test_verify_query_average_check():
    question = "What is the average order value?"
    # SQL used sum instead of avg
    sql = "SELECT sum(amount) FROM sales.orders"
    res = verify_query_execution(question, sql, [{"sum": 1000}], [{"key": "sum", "label": "Sum"}])
    assert any("avg" in c.lower() for c in res["caveats"])

