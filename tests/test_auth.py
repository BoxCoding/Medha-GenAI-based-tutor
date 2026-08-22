"""Authentication and user-data isolation tests (offline, deterministic)."""
import os
import tempfile

os.environ["MEDHA_OFFLINE"] = "1"
os.environ.setdefault("MEDHA_DB", os.path.join(tempfile.mkdtemp(), "medha_test.db"))

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


def _register(client, email, name="Someone"):
    return client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": "correct-horse-9"},
    )


def test_register_login_me_logout_cycle(client):
    assert _register(client, "cycle@example.com", "Cycle").status_code == 201
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["email"] == "cycle@example.com"
    # Password hashes never leave the API.
    assert "password_hash" not in me.json()["user"]

    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401

    login = client.post(
        "/api/auth/login",
        json={"email": "cycle@example.com", "password": "correct-horse-9"},
    )
    assert login.status_code == 200


def test_wrong_password_and_unknown_email_are_indistinguishable(client):
    _register(client, "known@example.com")
    client.post("/api/auth/logout")
    wrong_password = client.post(
        "/api/auth/login", json={"email": "known@example.com", "password": "wrong-password"}
    )
    unknown_email = client.post(
        "/api/auth/login", json={"email": "ghost@example.com", "password": "wrong-password"}
    )
    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()


def test_duplicate_email_rejected(client):
    assert _register(client, "dup@example.com").status_code == 201
    assert _register(client, "dup@example.com").status_code == 409


def test_unauthenticated_requests_rejected(client):
    assert client.get("/api/learners").status_code == 401
    assert client.post(
        "/api/lessons", json={"learner_id": 1, "concept_id": 1}
    ).status_code == 401


def test_user_data_isolation(client):
    """User B must not be able to read or act on user A's learner."""
    _register(client, "alice@example.com", "Alice")
    created = client.post(
        "/api/learners",
        json={"name": "Alice", "topic": "Astronomy", "level": "beginner"},
    )
    assert created.status_code == 201
    learner_id = created.json()["learner"]["id"]
    concept_id = created.json()["concepts"][0]["id"]

    client.post("/api/auth/logout")
    _register(client, "bob@example.com", "Bob")

    assert client.get(f"/api/learners/{learner_id}/progress").status_code == 404
    assert client.post(
        "/api/lessons", json={"learner_id": learner_id, "concept_id": concept_id}
    ).status_code == 404
    assert client.post(
        "/api/quizzes/generate", json={"learner_id": learner_id, "concept_id": concept_id}
    ).status_code == 404
    assert all(
        entry["id"] != learner_id for entry in client.get("/api/learners").json()["learners"]
    )


def test_weak_password_rejected(client):
    response = client.post(
        "/api/auth/register",
        json={"name": "Weak", "email": "weak@example.com", "password": "short"},
    )
    assert response.status_code == 422
