from uuid import UUID, uuid4

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request

from backend.api.dependencies import cube_pool, current_user, owned_cube
from backend.schemas import Analysis, Question, SessionCreate
from backend.services.analysis import execute_plan
from backend.services.planner import PlannerUnavailable, make_plan
from backend.services.sources import available_definitions, connect_existing

router = APIRouter(tags=["Analytics"])


@router.get("/cubes")
async def cubes(request: Request, user=Depends(current_user)):
    async with request.app.state.db.acquire() as connection:
        rows = await connection.fetch(
            "SELECT id,source_id,definition,updated_at FROM chat_olap.cubes WHERE owner_id=$1 ORDER BY source_schema,source_table",
            user["id"],
        )
    return [dict(row) for row in rows]


@router.post("/cubes/discover")
async def discover_cubes(request: Request, user=Depends(current_user)):
    definitions = await available_definitions(request)
    for schema in sorted({d["schema"] for d in definitions}):
        await connect_existing(request, user["id"], schema)
    return {"discovered": len(definitions)}


@router.post("/cubes/{cube_id}/analyze")
async def analyze(cube_id: UUID, body: Analysis, request: Request, user=Depends(current_user)):
    cube = await owned_cube(request, cube_id, user["id"])
    return await run(request, cube["definition"], body.plan, cube_pool(request, cube))


async def run(request, definition, plan, pool=None):
    if plan.clarification:
        return {"status": "clarification", "answer": plan.clarification}
    try:
        return await execute_plan(
            pool or request.app.state.analytics, request.app.state.settings, definition, plan
        )
    except ValueError as error:
        raise HTTPException(422, str(error))
    except asyncpg.QueryCanceledError:
        raise HTTPException(504, "Analysis exceeded the query timeout. Narrow the filters.")
    except (asyncpg.DataError, asyncpg.PostgresError):
        raise HTTPException(
            422,
            "The source rejected this analysis. Check filter values, permissions and rediscover the schema.",
        )


@router.post("/chat/session", status_code=201)
async def new_session(body: SessionCreate, request: Request, user=Depends(current_user)):
    await owned_cube(request, body.cube_id, user["id"])
    session_id = uuid4()
    async with request.app.state.db.acquire() as connection:
        await connection.execute(
            "INSERT INTO chat_olap.sessions(id,owner_id,cube_id) VALUES($1,$2,$3)",
            session_id,
            user["id"],
            body.cube_id,
        )
    return {"id": session_id, "cube_id": body.cube_id}


@router.get("/chat/sessions")
async def sessions(request: Request, user=Depends(current_user)):
    async with request.app.state.db.acquire() as connection:
        rows = await connection.fetch(
            "SELECT id,cube_id,created_at FROM chat_olap.sessions WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",
            user["id"],
        )
    return [dict(row) for row in rows]


async def owned_session(request, session_id, user_id):
    async with request.app.state.db.acquire() as connection:
        session = await connection.fetchrow(
            "SELECT * FROM chat_olap.sessions WHERE id=$1 AND owner_id=$2", session_id, user_id
        )
    if not session:
        raise HTTPException(404, "Session not found")
    return session


@router.get("/chat/session/{session_id}")
async def history(session_id: UUID, request: Request, user=Depends(current_user)):
    session = await owned_session(request, session_id, user["id"])
    async with request.app.state.db.acquire() as connection:
        messages = await connection.fetch(
            "SELECT id,question,result,created_at FROM chat_olap.messages WHERE session_id=$1 ORDER BY created_at,id LIMIT 200",
            session_id,
        )
    return {
        "id": session_id,
        "cube_id": session["cube_id"],
        "messages": [dict(m) for m in messages],
    }


@router.post("/chat/session/{session_id}/messages")
async def ask(session_id: UUID, body: Question, request: Request, user=Depends(current_user)):
    session = await owned_session(request, session_id, user["id"])
    cube = await owned_cube(request, session["cube_id"], user["id"])
    try:
        plan = await make_plan(cube["definition"], body.question, request.app.state.settings)
    except PlannerUnavailable as error:
        raise HTTPException(503, str(error))
    result = await run(request, cube["definition"], plan, cube_pool(request, cube))
    async with request.app.state.db.acquire() as connection:
        await connection.execute(
            "INSERT INTO chat_olap.messages(id,session_id,question,result) VALUES($1,$2,$3,$4)",
            uuid4(),
            session_id,
            body.question,
            result,
        )
    return result


@router.post("/cubes/{cube_id}/profile")
async def profile(cube_id: UUID, request: Request, user=Depends(current_user)):
    from backend.services.analysis import profile_cube

    cube = await owned_cube(request, cube_id, user["id"])
    try:
        return await profile_cube(
            cube_pool(request, cube), request.app.state.settings, cube["definition"]
        )
    except asyncpg.QueryCanceledError:
        raise HTTPException(
            504, "Profiling exceeded the query timeout. Use a smaller source table."
        )
    except asyncpg.PostgresError:
        raise HTTPException(
            422, "Cannot profile this source. Check permissions and rediscover cubes."
        )
