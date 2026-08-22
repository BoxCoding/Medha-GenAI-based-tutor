"""Doubt-solving tutor grounded in the learner's live knowledge state."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from .. import adaptive, content_service, store
from ..auth import current_user
from ..schemas import TutorRequest

router = APIRouter(prefix="/api/tutor", tags=["tutor"])


@router.post("")
async def ask_tutor(payload: TutorRequest, user: dict = Depends(current_user)) -> dict:
    """Answer a learner question, with their mastery map injected as context."""
    learner = store.get_learner(payload.learner_id, user["id"])
    if learner is None:
        raise HTTPException(status_code=404, detail="learner not found")

    concepts = store.get_concepts(payload.learner_id)
    states = store.get_states(payload.learner_id)
    annotated = adaptive.annotate_concepts(concepts, states)
    mastery_summary = "\n".join(
        f"  - {c['name']}: {c['mastery']:.0%} ({c['band']})" for c in annotated
    ) or "  (no concepts yet)"

    answer, source = await content_service.tutor_answer(
        payload.message, learner["topic"], learner["level"], mastery_summary
    )
    return {"answer": answer, "source": source}
