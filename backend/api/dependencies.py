import json
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

bearer = HTTPBearer(auto_error=False)


async def current_user(
    request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)
):
    try:
        if not credentials:
            raise ValueError("Missing credentials")
        payload = jwt.decode(
            credentials.credentials,
            request.app.state.settings.jwt_secret.get_secret_value(),
            algorithms=["HS256"],
            audience="chat-olap",
            options={"require": ["exp", "sub", "aud"]},
        )
        user_id = UUID(payload["sub"])
    except (jwt.InvalidTokenError, ValueError, KeyError, TypeError):
        raise HTTPException(401, "Authentication required", headers={"WWW-Authenticate": "Bearer"})
    async with request.app.state.db.acquire() as connection:
        user = await connection.fetchrow(
            "SELECT id,email,full_name,credits,model_settings FROM chat_olap.users WHERE id=$1 AND is_active", user_id
        )
    if not user:
        raise HTTPException(401, "Account unavailable")
    res = dict(user)
    if isinstance(res.get("model_settings"), str):
        try:
            res["model_settings"] = json.loads(res["model_settings"])
        except Exception:
            res["model_settings"] = {}
    elif res.get("model_settings") is None:
        res["model_settings"] = {
            "model": "gpt-4o-mini",
            "process_mode": "standard",
            "temperature": 0.1,
            "max_steps": 12,
            "custom_instructions": "",
        }
    if res.get("credits") is None:
        res["credits"] = 100
    return res


async def owned_cube(request, cube_id, user_id):
    async with request.app.state.db.acquire() as connection:
        cube = await connection.fetchrow(
            """SELECT c.*,s.kind AS source_kind FROM chat_olap.cubes c
            JOIN chat_olap.sources s ON s.id=c.source_id AND s.owner_id=c.owner_id AND s.schema_name=c.source_schema
            WHERE c.id=$1 AND c.owner_id=$2""",
            cube_id,
            user_id,
        )
    if not cube:
        raise HTTPException(404, "Cube not found")
    if (
        cube["source_kind"] == "existing"
        and cube["source_schema"] not in request.app.state.settings.analytics_schemas
    ):
        raise HTTPException(403, "Cube schema is no longer allowed")
    return dict(cube)


def cube_pool(request, cube):
    return (
        request.app.state.analytics if cube["source_kind"] == "existing" else request.app.state.db
    )
