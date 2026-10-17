"""Temporary demo DB on your configured PostgreSQL server. Removed on Ctrl+C.
Requires CREATEDB on DATABASE_URL. No rows in existing databases are modified.
"""

import asyncio
import os
import signal
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

import asyncpg

from backend.core.config import get_settings


async def main():
    api_port = os.environ.get("DEMO_API_PORT", "8001")
    web_port = os.environ.get("DEMO_WEB_PORT", "3001")
    settings = get_settings()
    url = settings.database_url.get_secret_value()
    connection = await asyncpg.connect(url)
    name = "chat_olap_demo_" + uuid4().hex[:10]
    await connection.execute(f'CREATE DATABASE "{name}"')
    await connection.close()
    parts = urlsplit(url)
    demo_url = urlunsplit((parts.scheme, parts.netloc, "/" + name, parts.query, parts.fragment))
    processes = []
    stop = asyncio.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        asyncio.get_running_loop().add_signal_handler(sig, stop.set)
    try:
        db = await asyncpg.connect(demo_url)
        try:
            for migration in sorted(Path("migrations").glob("*.sql")):
                await db.execute(migration.read_text())
            await db.execute("CREATE SCHEMA demo")
            await db.execute("""CREATE TABLE demo.sales (
                id bigint PRIMARY KEY, region text, product text, amount numeric(16,2), sold_at date)""")
            await db.execute("""INSERT INTO demo.sales SELECT n,
                (ARRAY['North','South','East','West'])[1+(n%4)],
                (ARRAY['Notebook','Monitor','Keyboard'])[1+(n%3)],
                (20+(n*17)%800)::numeric, DATE '2026-01-01'+(n%270)::int
                FROM generate_series(1,240) n""")
        finally:
            await db.close()
        env = {
            **os.environ,
            "DATABASE_URL": demo_url,
            "ANALYTICS_DATABASE_URL": demo_url,
            "ANALYTICS_SCHEMAS": '["demo"]',
            "BACKEND_URL": f"http://127.0.0.1:{api_port}",
            "PORT": web_port,
            "COOKIE_SECURE": "false",
            "APP_ORIGIN": f"http://localhost:{web_port}",
        }
        processes.append(
            await asyncio.create_subprocess_exec(
                sys.executable,
                "-m",
                "uvicorn",
                "main:app",
                "--host",
                "127.0.0.1",
                "--port",
                api_port,
                "--no-access-log",
                env=env,
            )
        )
        processes.append(
            await asyncio.create_subprocess_exec(
                "npm", "run", "start", cwd="frontend", env=env, start_new_session=True
            )
        )
        print(
            f"Temporary demo: http://localhost:{web_port} — create an account, then open Data sources.",
            flush=True,
        )
        await stop.wait()
    finally:
        for index, process in reversed(list(enumerate(processes))):
            if process.returncode is None:
                if index == 1:
                    os.killpg(process.pid, signal.SIGTERM)
                else:
                    process.terminate()
        for process in processes:
            await process.wait()
        cleanup = await asyncpg.connect(url)
        try:
            await cleanup.execute(f'DROP DATABASE "{name}" WITH (FORCE)')
        finally:
            await cleanup.close()


if __name__ == "__main__":
    asyncio.run(main())
