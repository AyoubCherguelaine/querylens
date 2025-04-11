from pydantic import BaseModel, EmailStr
from typing import Optional
from bson import ObjectId

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
    _id = ObjectId
    email: EmailStr
    full_name: Optional[str]
    is_active: bool
    is_admin: bool


class User(BaseModel):
    # _id is an object id of mongo 
    _id = ObjectId
    email: EmailStr
    password: str
    full_name: Optional[str] = ""
    is_active: bool = True
    is_admin: bool = False