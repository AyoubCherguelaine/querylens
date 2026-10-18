from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from backend.services.chat_scope import resolve_cubes


async def test_scope_rejects_separate_database_pools(monkeypatch):
    primary, extra, user = uuid4(), uuid4(), uuid4()
    db, analytics = object(), object()
    request = SimpleNamespace(
        app=SimpleNamespace(state=SimpleNamespace(db=db, analytics=analytics))
    )
    owned = AsyncMock(
        side_effect=[
            {"id": primary, "source_kind": "existing"},
            {"id": extra, "source_kind": "csv"},
        ]
    )
    monkeypatch.setattr("backend.services.chat_scope.owned_cube", owned)
    with pytest.raises(HTTPException) as error:
        await resolve_cubes(request, user, primary, [primary, extra])
    assert error.value.status_code == 422
    assert "same database" in error.value.detail
    assert owned.await_count == 2


async def test_scope_deduplicates_and_preserves_primary(monkeypatch):
    primary, extra, user = uuid4(), uuid4(), uuid4()
    request = SimpleNamespace(
        app=SimpleNamespace(state=SimpleNamespace(db=object(), analytics=object()))
    )
    owned = AsyncMock(
        side_effect=[{"id": primary, "source_kind": "csv"}, {"id": extra, "source_kind": "sqlite"}]
    )
    monkeypatch.setattr("backend.services.chat_scope.owned_cube", owned)
    result = await resolve_cubes(request, user, primary, [extra, primary, extra])
    assert [c["id"] for c in result] == [primary, extra]


async def test_scope_limit_precedes_database_work():
    with pytest.raises(HTTPException) as error:
        await resolve_cubes(None, uuid4(), uuid4(), [uuid4() for _ in range(20)])
    assert error.value.status_code == 422
