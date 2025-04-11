
from fastapi import HTTPException
from db.db import MongoDBClient
from cubes.models import CubeCreate, CubeOut , Cube
from bson import ObjectId

async def getCubeById(cube_id: str, user_id: str = None):
    mongoDbClient = MongoDBClient.get_instance()
    cube = mongoDbClient.cubes_collection.find_one({"_id": ObjectId(cube_id)})
    if not cube:
        return None
    if user_id and cube["ownerId"] != ObjectId(user_id):
        raise HTTPException(status_code=403, detail="Not authorized to access this cube")
    return CubeOut(**cube)

async def getCubesByOwnerId(owner_id: str):
    mongoDbClient = MongoDBClient.get_instance()
    cubes = mongoDbClient.cubes_collection.find({"ownerId": ObjectId(owner_id)})
    return [CubeOut(**cube) for cube in cubes]

async def createCube(cube: CubeCreate):
    mongoDbClient = MongoDBClient.get_instance()
    cube_dict = cube.dict()
    cube_dict["ownerId"] = ObjectId(cube_dict["ownerId"])
    new_cube_result = mongoDbClient.cubes_collection.insert_one(cube_dict)
    return {"msg": "Cube created" , "cube_id": str(new_cube_result.inserted_id)}



