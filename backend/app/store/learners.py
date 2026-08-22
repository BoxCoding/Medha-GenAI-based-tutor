"""Learner profiles, their concept maps, and BKT knowledge states.

Every read is scoped by user_id where ownership matters — the router layer
never sees another user's learners.
"""
from __future__ import annotations

import json
from typing import Any

from ..database import get_db, row_to_dict


def create_learner(user_id: int, name: str, topic: str, level: str, goal: str | None) -> int:
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO learners (user_id, name, topic, level, goal) VALUES (?, ?, ?, ?, ?)",
            (user_id, name, topic, level, goal),
        )
        return int(cursor.lastrowid)


def get_learner(learner_id: int, user_id: int) -> dict[str, Any] | None:
    """Fetch a learner profile only if it belongs to the given user."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM learners WHERE id = ? AND user_id = ?", (learner_id, user_id)
        ).fetchone()
        return row_to_dict(row)


def list_learners(user_id: int) -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM learners WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def create_concepts(
    learner_id: int, concepts: list[dict[str, Any]], initial_mastery: float
) -> None:
    with get_db() as conn:
        for position, concept in enumerate(concepts):
            cursor = conn.execute(
                """INSERT INTO concepts
                   (learner_id, slug, name, description, difficulty, position, prerequisites)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    learner_id,
                    concept["slug"],
                    concept["name"],
                    concept["description"],
                    concept["difficulty"],
                    position,
                    json.dumps(concept["prerequisites"]),
                ),
            )
            conn.execute(
                """INSERT INTO knowledge_states (learner_id, concept_id, mastery)
                   VALUES (?, ?, ?)""",
                (learner_id, cursor.lastrowid, initial_mastery),
            )


def get_concepts(learner_id: int) -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM concepts WHERE learner_id = ? ORDER BY position", (learner_id,)
        ).fetchall()
    concepts = []
    for row in rows:
        concept = dict(row)
        concept["prerequisites"] = json.loads(concept["prerequisites"])
        concepts.append(concept)
    return concepts


def get_concept(learner_id: int, concept_id: int) -> dict[str, Any] | None:
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM concepts WHERE id = ? AND learner_id = ?",
            (concept_id, learner_id),
        ).fetchone()
    if row is None:
        return None
    concept = dict(row)
    concept["prerequisites"] = json.loads(concept["prerequisites"])
    return concept


def get_states(learner_id: int) -> dict[int, dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM knowledge_states WHERE learner_id = ?", (learner_id,)
        ).fetchall()
        return {int(r["concept_id"]): dict(r) for r in rows}


def update_state(learner_id: int, concept_id: int, mastery: float, was_correct: bool) -> None:
    with get_db() as conn:
        conn.execute(
            """UPDATE knowledge_states
               SET mastery = ?, attempts = attempts + 1,
                   correct = correct + ?, updated_at = datetime('now')
               WHERE learner_id = ? AND concept_id = ?""",
            (mastery, 1 if was_correct else 0, learner_id, concept_id),
        )
