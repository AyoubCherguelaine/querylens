import json

import httpx
import pytest
from openai import APIConnectionError, APIStatusError, APITimeoutError, BadRequestError

from backend.services.chat_agent import resolve_sample_table, run_agent, sampling_tools, table_ref
from backend.services.provider_errors import provider_failure
from tests.test_chat_agent import DEFINITIONS, mock_agent
from tests.test_planner import settings


def test_tool_enums_do_not_contain_quoted_identifiers():
    definitions = [*DEFINITIONS, {"schema": "odd schema", "table": 'a"b'}]
    tool = next(tool for tool in sampling_tools(definitions) if tool["name"] == "sample_table")
    references = tool["parameters"]["properties"]["table"]["enum"]
    assert references[0] == "sales.orders"
    assert all('"' not in ref for ref in references)
    assert resolve_sample_table(definitions, references[1]) is definitions[1]
    assert table_ref(definitions[1]) == references[1]
    assert resolve_sample_table(definitions, '"odd schema"."a""b"') is definitions[1]


@pytest.mark.parametrize(
    "status,code,category",
    [
        (400, "invalid_function_parameters", "provider_invalid_request"),
        (401, "invalid_api_key", "provider_authentication"),
        (403, None, "provider_access"),
        (404, "model_not_found", "provider_access"),
        (429, "insufficient_quota", "provider_quota"),
        (429, "rate_limit_exceeded", "provider_rate_limit"),
        (500, None, "provider_unavailable"),
    ],
)
def test_provider_failure_is_actionable_and_sanitized(status, code, category):
    error = APIStatusError(
        "secret-provider-body",
        response=httpx.Response(status, request=httpx.Request("POST", "https://example.com")),
        body={"code": code, "param": "tools[1].parameters", "message": "private-key-and-data"},
    )
    failure = provider_failure(error)
    assert failure["code"] == category
    assert failure["diagnostics"]["provider_status"] == status
    assert "secret-provider-body" not in json.dumps(failure)
    assert "private-key-and-data" not in json.dumps(failure)


@pytest.mark.parametrize(
    "error,category",
    [
        (APITimeoutError(request=httpx.Request("POST", "https://example.com")), "model_timeout"),
        (
            APIConnectionError(request=httpx.Request("POST", "https://example.com")),
            "provider_connection",
        ),
    ],
)
def test_timeout_and_connection_failure_are_distinct(error, category):
    assert provider_failure(error)["code"] == category


async def test_rejected_tool_schema_preserves_actual_reason_in_step_and_logs(monkeypatch, caplog):
    error = BadRequestError(
        "private-provider-body",
        response=httpx.Response(400, request=httpx.Request("POST", "https://example.com")),
        body={"code": "invalid_function_parameters", "param": "tools[1].parameters"},
    )
    mock_agent(monkeypatch, [error])
    result = await run_agent(None, settings(), DEFINITIONS[0], "analyze", [])
    assert result["error"]["code"] == "provider_invalid_request"
    assert result["steps"][-1]["output"] == result["error"]
    assert "Execution interrupted" not in json.dumps(result)
    assert "tool definition" in result["answer"]
    assert result["steps"][-1]["duration_ms"] >= 0
    logged = next(r for r in caplog.records if r.getMessage() == "chat.agent_failed")
    assert logged.provider_code == "invalid_function_parameters"
    assert logged.provider_param == "tools[1].parameters"
    assert "private-provider-body" not in caplog.text
