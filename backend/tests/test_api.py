"""
API integration tests.

Covers the things that only show up when the whole request goes through:
authentication is required, rows are scoped to their owner, and the polymorphic
bullet cleanup actually runs on delete.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlmodel import Session, select

from models import Bullet, EntityType, Experience, Project, User

PROTECTED = [
    ("GET", "/api/vault"),
    ("GET", "/api/vault/me"),
    ("GET", "/api/vault/education"),
    ("GET", "/api/tailor/history"),
    ("GET", "/api/github/repos/octocat"),
]


@pytest.mark.parametrize("method, path", PROTECTED)
def test_endpoints_require_authentication(anon_client, method, path):
    assert anon_client.request(method, path).status_code == 401


def test_health_and_root_are_public(anon_client):
    assert anon_client.get("/").status_code == 200

    # `/health` probes the real engine, not the overridden test session, and
    # the suite's DATABASE_URL points nowhere - so a correct implementation
    # must report 503/degraded rather than pretending to be healthy.
    health = anon_client.get("/health")
    assert health.status_code == 503
    assert health.json()["database"] == "unreachable"


def test_vault_round_trip(client, user):
    """One pass through the whole vault: create each kind, read it back."""
    education = client.post("/api/vault/education", json={
        "level": "HIGHER_ED", "institution": "VIT", "location": "Vellore",
        "degree": "B.Tech CSE", "start_year": 2022, "start_month": 8,
        "end_year": 2026, "end_month": 5, "score": "8.74", "score_type": "CGPA",
        "coursework": "DSA, DBMS",
    })
    assert education.status_code == 201, education.text

    experience = client.post("/api/vault/experience", json={
        "title": "SWE Intern", "organization": "Razorpay",
        "location": "Bengaluru", "start_date": "2025-05-01",
        "end_date": "2025-07-31", "type": "WORK",
    })
    assert experience.status_code == 201, experience.text

    project = client.post("/api/vault/project", json={
        "title": "Course Scheduler", "repo_url": None, "tech_stack": "Python",
    })
    assert project.status_code == 201

    bullet = client.post("/api/vault/bullet", json={
        "entity_type": "EXPERIENCE", "entity_id": experience.json()["id"],
        "original_text": "Built a reconciliation service", "tags": "python,fastapi",
    })
    assert bullet.status_code == 201

    vault = client.get("/api/vault").json()
    assert vault["user"]["email"] == user.email
    assert len(vault["educations"]) == 1
    assert len(vault["experiences"]) == 1
    assert len(vault["projects"]) == 1
    assert len(vault["bullets"]) == 1
    # Manual projects are never flagged as GitHub imports.
    assert vault["projects"][0]["is_github_imported"] is False


def test_invalid_education_returns_422_not_500(client):
    """A Class XII row with no stream is rejected by the schema validator."""
    response = client.post("/api/vault/education", json={
        "level": "CLASS_12", "institution": "DPS", "board": "CBSE",
        "start_year": 2020, "end_year": 2022,
    })
    assert response.status_code == 422
    assert "stream is required" in response.text


def test_profile_update_feeds_the_resume_header(client):
    response = client.patch("/api/vault/me", json={
        "phone": "+91 90000 00000", "linkedin_url": "linkedin.com/in/x",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["phone"] == "+91 90000 00000"
    # Untouched fields survive a PATCH.
    assert body["first_name"] == "Ananya"


def test_rows_belonging_to_another_user_are_not_reachable(
    client, session: Session, other_user: User
):
    """404, not 403: a 403 would confirm the row exists."""
    theirs = Experience(
        user_id=other_user.id, title="Their job", organization="Elsewhere",
        start_date=date(2024, 1, 1),
    )
    session.add(theirs)
    session.commit()
    session.refresh(theirs)

    assert client.patch(
        f"/api/vault/experience/{theirs.id}", json={"title": "Hijacked"}
    ).status_code == 404
    assert client.delete(f"/api/vault/experience/{theirs.id}").status_code == 404
    assert client.get("/api/vault").json()["experiences"] == []


def test_bullets_cannot_be_attached_to_someone_elses_entity(
    client, session: Session, other_user: User
):
    theirs = Project(user_id=other_user.id, title="Their project", tech_stack="")
    session.add(theirs)
    session.commit()
    session.refresh(theirs)

    response = client.post("/api/vault/bullet", json={
        "entity_type": "PROJECT", "entity_id": theirs.id,
        "original_text": "Not mine", "tags": "",
    })
    assert response.status_code == 404


def test_deleting_an_entity_removes_its_bullets(client, session: Session, user: User):
    """Bullets point at their parent polymorphically, so no FK cascade can do
    this - the router has to clean them up explicitly or they become orphans
    that still surface in tailoring."""
    experience = client.post("/api/vault/experience", json={
        "title": "Intern", "organization": "Acme", "location": "",
        "start_date": "2025-01-01", "end_date": None, "type": "WORK",
    }).json()
    client.post("/api/vault/bullet", json={
        "entity_type": "EXPERIENCE", "entity_id": experience["id"],
        "original_text": "Did a thing", "tags": "",
    })

    assert client.delete(f"/api/vault/experience/{experience['id']}").status_code == 204

    orphans = session.exec(
        select(Bullet).where(
            Bullet.entity_type == EntityType.EXPERIENCE,
            Bullet.entity_id == experience["id"],
        )
    ).all()
    assert orphans == []


def test_tailoring_needs_bullets_before_it_will_run(client):
    """An empty vault is a 422 with an explanation, not an AI call."""
    response = client.post(
        "/api/tailor",
        files={"file": ("jd.txt", b"We need a Python developer. " * 10, "text/plain")},
    )
    assert response.status_code == 422
    assert "no achievement bullets" in response.text


def test_tailoring_rejects_an_unreadable_file_before_calling_the_ai(client, session, user):
    session.add(Bullet(
        user_id=user.id, entity_type=EntityType.PROJECT, entity_id=1,
        original_text="Built something", tags="python",
    ))
    session.commit()

    response = client.post(
        "/api/tailor",
        files={"file": ("jd.doc", b"\xd0\xcf\x11\xe0" + b"x" * 100, "application/msword")},
    )
    assert response.status_code == 400
    assert "Legacy .doc" in response.text
