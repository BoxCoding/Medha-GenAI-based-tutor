"""Personalized lesson generation, adapted to the learner's mastery band."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from .. import adaptive, bkt, content_service, store
from ..auth import current_user
from ..schemas import LessonRequest

router = APIRouter(prefix="/api/lessons", tags=["lessons"])

# Bumping this invalidates cached lessons when the lesson structure changes
# (v2 = visuals + storytelling progression).
LESSON_FORMAT_VERSION = "v2"


@router.post("")
async def get_lesson(payload: LessonRequest, user: dict = Depends(current_user)) -> dict:
    """Return a lesson for the concept, tuned to current mastery.

    Lessons are cached per (concept, mastery band) — as the learner's band
    changes, they get a deeper lesson rather than a repeat. Recent mistakes
    or live low-engagement signals force a fresh, targeted generation.
    """
    learner = store.get_learner(payload.learner_id, user["id"])
    concept = store.get_concept(payload.learner_id, payload.concept_id)
    if learner is None or concept is None:
        raise HTTPException(status_code=404, detail="learner or concept not found")

    state = store.get_states(payload.learner_id).get(payload.concept_id)
    mastery = adaptive.effective_mastery(state) if state else 0.0
    band = bkt.mastery_band(mastery)
    mistakes = store.recent_mistakes(payload.learner_id, payload.concept_id)
    engagement = store.engagement_summary(payload.learner_id)
    profile = adaptive.pace_profile(store.learning_profile_data(payload.learner_id))
    needs_adaptation = bool(mistakes) or (
        engagement["score"] is not None and engagement["score"] < 0.6
    )

    # Cache per (band, pace): a sprinter's compressed lesson and a
    # warming-up learner's scaffolded lesson are different documents.
    cache_key = f"{band}:{profile['pace']}@{LESSON_FORMAT_VERSION}"
    if not needs_adaptation:
        cached = store.get_cached_lesson(payload.concept_id, cache_key)
        if cached is not None:
            return _response(concept, band, mastery, cached, "cache")

    content, source = await content_service.build_lesson(
        concept, learner["topic"], band, learner["level"], mistakes,
        engagement if needs_adaptation else None,
        profile,
    )
    if source == "gemini" and not needs_adaptation:
        store.cache_lesson(payload.concept_id, cache_key, content)
    return _response(concept, band, mastery, content, source)


def _response(concept: dict, band: str, mastery: float, content: str, source: str) -> dict:
    return {
        "concept": {"id": concept["id"], "name": concept["name"]},
        "band": band,
        "mastery": round(mastery, 3),
        "content": content,
        "source": source,
    }
