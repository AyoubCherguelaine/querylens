import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pydantic import SecretStr

from backend.services.agent_sql import validate_sql
from backend.services.chat_agent import history_context, run_agent
from tests.test_planner import settings

DEFINITIONS = [{"schema": "sales", "table": "orders", "fields": [{"name": "amount"}]}]


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT sum(amount) FROM sales.orders",
        "SELECT a.amount FROM sales.orders a JOIN sales.orders b ON a.amount=b.amount",
        "SELECT * FROM (SELECT amount FROM sales.orders) x",
        "SELECT pg_catalog.round(avg(amount)::numeric, 2) FROM sales.orders",
        "SELECT row_number() OVER (ORDER BY amount) AS n FROM sales.orders",
    ],
)
def test_safe_sql(sql):
    assert validate_sql(sql, DEFINITIONS) == sql


@pytest.mark.parametrize(
    "sql",
    [
        "DELETE FROM sales.orders",
        "SELECT 1; SELECT 2",
        "WITH x AS (DELETE FROM sales.orders RETURNING *) SELECT * FROM x",
        "SELECT * INTO sales.copy FROM sales.orders",
        "SELECT * FROM sales.orders FOR UPDATE",
        "SELECT * FROM chat_olap.users",
        "SELECT * FROM pg_catalog.pg_authid",
        "SELECT * FROM other.orders",
        "SELECT * FROM orders",
        "SELECT * FROM sales.orders UNION SELECT * FROM chat_olap.users",
        "SELECT pg_read_file('/etc/passwd')",
        "SELECT set_config('search_path','public',true)",
        "SELECT public.sum(amount) FROM sales.orders",
        "SELECT pg_sleep(1)",
        "SELECT 'chat_olap.users'::regclass",
        "SELECT current_user",
        "SELECT 1 OPERATOR(public.+) 2",
        "SELECT amount::public.secret FROM sales.orders",
    ],
)
def test_unsafe_sql(sql):
    with pytest.raises(ValueError):
        validate_sql(sql, DEFINITIONS)


def response(name, args, index=0):
    return SimpleNamespace(
        status="completed",
        output=[
            SimpleNamespace(
                type="function_call", name=name, arguments=json.dumps(args), call_id=f"call-{index}"
            )
        ],
    )


def mock_agent(monkeypatch, responses):
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.responses.create.side_effect = responses
    monkeypatch.setattr("backend.services.chat_agent.AsyncOpenAI", lambda **kw: client)
    monkeypatch.setattr("backend.services.chat_agent.discover", AsyncMock(return_value=DEFINITIONS))
    query = AsyncMock(
        return_value={
            "sql": "SELECT count(*) AS n FROM sales.orders",
            "rows": [{"n": 8}],
            "columns": [{"key": "n", "label": "n"}],
        }
    )
    monkeypatch.setattr("backend.services.chat_agent.query_source", query)
    return client, query


async def test_tool_loop_receives_history_recovers_and_streams(monkeypatch):
    client, query = mock_agent(
        monkeypatch,
        [
            response("source_schema", {"purpose": "Inspect source"}, 0),
            response("query_postgres", {"sql": "bad", "purpose": "Count orders"}, 1),
            response(
                "query_postgres",
                {"sql": "SELECT count(*) AS n FROM sales.orders", "purpose": "Retry count"},
                2,
            ),
            response("finish", {"answer": "There are 8 orders."}, 3),
        ],
    )
    query.side_effect = [ValueError("Invalid SQL"), query.return_value]
    history = [
        {
            "question": "count orders",
            "result": {"answer": "8", "sql": "SELECT count(*)", "rows": [{"n": 8}]},
        }
    ]
    events = []

    async def emit(event):
        events.append(event)

    result = await run_agent(None, settings(), DEFINITIONS[0], "same again", history, emit)
    assert result["status"] == "answered" and result["rows"] == [{"n": 8}]
    assert [s["status"] for s in result["steps"] if s["tool"] != "model"] == [
        "completed",
        "failed",
        "completed",
        "completed",
    ]
    assert any(e["step"]["status"] == "running" for e in events)
    args = client.responses.create.call_args_list[0].kwargs
    context = json.loads(args["input"][0]["content"])
    assert context["history"][0]["queries"][0]["rows"] == [{"n": 8}]
    assert args["store"] is False
    assert any(
        m.get("type") == "function_call_output" for m in args["input"] if isinstance(m, dict)
    )


async def test_clarification_stops_without_query(monkeypatch):
    _, query = mock_agent(monkeypatch, [response("ask_user", {"question": "Which period?"})])
    result = await run_agent(None, settings(), DEFINITIONS[0], "sales?", [])
    assert result["status"] == "clarification" and result["answer"] == "Which period?"
    query.assert_not_called()


async def test_loop_limit_and_bad_arguments(monkeypatch):
    client, _ = mock_agent(monkeypatch, [response("unknown", {})])
    config = settings()
    config.agent_max_steps = 1
    result = await run_agent(None, config, DEFINITIONS[0], "test", [])
    assert result["status"] == "limit_reached" and result["steps"][-1]["status"] == "failed"
    assert client.responses.create.call_count == 1


async def test_missing_key():
    from backend.services.planner import PlannerUnavailable

    config = settings()
    config.openai_api_key = SecretStr("")
    with pytest.raises(PlannerUnavailable):
        await run_agent(None, config, DEFINITIONS[0], "hello", [])


def test_history_samples_all_prior_queries():
    history = [
        {
            "question": "test",
            "result": {
                "answer": "ok",
                "steps": [
                    {
                        "tool": "query_postgres",
                        "status": "completed",
                        "arguments": {"sql": "SELECT 1"},
                        "output": {"rows": [{"n": i} for i in range(50)], "truncated": True},
                    },
                    {"tool": "query_postgres", "status": "failed", "output": {"error": "bad SQL"}},
                ],
            },
        }
    ]
    queries = history_context(history)[0]["queries"]
    assert len(queries) == 2 and len(queries[0]["result"]["rows"]) == 5
    assert queries[1]["status"] == "failed"


async def test_provider_failure_preserves_completed_evidence(monkeypatch):
    import httpx
    from openai import APIConnectionError

    client, _ = mock_agent(
        monkeypatch,
        [
            response(
                "query_postgres",
                {"sql": "SELECT count(*) AS n FROM sales.orders", "purpose": "Count orders"},
            ),
            APIConnectionError(
                message="private-provider-body",
                request=httpx.Request("POST", "https://example.com"),
            ),
        ],
    )
    result = await run_agent(None, settings(), DEFINITIONS[0], "count", [])
    assert result["status"] == "error" and result["rows"] == [{"n": 8}]
    assert result["steps"][-1]["status"] == "failed"
    assert "private-provider-body" not in json.dumps(result)
    assert client.responses.create.call_count == 2


async def test_timeout_marks_running_step_failed(monkeypatch):
    import asyncio

    client, _ = mock_agent(monkeypatch, [])

    async def slow_response(**kwargs):
        await asyncio.sleep(1)

    client.responses.create.side_effect = slow_response
    config = settings().model_copy(update={"agent_timeout_seconds": 0.01})
    result = await run_agent(None, config, DEFINITIONS[0], "count", [])
    assert result["status"] == "error"
    assert result["steps"][-1]["status"] == "failed"


@pytest.mark.parametrize(
    "reference",
    [
        "zomato_restaurant",
        "zomato_restaurant_dataset.zomato_restaurant",
        '"zomato_restaurant_dataset"."zomato_restaurant"',
        "Zomato Restaurant",
        "  zomato restaurant  ",
    ],
)
def test_sample_table_resolves_discovered_names(reference):
    from backend.services.chat_agent import resolve_sample_table

    definition = {
        "schema": "zomato_restaurant_dataset",
        "table": "zomato_restaurant",
        "name": "Zomato Restaurant",
    }
    assert resolve_sample_table([definition], reference) is definition


@pytest.mark.parametrize(
    "reference",
    ["other.orders", "chat_olap.users", "orders; DROP TABLE sales.orders", "missing", None],
)
def test_sample_table_rejects_unknown_and_foreign_tables(reference):
    from backend.services.chat_agent import resolve_sample_table

    with pytest.raises(ValueError, match="Available tables"):
        resolve_sample_table(DEFINITIONS, reference)


def test_sample_table_rejects_ambiguous_display_names():
    from backend.services.chat_agent import resolve_sample_table

    definitions = [
        {"schema": "sales", "table": "orders_1", "name": "Orders"},
        {"schema": "sales", "table": "orders_2", "name": "Orders"},
    ]
    with pytest.raises(ValueError, match="Ambiguous"):
        resolve_sample_table(definitions, "Orders")
    assert resolve_sample_table(definitions, "sales.orders_2") is definitions[1]


async def test_sampling_tools_use_discovered_references_and_log_status(monkeypatch, caplog):
    import logging

    client, query = mock_agent(
        monkeypatch,
        [
            response("source_schema", {"purpose": "Inspect source"}, 0),
            response("sample_table", {"table": "sales.orders", "purpose": "Private purpose"}, 1),
            response("finish", {"answer": "Sample inspected."}, 2),
        ],
    )
    with caplog.at_level(logging.INFO, logger="backend.services.chat_agent"):
        result = await run_agent(None, settings(), DEFINITIONS[0], "preview", [])
    assert result["status"] == "answered"
    assert query.call_args.args[-1] == 'SELECT "amount" FROM "sales"."orders" LIMIT 5'
    sample_step = next(s for s in result["steps"] if s["tool"] == "sample_table")
    assert sample_step["output"]["sample_only"] is True
    schema_step = next(s for s in result["steps"] if s["tool"] == "source_schema")
    assert schema_step["output"]["tables"][0]["sample_table_ref"] == "sales.orders"
    tools = client.responses.create.call_args.kwargs["tools"]
    sampling = next(t for t in tools if t["name"] == "sample_table")
    assert sampling["parameters"]["properties"]["table"]["enum"] == ["sales.orders"]
    logged = [r for r in caplog.records if r.getMessage() == "chat.agent_step"]
    assert any(r.tool == "sample_table" and r.status == "completed" for r in logged)
    assert "Private purpose" not in caplog.text


@pytest.mark.parametrize(
    "sql",
    [
        "WITH q AS (SELECT amount FROM sales.orders) SELECT * FROM q",
        "WITH q AS (SELECT amount FROM sales.orders), r AS (SELECT * FROM q) SELECT * FROM r",
        "SELECT * FROM (WITH q AS (SELECT amount FROM sales.orders) SELECT * FROM q) sub",
        "WITH q AS (SELECT amount FROM sales.orders) SELECT * FROM q WHERE EXISTS (SELECT 1 FROM q)",
    ],
)
def test_readonly_ctes(sql):
    assert validate_sql(sql, DEFINITIONS) == sql


@pytest.mark.parametrize(
    "sql",
    [
        "WITH q AS (DELETE FROM sales.orders RETURNING *) SELECT * FROM q",
        "WITH q AS (SELECT * FROM chat_olap.users) SELECT * FROM q",
        "WITH q AS (SELECT * FROM other.orders) SELECT * FROM q",
        "WITH RECURSIVE q AS (SELECT 1 UNION ALL SELECT * FROM q) SELECT * FROM q",
        "WITH q AS (SELECT * FROM r), r AS (SELECT * FROM sales.orders) SELECT * FROM q",
        "SELECT * FROM (WITH q AS (SELECT * FROM sales.orders) SELECT * FROM q) sub, q",
        "WITH q AS (SELECT amount INTO sales.copy FROM sales.orders) SELECT * FROM q",
        "WITH q AS (SELECT pg_sleep(1)) SELECT * FROM q",
    ],
)
def test_ctes_cannot_escape_scope_or_write(sql):
    with pytest.raises(ValueError):
        validate_sql(sql, DEFINITIONS)


async def test_explicit_chat_tables_limit_schema_and_sql_scope(monkeypatch):
    from backend.services.chat_agent import table_ref

    orders = DEFINITIONS[0]
    customers = {"schema": "crm", "table": "customers", "fields": [{"name": "id"}]}
    hidden = {"schema": "sales", "table": "private", "fields": [{"name": "id"}]}
    client, _ = mock_agent(
        monkeypatch,
        [
            response("source_schema", {"purpose": "Inspect"}, 0),
            response("finish", {"answer": "Ready"}, 1),
        ],
    )
    discovery = AsyncMock(return_value=[orders, customers, hidden])
    monkeypatch.setattr("backend.services.chat_agent.discover", discovery)
    result = await run_agent(
        None, settings(), orders, "Join both", [], selected_cubes=[orders, customers]
    )
    assert discovery.call_args.kwargs["schemas"] == ["sales", "crm"]
    context = json.loads(client.responses.create.call_args_list[0].kwargs["input"][0]["content"])
    assert context["selected_tables"] == [
        {"schema": "sales", "table": "orders"},
        {"schema": "crm", "table": "customers"},
    ]
    schema = next(step for step in result["steps"] if step["tool"] == "source_schema")
    assert [table_ref(d) for d in schema["output"]["tables"]] == ["sales.orders", "crm.customers"]
    tools = client.responses.create.call_args_list[0].kwargs["tools"]
    sample = next(tool for tool in tools if tool["name"] == "sample_table")
    assert sample["parameters"]["properties"]["table"]["enum"] == ["sales.orders", "crm.customers"]


async def test_missing_selected_table_does_not_call_model(monkeypatch):
    from backend.services.planner import PlannerUnavailable

    client, _ = mock_agent(monkeypatch, [])
    missing = {"schema": "sales", "table": "deleted"}
    with pytest.raises(PlannerUnavailable, match="selected table is unavailable"):
        await run_agent(
            None, settings(), DEFINITIONS[0], "join", [], selected_cubes=[DEFINITIONS[0], missing]
        )
    client.responses.create.assert_not_called()
