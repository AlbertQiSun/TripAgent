import sqlite3
import json
import os
import hashlib
import math

DB_FILE = "tripagent.db"

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    # Adding password_hash for authentication
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            password_hash TEXT,
            preferences TEXT
        )
    ''')
    # If the table exists from previous version without password_hash, add it
    try:
        c.execute("ALTER TABLE users ADD COLUMN password_hash TEXT")
    except sqlite3.OperationalError:
        pass # Column already exists
        
    c.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            title TEXT,
            history_json TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(username) REFERENCES users(username)
        )
    ''')

    # ── Community Tables ────────────────────────────────────────
    c.execute('''
        CREATE TABLE IF NOT EXISTS community_trips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            destination TEXT,
            title TEXT,
            plan_json TEXT,
            profile_summary TEXT,
            embedding TEXT,
            avg_rating REAL DEFAULT 0,
            review_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(username) REFERENCES users(username)
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS community_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id INTEGER,
            username TEXT,
            rating INTEGER,
            comment TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(trip_id) REFERENCES community_trips(id),
            FOREIGN KEY(username) REFERENCES users(username)
        )
    ''')
    conn.commit()
    conn.close()

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def register_user(username: str, password: str) -> bool:
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    try:
        c.execute("INSERT INTO users (username, password_hash, preferences) VALUES (?, ?, ?)", 
                  (username, hash_password(password), ""))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()

def verify_user(username: str, password: str) -> bool:
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT password_hash FROM users WHERE username=?", (username,))
    row = c.fetchone()
    conn.close()
    if row and row[0] == hash_password(password):
        return True
    return False

def get_user_preferences(username: str) -> str:
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT preferences FROM users WHERE username=?", (username,))
    row = c.fetchone()
    conn.close()
    return row[0] if row else ""

def save_user_preferences(username: str, preferences: str):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        UPDATE users SET preferences=? WHERE username=?
    ''', (preferences, username))
    conn.commit()
    conn.close()

def save_session(username: str, title: str, history_json: str) -> int:
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        INSERT INTO sessions (username, title, history_json)
        VALUES (?, ?, ?)
    ''', (username, title, history_json))
    session_id = c.lastrowid
    conn.commit()
    conn.close()
    return session_id

def update_session(session_id: int, title: str, history_json: str):
    """Update an existing session's content."""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        UPDATE sessions SET title=?, history_json=?, created_at=CURRENT_TIMESTAMP WHERE id=?
    ''', (title, history_json, session_id))
    conn.commit()
    conn.close()

def get_sessions(username: str):
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT id, title, created_at FROM sessions WHERE username=? ORDER BY created_at DESC", (username,))
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_session_detail(session_id: int):
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT history_json FROM sessions WHERE id=?", (session_id,))
    row = c.fetchone()
    conn.close()
    if row:
        return json.loads(row["history_json"])
    return None


# ── Community Functions ──────────────────────────────────────────────────

def publish_trip(username: str, destination: str, title: str, plan_json: str, profile_summary: str, embedding: list[float]) -> int:
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        INSERT INTO community_trips (username, destination, title, plan_json, profile_summary, embedding)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (username, destination, title, plan_json, profile_summary, json.dumps(embedding)))
    trip_id = c.lastrowid
    conn.commit()
    conn.close()
    return trip_id

def unpublish_trip(trip_id: int, username: str) -> bool:
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("DELETE FROM community_trips WHERE id=? AND username=?", (trip_id, username))
    deleted = c.rowcount > 0
    if deleted:
        c.execute("DELETE FROM community_reviews WHERE trip_id=?", (trip_id,))
    conn.commit()
    conn.close()
    return deleted

def get_community_trips(destination: str = None, limit: int = 20):
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    if destination:
        c.execute("""
            SELECT id, destination, title, profile_summary, avg_rating, review_count, created_at 
            FROM community_trips 
            WHERE LOWER(destination) LIKE ? 
            ORDER BY avg_rating DESC, created_at DESC LIMIT ?
        """, (f"%{destination.lower()}%", limit))
    else:
        c.execute("""
            SELECT id, destination, title, profile_summary, avg_rating, review_count, created_at 
            FROM community_trips 
            ORDER BY created_at DESC LIMIT ?
        """, (limit,))
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_community_trip_detail(trip_id: int):
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT id, username, destination, title, plan_json, profile_summary, avg_rating, review_count, created_at FROM community_trips WHERE id=?", (trip_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        return None
    trip = dict(row)
    # Get reviews
    c.execute("SELECT id, username, rating, comment, created_at FROM community_reviews WHERE trip_id=? ORDER BY created_at DESC", (trip_id,))
    reviews = [dict(r) for r in c.fetchall()]
    conn.close()
    trip["reviews"] = reviews
    trip["plan"] = json.loads(trip.pop("plan_json"))
    return trip

def add_review(trip_id: int, username: str, rating: int, comment: str) -> int:
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    # Check if user already reviewed this trip
    c.execute("SELECT id FROM community_reviews WHERE trip_id=? AND username=?", (trip_id, username))
    if c.fetchone():
        conn.close()
        return -1  # Already reviewed
    c.execute('''
        INSERT INTO community_reviews (trip_id, username, rating, comment)
        VALUES (?, ?, ?, ?)
    ''', (trip_id, username, rating, comment))
    review_id = c.lastrowid
    # Update aggregate rating
    c.execute("SELECT AVG(rating), COUNT(*) FROM community_reviews WHERE trip_id=?", (trip_id,))
    avg, count = c.fetchone()
    c.execute("UPDATE community_trips SET avg_rating=?, review_count=? WHERE id=?", (round(avg, 1), count, trip_id))
    conn.commit()
    conn.close()
    return review_id

def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)

def search_trips_by_embedding(query_embedding: list[float], limit: int = 3) -> list:
    """Search community trips by cosine similarity to the query embedding."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT id, destination, title, plan_json, profile_summary, avg_rating, review_count, embedding FROM community_trips")
    rows = c.fetchall()
    conn.close()
    
    scored = []
    for row in rows:
        row_dict = dict(row)
        try:
            trip_emb = json.loads(row_dict["embedding"])
            sim = _cosine_similarity(query_embedding, trip_emb)
            row_dict["similarity"] = sim
            del row_dict["embedding"]
            scored.append(row_dict)
        except (json.JSONDecodeError, TypeError):
            continue
    
    scored.sort(key=lambda x: x["similarity"], reverse=True)
    return scored[:limit]
