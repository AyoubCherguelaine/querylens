import asyncio
import json
from contextlib import suppress
from uuid import UUID, uuid4

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from backend.api.dependencies import cube_pool, current_user, owned_cube
from backend.core.models_config import get_model_credit_cost
from backend.schemas import (
    Analysis,
    DashboardCardCreate,
    DashboardCardUpdate,
    Question,
    SessionCreate,
    SessionTables,
    TableSuggest,
)
from backend.services.analysis import execute_plan
from backend.services.chat_agent import run_agent, suggest_tables
from backend.services.chat_scope import resolve_cubes, save_tables, table_ids
from backend.services.credits import QUESTION_COST, check_and_deduct_credits
from backend.services.planner import PlannerUnavailable
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


@router.post("/cubes/suggest-tables")
async def suggest_tables_for_question(
    body: TableSuggest, request: Request, user=Depends(current_user)
):
    """Given a natural-language question and a source_id, return the most relevant cube IDs."""
    settings = request.app.state.settings
    async with request.app.state.db.acquire() as connection:
        rows = await connection.fetch(
            "SELECT id,definition FROM chat_olap.cubes WHERE source_id=$1 AND owner_id=$2 ORDER BY source_table",
            body.source_id,
            user["id"],
        )
    if not rows:
        raise HTTPException(404, "No tables found for this source.")
    cubes_data = [{"id": str(row["id"]), **row["definition"]} for row in rows]
    suggestion = await suggest_tables(body.question, cubes_data, settings)
    # Map table refs back to cube IDs
    ref_to_id = {f"{c['schema']}.{c['table']}": c["id"] for c in cubes_data}
    suggested_ids = [ref_to_id[ref] for ref in suggestion["table_refs"] if ref in ref_to_id]
    # Fallback: if no matches, return all cube IDs
    if not suggested_ids:
        suggested_ids = [c["id"] for c in cubes_data[:5]]
    return {
        "cube_ids": suggested_ids,
        "reasoning": suggestion.get("reasoning", ""),
    }


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
    selected = await resolve_cubes(request, user["id"], body.cube_id, body.cube_ids)
    limit = request.app.state.settings.max_chat_sessions
    session_id = uuid4()
    async with request.app.state.db.acquire() as connection:
        async with connection.transaction():
            if limit is not None:
                # Lock the user row so concurrent requests cannot both pass the quota check.
                await connection.execute(
                    "SELECT 1 FROM chat_olap.users WHERE id=$1 FOR UPDATE", user["id"]
                )
                count = await connection.fetchval(
                    "SELECT count(*) FROM chat_olap.sessions WHERE owner_id=$1", user["id"]
                )
                if count >= limit:
                    raise HTTPException(409, f"This account has reached the {limit}-chat limit.")
            await connection.execute(
                "INSERT INTO chat_olap.sessions(id,owner_id,cube_id) VALUES($1,$2,$3)",
                session_id,
                user["id"],
                body.cube_id,
            )
            await save_tables(connection, session_id, selected)
    return {"id": session_id, "cube_id": body.cube_id, "cube_ids": [c["id"] for c in selected]}


@router.get("/chat/sessions")
async def sessions(request: Request, user=Depends(current_user)):
    async with request.app.state.db.acquire() as connection:
        rows = await connection.fetch(
            """SELECT id,cube_id,created_at,
                ARRAY(SELECT sc.cube_id FROM chat_olap.session_cubes sc
                      WHERE sc.session_id=s.id ORDER BY sc.position) AS cube_ids
                FROM chat_olap.sessions s WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100""",
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
        "cube_ids": await table_ids(request, session),
        "messages": [dict(m) for m in messages],
    }


@router.delete("/chat/session/{session_id}")
async def delete_session(session_id: UUID, request: Request, user=Depends(current_user)):
    await owned_session(request, session_id, user["id"])
    async with request.app.state.db.acquire() as connection:
        async with connection.transaction():
            await connection.execute(
                "DELETE FROM chat_olap.dashboard_cards WHERE session_id = $1 AND owner_id = $2",
                session_id,
                user["id"],
            )
            await connection.execute(
                "DELETE FROM chat_olap.sessions WHERE id = $1 AND owner_id = $2",
                session_id,
                user["id"],
            )
    return {"status": "deleted", "id": str(session_id)}



@router.post("/chat/session/{session_id}/tables")
async def update_tables(
    session_id: UUID, body: SessionTables, request: Request, user=Depends(current_user)
):
    session = await owned_session(request, session_id, user["id"])
    selected = await resolve_cubes(request, user["id"], session["cube_id"], body.cube_ids)
    async with request.app.state.db.acquire() as connection:
        async with connection.transaction():
            await connection.execute(
                "SELECT 1 FROM chat_olap.sessions WHERE id=$1 FOR UPDATE", session_id
            )
            await save_tables(connection, session_id, selected)
    return {"cube_ids": [c["id"] for c in selected]}


@router.post("/chat/session/{session_id}/messages")
async def ask(session_id: UUID, body: Question, request: Request, user=Depends(current_user)):
    session = await owned_session(request, session_id, user["id"])
    selected = await resolve_cubes(
        request, user["id"], session["cube_id"], await table_ids(request, session)
    )
    cube = selected[0]
    settings = request.app.state.settings
    if not settings.openai_api_key.get_secret_value():
        raise HTTPException(503, "Configure OPENAI_API_KEY to use the conversational agent.")
    limit = settings.max_questions_per_session
    limit_message = (
        f"This chat has reached the {limit}-question limit. Start a new chat."
        if limit is not None
        else ""
    )

    user_model = (user.get("model_settings") or {}).get("model") or settings.openai_model
    question_cost = get_model_credit_cost(user_model, default_cost=QUESTION_COST)

    async with request.app.state.db.acquire() as connection:
        user_credits = await connection.fetchval(
            "SELECT credits FROM chat_olap.users WHERE id=$1", user["id"]
        )
        if user_credits is not None and user_credits < question_cost:
            raise HTTPException(
                402,
                f"Insufficient credits. Asking a question with {user_model} requires {question_cost} credits, but your current balance is {user_credits}.",
            )
        if limit is not None:
            asked = await connection.fetchval(
                "SELECT count(*) FROM chat_olap.messages WHERE session_id=$1", session_id
            )
            if asked >= limit:
                raise HTTPException(409, limit_message)
        previous = await connection.fetch(
            """SELECT question,result FROM (
                SELECT question,result,created_at,id FROM chat_olap.messages
                WHERE session_id=$1 ORDER BY created_at DESC,id DESC LIMIT 30
            ) recent ORDER BY created_at,id""",
            session_id,
        )

    async def execute(emit=None):
        try:
            # Grant agent full awareness of all tables in this source profile without requiring manual user selection
            async with request.app.state.db.acquire() as connection:
                source_cubes = await connection.fetch(
                    "SELECT id,source_id,definition FROM chat_olap.cubes WHERE source_id=$1 AND owner_id=$2 ORDER BY source_table",
                    cube["source_id"],
                    user["id"],
                )
            all_source_cubes = [dict(c) for c in source_cubes] if source_cubes else selected
            result = await run_agent(
                cube_pool(request, cube),
                settings,
                cube["definition"],
                body.question,
                previous,
                emit,
                selected_cubes=[c["definition"] for c in all_source_cubes],
                model_settings=user.get("model_settings"),
            )
        except PlannerUnavailable as error:
            raise HTTPException(503, str(error))
        result["cube_ids"] = [str(c["id"]) for c in all_source_cubes]
        async with request.app.state.db.acquire() as connection:
            async with connection.transaction():
                # Re-check under a session lock: concurrent questions may have landed meanwhile.
                await connection.execute(
                    "SELECT 1 FROM chat_olap.sessions WHERE id=$1 FOR UPDATE", session_id
                )
                if limit is not None:
                    asked = await connection.fetchval(
                        "SELECT count(*) FROM chat_olap.messages WHERE session_id=$1", session_id
                    )
                    if asked >= limit:
                        raise HTTPException(409, limit_message)
                remaining_credits = await check_and_deduct_credits(
                    connection, user["id"], question_cost, f"question:{user_model}:{body.question[:30]}"
                )
                result["credits_remaining"] = remaining_credits
                result["credits_spent"] = question_cost
                result["model_used"] = user_model
                await connection.execute(
                    "INSERT INTO chat_olap.messages(id,session_id,question,result) VALUES($1,$2,$3,$4)",
                    uuid4(),
                    session_id,
                    body.question,
                    result,
                )
        return result

    if not body.stream:
        return await execute()

    async def events():
        queue = asyncio.Queue()

        async def produce():
            try:
                result = await execute(queue.put)
                await queue.put({"type": "result", "result": result})
            except HTTPException as error:
                await queue.put({"type": "error", "detail": error.detail})
            except Exception:
                await queue.put({"type": "error", "detail": "Agent request failed. Please retry."})

        task = asyncio.create_task(produce())
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=10)
                except TimeoutError:
                    yield json.dumps({"type": "heartbeat"}) + "\n"
                    continue
                yield json.dumps(event, default=str) + "\n"
                if event["type"] in {"result", "error"}:
                    break
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    return StreamingResponse(
        events(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


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


@router.get("/dashboards/cards")
async def get_dashboard_cards(request: Request, user=Depends(current_user)):
    async with request.app.state.db.acquire() as connection:
        rows = await connection.fetch(
            """
            SELECT id, title, card_type, content, query_text, source_id, cube_id, session_id, layout_order, created_at
            FROM chat_olap.dashboard_cards
            WHERE owner_id = $1
            ORDER BY layout_order ASC, created_at DESC
            """,
            user["id"],
        )
    return [
        {
            "id": str(r["id"]),
            "title": r["title"],
            "card_type": r["card_type"],
            "content": r["content"],
            "query_text": r["query_text"],
            "source_id": str(r["source_id"]) if r["source_id"] else None,
            "cube_id": str(r["cube_id"]) if r["cube_id"] else None,
            "session_id": str(r["session_id"]) if r["session_id"] else None,
            "layout_order": r["layout_order"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows
    ]


@router.post("/dashboards/cards", status_code=201)
async def create_dashboard_card(
    body: DashboardCardCreate, request: Request, user=Depends(current_user)
):
    card_id = uuid4()
    async with request.app.state.db.acquire() as connection:
        row = await connection.fetchrow(
            """
            INSERT INTO chat_olap.dashboard_cards(
                id, owner_id, title, card_type, content, query_text, source_id, cube_id, session_id, layout_order
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id, title, card_type, content, query_text, source_id, cube_id, session_id, layout_order, created_at
            """,
            card_id,
            user["id"],
            body.title,
            body.card_type,
            body.content,
            body.query_text,
            body.source_id,
            body.cube_id,
            body.session_id,
            body.layout_order,
        )
    return {
        "id": str(row["id"]),
        "title": row["title"],
        "card_type": row["card_type"],
        "content": row["content"],
        "query_text": row["query_text"],
        "source_id": str(row["source_id"]) if row["source_id"] else None,
        "cube_id": str(row["cube_id"]) if row["cube_id"] else None,
        "session_id": str(row["session_id"]) if row["session_id"] else None,
        "layout_order": row["layout_order"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
    }


@router.delete("/dashboards/cards/{card_id}")
async def delete_dashboard_card(card_id: UUID, request: Request, user=Depends(current_user)):
    async with request.app.state.db.acquire() as connection:
        deleted = await connection.execute(
            "DELETE FROM chat_olap.dashboard_cards WHERE id = $1 AND owner_id = $2",
            card_id,
            user["id"],
        )
    if deleted == "DELETE 0":
        raise HTTPException(404, "Dashboard card not found.")
    return {"status": "deleted", "id": str(card_id)}


@router.patch("/dashboards/cards/{card_id}")
async def update_dashboard_card(
    card_id: UUID, body: DashboardCardUpdate, request: Request, user=Depends(current_user)
):
    async with request.app.state.db.acquire() as connection:
        current = await connection.fetchrow(
            "SELECT id, title, layout_order FROM chat_olap.dashboard_cards WHERE id = $1 AND owner_id = $2",
            card_id,
            user["id"],
        )
        if not current:
            raise HTTPException(404, "Dashboard card not found.")
        new_title = body.title if body.title is not None else current["title"]
        new_order = body.layout_order if body.layout_order is not None else current["layout_order"]
        row = await connection.fetchrow(
            """
            UPDATE chat_olap.dashboard_cards
            SET title = $1, layout_order = $2
            WHERE id = $3 AND owner_id = $4
            RETURNING id, title, card_type, content, query_text, source_id, cube_id, session_id, layout_order, created_at
            """,
            new_title,
            new_order,
            card_id,
            user["id"],
        )
    return {
        "id": str(row["id"]),
        "title": row["title"],
        "card_type": row["card_type"],
        "content": row["content"],
        "query_text": row["query_text"],
        "source_id": str(row["source_id"]) if row["source_id"] else None,
        "cube_id": str(row["cube_id"]) if row["cube_id"] else None,
        "session_id": str(row["session_id"]) if row["session_id"] else None,
        "layout_order": row["layout_order"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
    }

