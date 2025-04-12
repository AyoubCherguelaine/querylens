
import sqlite3

import pandas as pd
from agents.CubeQueryGeneration import CubeQueryGeneration


def query_cube(prompt: str, cube: dict[str, any]):
    """Very simple semantic parser for demo."""
    queryGenerator = CubeQueryGeneration(cube)
    new_query = queryGenerator.run(prompt)
    return new_query.raw
    
    
def process_query(query: str, db_path: str, cube: dict[str, any]):
    """Process a query and return the result."""
    try:
        raw_query = query_cube(query, cube)

        conn = sqlite3.connect(db_path)

        # Connect and execute
        with sqlite3.connect(db_path) as conn:
            df = pd.read_sql_query(raw_query, conn)

        # Convert DataFrame to Markdown format
        return df.to_markdown(index=False)
    except Exception as e:
        return f"Error: {e}"