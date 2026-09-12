"""
The quota and bring-your-own-key rules as the frontend sees them.

`test_quota.py` covers the arithmetic. This covers the wiring: which status
code a spent allowance produces, whether a supplied key really reaches the AI
layer, and - the one that costs a student their week if it regresses - that a
failed run is not charged.
"""

from __future__ import annotations

import pytest

import ai_service
import quota
from gemini_key import HEADER_NAME
from models import Bullet, EntityType, Experience
from schemas import JDAnalysis

from datetime import date

# Comfortably over `jd_parser.MIN_EXTRACTED_CHARS` (50), which exists to catch
# scanned PDFs that yield no selectable text.
JD_FILE = (
    "jd.txt",
    b"Backend Engineering Intern. We need Python, FastAPI and PostgreSQL. "
    b"Docker and CI/CD are a plus. Bengaluru based, six months, stipend paid.",
    "text/plain",
)

STUDENT_KEY = "AIzaSyStudentOwnKey000000000000000000000"

ANALYSIS = JDAnalysis(
    job_title="Backend Engineering Intern",
    company="Razorpay",
    hard_skills=["Python"],
    soft_skills=["ownership"],
    keywords=["python", "fastapi"],
    required_keywords=[],
    seniority="internship",
)


@pytest.fixture(name="vault")
def vault_fixture(session, user):
    """A minimum viable vault - the endpoint refuses to run without bullets."""
    experience = Experience(
        user_id=user.id,
        title="SWE Intern",
        organization="Razorpay",
        start_date=date(2025, 5, 1),
    )
    session.add(experience)
    session.commit()
    session.refresh(experience)
    session.add(
        Bullet(
            user_id=user.id,
            entity_type=EntityType.EXPERIENCE,
            entity_id=experience.id,
            original_text="Built a reconciliation service",
            tags="python",
        )
    )
    session.commit()
    return experience


@pytest.fixture(name="ai")
def ai_fixture(monkeypatch):
    """Record the api_key each AI call received."""
    from tests.test_tailor_flow import RESUME

    seen = {}

    def analyse(jd_text, qualifications_block="", api_key=None):
        seen["analyse_key"] = api_key
        return ANALYSIS

    def tailor(*, analysis, vault_context, student_name, student_email,
               qualifications_block="", api_key=None):
        seen["tailor_key"] = api_key
        return RESUME

    monkeypatch.setattr(ai_service, "analyse_job_description", analyse)
    monkeypatch.setattr(ai_service, "tailor_resume", tailor)
    return seen


# ---------------------------------------------------------------------------
# Reporting the allowance
# ---------------------------------------------------------------------------
def test_the_quota_endpoint_reports_a_fresh_allowance(client):
    body = client.get("/api/tailor/quota").json()

    assert body["used"] == 0
    assert body["limit"] == quota.FREE_RUNS_PER_WEEK
    assert body["remaining"] == quota.FREE_RUNS_PER_WEEK
    assert body["using_own_key"] is False
    assert body["resets_on"]  # an ISO date the UI can render


def test_the_quota_endpoint_reflects_a_supplied_key(client):
    body = client.get(
        "/api/tailor/quota", headers={HEADER_NAME: STUDENT_KEY}
    ).json()

    assert body["using_own_key"] is True


def test_reading_the_quota_does_not_spend_it(client):
    client.get("/api/tailor/quota")
    client.get("/api/tailor/quota")

    assert client.get("/api/tailor/quota").json()["used"] == 0


# ---------------------------------------------------------------------------
# Spending it through the real endpoint
# ---------------------------------------------------------------------------
def test_a_tailoring_run_reports_the_remaining_allowance(client, vault, ai):
    body = client.post("/api/tailor", files={"file": JD_FILE}).json()

    # Returned with the run so the UI updates its counter without a second
    # request.
    assert body["quota"]["used"] == 1
    assert body["quota"]["remaining"] == quota.FREE_RUNS_PER_WEEK - 1
    assert body["quota"]["using_own_key"] is False


def test_the_free_allowance_runs_out_with_a_429(client, vault, ai):
    for _ in range(quota.FREE_RUNS_PER_WEEK):
        assert client.post("/api/tailor", files={"file": JD_FILE}).status_code == 200

    response = client.post("/api/tailor", files={"file": JD_FILE})

    # 429, not 402 or 403: it is a rate limit that time clears, and the
    # frontend keys the "add your own key" dialog off this status.
    assert response.status_code == 429
    assert "free tailoring runs" in response.json()["detail"]
    # The reset date is a header too, so the UI never parses the prose.
    assert response.headers["X-Quota-Resets-On"]


def test_an_exhausted_student_is_turned_away_before_the_ai_is_called(
    client, vault, ai, session, user
):
    """Out of quota must cost nothing: no upload parsed, no Gemini call, no
    money spent."""
    user.free_runs_used = quota.FREE_RUNS_PER_WEEK
    user.free_runs_week = quota.week_start()
    session.add(user)
    session.commit()

    assert client.post("/api/tailor", files={"file": JD_FILE}).status_code == 429
    assert "analyse_key" not in ai


# ---------------------------------------------------------------------------
# Bring your own key
# ---------------------------------------------------------------------------
def test_a_supplied_key_reaches_both_ai_calls(client, vault, ai):
    response = client.post(
        "/api/tailor", files={"file": JD_FILE}, headers={HEADER_NAME: STUDENT_KEY}
    )

    assert response.status_code == 200
    assert ai["analyse_key"] == STUDENT_KEY
    assert ai["tailor_key"] == STUDENT_KEY


def test_a_supplied_key_is_not_charged_even_when_the_allowance_is_gone(
    client, vault, ai, session, user
):
    user.free_runs_used = quota.FREE_RUNS_PER_WEEK
    user.free_runs_week = quota.week_start()
    session.add(user)
    session.commit()

    response = client.post(
        "/api/tailor", files={"file": JD_FILE}, headers={HEADER_NAME: STUDENT_KEY}
    )

    assert response.status_code == 200
    assert response.json()["quota"]["using_own_key"] is True
    # Their free runs are left exactly as they were, for if they remove the key.
    session.refresh(user)
    assert user.free_runs_used == quota.FREE_RUNS_PER_WEEK


def test_no_key_header_means_the_app_key_is_used(client, vault, ai):
    client.post("/api/tailor", files={"file": JD_FILE})

    assert ai["analyse_key"] is None
    assert ai["tailor_key"] is None


def test_an_empty_key_header_is_treated_as_no_key(client, vault, ai):
    """A frontend that has just cleared a saved key may well send "". Rejecting
    that as malformed would be a baffling error for a student who removed
    theirs on purpose."""
    response = client.post(
        "/api/tailor", files={"file": JD_FILE}, headers={HEADER_NAME: ""}
    )

    assert response.status_code == 200
    assert ai["analyse_key"] is None


@pytest.mark.parametrize(
    "bad_key, reason",
    [
        ("AIza-too-short", "truncated paste"),
        ("AIzaSy key with a space in it 00000000000", "newline survived the copy"),
    ],
)
def test_an_obviously_malformed_key_fails_fast(client, vault, ai, bad_key, reason):
    """Caught locally rather than after an upload and a Gemini round trip - and
    the error must never echo the value back."""
    response = client.post(
        "/api/tailor", files={"file": JD_FILE}, headers={HEADER_NAME: bad_key}
    )

    assert response.status_code == 400, reason
    assert bad_key not in response.text
    assert "analyse_key" not in ai


def test_a_rejected_key_is_a_400_not_a_502(client, vault, monkeypatch):
    """The student can fix their own key in seconds. A 502 would tell them to
    wait and retry, which would never work."""
    def reject(jd_text, qualifications_block="", api_key=None):
        raise ai_service.InvalidApiKeyError("Google rejected that API key.")

    monkeypatch.setattr(ai_service, "analyse_job_description", reject)

    response = client.post(
        "/api/tailor", files={"file": JD_FILE}, headers={HEADER_NAME: STUDENT_KEY}
    )

    assert response.status_code == 400
    assert "rejected" in response.json()["detail"]


# ---------------------------------------------------------------------------
# The expensive mistake
# ---------------------------------------------------------------------------
def test_a_failed_run_is_not_charged(client, vault, session, user, monkeypatch):
    """With three runs a week, losing one to our own failure costs a student a
    third of their week. The allowance is charged only after the resume is
    stored."""
    def boom(jd_text, qualifications_block="", api_key=None):
        raise ai_service.AIServiceError("Gemini fell over.")

    monkeypatch.setattr(ai_service, "analyse_job_description", boom)

    assert client.post("/api/tailor", files={"file": JD_FILE}).status_code == 502

    session.refresh(user)
    assert user.free_runs_used == 0
    assert client.get("/api/tailor/quota").json()["remaining"] == (
        quota.FREE_RUNS_PER_WEEK
    )


def test_a_bad_upload_is_not_charged(client, vault, ai):
    """Same rule for a parse failure: the student's file was wrong, but they
    did not get a resume, so they do not pay for one."""
    bad = ("jd.doc", b"\xd0\xcf\x11\xe0legacy word binary", "application/msword")

    assert client.post("/api/tailor", files={"file": bad}).status_code == 400
    assert client.get("/api/tailor/quota").json()["used"] == 0
