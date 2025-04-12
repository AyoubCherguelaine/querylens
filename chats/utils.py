def convert_object_ids(session: dict) -> dict:
    if "_id" in session:
        session["_id"] = str(session["_id"])
    if "user_id" in session:
        session["user_id"] = str(session["user_id"])
    if "cube_id" in session and session["cube_id"] is not None:
        session["cube_id"] = str(session["cube_id"])
    return session
