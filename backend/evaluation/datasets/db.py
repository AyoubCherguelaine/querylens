"""Database provisioning and isolation for evaluation runs."""

import logging
import re
import sqlite3
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional
from uuid import uuid4

import asyncpg

from backend.database.pool import connect_pool
from backend.evaluation.datasets.base import BaseDataset

logger = logging.getLogger(__name__)


class MockPostgresError(asyncpg.PostgresError):
    """PostgresError subclass with message and sqlstate for SQLite compatibility."""

    def __init__(self, message: str, sqlstate: str = "42703"):
        super().__init__(message)
        self.message = message
        self.sqlstate = sqlstate


class MockRecord(dict):
    """Dictionary that mimics asyncpg.Record."""

    def __getitem__(self, key: Any) -> Any:
        # Allow indexing by integer position as well
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)

    def get(self, key: Any, default: Any = None) -> Any:
        if isinstance(key, int):
            vals = list(self.values())
            return vals[key] if 0 <= key < len(vals) else default
        return super().get(key, default)


class MockStatementAttribute:
    def __init__(self, name: str):
        self.name = name


class MockCursor:
    def __init__(self, rows: List[MockRecord]):
        self._rows = rows
        self._pos = 0

    async def fetch(self, n: int) -> List[MockRecord]:
        batch = self._rows[self._pos : self._pos + n]
        self._pos += n
        return batch


class MockStatement:
    def __init__(self, names: List[str], rows: List[MockRecord]):
        self._names = names
        self._rows = rows

    def get_attributes(self) -> List[MockStatementAttribute]:
        return [MockStatementAttribute(n) for n in self._names]

    async def cursor(self) -> MockCursor:
        return MockCursor(self._rows)


class MockConnection:
    """Async connection interface wrapping SQLite for in-memory evaluation."""

    def __init__(self, sqlite_conn: sqlite3.Connection):
        self._db = sqlite_conn

    @asynccontextmanager
    async def transaction(self, readonly: bool = True):
        yield self

    async def execute(self, query: str, *args) -> str:
        # Ignore session settings like SET LOCAL or statement_timeout
        cleaned = query.strip()
        if cleaned.upper().startswith("SET ") or "SET_CONFIG" in cleaned.upper():
            return "SET"
        cur = self._db.cursor()
        cur.execute(query, args)
        return "OK"

    async def prepare(self, query: str) -> MockStatement:
        # Adapt PostgreSQL-specific syntax for SQLite execution if needed
        adapted = self._adapt_sql(query)
        cur = self._db.cursor()
        try:
            cur.execute(adapted)
        except Exception as e:
            raise MockPostgresError(str(e)) from e
        cols = [d[0] for d in cur.description] if cur.description else []
        rows = [MockRecord(zip(cols, row)) for row in cur.fetchall()]
        return MockStatement(cols, rows)

    async def fetch(self, query: str, *args) -> List[MockRecord]:
        adapted = self._adapt_sql(query)
        cur = self._db.cursor()
        try:
            cur.execute(adapted, args)
        except Exception as e:
            raise MockPostgresError(str(e)) from e
        cols = [d[0] for d in cur.description] if cur.description else []
        return [MockRecord(zip(cols, row)) for row in cur.fetchall()]

    async def fetchrow(self, query: str, *args) -> Optional[MockRecord]:
        records = await self.fetch(query, *args)
        return records[0] if records else None

    async def fetchval(self, query: str, *args) -> Any:
        record = await self.fetchrow(query, *args)
        if record:
            return record[0]
        return None

    def _adapt_sql(self, sql: str) -> str:
        """Lightweight adaptation of common Postgres expressions to SQLite."""
        adapted = sql.strip().removesuffix(";")
        # Replace date_trunc('month', col) with strftime('%Y-%m-01', col)
        adapted = re.sub(
            r"date_trunc\s*\(\s*['\"]month['\"]\s*,\s*([A-Za-z0-9_.]+)\s*\)",
            r"strftime('%Y-%m-01', \1)",
            adapted,
            flags=re.IGNORECASE,
        )
        # Remove PostgreSQL type casts like ::numeric, ::text, ::int
        adapted = re.sub(r"::[A-Za-z0-9_]+", "", adapted)
        # Remove ILIKE -> LIKE
        adapted = re.sub(r"\bILIKE\b", "LIKE", adapted, flags=re.IGNORECASE)
        return adapted


class MockAsyncpgPool:
    """In-memory asyncpg-compatible connection pool."""

    def __init__(self, sqlite_conn: sqlite3.Connection, definitions: List[Dict[str, Any]]):
        self._sqlite = sqlite_conn
        self.definitions = definitions

    @asynccontextmanager
    async def acquire(self):
        yield MockConnection(self._sqlite)

    async def close(self):
        self._sqlite.close()


class InMemoryEvaluationDatabase:
    """Isolated in-memory database using SQLite for fast, offline, and CI evaluations."""

    def __init__(self, datasets: List[BaseDataset]):
        self.datasets = datasets
        self._db: Optional[sqlite3.Connection] = None
        self._pool: Optional[MockAsyncpgPool] = None

    async def setup(self) -> MockAsyncpgPool:
        self._db = sqlite3.connect(":memory:", check_same_thread=False)

        # Register common analytic functions
        def date_trunc(unit, date_str):
            if not date_str:
                return None
            s = str(date_str)
            if unit.lower() in ("month", "'month'"):
                return s[:7] + "-01"
            if unit.lower() in ("year", "'year'"):
                return s[:4] + "-01-01"
            return s[:10]

        self._db.create_function("date_trunc", 2, date_trunc)
        self._db.create_function("now", 0, lambda: "2026-11-01 12:00:00")

        all_definitions = []
        for dataset in self.datasets:
            # In SQLite, attach an in-memory database schema for the dataset
            self._db.execute(f"ATTACH DATABASE ':memory:' AS {dataset.schema_name}")
            for ddl in dataset.get_ddl_statements():
                # Strip schema creation if attached
                if ddl.strip().upper().startswith("CREATE SCHEMA"):
                    continue
                # Strip schema prefix in REFERENCES clause for SQLite compatibility
                adapted_ddl = re.sub(
                    rf"REFERENCES\s+{re.escape(dataset.schema_name)}\.([A-Za-z0-9_]+)",
                    r"REFERENCES \1",
                    ddl,
                    flags=re.IGNORECASE,
                )
                self._db.execute(adapted_ddl)
            for seed in dataset.get_seed_statements():
                self._db.execute(seed)
            all_definitions.extend(dataset.get_definitions())

        self._db.commit()
        self._pool = MockAsyncpgPool(self._db, all_definitions)
        return self._pool

    async def teardown(self):
        if self._pool:
            await self._pool.close()
            self._pool = None
        self._db = None


class PostgresEvaluationDatabase:
    """Isolated evaluation database running on a PostgreSQL server."""

    def __init__(self, base_url: str, datasets: List[BaseDataset]):
        self.base_url = base_url
        self.datasets = datasets
        self.run_id = uuid4().hex[:8]
        self.created_schemas = []
        self._pool = None

    async def setup(self):
        self._pool = await connect_pool(self.base_url)
        all_definitions = []

        async with self._pool.acquire() as conn:
            for dataset in self.datasets:
                schema_name = f"{dataset.schema_name}_{self.run_id}"
                self.created_schemas.append(schema_name)

                await conn.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema_name}"')
                for ddl in dataset.get_ddl_statements():
                    # Substitute isolated schema name
                    adapted_ddl = ddl.replace(dataset.schema_name, schema_name)
                    await conn.execute(adapted_ddl)
                for seed in dataset.get_seed_statements():
                    adapted_seed = seed.replace(dataset.schema_name, schema_name)
                    await conn.execute(adapted_seed)

                # Collect semantic definitions
                all_definitions.extend(dataset.get_definitions())

        return self._pool

    async def teardown(self):
        if self._pool and self.created_schemas:
            try:
                async with self._pool.acquire() as conn:
                    for s in self.created_schemas:
                        await conn.execute(f'DROP SCHEMA IF EXISTS "{s}" CASCADE')
            except Exception as e:
                logger.warning(f"Error dropping evaluation schemas: {e}")
            finally:
                await self._pool.close()
                self._pool = None
