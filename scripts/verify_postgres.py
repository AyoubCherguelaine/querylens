"""Run tests in a disposable DB on an existing local PostgreSQL container.
No credentials are printed or stored. Does not create a PostgreSQL container.
"""

import asyncio
import json
import os
import subprocess
import sys
from urllib.parse import quote
from uuid import uuid4

import asyncpg


async def main():
    container = os.environ.get("TEST_PG_CONTAINER")
    if not container:
        container = subprocess.check_output(
            ["docker", "compose", "ps", "-q", "postgres"], text=True
        ).strip()
        if not container:
            raise SystemExit("Start the project database first: docker compose up -d postgres")
    config = json.loads(subprocess.check_output(["docker", "inspect", container]))[0]
    env = dict(item.split("=", 1) for item in config["Config"]["Env"] if "=" in item)
    user = env.get("POSTGRES_USER", "postgres")
    password = env.get("POSTGRES_PASSWORD", "")
    port = config["NetworkSettings"]["Ports"]["5432/tcp"][0]["HostPort"]
    base = f"postgresql://{quote(user, safe='')}:{quote(password, safe='')}@127.0.0.1:{port}/"
    database = "chat_olap_verify_" + uuid4().hex[:12]
    connection = await asyncpg.connect(base + env.get("POSTGRES_DB", user))
    try:
        await connection.execute(f'CREATE DATABASE "{database}"')
        try:
            process = await asyncio.create_subprocess_exec(
                sys.executable,
                "-m",
                "pytest",
                "-q",
                env={**os.environ, "TEST_DATABASE_URL": base + database},
            )
            code = await process.wait()
        finally:
            await connection.execute(f'DROP DATABASE "{database}" WITH (FORCE)')
    finally:
        await connection.close()
    raise SystemExit(code)


if __name__ == "__main__":
    asyncio.run(main())
