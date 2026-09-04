"""
CRUD lifecycle for every vault entity, plus just-in-time user provisioning.

Parametrized rather than written out four times: the interesting behaviour is
identical across entities, and duplicating it would only add lines.
"""

from __future__ import annotations

import pytest
from sqlmodel import Session

from auth import get_current_user
from database import get_session
from models import User
import main

ENTITIES = [
    pytest.param(
        "education",
        {"level": "CLASS_10", "institution": "St. Xavier", "board": "ICSE",
         "start_year": 2018, "end_year": 2020},
        {"institution": "St. Xavier High School"},
        "institution", "St. Xavier High School",
        id="education",
    ),
    pytest.param(
        "experience",
        {"title": "Intern", "organization": "Acme", "location": "",
         "start_date": "2025-01-01", "end_date": None, "type": "WORK"},
        {"title": "Senior Intern", "end_date": "2025-06-30"},
        "title", "Senior Intern",
        id="experience",
    ),
    pytest.param(
        "project",
        {"title": "Scheduler", "repo_url": None, "tech_stack": "Python"},
        {"tech_stack": "Python, FastAPI"},
        "tech_stack", "Python, FastAPI",
        id="project",
    ),
]


@pytest.mark.parametrize(
    "path, create_body, patch_body, field, expected", ENTITIES
)
def test_create_list_patch_delete(client, path, create_body, patch_body, field, expected):
    created = client.post(f"/api/vault/{path}", json=create_body)
    assert created.status_code == 201, created.text
    row_id = created.json()["id"]

    listed = client.get(f"/api/vault/{path}").json()
    assert [item["id"] for item in listed] == [row_id]

    patched = client.patch(f"/api/vault/{path}/{row_id}", json=patch_body)
    assert patched.status_code == 200
    assert patched.json()[field] == expected

    assert client.delete(f"/api/vault/{path}/{row_id}").status_code == 204
    assert client.get(f"/api/vault/{path}").json() == []


@pytest.mark.parametrize("path", ["education", "experience", "project", "bullet"])
def test_patching_a_missing_row_is_404(client, path):
    assert client.patch(f"/api/vault/{path}/9999", json={}).status_code == 404
    assert client.delete(f"/api/vault/{path}/9999").status_code == 404


def test_bullet_lifecycle(client):
    """Bullets need a parent, so they get their own pass."""
    project = client.post("/api/vault/project", json={
        "title": "Scheduler", "repo_url": None, "tech_stack": "Python",
    }).json()

    created = client.post("/api/vault/bullet", json={
        "entity_type": "PROJECT", "entity_id": project["id"],
        "original_text": "Built a solver", "tags": "python",
    })
    assert created.status_code == 201
    bullet_id = created.json()["id"]
    assert created.json()["ai_enhanced_text"] is None

    patched = client.patch(f"/api/vault/bullet/{bullet_id}", json={
        "ai_enhanced_text": "Built a constraint solver in Python",
    })
    assert patched.status_code == 200
    # The student's original wording is preserved alongside the rewrite.
    assert patched.json()["original_text"] == "Built a solver"

    assert client.delete(f"/api/vault/bullet/{bullet_id}").status_code == 204


def test_bullet_requires_a_parent_that_exists(client):
    response = client.post("/api/vault/bullet", json={
        "entity_type": "PROJECT", "entity_id": 4242,
        "original_text": "Orphan", "tags": "",
    })
    assert response.status_code == 404


def test_first_request_provisions_the_user_from_the_token(session: Session, monkeypatch):
    """JIT provisioning: no row exists until the first authenticated request,
    and the profile comes from the JWT rather than a second lookup."""
    from fastapi.testclient import TestClient

    import auth as auth_module

    monkeypatch.setattr(
        auth_module, "verify_auth_token",
        lambda _token: {
            "sub": "user_brand_new",
            "email": "new@college.edu",
            "name": "Rohan Mehta",
        },
    )
    main.app.dependency_overrides[get_session] = lambda: session
    main.app.dependency_overrides.pop(get_current_user, None)

    try:
        with TestClient(main.app) as client:
            assert session.get(User, "user_brand_new") is None

            body = client.get(
                "/api/vault/me", headers={"Authorization": "Bearer whatever"}
            ).json()

            assert body["id"] == "user_brand_new"
            assert body["email"] == "new@college.edu"
            assert (body["first_name"], body["last_name"]) == ("Rohan", "Mehta")
            # Contact fields start empty - the student fills them in.
            assert body["phone"] == ""

            # A second request reuses the row rather than creating another.
            client.get("/api/vault/me", headers={"Authorization": "Bearer whatever"})
            assert session.get(User, "user_brand_new") is not None
    finally:
        main.app.dependency_overrides.clear()
