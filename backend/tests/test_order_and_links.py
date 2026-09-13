"""
Manual ordering of vault sections, extra profile links, and the resume header
built from the student's "show on resume" switches.

Ordering replaced a chronological sort, so the tests assert the student's
order wins everywhere it matters: the vault listing, the prompt context, and
the finished resume. The header is built by code rather than the model, so the
tests assert a hidden field cannot come back.
"""

from __future__ import annotations

from datetime import date

import pytest

import latex_renderer
from models import Experience, ProfileLink, Project
from routers.tailor import _apply_vault_order, build_header
from schemas import (
    ResumeExperience,
    ResumeHeader,
    ResumePayload,
    ResumeProject,
    normalise_link_url,
)

DEGREE = {"level": "HIGHER_ED", "institution": "VIT", "degree": "B.Tech",
          "start_year": 2022}
CLASS_12 = {"level": "CLASS_12", "institution": "DPS", "board": "CBSE",
            "stream": "PCM", "end_year": 2022}
CLASS_10 = {"level": "CLASS_10", "institution": "St. Xavier", "board": "ICSE",
            "end_year": 2020}


def _names(client, key="educations", field="institution"):
    return [row[field] for row in client.get("/api/vault").json()[key]]


# ---------------------------------------------------------------------------
# Ordering
# ---------------------------------------------------------------------------
def test_new_entries_are_added_at_the_bottom_not_sorted_by_date(client):
    """The old list put the degree first whatever order things were added in.
    Now the order is simply the order the student built it."""
    for body in (CLASS_10, CLASS_12, DEGREE):
        client.post("/api/vault/education", json=body)

    assert _names(client) == ["St. Xavier", "DPS", "VIT"]


def test_a_section_can_be_rearranged(client):
    ids = [client.post("/api/vault/education", json=b).json()["id"]
           for b in (CLASS_10, CLASS_12, DEGREE)]

    response = client.put("/api/vault/education/order", json={"ids": [ids[2], ids[0], ids[1]]})

    assert response.status_code == 204
    assert _names(client) == ["VIT", "St. Xavier", "DPS"]


@pytest.mark.parametrize(
    "shape",
    [
        pytest.param(lambda ids: ids[:2], id="missing-an-entry"),
        pytest.param(lambda ids: ids + [ids[0]], id="duplicate"),
        pytest.param(lambda ids: ids[:2] + [999_999], id="unknown-id"),
    ],
)
def test_a_partial_or_wrong_order_is_rejected_and_changes_nothing(client, shape):
    ids = [client.post("/api/vault/education", json=b).json()["id"]
           for b in (CLASS_10, CLASS_12, DEGREE)]

    response = client.put("/api/vault/education/order", json={"ids": shape(ids)})

    assert response.status_code == 400
    assert _names(client) == ["St. Xavier", "DPS", "VIT"]


def test_another_students_rows_cannot_be_used_in_an_order(client, session, other_user):
    theirs = Experience(user_id=other_user.id, title="T", organization="O",
                        start_date=date(2025, 1, 1))
    session.add(theirs)
    session.commit()
    session.refresh(theirs)
    mine = client.post("/api/vault/experience", json={
        "title": "Intern", "organization": "Acme", "start_date": "2025-01-01",
        "end_date": None, "type": "WORK"}).json()

    response = client.put("/api/vault/experience/order",
                          json={"ids": [mine["id"], theirs.id]})

    assert response.status_code == 400


@pytest.mark.parametrize("section, key", [("experience", "experiences"), ("project", "projects")])
def test_experience_and_projects_can_be_rearranged(client, section, key):
    bodies = {
        "experience": [{"title": t, "organization": t, "start_date": "2025-01-01",
                        "end_date": None, "type": "WORK"} for t in ("A", "B", "C")],
        "project": [{"title": t, "repo_url": None, "tech_stack": ""} for t in ("A", "B", "C")],
    }[section]
    ids = [client.post(f"/api/vault/{section}", json=b).json()["id"] for b in bodies]

    assert client.put(f"/api/vault/{section}/order",
                      json={"ids": [ids[1], ids[2], ids[0]]}).status_code == 204
    assert _names(client, key, "title") == ["B", "C", "A"]


def test_the_resume_keeps_the_students_order_whatever_the_model_returns():
    """The model chooses which roles fit; the student decides their order."""
    vault_roles = [
        Experience(id=1, user_id="u", title="Club Lead", organization="Robotics Club",
                   start_date=date(2023, 1, 1), end_date=date(2024, 1, 1)),
        Experience(id=2, user_id="u", title="Intern", organization="Razorpay",
                   start_date=date(2025, 5, 1), end_date=date(2025, 7, 1)),
    ]
    vault_projects = [Project(id=1, user_id="u", title="Scheduler"),
                      Project(id=2, user_id="u", title="Compiler")]
    returned = ResumePayload(
        header=ResumeHeader(full_name="A", phone="", email="", linkedin="",
                            github="", portfolio=""),
        education=[],
        # The model put the internship first and reordered the projects.
        experience=[
            ResumeExperience(title="SWE Intern", date_range="May 2025 - July 2025",
                             organization="Razorpay", location="", bullets=[]),
            ResumeExperience(title="Lead", date_range="Jan. 2023 - Jan. 2024",
                             organization="Robotics Club", location="", bullets=[]),
        ],
        projects=[
            ResumeProject(name="Compiler", tech_stack="", date_range="", bullets=[]),
            ResumeProject(name="Scheduler", tech_stack="", date_range="", bullets=[]),
            ResumeProject(name="Something the vault names differently",
                          tech_stack="", date_range="", bullets=[]),
        ],
        skills=[], selection_rationale="",
    )

    result = _apply_vault_order(returned, vault_roles, vault_projects)

    assert [e.organization for e in result.experience] == ["Robotics Club", "Razorpay"]
    # An unmatched project is kept, after the matched ones - never dropped.
    assert [p.name for p in result.projects] == [
        "Scheduler", "Compiler", "Something the vault names differently"]


# ---------------------------------------------------------------------------
# Extra links
# ---------------------------------------------------------------------------
def test_a_link_can_be_added_edited_hidden_and_deleted(client):
    created = client.post("/api/vault/link", json={"label": "LeetCode",
                                                    "url": "leetcode.com/u/ananya"})
    assert created.status_code == 201, created.text
    link = created.json()
    # A bare domain gets a scheme.
    assert link["url"] == "https://leetcode.com/u/ananya"
    assert link["include_on_resume"] is True

    edited = client.patch(f"/api/vault/link/{link['id']}",
                          json={"label": "LeetCode (Knight)", "include_on_resume": False})
    assert edited.status_code == 200
    assert edited.json()["include_on_resume"] is False
    assert client.get("/api/vault").json()["links"][0]["label"] == "LeetCode (Knight)"

    assert client.delete(f"/api/vault/link/{link['id']}").status_code == 204
    assert client.get("/api/vault").json()["links"] == []


def test_links_can_be_rearranged(client):
    ids = [client.post("/api/vault/link", json={"url": f"{site}.com/me"}).json()["id"]
           for site in ("leetcode", "kaggle", "codeforces")]

    assert client.put("/api/vault/link/order", json={"ids": [ids[2], ids[0], ids[1]]}).status_code == 204
    urls = [link["url"] for link in client.get("/api/vault").json()["links"]]
    assert urls == ["https://codeforces.com/me", "https://leetcode.com/me", "https://kaggle.com/me"]


@pytest.mark.parametrize(
    "url",
    [
        pytest.param("javascript:alert(1)", id="javascript-scheme"),
        pytest.param("file:///etc/passwd", id="file-scheme"),
        pytest.param("https://x.com/}\\input{/etc/passwd}", id="latex-breakout"),
        pytest.param("my site.com", id="whitespace"),
        pytest.param("notaurl", id="no-domain"),
        pytest.param("", id="empty"),
    ],
)
def test_an_unsafe_or_malformed_link_is_rejected(client, url):
    """The URL is placed inside a LaTeX \\href and becomes a clickable link in
    a PDF sent to recruiters, so this is a security boundary."""
    assert client.post("/api/vault/link", json={"url": url}).status_code == 422


def test_another_students_link_cannot_be_touched(client, session, other_user):
    theirs = ProfileLink(user_id=other_user.id, url="https://x.com")
    session.add(theirs)
    session.commit()
    session.refresh(theirs)

    assert client.patch(f"/api/vault/link/{theirs.id}", json={"label": "x"}).status_code == 404
    assert client.delete(f"/api/vault/link/{theirs.id}").status_code == 404


# ---------------------------------------------------------------------------
# The header
# ---------------------------------------------------------------------------
def test_show_on_resume_switches_are_saved(client):
    response = client.patch("/api/vault/me", json={"include_phone": False,
                                                   "include_github": False})
    assert response.status_code == 200
    body = response.json()
    assert body["include_phone"] is False
    assert body["include_github"] is False
    assert body["include_email"] is True


def test_the_header_respects_every_switch_and_link_setting(user):
    user.include_phone = False
    user.include_github = False
    links = [
        ProfileLink(user_id=user.id, label="LeetCode", url="https://leetcode.com/u/a"),
        ProfileLink(user_id=user.id, label="Hidden", url="https://hidden.com",
                    include_on_resume=False),
    ]

    header = build_header(user, links)

    assert header.full_name == "Ananya Krishnan"
    assert header.phone == ""
    assert header.github == ""
    assert header.email == user.email
    assert [link.label for link in header.links] == ["LeetCode"]


def test_a_hidden_field_never_reaches_the_pdf_source(user):
    user.include_phone = False
    header = build_header(user, [ProfileLink(user_id=user.id, label="",
                                             url=normalise_link_url("kaggle.com/a#top"))])
    tex = latex_renderer.render_latex(ResumePayload(
        header=header, education=[], experience=[], projects=[], skills=[],
        selection_rationale=""))

    assert user.phone not in tex
    # The link is shown without its scheme, with `#` escaped for \href.
    assert r"\href{https://kaggle.com/a\#top}{\underline{kaggle.com/a\#top}}" in tex
