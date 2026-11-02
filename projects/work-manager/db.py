import os
import sqlite3

from config import DB_PATH as _DEFAULT_DB_PATH


DB_PATH = _DEFAULT_DB_PATH


def get_db_connection():
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    # Enforce declared relations for every connection, including callers that
    # do not explicitly know about the schema policy.
    conn.execute("PRAGMA foreign_keys = ON")
    return conn
