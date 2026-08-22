"""Adaptive assessment: quiz generation and server-side grading.

Correct answers never leave the server before submission — the client only
receives question text and options, and grading happens here. This both
prevents trivial cheating and keeps the BKT update trustworthy.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException

from .. import adaptive, bkt, content_service, store
from ..auth import current_user
from ..schemas import QuizRequest, QuizSubmission

router = APIRouter(prefix="/api/quizzes", tags=["quizzes"])


@router.post("/generate")
async def generate_quiz(payload: QuizRequest, user: dict = Depends(current_user)) -> dict:
    """Create a quiz whose difficulty matches the learner's current mastery."""
    learner = store.get_learner(payload.learner_id, user["id"])
    concept = store.get_concept(payload.learner_id, payload.concept_id)
    if learner is None or concept is None:
        raise HTTPException(status_code=404, detail="learner or concept not found")

    state = store.get_states(payload.learner_id).get(payload.concept_id)
    mastery = adaptive.effective_mastery(state) if state else 0.0
    base_difficulty = bkt.difficulty_for(mastery)
    # Recent results on this concept can step the difficulty beyond the
    # mastery band: acing quizzes earns a challenge, struggling earns scaffolding.
    accuracy, attempts = store.recent_concept_accuracy(
        payload.learner_id, payload.concept_id
    )
    difficulty = adaptive.adjust_difficulty(base_difficulty, accuracy, attempts)

    questions, source = await content_service.build_quiz(
        concept, learner["topic"], difficulty, payload.num_questions, learner["level"]
    )
    quiz_id = str(uuid.uuid4())
    ids = store.save_questions(quiz_id, payload.learner_id, payload.concept_id, questions)

    return {
        "quiz_id": quiz_id,
        "concept": {"id": concept["id"], "name": concept["name"]},
        "difficulty": difficulty,
        "difficulty_adjusted": difficulty != base_difficulty,
        "source": source,
        "questions": [
            {
                "question_id": qid,
                "question": q["question"],
                "options": q["options"],
                "difficulty": q["difficulty"],
            }
            for qid, q in zip(ids, questions)
        ],
    }


@router.post("/submit")
async def submit_quiz(payload: QuizSubmission, user: dict = Depends(current_user)) -> dict:
    """Grade answers, update the BKT knowledge state, and return feedback."""
    if store.get_learner(payload.learner_id, user["id"]) is None:
        raise HTTPException(status_code=404, detail="learner not found")
    questions = store.get_quiz_questions(payload.quiz_id, payload.learner_id)
    if not questions:
        raise HTTPException(status_code=404, detail="quiz not found")
    by_id = {q["id"]: q for q in questions}

    results = []
    mastery_before: float | None = None
    mastery: float | None = None
    concept_id: int | None = None

    for answer in payload.answers:
        question = by_id.get(answer.question_id)
        if question is None:
            raise HTTPException(
                status_code=400,
                detail=f"question {answer.question_id} does not belong to this quiz",
            )
        if question["answered"]:
            raise HTTPException(
                status_code=409,
                detail=f"question {answer.question_id} was already answered",
            )

        concept_id = int(question["concept_id"])
        if mastery is None:
            state = store.get_states(payload.learner_id).get(concept_id)
            if state is None:
                raise HTTPException(status_code=404, detail="knowledge state not found")
            mastery = adaptive.effective_mastery(state)
            mastery_before = mastery

        is_correct = answer.selected_index == question["correct_index"]
        update = bkt.update(mastery, is_correct, question["difficulty"])
        mastery = update.posterior

        store.record_attempt(
            payload.learner_id,
            concept_id,
            answer.question_id,
            answer.selected_index,
            is_correct,
            question["difficulty"],
        )
        store.mark_answered(answer.question_id)
        results.append(
            {
                "question_id": answer.question_id,
                "correct": is_correct,
                "correct_index": question["correct_index"],
                "selected_index": answer.selected_index,
                "explanation": question["explanation"],
            }
        )

    assert concept_id is not None and mastery is not None and mastery_before is not None
    store.update_state(
        payload.learner_id,
        concept_id,
        mastery,
        was_correct=all(r["correct"] for r in results),
    )

    score = sum(1 for r in results if r["correct"])
    return {
        "results": results,
        "score": {"correct": score, "total": len(results)},
        "mastery": {
            "before": round(mastery_before, 3),
            "after": round(mastery, 3),
            "mastered": mastery >= bkt.MASTERY_THRESHOLD,
            "next_difficulty": bkt.difficulty_for(mastery),
        },
    }
