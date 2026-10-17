import asyncio
import json
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile
from pydantic import Field

from backend.api.dependencies import current_user
from backend.schemas import StrictModel
from backend.services.catalog import discover
from backend.services.import_parser import ImportInvalid, parse_file
from backend.services.sources import (
    available_definitions,
    connect_existing,
    import_dataset,
    save_cubes,
)

router = APIRouter(prefix="/sources", tags=["Data sources"])


class ExistingSource(StrictModel):
    schema_name: str = Field(min_length=1, max_length=63)


async def owned_source(request, source_id, user_id):
    async with request.app.state.db.acquire() as connection:
        source = await connection.fetchrow(
            "SELECT * FROM chat_olap.sources WHERE id=$1 AND owner_id=$2", source_id, user_id
        )
    if not source:
        raise HTTPException(404, "Source not found")
    if (
        source["kind"] == "existing"
        and source["schema_name"] not in request.app.state.settings.analytics_schemas
    ):
        raise HTTPException(403, "Source schema is no longer allowed")
    return dict(source)


def source_pool(request, source):
    return request.app.state.analytics if source["kind"] == "existing" else request.app.state.db


@router.get("")
async def list_sources(request: Request, user=Depends(current_user)):
    async with request.app.state.db.acquire() as connection:
        sources = await connection.fetch(
            """SELECT s.*,count(c.id)::int AS table_count
            FROM chat_olap.sources s LEFT JOIN chat_olap.cubes c ON c.source_id=s.id
            WHERE s.owner_id=$1 GROUP BY s.id ORDER BY s.created_at DESC,s.id""",
            user["id"],
        )
    # Saved imports remain usable even when an optional external analytics server is offline.
    available, warning = [], None
    try:
        definitions = await available_definitions(request)
        schemas = sorted({d["schema"] for d in definitions})
        available = [
            {"schema_name": schema, "table_count": sum(d["schema"] == schema for d in definitions)}
            for schema in schemas
        ]
    except (asyncpg.PostgresError, OSError, TimeoutError):
        warning = (
            "The configured external source is unavailable. Imported sources remain available."
        )
    settings = request.app.state.settings
    return {
        "sources": [dict(s) for s in sources],
        "available_schemas": available,
        "warning": warning,
        "limits": {
            "max_bytes": settings.upload_max_bytes,
            "max_rows": settings.import_max_rows,
            "max_tables": settings.import_max_tables,
            "max_columns": settings.import_max_columns,
        },
    }


@router.post("/connect", status_code=201)
async def connect(body: ExistingSource, request: Request, user=Depends(current_user)):
    try:
        return await connect_existing(request, user["id"], body.schema_name)
    except ImportInvalid as error:
        raise HTTPException(422, str(error))


async def parsed_upload(file, request):
    try:
        data = await file.read(request.app.state.settings.upload_max_bytes + 1)
        if len(data) > request.app.state.settings.upload_max_bytes:
            raise HTTPException(413, "File exceeds the configured upload size limit.")
        return await asyncio.to_thread(
            parse_file, data, file.filename or "", request.app.state.settings
        )
    except ImportInvalid as error:
        raise HTTPException(422, str(error))
    finally:
        await file.close()


@router.post("/preview")
async def preview(file: UploadFile, request: Request, user=Depends(current_user)):
    async with request.app.state.import_slots:
        return (await parsed_upload(file, request)).summary()


@router.post("/import", status_code=201)
async def import_source(
    file: UploadFile,
    request: Request,
    schema_name: str = Form(""),
    tables: str = Form(""),
    table_name: str = Form("data"),
    user=Depends(current_user),
):
    if len(schema_name) > 200 or len(table_name) > 200 or len(tables) > 20000:
        raise HTTPException(422, "Import options are too long.")
    selection = None
    if tables:
        try:
            selection = json.loads(tables)
            if not isinstance(selection, list) or not all(isinstance(t, str) for t in selection):
                raise ValueError("Invalid table list")
        except (ValueError, TypeError):
            raise HTTPException(422, "Tables must be a JSON array of table names.")
    try:
        async with request.app.state.import_slots:
            parsed = await parsed_upload(file, request)
            return await import_dataset(
                request.app.state.db,
                request.app.state.settings,
                user["id"],
                parsed,
                schema_name,
                selection,
                table_name,
            )
    except ImportInvalid as error:
        raise HTTPException(422, str(error))
    except asyncpg.QueryCanceledError:
        raise HTTPException(504, "Import timed out and was rolled back. Use a smaller dataset.")
    except asyncpg.LockNotAvailableError:
        raise HTTPException(409, "Another import is in progress. Retry shortly.")
    except (
        asyncpg.IntegrityConstraintViolationError,
        asyncpg.DataError,
        asyncpg.InvalidForeignKeyError,
        asyncpg.DatatypeMismatchError,
    ):
        raise HTTPException(
            422,
            "Data or constraints are incompatible with PostgreSQL. The entire import was rolled back; check key uniqueness, NULLs, foreign-key values and column types.",
        )


@router.get("/{source_id}")
async def source_detail(source_id: UUID, request: Request, user=Depends(current_user)):
    source = await owned_source(request, source_id, user["id"])
    async with request.app.state.db.acquire() as connection:
        cubes = await connection.fetch(
            "SELECT id,source_id,definition,updated_at FROM chat_olap.cubes WHERE source_id=$1 AND owner_id=$2 ORDER BY source_table",
            source_id,
            user["id"],
        )
    return {"source": source, "cubes": [dict(c) for c in cubes]}


@router.post("/{source_id}/discover")
async def refresh_source(source_id: UUID, request: Request, user=Depends(current_user)):
    source = await owned_source(request, source_id, user["id"])
    definitions = await discover(
        source_pool(request, source), request.app.state.settings, schemas=[source["schema_name"]]
    )
    async with request.app.state.db.acquire() as connection:
        async with connection.transaction():
            await save_cubes(connection, user["id"], source_id, definitions)
    return {"discovered": len(definitions)}
