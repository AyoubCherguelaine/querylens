from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from backend.core.models_config import (
    get_allowed_models,
    get_default_model_id,
    get_model_credit_cost,
    is_model_allowed,
    load_models_config,
)
from backend.schemas import CreditRecharge, ModelSettings
from backend.services.chat_agent import run_agent
from backend.services.credits import (
    NEW_DATA_COST,
    QUESTION_COST,
    STARTING_CREDITS,
    add_credits,
    check_and_deduct_credits,
    get_user_credits_data,
)
from tests.test_chat_agent import mock_agent, response
from tests.test_planner import settings as get_test_settings


def test_model_settings_schema():
    settings = ModelSettings()
    assert settings.model == "gpt-4o-mini"
    assert settings.process_mode == "standard"
    assert settings.temperature == 0.1
    assert settings.max_steps == 12
    assert settings.custom_instructions == ""

    custom = ModelSettings(
        model="claude-3-5-sonnet",
        process_mode="deep_analytical",
        temperature=0.5,
        max_steps=20,
        custom_instructions="Focus on Arabic business terms",
    )
    assert custom.model == "claude-3-5-sonnet"
    assert custom.process_mode == "deep_analytical"
    assert custom.max_steps == 20


def test_credit_recharge_schema():
    recharge = CreditRecharge(amount=50)
    assert recharge.amount == 50
    with pytest.raises(Exception):
        CreditRecharge(amount=1)  # ge=5 constraint


@pytest.mark.asyncio
async def test_check_and_deduct_credits_success():
    conn = AsyncMock()
    conn.fetchrow.return_value = {"credits": 95}
    user_id = uuid4()

    new_balance = await check_and_deduct_credits(conn, user_id, QUESTION_COST, "question:test")
    assert new_balance == 95
    assert conn.fetchrow.called
    assert conn.execute.called


@pytest.mark.asyncio
async def test_check_and_deduct_credits_for_new_data():
    conn = AsyncMock()
    conn.fetchrow.return_value = {"credits": 90}
    user_id = uuid4()

    new_balance = await check_and_deduct_credits(conn, user_id, NEW_DATA_COST, "import_data:sales")
    assert new_balance == 90
    assert NEW_DATA_COST == 10
    assert QUESTION_COST == 5
    assert STARTING_CREDITS == 100
    assert conn.fetchrow.called
    assert conn.execute.called


@pytest.mark.asyncio
async def test_check_and_deduct_credits_insufficient():
    conn = AsyncMock()
    conn.fetchrow.return_value = None
    conn.fetchval.return_value = 2  # Current balance is 2
    user_id = uuid4()

    with pytest.raises(HTTPException) as exc_info:
        await check_and_deduct_credits(conn, user_id, QUESTION_COST, "question:test")
    assert exc_info.value.status_code == 402
    assert "Insufficient credits" in exc_info.value.detail


@pytest.mark.asyncio
async def test_add_credits():
    conn = AsyncMock()
    conn.fetchrow.return_value = {"credits": 150}
    user_id = uuid4()

    new_balance = await add_credits(conn, user_id, 50, "recharge")
    assert new_balance == 150
    assert conn.execute.called


@pytest.mark.asyncio
async def test_get_user_credits_data():
    conn = AsyncMock()
    conn.fetchval.return_value = 85
    conn.fetch.return_value = [
        {
            "id": uuid4(),
            "amount": -5,
            "action": "question",
            "balance_after": 85,
            "created_at": "2026-10-30T12:00:00Z",
        }
    ]
    user_id = uuid4()

    summary = await get_user_credits_data(conn, user_id)
    assert summary["credits"] == 85
    assert summary["question_cost"] == 5
    assert summary["new_data_cost"] == 10
    assert len(summary["transactions"]) == 1


@pytest.mark.asyncio
async def test_run_agent_with_model_settings(monkeypatch):
    client, _ = mock_agent(monkeypatch, [response("finish", {"answer": "Custom model answer"})])
    config = get_test_settings()

    cube = {"schema": "sales", "table": "orders", "name": "Orders"}
    result = await run_agent(
        None,
        config,
        cube,
        "What is total sales?",
        [],
        model_settings={
            "model": "gpt-4o",
            "process_mode": "deep_analytical",
            "max_steps": 15,
            "custom_instructions": "Always include percent breakdown.",
        },
    )

    assert result["status"] == "answered"
    assert result["answer"] == "Custom model answer"
    assert result["model_used"] == "gpt-4o"
    call_kwargs = client.responses.create.call_args.kwargs
    assert call_kwargs["model"] == "gpt-4o"
    assert "MODE: Deep Analytical" in call_kwargs["instructions"]
    assert "Always include percent breakdown." in call_kwargs["instructions"]


def test_models_config_loading_and_properties():
    cfg = load_models_config()
    assert cfg.provider == "openai"
    assert len(cfg.models) >= 5

    # Check allowed models
    allowed = get_allowed_models()
    allowed_ids = [m.id for m in allowed]
    assert "gpt-4o-mini" in allowed_ids
    assert "gpt-4o" in allowed_ids
    assert "gpt-4-turbo" in allowed_ids
    assert "o1-mini" in allowed_ids
    assert "o3-mini" in allowed_ids

    # All models must be openai provider
    for m in allowed:
        assert m.provider == "openai"

    # Default model
    assert get_default_model_id() == "gpt-4o-mini"

    # Verification of permission checks
    assert is_model_allowed("gpt-4o-mini") is True
    assert is_model_allowed("gpt-4o") is True
    assert is_model_allowed("o3-mini") is True
    assert is_model_allowed("gpt-6-luna") is True
    assert is_model_allowed("gpt-5.6-luna") is True
    assert is_model_allowed("gpt-5.4-nano") is True
    assert is_model_allowed("gpt-5-nano") is True
    assert is_model_allowed("gpt-4.1-nano") is True
    assert is_model_allowed("gpt-4.1-mini") is True
    assert is_model_allowed("claude-3-5-sonnet") is False
    assert is_model_allowed("gemini-2.0-flash") is False
    assert is_model_allowed("arbitrary-llm") is False

    # Check special credit costs
    assert get_model_credit_cost("gpt-4o-mini") == 5
    assert get_model_credit_cost("gpt-6-luna") == 4
    assert get_model_credit_cost("gpt-5.6-luna") == 8
    assert get_model_credit_cost("gpt-5.4-nano") == 8
    assert get_model_credit_cost("gpt-5-nano") == 2
    assert get_model_credit_cost("gpt-4.1-nano") == 3
    assert get_model_credit_cost("gpt-4.1-mini") == 10
    assert get_model_credit_cost("gpt-4o") == 15
    assert get_model_credit_cost("gpt-4-turbo") == 20
    assert get_model_credit_cost("o1-mini") == 25
    assert get_model_credit_cost("o3-mini") == 30
    # Fallback default cost for unknown
    assert get_model_credit_cost("unknown-model") == 5


@pytest.mark.asyncio
async def test_update_settings_validation():
    from backend.api.auth import update_settings

    # Mock DB connection and app
    conn = AsyncMock()
    conn.execute.return_value = None

    class MockPool:
        def acquire(self):
            class PoolCtx:
                async def __aenter__(self):
                    return conn

                async def __aexit__(self, *args):
                    pass

            return PoolCtx()

    class MockApp:
        def __init__(self):
            self.state = type("State", (), {"db": MockPool()})()

    mock_request = type("Request", (), {"app": MockApp()})()
    test_user = {"id": uuid4()}

    # Allowed OpenAI model: gpt-4o (15 credits)
    valid_body = ModelSettings(model="gpt-4o", process_mode="deep_analytical")
    res = await update_settings(valid_body, mock_request, test_user)
    assert res["message"] == "Settings updated"
    assert res["model_settings"]["model"] == "gpt-4o"

    # Disallowed model: claude-3-5-sonnet -> HTTP 422
    invalid_body = ModelSettings(model="claude-3-5-sonnet")
    with pytest.raises(HTTPException) as exc:
        await update_settings(invalid_body, mock_request, test_user)
    assert exc.value.status_code == 422
    assert "not in the allowed models configuration" in exc.value.detail


@pytest.mark.asyncio
async def test_get_models_api_endpoint():
    from backend.api.auth import get_models

    res = await get_models()
    assert res["provider"] == "openai"
    assert len(res["models"]) >= 5
    ids = [m["id"] for m in res["models"]]
    assert "gpt-4o-mini" in ids
    assert "gpt-4o" in ids


@pytest.mark.asyncio
async def test_dynamic_model_credits_deduction():
    conn = AsyncMock()
    conn.fetchrow.return_value = {"credits": 85}  # 100 - 15 = 85
    user_id = uuid4()

    # Model gpt-4o eats 15 credits
    cost_gpt4o = get_model_credit_cost("gpt-4o")
    assert cost_gpt4o == 15
    new_balance = await check_and_deduct_credits(
        conn, user_id, cost_gpt4o, "question:gpt-4o:test"
    )
    assert new_balance == 85

    # Model o3-mini eats 30 credits
    cost_o3 = get_model_credit_cost("o3-mini")
    assert cost_o3 == 30
    conn.fetchrow.return_value = {"credits": 55}  # 85 - 30 = 55
    new_balance = await check_and_deduct_credits(
        conn, user_id, cost_o3, "question:o3-mini:test"
    )
    assert new_balance == 55

