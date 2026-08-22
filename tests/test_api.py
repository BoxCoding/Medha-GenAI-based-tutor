"""End-to-end API tests running the full learner workflow in offline mode.

The suite forces MEDHA_OFFLINE=1 with a temporary database, so it exercises
onboarding → recommendation → lesson → quiz → grading → mastery update
deterministically, with no network calls.
"""
import os
import tempfile

os.environ["MEDHA_OFFLINE"] = "1"
os.environ["MEDHA_DB"] = os.path.join(tempfile.mkdtemp(), "medha_test.db")

import pytest
from backend.main import app
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        response = test_client.post(
            "/api/auth/register",
            json={"name": "Test User", "email": "test@example.com", "password": "s3cret-pass"},
        )
        assert response.status_code == 201
        yield test_client


@pytest.fixture(scope="module")
def learner(client):
    response = client.post(
        "/api/learners",
        json={"name": "Test Learner", "topic": "Graph Theory", "level": "beginner"},
    )
    assert response.status_code == 201
    return response.json()


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["llm_enabled"] is False


def test_onboarding_creates_concept_map(learner):
    assert learner["learner"]["topic"] == "Graph Theory"
    assert len(learner["concepts"]) >= 3
    assert learner["concept_source"] == "fallback"
    # Foundational concept unlocked, later ones locked behind prerequisites.
    assert learner["concepts"][0]["unlocked"] is True
    assert any(not c["unlocked"] for c in learner["concepts"])


def test_recommendation_targets_weakest_unlocked(learner):
    reco = learner["recommendation"]
    assert reco is not None
    assert reco["action"] == "learn"
    assert reco["concept"]["unlocked"] is True


def test_lesson_generation(client, learner):
    learner_id = learner["learner"]["id"]
    concept = learner["concepts"][0]
    response = client.post(
        "/api/lessons", json={"learner_id": learner_id, "concept_id": concept["id"]}
    )
    assert response.status_code == 200
    lesson = response.json()
    assert concept["name"] in lesson["content"]
    assert lesson["band"] == "novice"


def test_lesson_has_visuals_and_storytelling(client, learner):
    """Lessons must follow the Concept → Visual → Example → Story → Takeaway
    progression, with machine-renderable visual blocks."""
    import json as jsonlib
    import re

    learner_id = learner["learner"]["id"]
    concept = learner["concepts"][0]
    content = client.post(
        "/api/lessons", json={"learner_id": learner_id, "concept_id": concept["id"]}
    ).json()["content"]

    assert "## Learn Through Storytelling" in content
    assert "The connection:" in content
    assert "## Key takeaways" in content

    visual_blocks = re.findall(r"```(chart|flow)\n(.*?)```", content, re.DOTALL)
    assert visual_blocks, "lesson must contain at least one chart/flow block"
    for kind, body in visual_blocks:
        spec = jsonlib.loads(body)  # must be valid JSON for the renderer
        assert spec.get("note"), f"{kind} block must carry an interpretation note"
        if kind == "chart":
            assert spec["type"] in ("bar", "line")
            assert len(spec["labels"]) == len(spec["series"][0]["values"])
        else:
            assert len(spec["steps"]) >= 2


def test_quiz_flow_updates_mastery(client, learner):
    learner_id = learner["learner"]["id"]
    concept = learner["concepts"][0]

    generated = client.post(
        "/api/quizzes/generate",
        json={"learner_id": learner_id, "concept_id": concept["id"], "num_questions": 4},
    )
    assert generated.status_code == 200
    quiz = generated.json()
    assert quiz["difficulty"] == "easy"  # beginner starts in the easy band
    assert all("correct_index" not in q for q in quiz["questions"])  # no answer leakage

    # Fallback questions always have correct_index 0.
    submission = client.post(
        "/api/quizzes/submit",
        json={
            "learner_id": learner_id,
            "quiz_id": quiz["quiz_id"],
            "answers": [
                {"question_id": q["question_id"], "selected_index": 0}
                for q in quiz["questions"]
            ],
        },
    )
    assert submission.status_code == 200
    result = submission.json()
    assert result["score"]["correct"] == result["score"]["total"]
    assert result["mastery"]["after"] > result["mastery"]["before"]


def test_double_submission_rejected(client, learner):
    learner_id = learner["learner"]["id"]
    concept = learner["concepts"][0]
    quiz = client.post(
        "/api/quizzes/generate",
        json={"learner_id": learner_id, "concept_id": concept["id"], "num_questions": 1},
    ).json()
    answers = [
        {"question_id": q["question_id"], "selected_index": 0} for q in quiz["questions"]
    ]
    payload = {"learner_id": learner_id, "quiz_id": quiz["quiz_id"], "answers": answers}
    assert client.post("/api/quizzes/submit", json=payload).status_code == 200
    assert client.post("/api/quizzes/submit", json=payload).status_code == 409


def test_tutor_answers_in_offline_mode(client, learner):
    response = client.post(
        "/api/tutor",
        json={"learner_id": learner["learner"]["id"], "message": "What is a graph?"},
    )
    assert response.status_code == 200
    assert response.json()["source"] == "fallback"


def test_mindmap_generation(client, learner):
    response = client.post(
        "/api/mindmap",
        json={
            "learner_id": learner["learner"]["id"],
            "concept_id": learner["concepts"][0]["id"],
        },
    )
    assert response.status_code == 200
    mindmap = response.json()["mindmap"]
    assert mindmap["center"]
    assert len(mindmap["branches"]) >= 3
    kinds = {branch["kind"] for branch in mindmap["branches"]}
    assert "example" in kinds or "steps" in kinds


def test_teachback_updates_mastery(client, learner):
    learner_id = learner["learner"]["id"]
    concept = learner["concepts"][1]
    response = client.post(
        "/api/teachback",
        json={
            "learner_id": learner_id,
            "concept_id": concept["id"],
            "explanation": (
                "The central rules and ideas that everything else builds on — the core "
                "principles give a foundation so later concepts make sense together."
            ),
        },
    )
    assert response.status_code == 200
    result = response.json()
    assert 0 <= result["grade"]["score"] <= 100
    assert result["mastery"]["after"] != result["mastery"]["before"]


def test_quiz_difficulty_steps_down_after_failing(client, learner):
    """After bombing a quiz on a concept, the next quiz must scaffold down
    (or stay at the floor) rather than repeat the same difficulty pressure."""
    learner_id = learner["learner"]["id"]
    concept = learner["concepts"][2]

    quiz = client.post(
        "/api/quizzes/generate",
        json={"learner_id": learner_id, "concept_id": concept["id"], "num_questions": 4},
    ).json()
    # Fallback questions have correct_index 0 — answer 3 for all-wrong.
    client.post(
        "/api/quizzes/submit",
        json={
            "learner_id": learner_id,
            "quiz_id": quiz["quiz_id"],
            "answers": [
                {"question_id": q["question_id"], "selected_index": 3}
                for q in quiz["questions"]
            ],
        },
    )
    next_quiz = client.post(
        "/api/quizzes/generate",
        json={"learner_id": learner_id, "concept_id": concept["id"], "num_questions": 2},
    ).json()
    assert next_quiz["difficulty"] == "easy"  # floor — never harder after failure

    progress = client.get(f"/api/learners/{learner_id}/progress").json()
    assert progress["profile"]["pace"] in {"warming-up", "steady", "new", "sprinter", "deep-diver"}
    assert progress["profile"]["recent_accuracy"] is not None


def test_behavior_events_and_engagement(client, learner):
    learner_id = learner["learner"]["id"]
    response = client.post(
        "/api/behavior/events",
        json={
            "learner_id": learner_id,
            "events": [
                {"kind": "focus_seconds", "value": 300},
                {"kind": "blur_seconds", "value": 100},
                {"kind": "response_time", "value": 12.5},
            ],
        },
    )
    assert response.status_code == 202
    summary = client.get(f"/api/behavior/{learner_id}/summary").json()["engagement"]
    assert summary["focus_ratio"] == 0.75
    assert summary["avg_response_time"] == 12.5


def test_validation_rejects_bad_input(client):
    assert client.post("/api/learners", json={"name": "", "topic": "x"}).status_code == 422
    assert (
        client.post("/api/tutor", json={"learner_id": 1, "message": "   "}).status_code
        == 422
    )
    assert client.get("/api/learners/999999/progress").status_code == 404


def test_quiz_for_foreign_question_rejected(client, learner):
    """Answers referencing questions outside the quiz must be rejected."""
    learner_id = learner["learner"]["id"]
    concept = learner["concepts"][0]
    quiz = client.post(
        "/api/quizzes/generate",
        json={"learner_id": learner_id, "concept_id": concept["id"], "num_questions": 1},
    ).json()
    response = client.post(
        "/api/quizzes/submit",
        json={
            "learner_id": learner_id,
            "quiz_id": quiz["quiz_id"],
            "answers": [{"question_id": 999999, "selected_index": 0}],
        },
    )
    assert response.status_code == 400
