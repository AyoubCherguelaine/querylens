from pymongo import MongoClient
from os import getenv
from pymongo.errors import ConnectionFailure
from pymongo.collection import Collection
from typing import Optional


class MongoDBClient:
    """
    A singleton class to handle MongoDB Atlas connections and database operations.
    """
    _instance: Optional['MongoDBClient'] = None
    users_collection: Optional[Collection] = None
    cubes_collection: Optional[Collection] = None
    schemas_chats_collection: Optional[Collection] = None

    def __new__(cls, mongo_url: str = None, db_name: str = "chat_olap"):
        """
        Ensure only one instance of MongoDBClient is created (Singleton Pattern).
        
        Args:
            mongo_url (str): The MongoDB Atlas connection string. If not provided, it will be fetched from the environment variable "MONGO_URL".
            db_name (str): The name of the database to connect to.
        
        Returns:
            MongoDBClient: The singleton instance of MongoDBClient.
        """
        if cls._instance is None:
            # Create the instance if it doesn't exist
            cls._instance = super(MongoDBClient, cls).__new__(cls)
            cls._instance.mongo_url = mongo_url or getenv("MONGO_URL")
            if not cls._instance.mongo_url:
                raise ValueError("MongoDB connection string is missing. Set the 'MONGO_URL' environment variable.")
            
            cls._instance.db_name = db_name
            cls._instance.client = None
            cls._instance.db = None
            cls._instance.connect()
        
        return cls._instance

    def connect(self):
        """
        Connect to MongoDB Atlas and initialize the database object.
        """
        try:
            # Create a MongoClient instance
            self.client = MongoClient(self.mongo_url, serverSelectionTimeoutMS=3000)
            
            # Test the connection by pinging the server
            self.client.admin.command('ping')
            print("Connection to MongoDB Atlas was successful!")
            
            # Initialize the database object
            self.db = self.client[self.db_name]
            
            # Initialize commonly used collections
            self.users_collection = self.db["users"]
            self.cubes_collection = self.db["cubes"]
            self.sessions_collection = self.db["sessions"]
            self.schemas_collection = self.db["schemas"]
            self.schemas_chats_collection = self.db["schemas_chats"]
        
        except ConnectionFailure as e:
            print(f"Failed to connect to MongoDB Atlas: {e}")
            self.client = None
            self.db = None

    def test_connection(self)->bool:
        """
        Test the MongoDB connection and list collections in the database.
        """
        if self.db is not None:

            print(f"Connected to database: {self.db_name}")
            print("Collections in the database:", self.db.list_collection_names())
            return True
        else:
            print("Could not establish a connection.")
            return False

    @classmethod
    def get_instance(cls):
        """
        Get the singleton instance of MongoDBClient.
        
        Returns:
            MongoDBClient: The singleton instance of MongoDBClient.
        """
        if cls._instance is None:
            cls._instance = MongoDBClient()
        return cls._instance


# Example usage
if __name__ == "__main__":
    # Get the singleton instance of MongoDBClient
    mongo_client = MongoDBClient.get_instance()
    
    # Test the connection
    mongo_client.test_connection()
