"""Concept mind maps — visual, practical-example-heavy summaries.

Maps are generated once per concept and cached in SQLite, so repeat views
cost zero LLM calls.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from .. import content_service, store
from ..auth import current_user
from ..schemas import MindmapRequest

router = APIRouter(prefix="/api/mindmap", tags=["mindmap"])


@router.post("")
async def get_mindmap(payload: MindmapRequest, user: dict = Depends(current_user)) -> dict:
    learner = store.get_learner(payload.learner_id, user["id"])
    concept = store.get_concept(payload.learner_id, payload.concept_id)
    if learner is None or concept is None:
        raise HTTPException(status_code=404, detail="learner or concept not found")

    cached = store.get_cached_mindmap(payload.concept_id)
    if cached is not None:
        return {"concept": {"id": concept["id"], "name": concept["name"]},
                "mindmap": cached, "source": "cache"}

    mindmap, source = await content_service.build_mindmap(concept, learner["topic"])
    if source == "gemini":
        store.cache_mindmap(payload.concept_id, mindmap)
    return {"concept": {"id": concept["id"], "name": concept["name"]},
            "mindmap": mindmap, "source": source}
