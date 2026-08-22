"""Data-access layer — all SQL lives here, always parameterized."""
from __future__ import annotations

import json
from typing import Any

from .database import get_db, row_to_dict


# ------------------------------------------------------------------- users
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


# ---------------------------------------------------------------- learners
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


# ---------------------------------------------------------------- concepts
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


# ---------------------------------------------------------- knowledge state
def get_states(learner_id: int) -> dict[int, dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM knowledge_states WHERE learner_id = ?", (learner_id,)
        ).fetchall()
        return {int(r["concept_id"]): dict(r) for r in rows}


def update_state(
    learner_id: int, concept_id: int, mastery: float, was_correct: bool
) -> None:
    with get_db() as conn:
        conn.execute(
            """UPDATE knowledge_states
               SET mastery = ?, attempts = attempts + 1,
                   correct = correct + ?, updated_at = datetime('now')
               WHERE learner_id = ? AND concept_id = ?""",
            (mastery, 1 if was_correct else 0, learner_id, concept_id),
        )


# ---------------------------------------------------------------- questions
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
        q = dict(row)
        q["options"] = json.loads(q["options"])
        questions.append(q)
    return questions


def mark_answered(question_id: int) -> None:
    with get_db() as conn:
        conn.execute("UPDATE questions SET answered = 1 WHERE id = ?", (question_id,))


# ----------------------------------------------------------------- attempts
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


# ---------------------------------------------------------------- behavior
def record_behavior_events(
    user_id: int, learner_id: int, events: list[dict[str, Any]]
) -> None:
    with get_db() as conn:
        conn.executemany(
            """INSERT INTO behavior_events (user_id, learner_id, kind, value, label)
               VALUES (?, ?, ?, ?, ?)""",
            [
                (user_id, learner_id, e["kind"], float(e.get("value", 0)), e.get("label"))
                for e in events
            ],
        )


def engagement_summary(learner_id: int, minutes: int = 30) -> dict[str, Any]:
    """Aggregate recent behavior signals into an engagement snapshot."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT kind, value, label FROM behavior_events
               WHERE learner_id = ? AND created_at > datetime('now', ?)
               ORDER BY created_at""",
            (learner_id, f"-{int(minutes)} minutes"),
        ).fetchall()

    focus = blur = idle = 0.0
    response_times: list[float] = []
    last_expression: str | None = None
    for row in rows:
        if row["kind"] == "focus_seconds":
            focus += row["value"]
        elif row["kind"] == "blur_seconds":
            blur += row["value"]
        elif row["kind"] == "idle_seconds":
            idle += row["value"]
        elif row["kind"] == "response_time":
            response_times.append(row["value"])
        elif row["kind"] == "expression" and row["label"]:
            last_expression = row["label"]

    tracked = focus + blur
    focus_ratio = focus / tracked if tracked > 0 else None
    expression_weight = {
        "focused": 1.0, "happy": 0.9, "neutral": 0.7,
        "confused": 0.45, "tired": 0.35, "bored": 0.3,
    }.get(last_expression or "", None)

    score = None
    if focus_ratio is not None and expression_weight is not None:
        score = round(0.6 * focus_ratio + 0.4 * expression_weight, 2)
    elif focus_ratio is not None:
        score = round(focus_ratio, 2)
    elif expression_weight is not None:
        score = round(expression_weight, 2)

    return {
        "focus_ratio": round(focus_ratio, 2) if focus_ratio is not None else None,
        "idle_seconds": round(idle),
        "avg_response_time": (
            round(sum(response_times) / len(response_times), 1) if response_times else None
        ),
        "expression": last_expression,
        "score": score,
    }


def learning_profile_data(learner_id: int, limit: int = 12) -> dict[str, Any]:
    """Raw signals describing how this learner learns: recent accuracy,
    answer speed, and volume. Interpreted by adaptive.pace_profile()."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT is_correct FROM attempts
               WHERE learner_id = ? ORDER BY id DESC LIMIT ?""",
            (learner_id, limit),
        ).fetchall()
        total_row = conn.execute(
            "SELECT COUNT(*) AS n FROM attempts WHERE learner_id = ?", (learner_id,)
        ).fetchone()
        rt_row = conn.execute(
            """SELECT AVG(value) AS avg_rt FROM behavior_events
               WHERE learner_id = ? AND kind = 'response_time'
               AND created_at > datetime('now', '-7 days')""",
            (learner_id,),
        ).fetchone()
    recent = [int(r["is_correct"]) for r in rows]
    return {
        "recent_accuracy": round(sum(recent) / len(recent), 2) if recent else None,
        "recent_attempts": len(recent),
        "total_attempts": int(total_row["n"]),
        "avg_response_time": round(rt_row["avg_rt"], 1) if rt_row["avg_rt"] is not None else None,
    }


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


def daily_streak(learner_id: int) -> int:
    """Consecutive days (ending today) with at least one learning attempt."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT DISTINCT date(created_at) AS day FROM attempts
               WHERE learner_id = ? ORDER BY day DESC LIMIT 60""",
            (learner_id,),
        ).fetchall()
        today_row = conn.execute("SELECT date('now') AS today").fetchone()
    days = [row["day"] for row in rows]
    if not days:
        return 0
    from datetime import date, timedelta

    cursor_day = date.fromisoformat(today_row["today"])
    if days[0] != cursor_day.isoformat():
        return 0
    streak = 0
    for day in days:
        if day == cursor_day.isoformat():
            streak += 1
            cursor_day -= timedelta(days=1)
        else:
            break
    return streak


# ------------------------------------------------------------ mindmap cache
def get_cached_mindmap(concept_id: int) -> dict[str, Any] | None:
    with get_db() as conn:
        row = conn.execute(
            "SELECT content FROM mindmap_cache WHERE concept_id = ?", (concept_id,)
        ).fetchone()
        return json.loads(row["content"]) if row else None


def cache_mindmap(concept_id: int, content: dict[str, Any]) -> None:
    with get_db() as conn:
        conn.execute(
            """INSERT INTO mindmap_cache (concept_id, content) VALUES (?, ?)
               ON CONFLICT(concept_id) DO UPDATE SET content = excluded.content""",
            (concept_id, json.dumps(content)),
        )


# ------------------------------------------------------------- lesson cache
def get_cached_lesson(concept_id: int, band: str) -> str | None:
    with get_db() as conn:
        row = conn.execute(
            "SELECT content FROM lesson_cache WHERE concept_id = ? AND band = ?",
            (concept_id, band),
        ).fetchone()
        return row["content"] if row else None


def cache_lesson(concept_id: int, band: str, content: str) -> None:
    with get_db() as conn:
        conn.execute(
            """INSERT INTO lesson_cache (concept_id, band, content) VALUES (?, ?, ?)
               ON CONFLICT(concept_id, band) DO UPDATE SET content = excluded.content""",
            (concept_id, band, content),
        )
