from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from bson import ObjectId

from db.utils import PyObjectId

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = ""

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    email: EmailStr
    full_name: Optional[str]
    is_active: bool
    is_admin: bool
    
class UserAdminOut(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    email: EmailStr
    full_name: Optional[str]
    is_active: bool
    is_admin: bool
    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        validate_by_name = True



class User(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    email: EmailStr
    password: str
    full_name: Optional[str] = ""
    is_active: bool = True
    is_admin: bool = False
    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        validate_by_name = True
