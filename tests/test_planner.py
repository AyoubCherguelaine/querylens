from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from openai import APIConnectionError

from backend.core.config import Settings
from backend.services.planner import PlannerUnavailable, make_plan
from tests.test_compiler import cube, plan


def settings(key="test-key"):
    return Settings(
        _env_file=None,
        database_url="postgresql://localhost/test",
        jwt_secret="s" * 40,
        openai_api_key=key,
    )


@pytest.mark.asyncio
async def test_missing_key_never_calls_provider():
    with pytest.raises(PlannerUnavailable, match="Configure OPENAI_API_KEY"):
        await make_plan(cube(), "count", settings(""))


@pytest.mark.asyncio
@pytest.mark.parametrize("status,parsed", [("incomplete", plan()), ("completed", None)])
async def test_provider_incomplete_or_refusal(monkeypatch, status, parsed):
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.responses.parse.return_value = SimpleNamespace(status=status, output_parsed=parsed)
    monkeypatch.setattr("backend.services.planner.AsyncOpenAI", lambda **kw: client)
    with pytest.raises(PlannerUnavailable):
        await make_plan(cube(), "count", settings())


@pytest.mark.asyncio
async def test_structured_plan_and_no_provider_storage(monkeypatch):
    client = AsyncMock()
    client.__aenter__.return_value = client
    expected = plan()
    client.responses.parse.return_value = SimpleNamespace(
        status="completed", output_parsed=expected, usage=None
    )
    monkeypatch.setattr("backend.services.planner.AsyncOpenAI", lambda **kw: client)
    result = await make_plan(cube(), "count", settings())
    assert result == expected
    args = client.responses.parse.call_args.kwargs
    assert args["store"] is False and args["model"] == "gpt-4o-mini"
    assert "sql" not in args["text_format"].model_fields


@pytest.mark.asyncio
async def test_provider_errors_are_sanitized(monkeypatch):
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.responses.parse.side_effect = APIConnectionError(
        message="sensitive-provider-details", request=httpx.Request("POST", "https://example.com")
    )
    monkeypatch.setattr("backend.services.planner.AsyncOpenAI", lambda **kw: client)
    with pytest.raises(PlannerUnavailable) as error:
        await make_plan(cube(), "count", settings())
    assert "sensitive-provider-details" not in str(error.value)
