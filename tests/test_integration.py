"""Real PostgreSQL tests. TEST_DATABASE_URL must identify an isolated disposable DB."""

import asyncio
import os
from pathlib import Path

import asyncpg
import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.core.config import Settings
from tests.test_compiler import plan


@pytest.fixture
def client():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set TEST_DATABASE_URL to an isolated PostgreSQL database")

    async def setup():
        db = await asyncpg.connect(url)
        try:
            for migration in sorted(Path("migrations").glob("*.sql")):
                await db.execute(migration.read_text())
            imported = await db.fetch(
                "SELECT schema_name FROM chat_olap.sources WHERE kind IN ('csv','sqlite')"
            )
            from backend.services.compiler import quote

            for source in imported:
                await db.execute(f"DROP SCHEMA IF EXISTS {quote(source['schema_name'])} CASCADE")
            await db.execute("CREATE SCHEMA IF NOT EXISTS business")
            await db.execute("DROP TABLE IF EXISTS business.sales")
            await db.execute("""CREATE TABLE business.sales(id bigint PRIMARY KEY, region text,
                amount numeric(20,4), sold_at timestamptz)""")
            await db.execute("""INSERT INTO business.sales VALUES
                (1,'North',10.1001,'2026-01-01'),(2,'North',20.2002,'2026-01-02'),
                (3,'South',30.3003,'2026-02-01'),(4,NULL,NULL,'2026-02-02')""")
            await db.execute("TRUNCATE chat_olap.users CASCADE")
        finally:
            await db.close()

    asyncio.run(setup())
    settings = Settings(
        _env_file=None,
        database_url=url,
        analytics_database_url=url,
        analytics_schemas=["business"],
        jwt_secret="test-secret-" * 5,
        openai_api_key="",
        max_result_rows=2,
    )
    with TestClient(create_app(settings)) as value:
        yield value


def account(client, email="analyst@example.com"):
    body = {"email": email, "password": "a-strong-test-password"}
    assert client.post("/users/signup", json=body).status_code == 201
    response = client.post("/users/login", json=body)
    assert response.status_code == 200
    return {"Authorization": "Bearer " + response.json()["access_token"]}


def discover(client, headers):
    assert client.post("/cubes/discover", headers=headers).json()["discovered"] == 1
    return client.get("/cubes", headers=headers).json()[0]["id"]


def analyze(client, headers, cube_id, **overrides):
    return client.post(
        f"/cubes/{cube_id}/analyze", headers=headers, json={"plan": plan(**overrides).model_dump()}
    )


def test_health_auth_and_ownership(client):
    assert client.get("/health/ready").status_code == 200
    assert client.get("/cubes").status_code == 401
    headers = account(client)
    assert client.get("/users/me", headers=headers).json()["email"] == "analyst@example.com"
    cube_id = discover(client, headers)
    other = account(client, "other@example.com")
    assert client.get("/cubes", headers=other).json() == []
    assert analyze(client, other, cube_id).status_code == 404
    session = client.post("/chat/session", headers=headers, json={"cube_id": cube_id}).json()["id"]
    assert client.get(f"/chat/session/{session}", headers=other).status_code == 404
    assert client.post("/chat/session", headers=other, json={"cube_id": cube_id}).status_code == 404
    assert (
        client.post(
            "/users/login", json={"email": "analyst@example.com", "password": "incorrect"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/users/signup",
            json={"email": "analyst@example.com", "password": "a-strong-test-password"},
        ).status_code
        == 409
    )


def test_real_aggregates_filters_limits_and_precision(client):
    headers = account(client)
    cube_id = discover(client, headers)
    result = analyze(client, headers, cube_id).json()
    assert result["rows"] == [{"m0": 4}]
    result = analyze(
        client,
        headers,
        cube_id,
        groups=[{"field": "region", "grain": None}],
        metrics=[{"field": "amount", "aggregation": "sum"}],
        limit=10,
    ).json()
    assert result["truncated"] and len(result["rows"]) == 2
    assert result["rows"][0] == {"g0": "North", "m0": "30.3003"}
    filtered = analyze(
        client, headers, cube_id, filters=[{"field": "amount", "operator": "gt", "value": "20"}]
    ).json()
    assert filtered["rows"] == [{"m0": 2}]
    injection = analyze(
        client,
        headers,
        cube_id,
        filters=[
            {"field": "region", "operator": "eq", "value": "'; DROP TABLE business.sales; --"}
        ],
    ).json()
    assert injection["rows"] == [{"m0": 0}]
    nulls = analyze(
        client,
        headers,
        cube_id,
        filters=[{"field": "region", "operator": "is_null", "value": None}],
    ).json()
    assert nulls["rows"] == [{"m0": 1}]
    contains = analyze(
        client,
        headers,
        cube_id,
        filters=[{"field": "region", "operator": "contains", "value": "orth"}],
    ).json()
    assert contains["rows"] == [{"m0": 2}]
    wildcard = analyze(
        client,
        headers,
        cube_id,
        filters=[{"field": "region", "operator": "contains", "value": "%"}],
    ).json()
    assert wildcard["rows"] == [{"m0": 0}]
    monthly = analyze(
        client, headers, cube_id, groups=[{"field": "sold_at", "grain": "month"}]
    ).json()
    assert monthly["rows"][0]["m0"] == 2
    assert (
        analyze(
            client, headers, cube_id, metrics=[{"field": "missing", "aggregation": "sum"}]
        ).status_code
        == 422
    )
    assert (
        analyze(
            client,
            headers,
            cube_id,
            filters=[{"field": "amount", "operator": "eq", "value": "invalid"}],
        ).status_code
        == 422
    )
    assert len(client.get("/cubes", headers=headers).json()) == 1
    discover(client, headers)
    assert len(client.get("/cubes", headers=headers).json()) == 1


def test_chat_persistence_refusal_and_provider_failure(client, monkeypatch):
    headers = account(client)
    cube_id = discover(client, headers)
    session = client.post("/chat/session", headers=headers, json={"cube_id": cube_id}).json()["id"]
    endpoint = f"/chat/session/{session}/messages"
    assert (
        client.post(endpoint, headers=headers, json={"question": "count rows"}).status_code == 503
    )

    async def planned(*args):
        return plan()

    monkeypatch.setattr("backend.api.analytics.make_plan", planned)
    response = client.post(endpoint, headers=headers, json={"question": "count rows"})
    assert response.status_code == 200 and response.json()["rows"] == [{"m0": 4}]

    async def clarify(*args):
        return plan(clarification="Which business metric?")

    monkeypatch.setattr("backend.api.analytics.make_plan", clarify)
    assert (
        client.post(endpoint, headers=headers, json={"question": "profit?"}).json()["status"]
        == "clarification"
    )
    messages = client.get(f"/chat/session/{session}", headers=headers).json()["messages"]
    assert len(messages) == 2 and messages[0]["result"]["rows"] == [{"m0": 4}]


def test_stale_schema(client):
    headers = account(client)
    cube_id = discover(client, headers)

    async def change():
        db = await asyncpg.connect(os.environ["TEST_DATABASE_URL"])
        await db.execute("ALTER TABLE business.sales ADD COLUMN extra text")
        await db.close()

    asyncio.run(change())
    assert analyze(client, headers, cube_id).status_code == 422


def test_exact_profile(client):
    headers = account(client)
    cube_id = discover(client, headers)
    response = client.post(f"/cubes/{cube_id}/profile", headers=headers)
    assert response.status_code == 200
    result = response.json()
    amount = next(row for row in result["rows"] if row["field"] == "amount")
    assert amount == {"field": "amount", "null_count": 1, "distinct_count": 3}


@pytest.mark.asyncio
async def test_readonly_timeout_and_pool_recovery():
    from backend.database.pool import connect_pool, readonly

    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set TEST_DATABASE_URL to an isolated PostgreSQL database")
    pool = await connect_pool(url)
    try:
        with pytest.raises(asyncpg.ReadOnlySQLTransactionError):
            async with readonly(pool, 1000) as connection:
                await connection.execute("CREATE TABLE must_not_exist(id integer)")
        with pytest.raises(asyncpg.QueryCanceledError):
            async with readonly(pool, 100) as connection:
                await connection.execute("SELECT pg_sleep(1)")
        async with readonly(pool, 1000) as connection:
            assert await connection.fetchval("SELECT 1") == 1
            assert await connection.fetchval("SELECT to_regclass('must_not_exist')") is None
    finally:
        await pool.close()
