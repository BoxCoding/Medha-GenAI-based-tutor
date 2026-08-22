"""Learner onboarding, knowledge state, and adaptive recommendations.

All routes require a signed-in user; every query is scoped to that user's
own learners (user-data isolation).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from .. import adaptive, bkt, content_service, store
from ..auth import current_user
from ..schemas import LearnerCreate

router = APIRouter(prefix="/api/learners", tags=["learners"])


@router.post("", status_code=201)
async def create_learner(payload: LearnerCreate, user: dict = Depends(current_user)) -> dict:
    """Onboard a learner: build their concept map and initialize BKT states."""
    concepts, source = await content_service.build_concept_map(
        payload.topic, payload.level.value
    )
    learner_id = store.create_learner(
        user["id"], payload.name, payload.topic, payload.level.value, payload.goal
    )
    store.create_concepts(learner_id, concepts, bkt.initial_mastery(payload.level.value))
    return {
        "learner": store.get_learner(learner_id, user["id"]),
        "concept_source": source,
        **_progress_payload(learner_id),
    }


@router.get("")
async def list_learners(user: dict = Depends(current_user)) -> dict:
    return {"learners": store.list_learners(user["id"])}


@router.get("/{learner_id}/progress")
async def progress(learner_id: int, user: dict = Depends(current_user)) -> dict:
    """Full knowledge state: per-concept mastery, recommendation, history."""
    learner = store.get_learner(learner_id, user["id"])
    if learner is None:
        raise HTTPException(status_code=404, detail="learner not found")
    return {
        "learner": learner,
        **_progress_payload(learner_id),
        "history": store.attempt_history(learner_id),
    }


def _progress_payload(learner_id: int) -> dict:
    concepts = store.get_concepts(learner_id)
    states = store.get_states(learner_id)
    annotated = adaptive.annotate_concepts(concepts, states)
    recommendation = adaptive.recommend_next(annotated)
    engagement = store.engagement_summary(learner_id)
    profile = adaptive.pace_profile(store.learning_profile_data(learner_id))

    # Behavior-aware pacing advice layered onto the recommendation.
    if recommendation is not None and engagement["score"] is not None:
        if engagement["score"] < 0.5:
            recommendation["pacing"] = (
                "Your recent attention has dipped — try a 5-minute break, then "
                "come back for a short focused session."
            )
        elif engagement["expression"] == "confused":
            recommendation["pacing"] = (
                "You looked puzzled recently — re-read the lesson or ask the "
                "tutor before quizzing again."
            )

    mastered = sum(1 for c in annotated if c["mastered"])
    overall = sum(c["mastery"] for c in annotated) / len(annotated) if annotated else 0.0
    return {
        "concepts": annotated,
        "recommendation": recommendation,
        "engagement": engagement,
        "profile": profile,
        "summary": {
            "overall_mastery": round(overall, 3),
            "concepts_mastered": mastered,
            "concepts_total": len(annotated),
            "streak_days": store.daily_streak(learner_id),
        },
    }
