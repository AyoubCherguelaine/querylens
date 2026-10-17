"""Apply pending SQL migrations explicitly, never during API import/startup."""

import asyncio
from pathlib import Path

import asyncpg

from backend.core.config import get_settings


async def main():
    connection = await asyncpg.connect(get_settings().database_url.get_secret_value())
    try:
        async with connection.transaction():
            await connection.execute("SELECT pg_advisory_xact_lock(73012891)")
            exists = await connection.fetchval("SELECT to_regclass('chat_olap.schema_migrations')")
            applied = (
                await connection.fetch("SELECT version FROM chat_olap.schema_migrations")
                if exists
                else []
            )
            versions = {row["version"] for row in applied}
            paths = sorted(Path("migrations").glob("*.sql"))
            if not paths:
                raise SystemExit(f"No migrations found in {Path('migrations').resolve()}")
            for path in paths:
                version = int(path.name.split("_", 1)[0])
                if version in versions:
                    continue
                await connection.execute(path.read_text())
                await connection.execute(
                    "INSERT INTO chat_olap.schema_migrations(version) VALUES($1) ON CONFLICT DO NOTHING",
                    version,
                )
                print(f"Applied {path.name}")
            row = await connection.fetchrow(
                "SELECT current_database() AS db, inet_server_addr() AS host,"
                " (SELECT max(version) FROM chat_olap.schema_migrations) AS version"
            )
            print(f"Database {row['db']} on {row['host']} is at migration version {row['version']}")
    finally:
        await connection.close()


if __name__ == "__main__":
    asyncio.run(main())
