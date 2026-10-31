import asyncio
import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import asyncpg
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from pwdlib import PasswordHash

from backend.api.dependencies import current_user
from backend.core.models_config import get_allowed_models, is_model_allowed, load_models_config
from backend.schemas import CreditRecharge, Login, ModelSettings, Signup
from backend.services.credits import add_credits, get_user_credits_data

router = APIRouter(prefix="/users", tags=["Accounts"])
hasher = PasswordHash.recommended()
DUMMY_HASH = hasher.hash("dummy-password-for-timing")


@router.post("/signup", status_code=201)
async def signup(body: Signup, request: Request):
    if not request.app.state.settings.allow_signup:
        raise HTTPException(403, "Registration is disabled")
    password_hash = await asyncio.to_thread(hasher.hash, body.password)
    user_id = uuid4()
    try:
        async with request.app.state.db.acquire() as connection:
            async with connection.transaction():
                await connection.execute(
                    "INSERT INTO chat_olap.users(id,email,full_name,password_hash,credits) VALUES($1,$2,$3,$4,100)",
                    user_id,
                    str(body.email).lower(),
                    body.full_name,
                    password_hash,
                )
                await connection.execute(
                    "INSERT INTO chat_olap.credit_transactions(id,user_id,amount,action,balance_after) VALUES($1,$2,100,'welcome_bonus',100)",
                    uuid4(),
                    user_id,
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
    model_settings = user["model_settings"] if "model_settings" in user and user["model_settings"] else {}
    if isinstance(model_settings, str):
        try:
            model_settings = json.loads(model_settings)
        except Exception:
            model_settings = {}
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": settings.token_minutes * 60,
        "user": {
            "id": str(user["id"]),
            "email": str(user["email"]),
            "full_name": str(user["full_name"]),
            "credits": user["credits"] if "credits" in user and user["credits"] is not None else 100,
            "model_settings": model_settings,
        },
    }


@router.get("/me")
async def me(user=Depends(current_user)):
    return user


@router.get("/settings")
async def get_settings(user=Depends(current_user)):
    models = [m.model_dump() for m in get_allowed_models()]
    return {
        "model_settings": user.get("model_settings") or {
            "model": "gpt-4o-mini",
            "process_mode": "standard",
            "temperature": 0.1,
            "max_steps": 12,
            "custom_instructions": "",
        },
        "credits": user.get("credits", 100),
        "allowed_models": models,
        "provider": "openai",
    }


@router.get("/models")
async def get_models():
    config = load_models_config()
    return {
        "provider": config.provider,
        "description": config.description,
        "models": [m.model_dump() for m in config.models],
    }


@router.patch("/settings")
async def update_settings(body: ModelSettings, request: Request, user=Depends(current_user)):
    if not is_model_allowed(body.model):
        allowed = [m.id for m in get_allowed_models()]
        raise HTTPException(
            422,
            f"Model '{body.model}' is not in the allowed models configuration. Allowed OpenAI models: {', '.join(allowed)}.",
        )
    settings_dict = body.model_dump()
    async with request.app.state.db.acquire() as connection:
        await connection.execute(
            "UPDATE chat_olap.users SET model_settings=$1 WHERE id=$2",
            json.dumps(settings_dict),
            user["id"],
        )
    return {"message": "Settings updated", "model_settings": settings_dict}


@router.get("/credits")
async def get_credits(request: Request, user=Depends(current_user)):
    async with request.app.state.db.acquire() as connection:
        return await get_user_credits_data(connection, user["id"])


@router.post("/credits/recharge")
async def recharge_credits(body: CreditRecharge, request: Request, user=Depends(current_user)):
    async with request.app.state.db.acquire() as connection:
        async with connection.transaction():
            new_balance = await add_credits(
                connection, user["id"], body.amount, "user_recharge"
            )
    return {"message": "Credits recharged successfully", "credits": new_balance}

