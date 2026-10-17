import asyncio
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import asyncpg
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from pwdlib import PasswordHash

from backend.api.dependencies import current_user
from backend.schemas import Login, Signup

router = APIRouter(prefix="/users", tags=["Accounts"])
hasher = PasswordHash.recommended()
DUMMY_HASH = hasher.hash("dummy-password-for-timing")


@router.post("/signup", status_code=201)
async def signup(body: Signup, request: Request):
    if not request.app.state.settings.allow_signup:
        raise HTTPException(403, "Registration is disabled")
    password_hash = await asyncio.to_thread(hasher.hash, body.password)
    try:
        async with request.app.state.db.acquire() as connection:
            await connection.execute(
                "INSERT INTO chat_olap.users(id,email,full_name,password_hash) VALUES($1,$2,$3,$4)",
                uuid4(),
                str(body.email).lower(),
                body.full_name,
                password_hash,
            )
    except asyncpg.UniqueViolationError:
        raise HTTPException(409, "Email already registered")
    return {"message": "Account created"}


@router.post("/login")
async def login(body: Login, request: Request):
    async with request.app.state.db.acquire() as connection:
        user = await connection.fetchrow(
            "SELECT * FROM chat_olap.users WHERE email=$1", str(body.email).lower()
        )
    valid = await asyncio.to_thread(
        hasher.verify, body.password, user["password_hash"] if user else DUMMY_HASH
    )
    if not user or not valid or not user["is_active"]:
        raise HTTPException(401, "Invalid credentials")
    settings = request.app.state.settings
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": str(user["id"]),
            "aud": "chat-olap",
            "iat": now,
            "exp": now + timedelta(minutes=settings.token_minutes),
        },
        settings.jwt_secret.get_secret_value(),
        algorithm="HS256",
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": settings.token_minutes * 60,
        "user": {k: str(user[k]) for k in ("id", "email", "full_name")},
    }


@router.get("/me")
async def me(user=Depends(current_user)):
    return user
