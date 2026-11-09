from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from backend.api.analytics import (
    create_dashboard_card,
    delete_dashboard_card,
    get_dashboard_cards,
    update_dashboard_card,
)
from backend.schemas import DashboardCardCreate, DashboardCardUpdate


def test_dashboard_card_create_schema():
    card = DashboardCardCreate(
        title="Monthly Revenue Trend",
        card_type="chart",
        content={"chart_type": "line", "x_key": "month", "y_keys": ["revenue"]},
        query_text="What is monthly revenue?",
        layout_order=1,
    )
    assert card.title == "Monthly Revenue Trend"
    assert card.card_type == "chart"
    assert card.content["chart_type"] == "line"
    assert card.query_text == "What is monthly revenue?"
    assert card.layout_order == 1


def test_dashboard_card_create_invalid_type():
    with pytest.raises(ValidationError):
        DashboardCardCreate(
            title="Invalid",
            card_type="invalid_type",  # only 'chart', 'report', 'table', 'metric' allowed
            content={},
        )


def test_dashboard_card_update_schema():
    update = DashboardCardUpdate(title="New Title", layout_order=5)
    assert update.title == "New Title"
    assert update.layout_order == 5


@pytest.mark.asyncio
async def test_get_dashboard_cards():
    user_id = uuid4()
    card_id = uuid4()
    now = datetime.now(timezone.utc)

    conn = AsyncMock()
    conn.fetch.return_value = [
        {
            "id": card_id,
            "title": "Quarterly Sales",
            "card_type": "chart",
            "content": {"chart_type": "bar"},
            "query_text": "Sales by quarter",
            "source_id": None,
            "cube_id": None,
            "session_id": None,
            "layout_order": 0,
            "created_at": now,
        }
    ]

    pool = MagicMock()
    pool.acquire.return_value.__aenter__.return_value = conn

    request = MagicMock()
    request.app.state.db = pool

    user = {"id": user_id}
    cards = await get_dashboard_cards(request, user=user)

    assert len(cards) == 1
    assert cards[0]["id"] == str(card_id)
    assert cards[0]["title"] == "Quarterly Sales"
    assert cards[0]["card_type"] == "chart"
    assert cards[0]["created_at"] == now.isoformat()


@pytest.mark.asyncio
async def test_create_dashboard_card():
    user_id = uuid4()
    card_id = uuid4()
    now = datetime.now(timezone.utc)

    conn = AsyncMock()
    conn.fetchrow.return_value = {
        "id": card_id,
        "title": "Executive Summary",
        "card_type": "report",
        "content": {"summary": "Strong growth in Q3"},
        "query_text": "Analyze Q3 growth",
        "source_id": None,
        "cube_id": None,
        "session_id": None,
        "layout_order": 0,
        "created_at": now,
    }

    pool = MagicMock()
    pool.acquire.return_value.__aenter__.return_value = conn

    request = MagicMock()
    request.app.state.db = pool

    body = DashboardCardCreate(
        title="Executive Summary",
        card_type="report",
        content={"summary": "Strong growth in Q3"},
        query_text="Analyze Q3 growth",
    )
    user = {"id": user_id}
    created = await create_dashboard_card(body, request, user=user)

    assert created["id"] == str(card_id)
    assert created["title"] == "Executive Summary"
    assert created["card_type"] == "report"
    assert conn.fetchrow.called


@pytest.mark.asyncio
async def test_delete_dashboard_card_success():
    user_id = uuid4()
    card_id = uuid4()

    conn = AsyncMock()
    conn.execute.return_value = "DELETE 1"

    pool = MagicMock()
    pool.acquire.return_value.__aenter__.return_value = conn

    request = MagicMock()
    request.app.state.db = pool

    res = await delete_dashboard_card(card_id, request, user={"id": user_id})
    assert res["status"] == "deleted"
    assert res["id"] == str(card_id)


@pytest.mark.asyncio
async def test_delete_dashboard_card_not_found():
    user_id = uuid4()
    card_id = uuid4()

    conn = AsyncMock()
    conn.execute.return_value = "DELETE 0"

    pool = MagicMock()
    pool.acquire.return_value.__aenter__.return_value = conn

    request = MagicMock()
    request.app.state.db = pool

    with pytest.raises(HTTPException) as exc:
        await delete_dashboard_card(card_id, request, user={"id": user_id})
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_update_dashboard_card():
    user_id = uuid4()
    card_id = uuid4()
    now = datetime.now(timezone.utc)

    conn = AsyncMock()
    conn.fetchrow.side_effect = [
        {"id": card_id, "title": "Old Title", "layout_order": 0},
        {
            "id": card_id,
            "title": "Updated Title",
            "card_type": "metric",
            "content": {"value": 42},
            "query_text": None,
            "source_id": None,
            "cube_id": None,
            "session_id": None,
            "layout_order": 2,
            "created_at": now,
        },
    ]

    pool = MagicMock()
    pool.acquire.return_value.__aenter__.return_value = conn

    request = MagicMock()
    request.app.state.db = pool

    body = DashboardCardUpdate(title="Updated Title", layout_order=2)
    updated = await update_dashboard_card(card_id, body, request, user={"id": user_id})
    assert updated["title"] == "Updated Title"
    assert updated["layout_order"] == 2


@pytest.mark.asyncio
async def test_update_dashboard_card_not_found():
    user_id = uuid4()
    card_id = uuid4()

    conn = AsyncMock()
    conn.fetchrow.return_value = None

    pool = MagicMock()
    pool.acquire.return_value.__aenter__.return_value = conn

    request = MagicMock()
    request.app.state.db = pool

    body = DashboardCardUpdate(title="Updated Title")
    with pytest.raises(HTTPException) as exc:
        await update_dashboard_card(card_id, body, request, user={"id": user_id})
    assert exc.value.status_code == 404


def test_dashboard_card_schema_validation_edges():
    with pytest.raises(ValidationError):
        # Empty title should be rejected
        DashboardCardCreate(title="", card_type="chart", content={})

    with pytest.raises(ValidationError):
        # Title too long (>200) should be rejected
        DashboardCardCreate(title="x" * 201, card_type="chart", content={})

    with pytest.raises(ValidationError):
        # Empty title update should be rejected
        DashboardCardUpdate(title="")

