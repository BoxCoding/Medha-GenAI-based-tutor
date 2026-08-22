"""User accounts and session tokens."""
from __future__ import annotations

from typing import Any

from ..database import get_db, row_to_dict


def create_user(name: str, email: str, password_hash: str, salt: str) -> int:
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO users (name, email, password_hash, salt) VALUES (?, ?, ?, ?)",
            (name, email, password_hash, salt),
        )
        return int(cursor.lastrowid)


def get_user_by_email(email: str) -> dict[str, Any] | None:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        return row_to_dict(row)


def create_session(token_hash: str, user_id: int, expires_at: str) -> None:
    with get_db() as conn:
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (token_hash, user_id, expires_at),
        )


def get_session_user(token_hash: str) -> dict[str, Any] | None:
    with get_db() as conn:
        row = conn.execute(
            """SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
               WHERE s.token_hash = ? AND s.expires_at > datetime('now')""",
            (token_hash,),
        ).fetchone()
        return row_to_dict(row)


def delete_session(token_hash: str) -> None:
    with get_db() as conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
