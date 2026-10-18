"""Resolve the owned tables a conversation may query on one database connection."""

from fastapi import HTTPException

from backend.api.dependencies import cube_pool, owned_cube


async def resolve_cubes(request, owner_id, primary_id, cube_ids):
    ids = list(dict.fromkeys([primary_id, *cube_ids]))
    if len(ids) > 20:
        raise HTTPException(422, "Select at most 20 tables per chat.")
    cubes = [await owned_cube(request, cube_id, owner_id) for cube_id in ids]
    pool = cube_pool(request, cubes[0])
    if any(cube_pool(request, cube) is not pool for cube in cubes[1:]):
        raise HTTPException(422, "Selected tables must share the same database connection.")
    return cubes


async def table_ids(request, session):
    async with request.app.state.db.acquire() as connection:
        rows = await connection.fetch(
            "SELECT cube_id FROM chat_olap.session_cubes WHERE session_id=$1 ORDER BY position",
            session["id"],
        )
    return [row["cube_id"] for row in rows] or [session["cube_id"]]


async def save_tables(connection, session_id, cubes):
    await connection.execute("DELETE FROM chat_olap.session_cubes WHERE session_id=$1", session_id)
    await connection.executemany(
        "INSERT INTO chat_olap.session_cubes(session_id,cube_id,position) VALUES($1,$2,$3)",
        [(session_id, cube["id"], index) for index, cube in enumerate(cubes)],
    )
