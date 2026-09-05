"""
The tailoring endpoint end to end, with Gemini mocked.

Proves the four steps wire together: the upload is parsed, the vault is
filtered, the payload is stored, and what comes back is what the PDF renderer
will consume.
"""

from __future__ import annotations

from datetime import date

import pytest

import ai_service
import latex_renderer
from models import Bullet, EntityType, Experience, GeneratedResume
from schemas import (
    JDAnalysis,
    ResumeEducation,
    ResumeExperience,
    ResumeHeader,
    ResumePayload,
    ResumeProject,
    SkillCategory,
)

JD_FILE = (
    "jd.txt",
    b"Backend intern. We need Python, FastAPI and PostgreSQL. "
    b"Docker and CI/CD are a plus. Bengaluru based, six months.",
    "text/plain",
)

ANALYSIS = JDAnalysis(
    job_title="Backend Engineering Intern",
    company="Razorpay",
    hard_skills=["Python", "FastAPI", "PostgreSQL"],
    soft_skills=["collaboration"],
    keywords=["python", "fastapi", "postgresql", "docker"],
    seniority="internship",
)

RESUME = ResumePayload(
    header=ResumeHeader(
        full_name="Ananya Krishnan", phone="+91 98765 43210",
        email="ananya@vit.ac.in", linkedin="", github="github.com/ananyak",
        portfolio="",
    ),
    education=[ResumeEducation(
        institution="VIT", location="Vellore", qualification="B.Tech CSE",
        score="CGPA: 8.74", date_range="Aug. 2022 - May 2026",
    )],
    experience=[ResumeExperience(
        title="SWE Intern", date_range="May 2025 - July 2025",
        organization="Razorpay", location="Bengaluru",
        bullets=["Built a reconciliation service in Python and FastAPI"],
    )],
    projects=[ResumeProject(
        name="Scheduler", tech_stack="Python, FastAPI",
        date_range="Jan. 2025", bullets=["Built a constraint solver"],
    )],
    skills=[SkillCategory(category="Languages", items="Python, TypeScript")],
    selection_rationale="Chose the Razorpay internship because the role asks "
                        "for production Python.",
)


@pytest.fixture(name="stocked_vault")
def stocked_vault_fixture(session, user):
    experience = Experience(
        user_id=user.id, title="SWE Intern", organization="Razorpay",
        location="Bengaluru", start_date=date(2025, 5, 1), end_date=date(2025, 7, 31),
    )
    session.add(experience)
    session.commit()
    session.refresh(experience)

    session.add(Bullet(
        user_id=user.id, entity_type=EntityType.EXPERIENCE, entity_id=experience.id,
        original_text="Built a reconciliation service", tags="python,fastapi",
    ))
    session.commit()
    return experience


@pytest.fixture(name="mock_ai")
def mock_ai_fixture(monkeypatch):
    calls = {}

    def analyse(jd_text):
        calls["jd_text"] = jd_text
        return ANALYSIS

    def tailor(*, analysis, vault_context, student_name, student_email):
        calls["vault_context"] = vault_context
        calls["student_name"] = student_name
        return RESUME

    monkeypatch.setattr(ai_service, "analyse_job_description", analyse)
    monkeypatch.setattr(ai_service, "tailor_resume", tailor)
    return calls


def test_tailoring_returns_a_renderable_payload_and_stores_it(
    client, session, stocked_vault, mock_ai
):
    response = client.post("/api/tailor", files={"file": JD_FILE})
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["job_title"] == "Backend Engineering Intern"
    assert body["analysis"]["company"] == "Razorpay"
    # The echo of what was parsed - this is what lets a student spot a bad parse.
    assert body["source"]["filename"] == "jd.txt"
    assert body["source"]["char_count"] > 0
    assert "Python" in body["source"]["preview"]

    # Section order and shape must match the template the renderer expects.
    # `selection_rationale` rides along for the preview but is never rendered.
    assert list(body["resume"]) == [
        "header", "education", "experience", "projects", "skills",
        "selection_rationale",
    ]
    assert body["resume"]["skills"][0]["category"] == "Languages"
    assert body["resume"]["selection_rationale"].startswith("Chose the")

    stored = session.get(GeneratedResume, body["resume_id"])
    assert stored is not None
    assert stored.resume_json["header"]["full_name"] == "Ananya Krishnan"


def test_the_ai_receives_the_parsed_file_and_the_students_own_vault(
    client, stocked_vault, mock_ai
):
    client.post("/api/tailor", files={"file": JD_FILE})

    assert "FastAPI" in mock_ai["jd_text"]
    assert "Built a reconciliation service" in mock_ai["vault_context"]
    assert "date_range: May 2025 - July 2025" in mock_ai["vault_context"]
    assert mock_ai["student_name"] == "Ananya Krishnan"


def test_an_explicit_job_title_overrides_the_inferred_one(
    client, stocked_vault, mock_ai
):
    response = client.post(
        "/api/tailor",
        files={"file": JD_FILE},
        data={"job_title": "Platform Intern"},
    )
    assert response.json()["job_title"] == "Platform Intern"


def test_ai_failure_becomes_a_502_not_a_500(client, stocked_vault, monkeypatch):
    """The frontend needs to tell "the AI failed" apart from "your request was
    wrong", so this must not surface as a generic server error."""
    def boom(_jd_text):
        raise ai_service.AIServiceError("Gemini returned malformed output.")

    monkeypatch.setattr(ai_service, "analyse_job_description", boom)

    response = client.post("/api/tailor", files={"file": JD_FILE})
    assert response.status_code == 502
    assert "Could not analyse" in response.text


def test_history_lists_then_reopens_then_deletes(client, stocked_vault, mock_ai):
    resume_id = client.post("/api/tailor", files={"file": JD_FILE}).json()["resume_id"]

    listed = client.get("/api/tailor/history").json()
    assert [item["id"] for item in listed] == [resume_id]
    # The list omits the payload so it stays cheap.
    assert "resume_json" not in listed[0]

    detail = client.get(f"/api/tailor/history/{resume_id}").json()
    assert detail["resume_json"]["header"]["full_name"] == "Ananya Krishnan"

    assert client.delete(f"/api/tailor/history/{resume_id}").status_code == 204
    assert client.get("/api/tailor/history").json() == []


def test_another_users_resume_is_not_reachable(client, session, other_user):
    theirs = GeneratedResume(
        user_id=other_user.id, job_title="Theirs", jd_text="...", resume_json={},
    )
    session.add(theirs)
    session.commit()
    session.refresh(theirs)

    assert client.get(f"/api/tailor/history/{theirs.id}").status_code == 404
    assert client.delete(f"/api/tailor/history/{theirs.id}").status_code == 404


# ---------------------------------------------------------------------------
# PDF rendering
# ---------------------------------------------------------------------------
@pytest.fixture(name="mock_latex")
def mock_latex_fixture(monkeypatch):
    """Stand in for the LaTeX service.

    Compilation needs Docker, so it is exercised by the e2e suite instead. What
    matters here is that the endpoint hands the renderer the right payload and
    returns the bytes as a PDF.
    """
    seen = {}

    def render_pdf(payload):
        seen["payload"] = payload
        return b"%PDF-1.5 fake pdf bytes %%EOF"

    monkeypatch.setattr(latex_renderer, "render_pdf", render_pdf)
    return seen


def test_render_endpoint_compiles_an_arbitrary_payload(client, mock_latex):
    """This is what makes the preview editable - the browser posts the edited
    payload and gets the real document back."""
    response = client.post(
        "/api/tailor/render?job_title=Backend%20Intern", json=RESUME.model_dump()
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF-")
    # Never cached: the payload changes as the student edits.
    assert response.headers["cache-control"] == "no-store"
    assert "Ananya_Krishnan_Backend_Intern.pdf" in response.headers["content-disposition"]
    assert mock_latex["payload"].header.full_name == "Ananya Krishnan"


def test_stored_resume_downloads_as_pdf(client, stocked_vault, mock_ai, mock_latex):
    resume_id = client.post("/api/tailor", files={"file": JD_FILE}).json()["resume_id"]

    response = client.get(f"/api/tailor/history/{resume_id}/pdf")
    assert response.status_code == 200
    assert response.content.startswith(b"%PDF-")


def test_edits_can_be_saved_back_to_a_stored_resume(client, stocked_vault, mock_ai):
    resume_id = client.post("/api/tailor", files={"file": JD_FILE}).json()["resume_id"]

    edited = RESUME.model_copy(deep=True)
    edited.experience[0].bullets = ["A bullet the student rewrote by hand"]

    response = client.patch(
        f"/api/tailor/history/{resume_id}", json=edited.model_dump()
    )
    assert response.status_code == 200
    assert (
        response.json()["resume_json"]["experience"][0]["bullets"][0]
        == "A bullet the student rewrote by hand"
    )

    # And it persisted.
    reopened = client.get(f"/api/tailor/history/{resume_id}").json()
    assert reopened["resume_json"]["experience"][0]["bullets"][0].startswith("A bullet")


def test_a_latex_failure_is_a_502_with_the_reason(client, monkeypatch):
    def boom(_payload):
        raise latex_renderer.LatexRenderError("The PDF service is not running.")

    monkeypatch.setattr(latex_renderer, "render_pdf", boom)

    response = client.post("/api/tailor/render", json=RESUME.model_dump())
    assert response.status_code == 502
    assert "not running" in response.text


@pytest.mark.parametrize("path", ["/api/tailor/history/999/pdf"])
def test_another_users_pdf_is_not_reachable(client, session, other_user, path):
    theirs = GeneratedResume(
        user_id=other_user.id, job_title="Theirs", jd_text="...",
        resume_json=RESUME.model_dump(),
    )
    session.add(theirs)
    session.commit()
    session.refresh(theirs)

    assert client.get(f"/api/tailor/history/{theirs.id}/pdf").status_code == 404
    assert client.patch(
        f"/api/tailor/history/{theirs.id}", json=RESUME.model_dump()
    ).status_code == 404
