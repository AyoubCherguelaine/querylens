"""Execute semantic cubes against an explicitly configured disposable PostgreSQL DB."""

import os
from decimal import Decimal
from uuid import uuid4

import asyncpg
import pytest

from backend.core.config import Settings
from backend.services.analysis import execute_plan, profile_cube
from backend.services.catalog import discover
from tests.test_compiler import plan


@pytest.mark.asyncio
async def test_real_semantic_cube_joins_grain_nulls_and_drift():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set TEST_DATABASE_URL to an isolated PostgreSQL database")
    schema = "semantic_" + uuid4().hex[:12]
    settings = Settings(
        _env_file=None, database_url=url, jwt_secret="s" * 40, analytics_schemas=[schema]
    )
    pool = await asyncpg.create_pool(url, min_size=1, max_size=1)
    try:
        async with pool.acquire() as c:
            await c.execute(f'CREATE SCHEMA "{schema}"')
            await c.execute(f'''CREATE TABLE "{schema}".customers(id bigint PRIMARY KEY, name text);
                CREATE TABLE "{schema}".orders(id bigint PRIMARY KEY,
                    customer_id bigint REFERENCES "{schema}".customers, ordered_at date, amount numeric);
                CREATE TABLE "{schema}".lines(id bigint PRIMARY KEY,
                    order_id bigint REFERENCES "{schema}".orders, quantity bigint, unit_price numeric);
                INSERT INTO "{schema}".customers VALUES (1,'North');
                INSERT INTO "{schema}".orders VALUES (1,1,'2026-01-01',500),(2,NULL,'2026-01-02',200);
                INSERT INTO "{schema}".lines VALUES (1,1,2,10.1234),(2,1,3,20),(3,2,1,8),(4,NULL,1,NULL);
                ANALYZE "{schema}".lines''')
        cubes = {d["table"]: d for d in await discover(pool, settings)}
        assert cubes["lines"]["kind"] == "fact"
        assert cubes["orders"]["relationships"][0]["target_table"] == "customers"
        result = await execute_plan(
            pool,
            settings,
            cubes["lines"],
            plan(
                groups=[{"field": "order.customer.name", "grain": None}],
                metrics=[
                    {"field": "__extended_amount", "aggregation": "sum"},
                    {"field": None, "aggregation": "count"},
                ],
            ),
        )
        assert result["rows"] == [
            {"g0": "North", "m0": "80.2468", "m1": 2},
            {"g0": None, "m0": "8", "m1": 2},
        ]
        assert Decimal(result["rows"][0]["m0"]) == Decimal("80.2468")
        count = await execute_plan(pool, settings, cubes["orders"], plan())
        assert count["rows"] == [{"m0": 2}]  # child lines never multiply order count
        profile = await profile_cube(pool, settings, cubes["lines"])
        assert len(profile["rows"]) == 4  # only physical base columns
        async with pool.acquire() as c:
            await c.execute(f'ALTER TABLE "{schema}".customers ADD COLUMN region text')
        with pytest.raises(ValueError, match="Source schema changed"):
            await execute_plan(pool, settings, cubes["lines"], plan())
    finally:
        async with pool.acquire() as c:
            await c.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
        await pool.close()
