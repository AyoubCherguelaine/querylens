from pydantic import BaseModel, EmailStr
from typing import List, Optional
from bson import ObjectId


class CubeCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    dimensions: List[str]
    measures: List[str]
    sql_query: str
    ownerId: ObjectId


class Cube(BaseModel):
    _id: ObjectId
    name: str
    description: Optional[str] = ""
    dimensions: List[str]
    measures: List[str]
    sql_query: str
    ownerId: ObjectId


class CubeOut(BaseModel):
    _id = ObjectId
    name: str
    description: Optional[str] = ""
    dimensions: List[str]
    measures: List[str]
    sql_query: str
    ownerId: ObjectId
