"""Data-access layer, organized by domain.

All SQL lives in this package, always parameterized. Modules:
  users          — accounts and session tokens
  learners       — learner profiles, concepts, knowledge states
  assessments    — quiz questions, attempts, answer history
  behavior       — engagement telemetry, learning profile, streaks
  content_cache  — cached lessons and mind maps

The package re-exports every public function, so callers use it as a single
facade: `from .. import store; store.get_learner(...)`.
"""
from .assessments import (
    attempt_history,
    get_quiz_questions,
    mark_answered,
    recent_concept_accuracy,
    recent_mistakes,
    record_attempt,
    save_questions,
)
from .behavior import (
    daily_streak,
    engagement_summary,
    learning_profile_data,
    record_behavior_events,
)
from .content_cache import (
    cache_lesson,
    cache_mindmap,
    get_cached_lesson,
    get_cached_mindmap,
)
from .learners import (
    create_concepts,
    create_learner,
    get_concept,
    get_concepts,
    get_learner,
    get_states,
    list_learners,
    update_state,
)
from .users import (
    create_session,
    create_user,
    delete_session,
    get_session_user,
    get_user_by_email,
)

__all__ = [
    "attempt_history",
    "cache_lesson",
    "cache_mindmap",
    "create_concepts",
    "create_learner",
    "create_session",
    "create_user",
    "daily_streak",
    "delete_session",
    "engagement_summary",
    "get_cached_lesson",
    "get_cached_mindmap",
    "get_concept",
    "get_concepts",
    "get_learner",
    "get_quiz_questions",
    "get_session_user",
    "get_states",
    "get_user_by_email",
    "learning_profile_data",
    "list_learners",
    "mark_answered",
    "recent_concept_accuracy",
    "recent_mistakes",
    "record_attempt",
    "record_behavior_events",
    "save_questions",
    "update_state",
]
