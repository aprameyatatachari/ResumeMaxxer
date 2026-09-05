"""
ai_service.py
=============
Every Gemini call in the application lives behind this module.

Keeping the SDK boxed in here means two things:

* Swapping SDKs touches exactly one file. That already paid off once: this
  module was migrated off the retired `google-generativeai` package to
  `google-genai` without any router changing a line.
* Prompts are versioned and reviewable in one place instead of scattered
  through routers.

Guardrails implemented here (product.md section 5)
--------------------------------------------------
* **Strict JSON**: every call passes `response_schema=<Pydantic model>` and
  `response_mime_type="application/json"`, so Gemini is constrained to emit
  parseable JSON matching our shape. We still re-validate with Pydantic
  afterwards - trust, then verify.
* **No Fluff**: the system prompts forbid inventing metrics, and
  `enforce_no_fabrication()` runs a mechanical check for numbers that appear in
  the output but nowhere in the student's source text.
* **One Page**: `enforce_one_page()` trims the payload in Python. Prompt
  instructions alone are a suggestion; the trim is a guarantee.
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
from typing import Optional, Type, TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel, ValidationError

import latex_renderer
from schemas import (
    JDAnalysis,
    RepoAnalysis,
    ResumeExperience,
    ResumePayload,
    ResumeProject,
)

logger = logging.getLogger("resumemaxxer.ai")

T = TypeVar("T", bound=BaseModel)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

# One-Page Rule, enforced numerically rather than by persuasion.
#
# MAX_EDUCATION is 3, not the 1 in product.md: an Indian resume conventionally
# lists the degree plus Class XII and Class X board results, because campus
# placement portals screen on those marks. Three short education rows cost less
# vertical space than one extra experience bullet.
MAX_EDUCATION = 3
MAX_ENTRIES_TOTAL = 4  # experiences + projects combined
MAX_BULLETS_PER_ENTRY = 4
MAX_SKILL_CATEGORIES = 4
MAX_SKILLS_PER_CATEGORY = 12


class AIServiceError(RuntimeError):
    """Raised when Gemini is unusable or returned something we cannot trust.

    Routers translate this into an HTTP 502 so the frontend can distinguish
    "the AI failed" from "your request was wrong".
    """


_client: Optional[genai.Client] = None
_client_lock = threading.Lock()


def _get_client() -> genai.Client:
    """Build the process-wide Gemini client once, lazily (thread-safe).

    Lazy rather than at import time so the app still boots (and `/health` still
    answers) when the developer has not pasted a Gemini key yet. The client
    holds a connection pool, so it is built once and shared rather than
    per-request.
    """
    global _client
    if _client is not None:
        return _client

    if not GEMINI_API_KEY:
        raise AIServiceError(
            "GEMINI_API_KEY is not set. Add it to backend/.env - see .env.example."
        )

    with _client_lock:
        # Re-check inside the lock: another thread may have won the race.
        if _client is None:
            _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


# ---------------------------------------------------------------------------
# Core call helper
# ---------------------------------------------------------------------------
def _generate_structured(
    *,
    system_instruction: str,
    prompt: str,
    schema: Type[T],
    temperature: float = 0.3,
) -> T:
    """Call Gemini and return a validated instance of `schema`.

    `temperature` stays low by default: this is an extraction and rewriting
    task, not a creative one. Higher values measurably increase the rate of
    invented detail, which is exactly what the No Fluff rule forbids.
    """
    client = _get_client()

    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=schema,
                temperature=temperature,
            ),
        )
    except Exception as exc:
        logger.exception("Gemini request failed")
        raise AIServiceError(f"Gemini request failed: {exc}") from exc

    # Fast path: with `response_schema` set, the SDK parses and validates the
    # response into our Pydantic model itself. `parsed` is None when the model
    # returned nothing usable, so the manual path below stays as a fallback.
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, schema):
        return parsed

    raw = (response.text or "").strip()
    if not raw:
        # Usually means the safety filters blocked the response. Surface the
        # reason when the SDK gives us one - "empty response" alone is
        # undebuggable.
        reason = getattr(response, "prompt_feedback", None)
        raise AIServiceError(
            f"Gemini returned an empty response{f' ({reason})' if reason else ''}."
        )

    try:
        return schema.model_validate(json.loads(raw))
    except (json.JSONDecodeError, ValidationError) as exc:
        logger.error("Gemini returned unusable JSON: %s", raw[:500])
        raise AIServiceError(f"Gemini returned malformed output: {exc}") from exc


# ---------------------------------------------------------------------------
# Guardrail helpers
# ---------------------------------------------------------------------------
_NUMBER_RE = re.compile(r"\d+(?:[.,]\d+)?%?")


def enforce_no_fabrication(generated: str, source_corpus: str) -> str:
    """Strip invented metrics from a generated bullet.

    Gemini's most common guardrail violation is inventing plausible numbers
    ("improved performance by 40%"). This is a mechanical last line of defence:
    any number in the output that does not appear anywhere in the student's own
    text gets removed along with its clause.

    Deliberately conservative - it only ever deletes, never rewrites, so the
    worst case is a slightly clipped bullet rather than a false claim.
    """
    source_numbers = set(_NUMBER_RE.findall(source_corpus))
    invented = [n for n in _NUMBER_RE.findall(generated) if n not in source_numbers]
    if not invented:
        return generated

    logger.warning("Dropping fabricated metrics %s from generated bullet", invented)

    # Split into clauses and drop any clause carrying an invented number.
    clauses = re.split(r"(?<=[,;])\s+", generated)
    kept = [
        clause
        for clause in clauses
        if not any(number in clause for number in invented)
    ]
    cleaned = " ".join(kept).strip() if kept else generated
    # Tidy up punctuation left dangling by a removed trailing clause.
    return re.sub(r"[\s,;]+$", "", cleaned) or generated


def _trim_entry(
    entry: ResumeExperience | ResumeProject,
) -> ResumeExperience | ResumeProject:
    entry.bullets = [b.strip() for b in entry.bullets if b.strip()][
        :MAX_BULLETS_PER_ENTRY
    ]
    return entry


def enforce_one_page(payload: ResumePayload) -> ResumePayload:
    """Trim the payload down to something that physically fits on one page.

    Caps follow product.md section 5, adjusted for the Indian convention of
    listing board results: at most 3 education rows (degree, Class XII, Class
    X), 4 experiences and projects combined, 4 bullets each, and 4 skill
    categories. Experience is filled before projects, since paid work outranks
    side projects when space runs out.
    """
    payload.education = payload.education[:MAX_EDUCATION]

    payload.experience = [_trim_entry(e) for e in payload.experience]
    payload.projects = [_trim_entry(p) for p in payload.projects]

    # Same reasoning as every other cap here: the prompt asks for at most five
    # technologies, this makes it true. An imported repo often carries a dozen,
    # which wraps the project heading onto a second line.
    for project in payload.projects:
        project.tech_stack = latex_renderer.trim_tech_stack(project.tech_stack)

    # Budget: experience first, projects fill whatever is left.
    experience_budget = min(len(payload.experience), MAX_ENTRIES_TOTAL)
    payload.experience = payload.experience[:experience_budget]
    payload.projects = payload.projects[: MAX_ENTRIES_TOTAL - experience_budget]

    payload.skills = payload.skills[:MAX_SKILL_CATEGORIES]
    for category in payload.skills:
        items = [item.strip() for item in category.items.split(",") if item.strip()]
        category.items = ", ".join(items[:MAX_SKILLS_PER_CATEGORY])

    # Drop any category the model left empty rather than rendering a bold
    # label with nothing after it.
    payload.skills = [c for c in payload.skills if c.items and c.category.strip()]

    return payload


# ---------------------------------------------------------------------------
# Shared prompt fragment
# ---------------------------------------------------------------------------
_NO_FLUFF_RULES = """
You write resume content for college students. Absolute rules:

1. NEVER invent facts, metrics, numbers, dates, company names or technologies.
   If the source material does not contain a number, your output contains no
   number. A vague true statement always beats a specific false one.
2. Every bullet starts with a strong past-tense action verb (Built, Designed,
   Automated, Led, Reduced, Shipped). Never start with "Responsible for",
   "Helped with" or a gerund.
3. Prefer the "Accomplished X by doing Y using Z" shape when the source
   supports it.
4. Keep each bullet to one line: 15-25 words maximum.
5. Use the exact terminology from the job description where it truthfully
   describes what the student did. This is what gets past ATS filters. Do not
   claim a technology the student never touched.
6. No first-person pronouns. No adjectival self-praise ("passionate",
   "hardworking", "detail-oriented").
""".strip()


# ---------------------------------------------------------------------------
# Step 1 - Extract requirements from the job description
# ---------------------------------------------------------------------------
def analyse_job_description(jd_text: str) -> JDAnalysis:
    """Pull structured requirements out of a pasted JD."""
    system_instruction = (
        "You are an expert technical recruiter and ATS analyst. You read job "
        "descriptions and extract exactly what the hiring team screens for. "
        "Return only what the text supports; never speculate."
    )
    prompt = f"""
Analyse the job description below.

Extract:
- job_title: the normalised role title.
- company: the hiring company, or an empty string if not stated.
- hard_skills: concrete technologies, languages, frameworks, tools.
- soft_skills: behavioural and collaboration requirements.
- keywords: 10-20 lowercase single words or short phrases an ATS would scan
  for. These are matched against a database of tags, so keep them short and
  canonical ("python", "rest api", "ci/cd") rather than sentences.
- seniority: one of internship, entry, mid, senior.

JOB DESCRIPTION:
---
{jd_text[:15000]}
---
""".strip()

    return _generate_structured(
        system_instruction=system_instruction,
        prompt=prompt,
        schema=JDAnalysis,
        temperature=0.1,  # pure extraction: near-deterministic
    )


# ---------------------------------------------------------------------------
# GitHub import - turn a repo into Vault bullets
# ---------------------------------------------------------------------------
def analyse_repository(
    *,
    repo_name: str,
    readme: str,
    languages: list[str],
    description: Optional[str] = None,
) -> RepoAnalysis:
    """Turn a repo's README plus language stats into tagged resume bullets."""
    system_instruction = _NO_FLUFF_RULES
    prompt = f"""
A student wants this GitHub project on their resume. Write 4-5 bullets
describing what they built, based ONLY on the material below.

If the README is thin, write fewer bullets rather than padding with guesses.
Describe the engineering (architecture, features, problems solved), not the
repository's popularity.

Also return:
- project_title: a clean human-readable name (not the raw repo slug).
- tech_stack: technologies genuinely evidenced by the README or language stats.
- For each bullet, `tags`: lowercase skill tags used later to match this bullet
  against job descriptions.

REPOSITORY: {repo_name}
DESCRIPTION: {description or "(none)"}
DETECTED LANGUAGES: {", ".join(languages) or "(none)"}

README:
---
{readme[:12000]}
---
""".strip()

    analysis = _generate_structured(
        system_instruction=system_instruction,
        prompt=prompt,
        schema=RepoAnalysis,
        temperature=0.4,
    )

    # Mechanical guardrail pass over the model's output.
    source_corpus = f"{readme}\n{description or ''}\n{' '.join(languages)}"
    for bullet in analysis.bullets:
        bullet.text = enforce_no_fabrication(bullet.text, source_corpus)

    return analysis


# ---------------------------------------------------------------------------
# Step 3 - Rewrite the Vault into a tailored one-page resume
# ---------------------------------------------------------------------------
def tailor_resume(
    *,
    analysis: JDAnalysis,
    vault_context: str,
    student_name: str,
    student_email: str,
) -> ResumePayload:
    """Produce the final resume payload for @react-pdf/renderer.

    `vault_context` is a plain-text rendering of the student's filtered Vault
    (built by `routers/tailor.py`). Passing pre-filtered text rather than the
    whole Vault keeps the prompt small and stops Gemini from reaching for
    irrelevant material.
    """
    system_instruction = (
        _NO_FLUFF_RULES
        + "\n\nYou select and rewrite existing material. You are a ruthless "
        "editor, not an author. Every claim must trace back to the vault."
    )
    prompt = f"""
Build a tailored, one-page, ATS-friendly resume for an Indian college student.

TARGET ROLE: {analysis.job_title} ({analysis.seniority})
COMPANY: {analysis.company or "(not stated)"}
REQUIRED HARD SKILLS: {", ".join(analysis.hard_skills)}
REQUIRED SOFT SKILLS: {", ".join(analysis.soft_skills)}
ATS KEYWORDS: {", ".join(analysis.keywords)}

STUDENT VAULT (the ONLY source of truth - every claim must come from here):
---
{vault_context}
---

Instructions:

1. SELECT the most relevant material. Leaving things out is the main tool you
   have - anything that does not help for this specific role is noise.

2. HARD LIMITS (going over means it does not fit on one page):
   - at most 3 education rows
   - at most 4 experience and project entries COMBINED
   - at most 4 bullets per entry
   - at most 4 skill categories

3. REWRITE each selected bullet to mirror the job description's language,
   without claiming anything the vault does not support.

4. EDUCATION: copy `institution`, `location`, `score` and `date_range` from the
   vault verbatim - do not reformat or recalculate them. Build `qualification`
   as follows:
   - degree      -> the degree name, e.g. "B.E. Computer Science"
   - Class XII   -> "<BOARD> - Class XII (<STREAM>)", e.g. "CBSE - Class XII (PCMB)"
   - Class X     -> "<BOARD> - Class X", e.g. "ICSE - Class X"
   Order most recent first: degree, then Class XII, then Class X. Drop the
   school rows if the student has strong work experience and space is tight.

5. EXPERIENCE comes before projects and outranks them. Internships and jobs
   are what a recruiter screens on hardest, so include EVERY relevant role in
   the vault before spending entries on projects. Never drop an experience to
   make room for a project.

6. EXPERIENCE and PROJECTS: copy `date_range`, `organization` and `location`
   from the vault verbatim. Only the bullets get rewritten.

7. PROJECT `tech_stack`: pick AT MOST 5 technologies from the vault's list,
   most relevant to this job description first. The vault often holds a dozen
   for an imported repo; listing them all wraps the heading onto a second line
   and reads as noise. Comma-separated, e.g. "Python, FastAPI, PostgreSQL".

8. SKILLS: group into 3-4 categories with bold labels, exactly like a technical
   resume - "Languages", "Frameworks", "Developer Tools", "Libraries",
   "Databases". Put the categories the job description cares about most first,
   and inside each category order by relevance. Only list skills the vault
   actually evidences.

9. HEADER: full_name = "{student_name}", email = "{student_email}". Fill phone,
   linkedin, github and portfolio ONLY from the vault; use an empty string for
   anything not there. Write links bare, without a scheme:
   "github.com/name", not "https://github.com/name".

10. `selection_rationale`: one or two sentences, written TO the student,
    explaining why you chose these particular experiences and projects for
    this role - name the specific requirement each one answers. This is shown
    in the preview so they can sanity-check your choices; it is never printed
    on the resume itself.

Note there is no summary or objective section. Do not invent one.
""".strip()

    payload = _generate_structured(
        system_instruction=system_instruction,
        prompt=prompt,
        schema=ResumePayload,
        temperature=0.35,
    )

    # Guardrails: no invented numbers, then hard-trim to one page.
    for entry in [*payload.experience, *payload.projects]:
        entry.bullets = [
            enforce_no_fabrication(bullet, vault_context) for bullet in entry.bullets
        ]

    return enforce_one_page(payload)
