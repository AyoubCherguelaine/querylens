from fastapi import FastAPI

app = FastAPI()
from db.db import MongoDBClient
from users.routers import router as user_router # Import routers from other files


# Include the routers
app.include_router(user_router)

@app.get("/")
def read_root():
    return {"message": "Welcome to the FastAPI app!"}


def _init_config():
    mongo_client = MongoDBClient.get_instance()
    #check if the connection is established
    if mongo_client.test_connection():
        print("MongoDB connection is established.")
    else:
        print("MongoDB connection failed.")
        return
    
    
_init_config()