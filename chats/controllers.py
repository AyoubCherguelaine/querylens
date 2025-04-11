
from fastapi import HTTPException
from db.db import MongoDBClient
from bson import ObjectId

from chats.models import chats, chatsOut, chatCreate,sessionsCreate, sessionsOut

async def getSessionById(session_id: str, user_id: str = None):
    mongoDbClient = MongoDBClient.get_instance()
    session = mongoDbClient.sessions_collection.find_one({"_id": ObjectId(session_id)})
    if not session:
        return None
    if user_id and session["user_id"] != ObjectId(user_id):
        raise HTTPException(status_code=403, detail="Not authorized to access this session")
    return sessionsOut(**session)

async def getSessionsByUserId(user_id: str):
    mongoDbClient = MongoDBClient.get_instance()
    sessions = mongoDbClient.sessions_collection.find({"user_id": ObjectId(user_id)})
    return [sessionsOut(**session) for session in sessions]

async def createSession(session: sessionsCreate):
    mongoDbClient = MongoDBClient.get_instance()
    session_dict = session.dict()
    session_dict["user_id"] = ObjectId(session_dict["user_id"])
    new_session_result = mongoDbClient.sessions_collection.insert_one(session_dict)
    return {"msg": "Session created" , "session_id": str(new_session_result.inserted_id)}