"""
Achievements, the Extracurricular Activities section, and the student's
choice to let a resume run past one page.

Achievements are printed exactly as entered - never rewritten by the model -
so the tests pin that the vault text reaches the resume untouched. Club and
leadership roles share the experiences table, so the tests pin that each role
lands in the section its type says, whatever the model returned.
"""

from __future__ import annotations

from datetime import date

import pytest

import ai_service
import latex_renderer
from models import Achievement, Bullet, EntityType, Experience, ExperienceType
from routers.tailor import _separate_extracurriculars
from schemas import (
    JDAnalysis,
    ResumeAchievement,
    ResumeExperience,
    ResumeHeader,
    ResumePayload,
)

JD_FILE = (
    "jd.txt",
    b"Backend Engineering Intern. We need Python, FastAPI and PostgreSQL. "
    b"Docker and CI/CD are a plus. Bengaluru based, six months, stipend paid.",
    "text/plain",
)


def _payload(**sections) -> ResumePayload:
    base = dict(education=[], experience=[], projects=[], skills=[], selection_rationale="")
    return ResumePayload(
        header=ResumeHeader(full_name="A", phone="", email="", linkedin="",
                            github="", portfolio=""),
        **{**base, **sections},
    )


def _role(title: str, organization: str, dates: str = "May 2025 - July 2025") -> ResumeExperience:
    return ResumeExperience(title=title, date_range=dates, organization=organization,
                            location="", bullets=["Did a thing"])


# ---------------------------------------------------------------------------
# Achievements API
# ---------------------------------------------------------------------------
def test_an_achievement_can_be_added_edited_hidden_reordered_and_deleted(client):
    first = client.post("/api/vault/achievement", json={
        "title": "  Winner, Smart India Hackathon ", "description": "1st of 400 teams",
        "date_text": "Mar. 2024"})
    assert first.status_code == 201, first.text
    first = first.json()
    assert first["title"] == "Winner, Smart India Hackathon"  # trimmed
    second = client.post("/api/vault/achievement", json={"title": "Knight, LeetCode"}).json()

    assert client.patch(f"/api/vault/achievement/{first['id']}",
                        json={"include_on_resume": False}).status_code == 200
    assert client.put("/api/vault/achievement/order",
                      json={"ids": [second["id"], first["id"]]}).status_code == 204

    listed = client.get("/api/vault").json()["achievements"]
    assert [a["title"] for a in listed] == ["Knight, LeetCode", "Winner, Smart India Hackathon"]
    assert listed[1]["include_on_resume"] is False

    assert client.delete(f"/api/vault/achievement/{first['id']}").status_code == 204
    assert len(client.get("/api/vault").json()["achievements"]) == 1


def test_an_achievement_needs_a_title(client):
    assert client.post("/api/vault/achievement", json={"title": ""}).status_code == 422


def test_another_students_achievement_cannot_be_touched(client, session, other_user):
    theirs = Achievement(user_id=other_user.id, title="Theirs")
    session.add(theirs)
    session.commit()
    session.refresh(theirs)

    assert client.patch(f"/api/vault/achievement/{theirs.id}", json={"title": "x"}).status_code == 404
    assert client.delete(f"/api/vault/achievement/{theirs.id}").status_code == 404


# ---------------------------------------------------------------------------
# Sections on the finished resume
# ---------------------------------------------------------------------------
def test_each_role_lands_in_the_section_its_vault_type_says():
    """The model put a club role under Experience and an internship under
    Extracurricular Activities. Both are corrected."""
    vault = [
        Experience(id=1, user_id="u", title="Intern", organization="Razorpay",
                   start_date=date(2025, 5, 1), end_date=date(2025, 7, 1),
                   type=ExperienceType.WORK),
        Experience(id=2, user_id="u", title="Head", organization="IEEE Branch",
                   start_date=date(2023, 8, 1), end_date=date(2025, 5, 1),
                   type=ExperienceType.EXTRACURRICULAR),
    ]
    returned = _payload(
        experience=[_role("Head", "IEEE Branch", "Aug. 2023 - May 2025")],
        extracurriculars=[_role("Intern", "Razorpay", "May 2025 - July 2025"),
                          _role("Mentor", "Unmatched Club")],
    )

    result = _separate_extracurriculars(returned, vault)

    assert [e.organization for e in result.experience] == ["Razorpay"]
    # Unmatched entries keep the model's placement rather than being dropped.
    assert [e.organization for e in result.extracurriculars] == ["IEEE Branch", "Unmatched Club"]


def test_both_new_sections_render_after_skills():
    tex = latex_renderer.render_latex(_payload(
        extracurriculars=[_role("Head of Events", "IEEE Branch")],
        achievements=[ResumeAchievement(title="Winner & finalist", description="100% ranked",
                                        date="Mar. 2024")],
    ))

    assert tex.index(r"\section{Extracurricular Activities}") < tex.index(r"\section{Achievements}")
    # Escaped like every other piece of student text.
    assert r"\textbf{Winner \& finalist}{: 100\% ranked} \hfill \emph{Mar. 2024}" in tex


def test_empty_sections_are_left_out_entirely():
    tex = latex_renderer.render_latex(_payload())
    assert "Extracurricular" not in tex
    assert "Achievements" not in tex


# ---------------------------------------------------------------------------
# One page, or more if the student says so
# ---------------------------------------------------------------------------
def test_one_page_mode_trims_the_new_sections_to_their_measured_budget():
    limits = ai_service.ONE_PAGE
    payload = _payload(
        extracurriculars=[_role(f"Role {i}", f"Club {i}") for i in range(4)],
        achievements=[ResumeAchievement(title=f"Award {i}") for i in range(8)],
    )
    for role in payload.extracurriculars:
        role.bullets = ["a", "b", "c", "d"]

    trimmed = ai_service.enforce_one_page(payload, limits)

    assert len(trimmed.extracurriculars) == limits.extracurriculars
    assert all(len(r.bullets) <= limits.extracurricular_bullets for r in trimmed.extracurriculars)
    assert len(trimmed.achievements) == limits.achievements


def test_multi_page_mode_allows_more_but_is_still_capped():
    payload = _payload(achievements=[ResumeAchievement(title=f"Award {i}") for i in range(50)])

    trimmed = ai_service.enforce_one_page(payload, ai_service.MULTI_PAGE)

    assert ai_service.ONE_PAGE.achievements < len(trimmed.achievements)
    assert len(trimmed.achievements) == ai_service.MULTI_PAGE.achievements


@pytest.fixture(name="stocked")
def stocked_fixture(session, user):
    work = Experience(user_id=user.id, title="Intern", organization="Razorpay",
                      start_date=date(2025, 5, 1), end_date=date(2025, 7, 31),
                      type=ExperienceType.WORK, position=0)
    club = Experience(user_id=user.id, title="Head of Events", organization="IEEE Branch",
                      start_date=date(2023, 8, 1), end_date=date(2025, 5, 31),
                      type=ExperienceType.EXTRACURRICULAR, position=1)
    session.add_all([work, club])
    session.commit()
    session.refresh(work)
    session.refresh(club)
    session.add_all([
        Bullet(user_id=user.id, entity_type=EntityType.EXPERIENCE, entity_id=work.id,
               original_text="Built a service in Python and FastAPI", tags="python,fastapi"),
        # Nothing here matches the JD - it must still reach the model.
        Bullet(user_id=user.id, entity_type=EntityType.EXPERIENCE, entity_id=club.id,
               original_text="Ran a 36-hour hackathon for 400 participants", tags="leadership"),
        Achievement(user_id=user.id, title="Winner, Smart India Hackathon",
                    description="1st of 400 teams", date_text="Mar. 2024", position=0),
        Achievement(user_id=user.id, title="Hidden award", include_on_resume=False, position=1),
    ])
    session.commit()


@pytest.fixture(name="seen")
def seen_fixture(monkeypatch):
    seen = {}

    def analyse(jd_text, qualifications_block="", api_key=None):
        return JDAnalysis(job_title="Backend Intern", company="", hard_skills=["Python"],
                          soft_skills=[], keywords=["python", "fastapi"],
                          required_keywords=[], seniority="internship")

    def tailor(*, analysis, vault_context, student_name, student_email,
               qualifications_block="", api_key=None, limits=None):
        seen["context"] = vault_context
        seen["limits"] = limits
        return _payload(
            experience=[_role("Intern", "Razorpay", "May 2025 - July 2025")],
            extracurriculars=[_role("Head of Events", "IEEE Branch", "Aug. 2023 - May 2025")],
            # A model trying to supply achievements is ignored.
            achievements=[ResumeAchievement(title="Invented award")],
        )

    monkeypatch.setattr(ai_service, "analyse_job_description", analyse)
    monkeypatch.setattr(ai_service, "tailor_resume", tailor)
    return seen


def test_tailoring_fills_both_sections_from_the_vault(client, stocked, seen):
    response = client.post("/api/tailor", files={"file": JD_FILE})
    assert response.status_code == 200, response.text
    resume = response.json()["resume"]

    # Extracurriculars are a separate list in the context, and their bullets
    # get through even though they share no keyword with the JD.
    assert "## EXTRACURRICULARS" in seen["context"]
    assert "Ran a 36-hour hackathon" in seen["context"]
    assert [e["organization"] for e in resume["extracurriculars"]] == ["IEEE Branch"]

    # Achievements come from the vault verbatim; hidden ones and anything the
    # model invented are absent.
    assert resume["achievements"] == [
        {"title": "Winner, Smart India Hackathon", "description": "1st of 400 teams",
         "date": "Mar. 2024"}
    ]


def test_one_page_is_the_default_and_more_pages_is_an_explicit_choice(client, stocked, seen):
    client.post("/api/tailor", files={"file": JD_FILE})
    assert seen["limits"] is ai_service.ONE_PAGE

    client.post("/api/tailor", files={"file": JD_FILE}, data={"allow_multiple_pages": "true"})
    assert seen["limits"] is ai_service.MULTI_PAGE
