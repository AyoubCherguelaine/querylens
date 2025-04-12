from fastapi import HTTPException
from chats.models import ChatCreate, SessionsOut
from chats.utils import convert_object_ids
from db.db import MongoDBClient
from bson import ObjectId
from bson.errors import InvalidId


async def getSessionById(session_id: str | ObjectId, user_id: str | ObjectId= None):
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID is required")
    if not session_id:
        raise HTTPException(status_code=400, detail="Session ID is required")
    try:
        user_obj_id = user_id if isinstance(user_id, ObjectId) else ObjectId(user_id)
        session_obj_id = session_id if isinstance(session_id, ObjectId) else ObjectId(session_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid user ID")
    
    mongoDbClient = MongoDBClient.get_instance()
    session = mongoDbClient.sessions_collection.find_one({"_id": session_obj_id})
    if not session:
        return None
    if str(session["user_id"]) != str(user_obj_id):
        raise HTTPException(
            status_code=403, detail="Not authorized to access this session"
        )
    return SessionsOut(**session)


async def getSessionsByUserId(user_id: str | ObjectId):
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID is required")
    try:
        user_obj_id = user_id if isinstance(user_id, ObjectId) else ObjectId(user_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid user ID")
    mongoDbClient = MongoDBClient.get_instance()
    sessions = mongoDbClient.sessions_collection.find({"user_id": user_obj_id})
    if not sessions:
        raise HTTPException(status_code=404, detail="No sessions found for this user")
    sessions = list(sessions)
    sessions_out = [SessionsOut(**convert_object_ids(session)) for session in sessions]
    return sessions_out


async def createSession(
    user_id: str | ObjectId, cube_id: str | ObjectId, timestamp: str
):
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID is required")
    if not cube_id:
        raise HTTPException(status_code=400, detail="Cube ID is required")

    try:
        user_obj_id = user_id if isinstance(user_id, ObjectId) else ObjectId(user_id)
        cube_obj_id = cube_id if isinstance(cube_id, ObjectId) else ObjectId(cube_id)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail="Invalid user_id or cube_id format")

    session_data = {
        "user_id": user_obj_id,
        "cube_id": cube_obj_id,
        "timestamp": timestamp,
        "messages": [],
    }

    mongo_client = MongoDBClient.get_instance()
    result = mongo_client.sessions_collection.insert_one(session_data)

    return {"session_id": str(result.inserted_id)}


async def add_chat_to_session(session_id: str, chat: ChatCreate):
    mongoDbClient = MongoDBClient.get_instance()
    chat_dict = chat.dict()
    chat_dict["user_id"] = ObjectId(chat_dict["user_id"])
    chat_dict["cube_id"] = ObjectId(chat_dict["cube_id"])
    new_chat_result = mongoDbClient.sessions_collection.update_one(
        {"_id": ObjectId(session_id)}, {"$push": {"messages": chat_dict}}
    )
    if new_chat_result.modified_count == 0:
        raise HTTPException(
            status_code=404, detail="Session not found or no changes made"
        )
    return {"msg": "Chat added to session"}
