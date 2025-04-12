from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from bson import ObjectId

from db.utils import PyObjectId


class Chats(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    user_id: PyObjectId
    user_message: str
    timestamp: str
    bot_response: str
    data_example: str
    cube_id: Optional[PyObjectId] = None

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        validate_by_name = True


class ChatsOut(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    user_id: Optional[PyObjectId] = None
    user_message: str
    timestamp: str
    bot_response: str
    data_example: str
    cube_id: Optional[PyObjectId] = None

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        validate_by_name = True


class ChatCreate(BaseModel):
    user_id: Optional[PyObjectId] = None
    user_message: str
    timestamp: str
    bot_response: str
    data_example: str
    cube_id: Optional[PyObjectId] = None

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        validate_by_name = True


class Sessions(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    user_id: Optional[PyObjectId] = None
    timestamp: str
    messages: List[Chats]
    cube_id: Optional[PyObjectId] = None
    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        validate_by_name = True


class SessionsCreate(BaseModel):
    user_id: Optional[PyObjectId] = None
    timestamp: str
    messages: Optional[List[Chats]] = []
    cube_id: Optional[PyObjectId] = None
    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        validate_by_name = True

class SessionsOut(BaseModel):
    id: str = Field(default=None, alias="_id")
    user_id: str = None
    timestamp: str
    messages: List[Chats]
    cube_id: str = None
