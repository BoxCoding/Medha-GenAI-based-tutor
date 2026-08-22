"""Adaptive learning policy.

Decides, from the learner's current knowledge state, which concept to work
on next and what kind of activity (learn / practice / review) will help most.
The policy respects the prerequisite graph: a concept is locked until every
prerequisite reaches the unlock threshold.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from . import bkt


def effective_mastery(state: dict[str, Any]) -> float:
    """Mastery adjusted for time decay since the last update."""
    updated_at = state.get("updated_at")
    days = 0.0
    if updated_at:
        try:
            then = datetime.fromisoformat(str(updated_at)).replace(tzinfo=UTC)
            days = max(0.0, (datetime.now(UTC) - then).total_seconds() / 86400)
        except ValueError:
            days = 0.0
    return bkt.decayed_mastery(float(state["mastery"]), days)


def annotate_concepts(
    concepts: list[dict[str, Any]], states: dict[int, dict[str, Any]]
) -> list[dict[str, Any]]:
    """Attach mastery, lock status, and status label to each concept."""
    mastery_by_slug: dict[str, float] = {}
    for concept in concepts:
        state = states.get(concept["id"], {})
        mastery = effective_mastery(state) if state else 0.0
        mastery_by_slug[concept["slug"]] = mastery

    annotated = []
    for concept in concepts:
        state = states.get(concept["id"], {})
        mastery = mastery_by_slug[concept["slug"]]
        prereqs: list[str] = concept.get("prerequisites", [])
        unlocked = all(
            mastery_by_slug.get(slug, 1.0) >= bkt.UNLOCK_THRESHOLD for slug in prereqs
        )
        annotated.append(
            {
                **concept,
                "mastery": round(mastery, 3),
                "attempts": int(state.get("attempts", 0)),
                "correct": int(state.get("correct", 0)),
                "unlocked": unlocked,
                "mastered": mastery >= bkt.MASTERY_THRESHOLD,
                "band": bkt.mastery_band(mastery),
                "recommended_difficulty": bkt.difficulty_for(mastery),
            }
        )
    return annotated


_DIFFICULTY_ORDER = ["easy", "medium", "hard"]

# A pace label needs at least this many recent answers to be meaningful.
_MIN_ATTEMPTS_FOR_PACE = 3


def pace_profile(data: dict[str, Any]) -> dict[str, Any]:
    """Interpret raw learning signals into a pace profile.

    The label drives both the dashboard tile and lesson-prompt guidance:
      sprinter     — fast AND accurate: compress basics, add stretch material
      deep-diver   — accurate but deliberate: keep depth, don't rush
      warming-up   — recent accuracy is low: smaller steps, more scaffolding
      steady       — everything else (the healthy default)
    """
    accuracy = data.get("recent_accuracy")
    response_time = data.get("avg_response_time")
    attempts = data.get("recent_attempts", 0)

    if accuracy is None or attempts < _MIN_ATTEMPTS_FOR_PACE:
        label = "new"
        description = "Still learning your rhythm — take a quiz or two."
    elif accuracy < 0.5:
        label = "warming-up"
        description = (
            f"Recent accuracy is {accuracy:.0%} — Medhā is slowing down and "
            "breaking ideas into smaller steps for you."
        )
    elif accuracy >= 0.75 and response_time is not None and response_time < 20:
        label = "sprinter"
        description = (
            f"Fast and accurate ({accuracy:.0%} at ~{response_time:.0f}s/answer) — "
            "lessons will skip padding and stretch you further."
        )
    elif accuracy >= 0.6 and response_time is not None and response_time >= 20:
        label = "deep-diver"
        description = (
            f"Accurate and deliberate ({accuracy:.0%}) — Medhā keeps the depth "
            "and never rushes you."
        )
    else:
        label = "steady"
        description = f"Consistent progress ({accuracy:.0%} recently) — keep the rhythm."

    return {**data, "pace": label, "description": description}


def adjust_difficulty(base: str, recent_accuracy: float | None, attempts: int) -> str:
    """Step quiz difficulty beyond the mastery band using recent results.

    Mastery says what the learner *knows*; recent accuracy says how the last
    quizzes actually *went*. Acing recent questions earns a step up
    (challenge); struggling earns a step down (scaffold). One step max, and
    only with enough evidence.
    """
    if recent_accuracy is None or attempts < _MIN_ATTEMPTS_FOR_PACE:
        return base
    index = _DIFFICULTY_ORDER.index(base) if base in _DIFFICULTY_ORDER else 1
    if recent_accuracy >= 0.85:
        index = min(index + 1, len(_DIFFICULTY_ORDER) - 1)
    elif recent_accuracy <= 0.4:
        index = max(index - 1, 0)
    return _DIFFICULTY_ORDER[index]


def recommend_next(annotated: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Pick the next best activity for the learner.

    Priority:
      1. Unlocked, unmastered concepts — lowest mastery first (close the
         weakest gap the learner is ready for).
      2. If everything is mastered, the mastered concept with the lowest
         effective mastery (spaced review of the most-faded memory).
    """
    candidates = [c for c in annotated if c["unlocked"] and not c["mastered"]]
    if candidates:
        target = min(candidates, key=lambda c: (c["mastery"], c["position"]))
        action = "learn" if target["attempts"] == 0 else "practice"
        reason = (
            f"'{target['name']}' is your weakest unlocked concept "
            f"(mastery {target['mastery']:.0%})."
        )
        return {"concept": target, "action": action, "reason": reason}

    mastered = [c for c in annotated if c["mastered"]]
    if mastered:
        target = min(mastered, key=lambda c: c["mastery"])
        return {
            "concept": target,
            "action": "review",
            "reason": (
                f"All concepts mastered — reviewing '{target['name']}' keeps it "
                f"from fading (retention {target['mastery']:.0%})."
            ),
        }
    return None
