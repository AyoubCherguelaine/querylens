import json
from contextlib import asynccontextmanager

import asyncpg


async def connect_pool(url):
    async def initialize(connection):
        await connection.set_type_codec(
            "jsonb", schema="pg_catalog", encoder=json.dumps, decoder=json.loads, format="text"
        )

    return await asyncpg.create_pool(
        url, min_size=1, max_size=10, timeout=10, command_timeout=30, init=initialize
    )


@asynccontextmanager
async def readonly(pool, timeout_ms):
    async with pool.acquire() as connection:
        async with connection.transaction(readonly=True):
            await connection.execute(
                "SELECT set_config('statement_timeout', $1, true)", str(timeout_ms)
            )
            await connection.execute("SET LOCAL TIME ZONE 'UTC'")
            yield connection
