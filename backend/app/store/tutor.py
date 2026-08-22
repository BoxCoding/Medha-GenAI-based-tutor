"""Tutor conversation history.

The tutor is a real conversation, not a series of unrelated questions: prior
turns are replayed to the model so follow-ups like "explain that again, but
slower" resolve against what was actually said.
"""
from __future__ import annotations

from typing import Any

from ..database import get_db

# Roles as Gemini expects them: the learner is "user", the tutor is "model".
USER_ROLE = "user"
MODEL_ROLE = "model"


def record_tutor_turns(learner_id: int, turns: list[tuple[str, str]]) -> None:
    """Append (role, content) turns to a learner's conversation."""
    with get_db() as conn:
        conn.executemany(
            "INSERT INTO tutor_messages (learner_id, role, content) VALUES (?, ?, ?)",
            [(learner_id, role, content) for role, content in turns],
        )


def recent_tutor_turns(learner_id: int, limit: int = 10) -> list[dict[str, Any]]:
    """The last `limit` turns, oldest first (chronological order for replay).

    The window is bounded so a long session cannot grow the prompt without
    limit — older context ages out instead of inflating every request.
    """
    with get_db() as conn:
        rows = conn.execute(
            """SELECT role, content FROM tutor_messages
               WHERE learner_id = ? ORDER BY id DESC LIMIT ?""",
            (learner_id, limit),
        ).fetchall()
    return [dict(row) for row in reversed(rows)]
