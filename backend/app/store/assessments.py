"""Quiz questions, graded attempts, and answer history."""
from __future__ import annotations

import json
from typing import Any

from ..database import get_db


def save_questions(
    quiz_id: str, learner_id: int, concept_id: int, questions: list[dict[str, Any]]
) -> list[int]:
    ids = []
    with get_db() as conn:
        for q in questions:
            cursor = conn.execute(
                """INSERT INTO questions
                   (quiz_id, learner_id, concept_id, question, options,
                    correct_index, explanation, difficulty)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    quiz_id,
                    learner_id,
                    concept_id,
                    q["question"],
                    json.dumps(q["options"]),
                    q["correct_index"],
                    q["explanation"],
                    q["difficulty"],
                ),
            )
            ids.append(int(cursor.lastrowid))
    return ids


def get_quiz_questions(quiz_id: str, learner_id: int) -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM questions WHERE quiz_id = ? AND learner_id = ? ORDER BY id",
            (quiz_id, learner_id),
        ).fetchall()
    questions = []
    for row in rows:
        question = dict(row)
        question["options"] = json.loads(question["options"])
        questions.append(question)
    return questions


def mark_answered(question_id: int) -> None:
    with get_db() as conn:
        conn.execute("UPDATE questions SET answered = 1 WHERE id = ?", (question_id,))


def record_attempt(
    learner_id: int,
    concept_id: int,
    question_id: int,
    selected: int,
    is_correct: bool,
    difficulty: str,
) -> None:
    with get_db() as conn:
        conn.execute(
            """INSERT INTO attempts
               (learner_id, concept_id, question_id, selected, is_correct, difficulty)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (learner_id, concept_id, question_id, selected, 1 if is_correct else 0, difficulty),
        )


def recent_mistakes(learner_id: int, concept_id: int, limit: int = 5) -> list[str]:
    """Question texts the learner recently answered incorrectly."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT q.question FROM attempts a
               JOIN questions q ON q.id = a.question_id
               WHERE a.learner_id = ? AND a.concept_id = ? AND a.is_correct = 0
               ORDER BY a.created_at DESC LIMIT ?""",
            (learner_id, concept_id, limit),
        ).fetchall()
        return [r["question"] for r in rows]


def attempt_history(learner_id: int, limit: int = 50) -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            """SELECT a.created_at, a.is_correct, a.difficulty, c.name AS concept_name
               FROM attempts a JOIN concepts c ON c.id = a.concept_id
               WHERE a.learner_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT ?""",
            (learner_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]


def recent_concept_accuracy(
    learner_id: int, concept_id: int, limit: int = 6
) -> tuple[float | None, int]:
    """Accuracy over the last `limit` attempts on one concept."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT is_correct FROM attempts
               WHERE learner_id = ? AND concept_id = ? ORDER BY id DESC LIMIT ?""",
            (learner_id, concept_id, limit),
        ).fetchall()
    if not rows:
        return None, 0
    values = [int(r["is_correct"]) for r in rows]
    return sum(values) / len(values), len(values)
