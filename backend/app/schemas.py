"""Pydantic request/response models — every API input is validated here."""
from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field, field_validator


class Level(StrEnum):
    beginner = "beginner"
    intermediate = "intermediate"
    advanced = "advanced"


class LearnerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    topic: str = Field(min_length=2, max_length=120)
    level: Level = Level.beginner
    goal: str | None = Field(default=None, max_length=300)

    @field_validator("name", "topic", "goal")
    @classmethod
    def strip_whitespace(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value


class LessonRequest(BaseModel):
    learner_id: int = Field(ge=1)
    concept_id: int = Field(ge=1)


class QuizRequest(BaseModel):
    learner_id: int = Field(ge=1)
    concept_id: int = Field(ge=1)
    num_questions: int = Field(default=4, ge=1, le=8)


class AnswerItem(BaseModel):
    question_id: int = Field(ge=1)
    selected_index: int = Field(ge=0, le=3)


class QuizSubmission(BaseModel):
    learner_id: int = Field(ge=1)
    quiz_id: str = Field(min_length=8, max_length=64, pattern=r"^[a-f0-9\-]+$")
    answers: list[AnswerItem] = Field(min_length=1, max_length=8)


_EMAIL_PATTERN = r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$"


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    email: str = Field(max_length=120, pattern=_EMAIL_PATTERN)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("name must not be blank")
        return stripped


class LoginRequest(BaseModel):
    email: str = Field(max_length=120, pattern=_EMAIL_PATTERN)
    password: str = Field(min_length=1, max_length=128)


class BehaviorEventItem(BaseModel):
    kind: str = Field(pattern=r"^(focus_seconds|blur_seconds|idle_seconds|response_time)$")
    value: float = Field(ge=0, le=3600)


class BehaviorBatch(BaseModel):
    learner_id: int = Field(ge=1)
    events: list[BehaviorEventItem] = Field(min_length=1, max_length=20)


class ExpressionFrame(BaseModel):
    learner_id: int = Field(ge=1)
    # A small downscaled JPEG/PNG, base64 (no data: prefix). ~220KB cap.
    image_base64: str = Field(min_length=100, max_length=300_000)
    mime_type: str = Field(default="image/jpeg", pattern=r"^image/(jpeg|png|webp)$")


class MindmapRequest(BaseModel):
    learner_id: int = Field(ge=1)
    concept_id: int = Field(ge=1)


class TeachbackRequest(BaseModel):
    learner_id: int = Field(ge=1)
    concept_id: int = Field(ge=1)
    explanation: str = Field(min_length=20, max_length=2000)

    @field_validator("explanation")
    @classmethod
    def strip_explanation(cls, value: str) -> str:
        stripped = value.strip()
        if len(stripped) < 20:
            raise ValueError("explain in at least a couple of sentences")
        return stripped


class TutorRequest(BaseModel):
    learner_id: int = Field(ge=1)
    message: str = Field(min_length=1, max_length=1000)

    @field_validator("message")
    @classmethod
    def strip_message(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("message must not be blank")
        return stripped
