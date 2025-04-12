from fastapi import APIRouter, Depends, HTTPException, Header

from db.db import MongoDBClient

# from models import UserCreate, UserLogin, UserOut
from users.models import UserCreate, UserLogin, UserOut
from users.utils import hash_password, verify_password
from users.auth import create_access_token, verify_token
from bson import ObjectId

# Create an instance of APIRouter
router = APIRouter(
    prefix="/users",  # Optional: Define a common prefix for all routes in this router
    tags=["users"],  # Optional: Add tags for grouping in the API documentation
)


async def get_current_user(token: str = Header(...)):
    payload = verify_token(token)
    mongoDbClient = MongoDBClient.get_instance()
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = mongoDbClient.users_collection.find_one({"email": payload["sub"]})
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="User is disabled or not found")
    return user


def admin_required(user=Depends(get_current_user)):
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return user


# ---------------- ENDPOINTS ---------------- #


@router.post("/signup")
async def signup(user: UserCreate):
    mongoDbClient = MongoDBClient.get_instance()
    check_user = mongoDbClient.users_collection.find_one({"email": user.email})
    if check_user:
        raise HTTPException(400, detail="Email already registered")
    hashed = hash_password(user.password)
    user_dict = user.dict()
    user_dict.update({"password": hashed, "is_active": True, "is_admin": False})
    mongoDbClient.users_collection.insert_one(user_dict)
    return {"msg": "User created"}


@router.post("/login")
async def login(user: UserLogin):
    mongoDbClient = MongoDBClient.get_instance()
    db_user = mongoDbClient.users_collection.find_one({"email": user.email})
    if not db_user or not verify_password(user.password, db_user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not db_user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account disabled")
    token = create_access_token(
        {"sub": db_user["email"], "is_admin": db_user["is_admin"],
         "is_active": db_user["is_active"],
         "_id": str(db_user["_id"])}
    )
    return {"access_token": token, "user": UserOut(**db_user)}


@router.get("/me", response_model=UserOut)
async def get_me(user=Depends(get_current_user)):
    return UserOut(**user)


# ------------- ADMIN ENDPOINTS ------------- #


@router.get("/admin/users", dependencies=[Depends(admin_required)])
async def list_users():
    mongoDbClient = MongoDBClient.get_instance()
    users = mongoDbClient.users_collection.find().to_list(100)
    for u in users:
        u["_id"] = str(u["_id"])
    return users


@router.post("/admin/disable_user/{email}", dependencies=[Depends(admin_required)])
async def disable_user(email: str):
    mongoDbClient = MongoDBClient.get_instance()
    result = mongoDbClient.users_collection.update_one(
        {"email": email}, {"$set": {"is_active": False}}
    )
    if result.modified_count == 0:
        raise HTTPException(404, detail="User not found or already disabled")
    return {"msg": f"{email} disabled"}


@router.post("/admin/enable_user/{email}", dependencies=[Depends(admin_required)])
async def enable_user(email: str):
    mongoDbClient = MongoDBClient.get_instance()
    result = mongoDbClient.users_collection.update_one(
        {"email": email}, {"$set": {"is_active": True}}
    )
    if result.modified_count == 0:
        raise HTTPException(404, detail="User not found or already enabled")
    return {"msg": f"{email} enabled"}


@router.post("/admin/make_admin/{email}", dependencies=[Depends(admin_required)])
async def make_admin(email: str):
    mongoDbClient = MongoDBClient.get_instance()
    result = mongoDbClient.users_collection.update_one(
        {"email": email}, {"$set": {"is_admin": True}}
    )
    if result.modified_count == 0:
        raise HTTPException(404, detail="User not found")
    return {"msg": f"{email} promoted to admin"}
