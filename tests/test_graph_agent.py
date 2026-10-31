import pytest

from agents.GraphAgent import GraphAgent
from backend.services.graph_agent import create_graph, sanitize_filename


def sample_evidence():
    return {
        "call-0": {
            "sql": "SELECT category, sum(amount) AS total_sales FROM sales.orders GROUP BY category",
            "rows": [
                {"category": "Electronics", "total_sales": 15000},
                {"category": "Clothing", "total_sales": 8200},
                {"category": "Groceries", "total_sales": 4300},
            ],
            "columns": [
                {"key": "category", "label": "Category"},
                {"key": "total_sales", "label": "Total Sales"},
            ],
            "row_count": 3,
        }
    }


def test_create_graph_success():
    args = {
        "title": "Category Sales Distribution",
        "chart_type": "bar",
        "description": "Electronics generated the highest revenue, followed by Clothing.",
        "x_key": "category",
        "y_keys": ["total_sales"],
        "x_label": "Category",
        "y_label": "Sales ($)",
        "evidence_id": "call-0",
    }
    graph = create_graph(args, sample_evidence())

    assert graph["title"] == "Category Sales Distribution"
    assert graph["chart_type"] == "bar"
    assert graph["x_key"] == "category"
    assert graph["y_keys"] == ["total_sales"]
    assert len(graph["rows"]) == 3
    assert "data_source" in graph
    assert graph["data_source"]["row_count"] == 3
    assert graph["data_source"]["download_name"] == "category_sales_distribution_data_source.csv"
    assert "Category,Total Sales" in graph["data_source"]["csv_data"]
    assert "Electronics,15000" in graph["data_source"]["csv_data"]


def test_create_graph_missing_evidence():
    args = {
        "title": "Missing Evidence Graph",
        "chart_type": "line",
        "description": "Test",
        "x_key": "category",
        "y_keys": ["total_sales"],
        "evidence_id": "nonexistent-call",
    }
    with pytest.raises(ValueError, match="Cite a successful query evidence ID"):
        create_graph(args, sample_evidence())


def test_create_graph_empty_rows():
    args = {
        "title": "Empty Rows Graph",
        "chart_type": "line",
        "description": "Test",
        "x_key": "category",
        "y_keys": ["total_sales"],
        "evidence_id": "empty-call",
    }
    evidence = {
        "empty-call": {
            "sql": "SELECT 1 WHERE false",
            "rows": [],
            "columns": [{"key": "category", "label": "Category"}],
        }
    }
    with pytest.raises(ValueError, match="has no result rows"):
        create_graph(args, evidence)


def test_create_graph_fallback_keys():
    args = {
        "title": "Auto Key Matching",
        "chart_type": "pie",
        "description": "Test fallback",
        "x_key": "CATEGORY",  # Case mismatch
        "y_keys": ["TOTAL_SALES"],
        "evidence_id": "call-0",
    }
    graph = create_graph(args, sample_evidence())
    assert graph["x_key"] == "category"
    assert graph["y_keys"] == ["total_sales"]


def test_graph_agent_class():
    agent = GraphAgent()
    args = {
        "title": "Agent Class Test",
        "chart_type": "area",
        "description": "Tested via GraphAgent coordinator",
        "x_key": "category",
        "y_keys": ["total_sales"],
        "evidence_id": "call-0",
    }
    graph = agent.build_chart(args, sample_evidence())
    assert graph["chart_type"] == "area"
    assert graph["data_source"]["row_count"] == 3


def test_sanitize_filename():
    assert sanitize_filename("Monthly Sales (2024)! - Report") == "monthly_sales_2024_report"
    assert sanitize_filename("") == "chart_data"


async def test_agent_generates_graph_with_data_source(monkeypatch):
    from backend.services.chat_agent import run_agent
    from tests.test_chat_agent import DEFINITIONS, mock_agent, response
    from tests.test_planner import settings

    graph_args = {
        "title": "Order Revenue Trend",
        "chart_type": "line",
        "description": "Total order amount trend over time.",
        "x_key": "n",
        "y_keys": ["n"],
        "evidence_id": "call-0",
    }
    client, query = mock_agent(
        monkeypatch,
        [
            response(
                "query_postgres",
                {"sql": "SELECT count(*) AS n FROM sales.orders", "purpose": "Count"},
                0,
            ),
            response("create_graph", graph_args, 1),
        ],
    )
    result = await run_agent(None, settings(), DEFINITIONS[0], "Plot a graph of orders", [])
    assert result["status"] == "answered"
    assert "chart" in result
    assert result["chart"]["title"] == "Order Revenue Trend"
    assert result["chart"]["chart_type"] == "line"
    assert result["chart"]["data_source"]["row_count"] == 1
    assert "order_revenue_trend_data_source.csv" in result["chart"]["data_source"]["download_name"]


async def test_agent_graph_followup_reuses_history(monkeypatch):
    from backend.services.chat_agent import history_context, run_agent
    from tests.test_chat_agent import DEFINITIONS, mock_agent, response
    from tests.test_planner import settings

    graph_args = {
        "title": "History Followup Graph",
        "chart_type": "bar",
        "description": "Graph from previous turn.",
        "x_key": "n",
        "y_keys": ["n"],
        "evidence_id": "history-0-query-0",
    }
    client, query = mock_agent(
        monkeypatch,
        [response("create_graph", graph_args, 0)],
    )
    history = [
        {
            "question": "count rows",
            "result": {
                "answer": "Count is 8",
                "sql": "SELECT count(*) AS n FROM sales.orders",
                "rows": [{"n": 8}],
                "columns": [{"key": "n", "label": "n"}],
            },
        }
    ]
    result = await run_agent(None, settings(), DEFINITIONS[0], "Visualize that count", history)
    assert result["status"] == "answered"
    assert result["chart"]["data_source"]["rows"] == [{"n": 8}]
    query.assert_not_called()
    ctx = history_context([{"question": "make graph", "result": result}])[0]
    assert ctx["chart"]["title"] == "History Followup Graph"
    assert ctx["chart"]["chart_type"] == "bar"


async def test_agent_graph_without_evidence_returns_error_and_recovers(monkeypatch):
    from backend.services.chat_agent import run_agent
    from tests.test_chat_agent import DEFINITIONS, mock_agent, response
    from tests.test_planner import settings

    bad_args = {
        "title": "Bad Evidence",
        "chart_type": "bar",
        "description": "Invalid",
        "x_key": "n",
        "y_keys": ["n"],
        "evidence_id": "invalid-call",
    }
    mock_agent(
        monkeypatch,
        [
            response("create_graph", bad_args, 0),
            response("ask_user", {"question": "Which dataset should be plotted?"}, 1),
        ],
    )
    result = await run_agent(None, settings(), DEFINITIONS[0], "Make a graph", [])
    assert result["status"] == "clarification"
    assert "chart" not in result
    step = next(s for s in result["steps"] if s["tool"] == "create_graph")
    assert step["status"] == "failed"


def test_create_graph_3d_and_types():
    types = ["bar", "line", "area", "pie", "scatter"]
    for t in types:
        args = {
            "title": f"3D {t.title()} Chart",
            "chart_type": t,
            "is_3d": True,
            "description": f"Testing 3D {t} rendering.",
            "x_key": "category",
            "y_keys": ["total_sales"],
            "evidence_id": "call-0",
        }
        graph = create_graph(args, sample_evidence())
        assert graph["chart_type"] == t
        assert graph["is_3d"] is True

    # Test normalization of "3d_bar" and variations
    args_3d_str = {
        "title": "Normalized 3D Bar",
        "chart_type": "3d_bar",
        "description": "Prefix 3d bar",
        "x_key": "category",
        "y_keys": ["total_sales"],
        "evidence_id": "call-0",
    }
    graph_norm = create_graph(args_3d_str, sample_evidence())
    assert graph_norm["chart_type"] == "bar"
    assert graph_norm["is_3d"] is True

    # Test normalization of "3d_pie"
    args_3d_pie = {
        "title": "Normalized 3D Pie",
        "chart_type": "3d-pie",
        "description": "Hyphenated 3d pie",
        "x_key": "category",
        "y_keys": ["total_sales"],
        "evidence_id": "call-0",
    }
    graph_pie = create_graph(args_3d_pie, sample_evidence())
    assert graph_pie["chart_type"] == "pie"
    assert graph_pie["is_3d"] is True


async def test_agent_generates_3d_graph(monkeypatch):
    from backend.services.chat_agent import run_agent
    from tests.test_chat_agent import DEFINITIONS, mock_agent, response
    from tests.test_planner import settings

    graph_args = {
        "title": "3D Category Distribution",
        "chart_type": "scatter",
        "is_3d": True,
        "description": "3D scatter visualization of categories.",
        "x_key": "n",
        "y_keys": ["n"],
        "evidence_id": "call-0",
    }
    client, query = mock_agent(
        monkeypatch,
        [
            response(
                "query_postgres",
                {"sql": "SELECT count(*) AS n FROM sales.orders", "purpose": "Count"},
                0,
            ),
            response("create_graph", graph_args, 1),
        ],
    )
    result = await run_agent(None, settings(), DEFINITIONS[0], "Plot a 3d scatter graph", [])
    assert result["status"] == "answered"
    assert result["chart"]["chart_type"] == "scatter"
    assert result["chart"]["is_3d"] is True
    step = next(s for s in result["steps"] if s["tool"] == "create_graph")
    assert "chart_type" in step["output"]


def test_create_graph_three_dimensions_breakdown():
    evidence = {
        "call-multi": {
            "sql": "SELECT month, region, sum(revenue) as revenue FROM sales GROUP BY month, region",
            "rows": [
                {"month": "Jan", "region": "North", "revenue": 5000},
                {"month": "Jan", "region": "South", "revenue": 3000},
                {"month": "Feb", "region": "North", "revenue": 6000},
                {"month": "Feb", "region": "South", "revenue": 4000},
            ],
            "columns": [
                {"key": "month", "label": "Month"},
                {"key": "region", "label": "Region"},
                {"key": "revenue", "label": "Revenue"},
            ],
            "row_count": 4,
        }
    }
    args = {
        "title": "Monthly Revenue by Region",
        "chart_type": "bar",
        "description": "3-dimensional breakdown by region over months.",
        "x_key": "month",
        "y_keys": ["revenue"],
        "z_key": "region",
        "group_mode": "stacked",
        "evidence_id": "call-multi",
    }
    graph = create_graph(args, evidence)
    assert graph["chart_type"] == "bar"
    assert graph["x_key"] == "month"
    assert graph["y_keys"] == ["revenue"]
    assert graph["z_key"] == "region"
    assert graph["group_mode"] == "stacked"




