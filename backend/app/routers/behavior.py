"""Learning-behavior signals: screen focus, idle time, response speed, and
opt-in camera expression analysis. These feed the engagement score that
dynamically reshapes lesson generation and pacing advice.

Privacy: webcam frames are analyzed transiently and never written to disk or
database — only the derived label ("focused", "confused", …) is stored.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from .. import content_service, store
from ..auth import current_user
from ..schemas import BehaviorBatch, ExpressionFrame

router = APIRouter(prefix="/api/behavior", tags=["behavior"])


def _owned_learner(learner_id: int, user: dict) -> dict:
    learner = store.get_learner(learner_id, user["id"])
    if learner is None:
        raise HTTPException(status_code=404, detail="learner not found")
    return learner


@router.post("/events", status_code=202)
async def record_events(payload: BehaviorBatch, user: dict = Depends(current_user)) -> dict:
    """Batch-record focus/blur/idle/response-time telemetry."""
    _owned_learner(payload.learner_id, user)
    store.record_behavior_events(
        user["id"],
        payload.learner_id,
        [event.model_dump() for event in payload.events],
    )
    return {"recorded": len(payload.events)}


@router.post("/expression")
async def analyze_expression(
    payload: ExpressionFrame, user: dict = Depends(current_user)
) -> dict:
    """Classify a webcam frame into an engagement label via Gemini vision."""
    _owned_learner(payload.learner_id, user)
    result, source = await content_service.analyze_expression(
        payload.image_base64, payload.mime_type
    )
    if source == "gemini" and result["confidence"] > 0:
        store.record_behavior_events(
            user["id"],
            payload.learner_id,
            [{"kind": "expression", "value": result["confidence"], "label": result["label"]}],
        )
    return {**result, "source": source}


@router.get("/{learner_id}/summary")
async def engagement(learner_id: int, user: dict = Depends(current_user)) -> dict:
    _owned_learner(learner_id, user)
    return {"engagement": store.engagement_summary(learner_id)}
