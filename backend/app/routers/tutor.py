"""Doubt-solving tutor: an ongoing conversation grounded in the learner's
live knowledge state.

Turns are persisted per learner and replayed to the model, so follow-ups
("explain that again, but slower") resolve against what was actually said
rather than producing a fresh, unrelated answer.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from .. import adaptive, content_service, store
from ..auth import current_user
from ..schemas import TutorRequest

router = APIRouter(prefix="/api/tutor", tags=["tutor"])

# How many past turns to replay. Bounded so a long session cannot grow the
# prompt (and its cost) without limit.
HISTORY_TURNS = 10


def _mastery_summary(learner_id: int) -> str:
    concepts = store.get_concepts(learner_id)
    states = store.get_states(learner_id)
    annotated = adaptive.annotate_concepts(concepts, states)
    return (
        "\n".join(f"  - {c['name']}: {c['mastery']:.0%} ({c['band']})" for c in annotated)
        or "  (no concepts yet)"
    )


@router.post("")
async def ask_tutor(payload: TutorRequest, user: dict = Depends(current_user)) -> dict:
    """Answer a question in context, then persist both sides of the exchange."""
    learner = store.get_learner(payload.learner_id, user["id"])
    if learner is None:
        raise HTTPException(status_code=404, detail="learner not found")

    history = store.recent_tutor_turns(payload.learner_id, HISTORY_TURNS)
    answer, source = await content_service.tutor_answer(
        payload.message,
        learner["topic"],
        learner["level"],
        _mastery_summary(payload.learner_id),
        history=history,
    )
    store.record_tutor_turns(
        payload.learner_id,
        [(store.tutor.USER_ROLE, payload.message), (store.tutor.MODEL_ROLE, answer)],
    )
    return {"answer": answer, "source": source}


@router.get("/{learner_id}/history")
async def tutor_history(learner_id: int, user: dict = Depends(current_user)) -> dict:
    """Past turns, so the chat panel can restore itself after a reload."""
    if store.get_learner(learner_id, user["id"]) is None:
        raise HTTPException(status_code=404, detail="learner not found")
    return {"messages": store.recent_tutor_turns(learner_id, HISTORY_TURNS)}
