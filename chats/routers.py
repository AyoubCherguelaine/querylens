import datetime
from typing import Annotated
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Header
from chats.controllers import (
    getSessionById,
    getSessionsByUserId,
    createSession,
    add_chat_to_session,
)
from users.routers import get_current_user, admin_required

# Create an instance of APIRouter
router = APIRouter(
    prefix="/chat",  # Optional: Define a common prefix for all routes in this router
    tags=["chat"],  # Optional: Add tags for grouping in the API documentation
)


@router.get("/session/{session_id}")
async def get_session(
    session_id: str, user: Annotated[dict, Depends(get_current_user)]
):
    session = await getSessionById(session_id, user.get("_id"))
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.get("/sessions")
async def get_sessions(user: Annotated[dict, Depends(get_current_user)]):
    sessions = await getSessionsByUserId(user.get("_id"))
    return sessions


@router.post("/session")
async def create_session(
    cube_id: str, user: Annotated[dict, Depends(get_current_user)]
):
    session_result = await createSession(
        user.get("_id"), cube_id, str(datetime.datetime.now())
    )
    return session_result
