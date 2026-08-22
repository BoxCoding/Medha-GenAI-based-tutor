"""Engagement telemetry, the learning profile's raw signals, and streaks."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from ..database import get_db

_EXPRESSION_WEIGHTS = {
    "focused": 1.0,
    "happy": 0.9,
    "neutral": 0.7,
    "confused": 0.45,
    "tired": 0.35,
    "bored": 0.3,
}


def record_behavior_events(user_id: int, learner_id: int, events: list[dict[str, Any]]) -> None:
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
    expression_weight = _EXPRESSION_WEIGHTS.get(last_expression or "")

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
        "avg_response_time": (
            round(rt_row["avg_rt"], 1) if rt_row["avg_rt"] is not None else None
        ),
    }


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
    cursor_day = date.fromisoformat(today_row["today"])
    if days[0] != cursor_day.isoformat():
        return 0
    streak = 0
    for day in days:
        if day != cursor_day.isoformat():
            break
        streak += 1
        cursor_day -= timedelta(days=1)
    return streak
