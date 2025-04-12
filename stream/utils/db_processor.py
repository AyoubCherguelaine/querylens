

import json
import sqlite3
import streamlit as st

from agents.OLAPCubeExtractor import OLAPCubeExtractor


def extract_schema(db_path):
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        # Get all tables
        schema = {}
        tables = cursor.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name NOT LIKE 'sqlite_%'
        """).fetchall()
        for table in tables:
            table_name = table[0]
            # Get columns for each table
            columns = cursor.execute(f"PRAGMA table_info('{table_name}')").fetchall()
            schema[table_name] = {
                'columns': [(col[1], col[2]) for col in columns],
                'primary_key': next((col[1] for col in columns if col[5]), None)
            }

        return schema
    except Exception as e:
        st.error(f"Error extracting schema: {e}")
        return None

def extract_cube(db_path ):
    try:
        schema = extract_schema(db_path)
        extractor = OLAPCubeExtractor()
        olap_cubes = extractor.run(schema)
        olap_cubes_json = json.loads(olap_cubes.raw)
        return olap_cubes_json
    except Exception as e:
        st.sidebar.error(f"Error reading DB: {e}")
