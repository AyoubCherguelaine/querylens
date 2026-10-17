import asyncio
import logging
import time
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from backend.api import analytics, auth, sources
from backend.core.config import get_settings
from backend.core.logging import configure_logging
from backend.core.uploads import UploadBodyLimit
from backend.database.pool import connect_pool

logger = logging.getLogger(__name__)


def create_app(settings=None):
    @asynccontextmanager
    async def lifespan(app):
        config = settings or get_settings()
        configure_logging(config.log_level)
        app.state.settings = config
        app.state.import_slots = asyncio.Semaphore(2)
        app.state.upload_slots = asyncio.Semaphore(2)
        app.state.db = await connect_pool(config.database_url.get_secret_value())
        try:
            source_url = config.analytics_database_url or config.database_url
            app.state.analytics = await connect_pool(source_url.get_secret_value())
            try:
                async with app.state.db.acquire() as connection:
                    version = await connection.fetchval(
                        "SELECT max(version) FROM chat_olap.schema_migrations"
                    )
                    if version != 2:
                        raise RuntimeError("Apply database migrations before starting the API")
                logger.info("service.started")
                yield
            finally:
                await app.state.analytics.close()
        finally:
            await app.state.db.close()

    app = FastAPI(title="Chat OLAP", version="0.2.0", lifespan=lifespan)

    @app.middleware("http")
    async def request_logging(request: Request, call_next):
        request_id, started = str(uuid4()), time.monotonic()
        try:
            response = await call_next(request)
        except Exception as error:
            logger.error(
                "request.failed",
                extra={"request_id": request_id, "error_type": type(error).__name__},
            )
            response = JSONResponse(
                status_code=500,
                content={"detail": "Internal service error", "request_id": request_id},
            )
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "request.completed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "route": getattr(request.scope.get("route"), "path", "unknown"),
                "status": response.status_code,
                "duration_ms": round((time.monotonic() - started) * 1000),
            },
        )
        return response

    @app.get("/health/live", tags=["Health"])
    async def live():
        return {"status": "ok"}

    @app.get("/health/ready", tags=["Health"])
    async def ready(request: Request):
        try:
            for pool in (request.app.state.db, request.app.state.analytics):
                async with pool.acquire() as connection:
                    await connection.fetchval("SELECT 1")
        except Exception:
            return JSONResponse(status_code=503, content={"status": "unavailable"})
        return {"status": "ready"}

    app.add_middleware(UploadBodyLimit)
    app.include_router(sources.router)
    app.include_router(auth.router)
    app.include_router(analytics.router)
    return app
