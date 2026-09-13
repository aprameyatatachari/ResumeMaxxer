"""
Editing vault entries in place.

A PATCH carries only the changed fields, so the dangerous edits are the ones
that are fine alone and invalid together - a stream added to Class X, an end
date moved before the start. The router merges first and validates the result;
these tests pin that down, plus the edit that changes an entry's type.
"""

from __future__ import annotations

import pytest

CLASS_10 = {"level": "CLASS_10", "institution": "St. Xavier", "board": "ICSE",
            "end_year": 2020, "score": "96", "score_type": "PERCENTAGE"}


def _create(client, path, body):
    response = client.post(f"/api/vault/{path}", json=body)
    assert response.status_code in (200, 201), response.text
    return response.json()


def test_an_education_field_can_be_edited_without_touching_the_rest(client):
    row = _create(client, "education", CLASS_10)

    response = client.patch(f"/api/vault/education/{row['id']}", json={"score": "97.4"})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["score"] == "97.4"
    assert body["institution"] == "St. Xavier"
    assert body["board"] == "ICSE"


def test_an_edit_that_breaks_the_level_rules_is_rejected_and_not_saved(client):
    """Valid alone, invalid combined with the stored row: Class X has no stream."""
    row = _create(client, "education", CLASS_10)

    response = client.patch(f"/api/vault/education/{row['id']}", json={"stream": "PCMB"})

    assert response.status_code == 422
    assert "common curriculum" in response.text
    stored = client.get("/api/vault/education").json()[0]
    assert stored["stream"] is None


def test_a_class_x_entry_can_be_turned_into_a_school_entry(client):
    """Changing the type is an edit, and the old level's fields must go."""
    row = _create(client, "education", CLASS_10)

    response = client.patch(f"/api/vault/education/{row['id']}", json={
        "level": "SCHOOL", "board": None, "score": None, "score_type": None,
        "start_year": 2008, "end_year": 2020, "start_grade": "LKG",
        "class10_board": "ICSE", "class10_score": "96",
        "class10_score_type": "PERCENTAGE",
    })

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["level"] == "SCHOOL"
    assert body["board"] is None
    assert body["class10_board"] == "ICSE"
    assert body["start_grade"] == "LKG"


def test_a_level_change_that_leaves_old_fields_behind_is_rejected(client):
    row = _create(client, "education", CLASS_10)

    # Switching to School without clearing the top-level board.
    response = client.patch(f"/api/vault/education/{row['id']}", json={
        "level": "SCHOOL", "start_year": 2008, "class10_board": "ICSE",
    })

    assert response.status_code == 422


def test_an_experience_cannot_be_edited_to_end_before_it_started(client):
    row = _create(client, "experience", {
        "title": "Intern", "organization": "Acme", "start_date": "2025-05-01",
        "end_date": "2025-07-31", "type": "WORK",
    })

    response = client.patch(f"/api/vault/experience/{row['id']}", json={"end_date": "2025-01-01"})

    assert response.status_code == 422
    assert "end date cannot be before start date" in response.text


def test_an_experience_can_be_edited(client):
    row = _create(client, "experience", {
        "title": "Intern", "organization": "Acme", "start_date": "2025-05-01",
        "end_date": None, "type": "WORK",
    })

    response = client.patch(f"/api/vault/experience/{row['id']}", json={
        "title": "SDE Intern", "end_date": "2025-07-31",
    })

    assert response.status_code == 200, response.text
    assert response.json()["title"] == "SDE Intern"
    assert response.json()["organization"] == "Acme"


@pytest.mark.parametrize("path", ["education", "experience", "project", "bullet"])
def test_another_students_entry_cannot_be_edited(client, session, other_user, path):
    from datetime import date
    from models import Bullet, Education, EducationLevel, EntityType, Experience, Project

    theirs = {
        "education": Education(user_id=other_user.id, level=EducationLevel.HIGHER_ED,
                               institution="X", degree="B.Tech", start_year=2020),
        "experience": Experience(user_id=other_user.id, title="T", organization="O",
                                 start_date=date(2025, 1, 1)),
        "project": Project(user_id=other_user.id, title="P"),
        "bullet": Bullet(user_id=other_user.id, entity_type=EntityType.PROJECT,
                         entity_id=1, original_text="b"),
    }[path]
    session.add(theirs)
    session.commit()
    session.refresh(theirs)

    field = {"education": "institution", "experience": "title",
             "project": "title", "bullet": "original_text"}[path]
    response = client.patch(f"/api/vault/{path}/{theirs.id}", json={field: "hijacked"})

    assert response.status_code == 404
