"""
The Gemini wrapper, with the SDK mocked.

The value here is the contract around the model: structured output is
re-validated, an empty or malformed response becomes a typed error rather than
a crash, and the guardrails run on whatever comes back.
"""

from __future__ import annotations

import json

import pytest

import ai_service
from schemas import JDAnalysis, RepoAnalysis


class FakeResponse:
    def __init__(self, text=None, parsed=None, prompt_feedback=None):
        self.text = text
        self.parsed = parsed
        self.prompt_feedback = prompt_feedback


class FakeModels:
    def __init__(self, response):
        self._response = response
        self.last_call = {}

    def generate_content(self, *, model, contents, config):
        self.last_call = {"model": model, "contents": contents, "config": config}
        if isinstance(self._response, Exception):
            raise self._response
        return self._response


class FakeClient:
    def __init__(self, response):
        self.models = FakeModels(response)


@pytest.fixture(name="gemini")
def gemini_fixture(monkeypatch):
    def install(response):
        client = FakeClient(response)
        # `_get_client` now takes the student's own API key (or None for the
        # app's), so the stand-in has to accept it and ignore it.
        monkeypatch.setattr(ai_service, "_get_client", lambda api_key=None: client)
        return client

    return install


ANALYSIS_JSON = {
    "job_title": "Backend Intern", "company": "Razorpay",
    "hard_skills": ["Python"], "soft_skills": ["ownership"],
    "keywords": ["python"], "seniority": "internship",
}


def test_uses_the_sdk_parsed_object_when_available(gemini):
    parsed = JDAnalysis(**ANALYSIS_JSON)
    client = gemini(FakeResponse(parsed=parsed))

    result = ai_service.analyse_job_description("We need a Python developer.")

    assert result is parsed
    # Structured output must be requested, or the model is free to return prose.
    config = client.models.last_call["config"]
    assert config.response_mime_type == "application/json"
    assert config.response_schema is JDAnalysis


def test_falls_back_to_parsing_the_raw_json(gemini):
    gemini(FakeResponse(text=json.dumps(ANALYSIS_JSON), parsed=None))
    result = ai_service.analyse_job_description("We need a Python developer.")
    assert result.job_title == "Backend Intern"


@pytest.mark.parametrize(
    "response, expected",
    [
        pytest.param(FakeResponse(text="", parsed=None), "empty response", id="empty"),
        pytest.param(FakeResponse(text="not json at all", parsed=None),
                     "malformed output", id="not-json"),
        pytest.param(FakeResponse(text='{"job_title": "x"}', parsed=None),
                     "malformed output", id="missing-required-fields"),
    ],
)
def test_unusable_model_output_raises_a_typed_error(gemini, response, expected):
    gemini(response)
    with pytest.raises(ai_service.AIServiceError) as exc:
        ai_service.analyse_job_description("We need a Python developer.")
    assert expected in str(exc.value)


def test_a_blocked_response_reports_the_reason(gemini):
    gemini(FakeResponse(text="", parsed=None, prompt_feedback="BLOCKED_SAFETY"))
    with pytest.raises(ai_service.AIServiceError) as exc:
        ai_service.analyse_job_description("We need a Python developer.")
    assert "BLOCKED_SAFETY" in str(exc.value)


def test_sdk_exceptions_are_wrapped(gemini):
    gemini(RuntimeError("connection reset"))
    with pytest.raises(ai_service.AIServiceError) as exc:
        ai_service.analyse_job_description("We need a Python developer.")
    assert "connection reset" in str(exc.value)


def test_missing_api_key_is_a_clear_error(monkeypatch):
    """With no app key configured, the free allowance cannot run - and the
    message has to point the student at the way out, which is their own key."""
    monkeypatch.setattr(ai_service, "_client", None)
    monkeypatch.setattr(ai_service, "GEMINI_API_KEY", "")
    with pytest.raises(ai_service.AIServiceError) as exc:
        ai_service._get_client()
    assert "own Gemini API key" in str(exc.value)


def test_a_student_key_bypasses_the_apps_client_entirely(monkeypatch):
    """A student's own key must be used even when the app has no key at all -
    that is the whole point of bring-your-own-key."""
    built = {}

    class FakeGenaiClient:
        def __init__(self, api_key):
            built["api_key"] = api_key

    monkeypatch.setattr(ai_service, "_client", None)
    monkeypatch.setattr(ai_service, "GEMINI_API_KEY", "")
    monkeypatch.setattr(ai_service.genai, "Client", FakeGenaiClient)

    ai_service._get_client("AIzaSTUDENTKEY0000000000000000000000000")

    assert built["api_key"] == "AIzaSTUDENTKEY0000000000000000000000000"
    # Never cached: a process-wide cache keyed on the key would hold other
    # people's credentials in memory for the life of the instance.
    assert ai_service._client is None


def test_a_rejected_key_is_a_typed_error_and_never_echoes_the_key(monkeypatch):
    """A bad key needs different handling from a broken service, and the key
    itself must not reach a log line or an error message."""
    secret = "AIzaSECRETKEY000000000000000000000000000"

    class ExplodingClient:
        class models:
            @staticmethod
            def generate_content(**_kwargs):
                raise RuntimeError(
                    f"400 INVALID_ARGUMENT: API key not valid: {secret}"
                )

    monkeypatch.setattr(ai_service, "_get_client", lambda api_key=None: ExplodingClient())

    with pytest.raises(ai_service.InvalidApiKeyError) as exc:
        ai_service.analyse_job_description("We need Python.", api_key=secret)

    message = str(exc.value)
    assert secret not in message
    assert "rejected that API key" in message


def test_the_redactor_removes_keys_but_leaves_short_strings_alone():
    secret = "AIzaSECRETKEY000000000000000000000000000"
    assert secret not in ai_service._redact(f"failed for {secret}", secret)
    # Guard against a short or empty "secret" blanking out unrelated text.
    assert ai_service._redact("a b c", "", "ab") == "a b c"


def test_repo_bullets_are_stripped_of_invented_metrics(gemini):
    """The guardrail must run on the model's output, not just be defined."""
    analysis = RepoAnalysis(
        project_title="Scheduler",
        tech_stack=["Python"],
        bullets=[
            {"text": "Built a solver, cutting runtime by 80%, using OR-Tools",
             "tags": ["python"]},
        ],
    )
    gemini(FakeResponse(parsed=analysis))

    result = ai_service.analyse_repository(
        repo_name="ananyak/scheduler",
        readme="# Scheduler\nA timetable solver built with OR-Tools.",
        languages=["Python"],
    )
    assert "80%" not in result.bullets[0].text
    assert "OR-Tools" in result.bullets[0].text


def test_tailoring_applies_both_guardrails(gemini, monkeypatch):
    from tests.test_guardrails import _oversized_payload

    payload = _oversized_payload()
    payload.experience[0].bullets = ["Shipped the API, improving speed by 90%"]
    gemini(FakeResponse(parsed=payload))

    result = ai_service.tailor_resume(
        analysis=JDAnalysis(**ANALYSIS_JSON),
        vault_context="Shipped the API using FastAPI.",
        student_name="Ananya Krishnan",
        student_email="ananya@vit.ac.in",
    )

    # One-page trim applied...
    assert len(result.education) == ai_service.MAX_EDUCATION
    # ...and the invented metric is gone.
    assert "90%" not in result.experience[0].bullets[0]
