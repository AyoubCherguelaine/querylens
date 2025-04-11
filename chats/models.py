from pydantic import BaseModel, EmailStr
from typing import List, Optional
from bson import ObjectId

class chats(BaseModel):
    _id = ObjectId
    user_id: ObjectId
    user_message: str
    timestamp: str
    # after that we will extract bot as an object
    bot_response: str
    cube_id: ObjectId


class chatsOut(BaseModel):
    _id = ObjectId
    user_id: ObjectId
    user_message: str
    timestamp: str
    bot_response: str
    cube_id: ObjectId


class chatCreate(BaseModel):
    user_id: ObjectId
    user_message: str
    timestamp: str
    bot_response: str
    cube_id: ObjectId


class sessions(BaseModel):
    _id = ObjectId
    user_id: ObjectId
    session_id: str
    timestamp: str
    messages: List[chats]
    
class sessionsCreate(BaseModel):
    user_id: ObjectId
    session_id: str
    timestamp: str
    messages: List[chats] | None = []

class sessionsOut(BaseModel):
    _id = ObjectId
    user_id: ObjectId
    timestamp: str
    messages: List[chats]

