"""Teach-back mode (Feynman technique).

The learner explains a concept in their own words; Gemini grades the
explanation, and a passing grade counts as strong (hard-difficulty) evidence
in the BKT knowledge state — articulating a concept is better proof of
mastery than recognizing an answer.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from .. import adaptive, bkt, content_service, store
from ..auth import current_user
from ..schemas import TeachbackRequest

router = APIRouter(prefix="/api/teachback", tags=["teachback"])

PASS_SCORE = 60


@router.post("")
async def submit_teachback(
    payload: TeachbackRequest, user: dict = Depends(current_user)
) -> dict:
    learner = store.get_learner(payload.learner_id, user["id"])
    concept = store.get_concept(payload.learner_id, payload.concept_id)
    if learner is None or concept is None:
        raise HTTPException(status_code=404, detail="learner or concept not found")

    grade, source = await content_service.grade_teachback(
        concept, learner["topic"], payload.explanation, learner["level"]
    )

    state = store.get_states(payload.learner_id).get(payload.concept_id)
    if state is None:
        raise HTTPException(status_code=404, detail="knowledge state not found")
    mastery_before = adaptive.effective_mastery(state)
    passed = grade["score"] >= PASS_SCORE
    update = bkt.update(mastery_before, is_correct=passed, difficulty="hard")
    store.update_state(payload.learner_id, payload.concept_id, update.posterior, passed)
    store.record_behavior_events(
        user["id"], payload.learner_id,
        [{"kind": "teachback", "value": grade["score"], "label": "pass" if passed else "retry"}],
    )

    return {
        "grade": grade,
        "passed": passed,
        "source": source,
        "mastery": {
            "before": round(mastery_before, 3),
            "after": round(update.posterior, 3),
            "mastered": update.mastered,
        },
    }
