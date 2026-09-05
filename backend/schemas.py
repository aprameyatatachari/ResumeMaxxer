"""
schemas.py
==========
Every Pydantic model that is NOT a database table.

Two distinct families live here, and it is worth keeping them straight:

1. **API contracts** (`*Create`, `*Update`, `*Read`) - what the React frontend
   sends and receives. These never expose `user_id`: the server takes the owner
   from the verified Better Auth JWT, so a client cannot write into someone else's
   Vault by putting a different id in the request body.

2. **AI structured-output schemas** (`JDAnalysis`, `RepoAnalysis`,
   `ResumePayload`) - handed directly to Gemini as `response_schema`. Per
   product.md section 5 this is what guarantees the backend never crashes on
   malformed model output.

IMPORTANT constraint on family 2: the Gemini structured-output converter only
understands a narrow slice of JSON Schema. Keep those models to plain types,
nested models and lists - no `Literal`, no regex patterns, no `min_length` /
`max_length` constraints. Caps like the "One-Page Rule" are enforced by the
prompt plus the Python-side trimming in `ai_service.enforce_one_page()`.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from models import (
    Board,
    EducationLevel,
    EntityType,
    ExperienceType,
    ScoreType,
    Stream,
)

# ===========================================================================
# SECTION 1 - API contracts
# ===========================================================================


class UserRead(BaseModel):
    """The authenticated student, as returned by `GET /api/vault/me`."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    first_name: str
    last_name: str
    phone: str
    location: str
    linkedin_url: str
    github_url: str
    portfolio_url: str
    created_at: datetime


class UserUpdate(BaseModel):
    """Editable profile fields.

    These feed the resume header directly, so they are part of the Vault
    rather than account settings. `email` is deliberately absent: the auth
    service owns it, and letting the app diverge from the identity provider
    causes exactly the kind of bug that is miserable to debug.
    """

    first_name: Optional[str] = Field(default=None, max_length=100)
    last_name: Optional[str] = Field(default=None, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=32)
    location: Optional[str] = Field(default=None, max_length=255)
    linkedin_url: Optional[str] = Field(default=None, max_length=512)
    github_url: Optional[str] = Field(default=None, max_length=512)
    portfolio_url: Optional[str] = Field(default=None, max_length=512)


# --- Education -------------------------------------------------------------
# Indian education has three levels with genuinely different shapes, all stored
# in one table (see `models.Education`). The validator below is what stops a
# client sending, say, a Class X row with a `stream`.

SCHOOL_LEVELS = {EducationLevel.CLASS_10, EducationLevel.CLASS_12}


class EducationBase(BaseModel):
    level: EducationLevel
    institution: str = Field(min_length=1, max_length=255)
    location: str = Field(default="", max_length=255)

    board: Optional[Board] = None
    stream: Optional[Stream] = None
    degree: Optional[str] = Field(default=None, max_length=255)

    start_year: int = Field(ge=1950, le=2100)
    end_year: Optional[int] = Field(default=None, ge=1950, le=2100)
    start_month: Optional[int] = Field(default=None, ge=1, le=12)
    end_month: Optional[int] = Field(default=None, ge=1, le=12)

    score: Optional[str] = Field(default=None, max_length=20)
    score_type: Optional[ScoreType] = None

    coursework: str = ""


class EducationCreate(EducationBase):
    @model_validator(mode="after")
    def check_level_rules(self) -> "EducationCreate":
        """Enforce the per-level column rules from `models.Education`.

        Rejecting inapplicable fields rather than silently dropping them is
        deliberate: a silently ignored `stream` on a Class X row would look
        like a frontend bug that "sometimes doesn't save".
        """
        if self.level in SCHOOL_LEVELS:
            if not self.board:
                raise ValueError("board is required for Class X and Class XII")
            if self.degree:
                raise ValueError("degree does not apply to school entries")
            if self.start_month or self.end_month:
                raise ValueError(
                    "school entries are recorded by year only - omit the months"
                )
            if self.level is EducationLevel.CLASS_10 and self.stream:
                raise ValueError("Class X has a common curriculum, so no stream")
            if self.level is EducationLevel.CLASS_12 and not self.stream:
                raise ValueError("stream is required for Class XII")
        else:  # HIGHER_ED
            if not self.degree:
                raise ValueError("degree is required for higher education")
            if self.board or self.stream:
                raise ValueError(
                    "board and stream apply to school entries, not a degree"
                )

        if self.end_year is not None and self.end_year < self.start_year:
            raise ValueError("end year cannot be before start year")

        # A score without its unit is unreadable on a resume - "8.7" could be
        # a CGPA or a very bad percentage.
        if self.score and not self.score_type:
            raise ValueError("score_type is required when a score is given")

        return self


class EducationUpdate(BaseModel):
    """All fields optional - this backs a PATCH, not a PUT.

    Cross-field rules are not re-checked here: a PATCH sees only the changed
    fields, so it cannot know the resulting row. The frontend edits through a
    level-aware form, and a bad combination is cosmetic rather than unsafe.
    """

    institution: Optional[str] = Field(default=None, min_length=1, max_length=255)
    location: Optional[str] = Field(default=None, max_length=255)
    board: Optional[Board] = None
    stream: Optional[Stream] = None
    degree: Optional[str] = Field(default=None, max_length=255)
    start_year: Optional[int] = Field(default=None, ge=1950, le=2100)
    end_year: Optional[int] = Field(default=None, ge=1950, le=2100)
    start_month: Optional[int] = Field(default=None, ge=1, le=12)
    end_month: Optional[int] = Field(default=None, ge=1, le=12)
    score: Optional[str] = Field(default=None, max_length=20)
    score_type: Optional[ScoreType] = None
    coursework: Optional[str] = None


class EducationRead(EducationBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# --- Experience ------------------------------------------------------------
class ExperienceCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    organization: str = Field(min_length=1, max_length=255)
    location: str = Field(default="", max_length=255)
    start_date: date
    end_date: Optional[date] = None  # None means "Present"
    type: ExperienceType = ExperienceType.WORK


class ExperienceUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    organization: Optional[str] = Field(default=None, min_length=1, max_length=255)
    location: Optional[str] = Field(default=None, max_length=255)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    type: Optional[ExperienceType] = None


class ExperienceRead(ExperienceCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int


# --- Project ---------------------------------------------------------------
class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    repo_url: Optional[str] = Field(default=None, max_length=512)
    tech_stack: str = ""


class ProjectUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    repo_url: Optional[str] = Field(default=None, max_length=512)
    tech_stack: Optional[str] = None


class ProjectRead(ProjectCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_github_imported: bool


# --- Bullet ----------------------------------------------------------------
class BulletCreate(BaseModel):
    entity_type: EntityType
    entity_id: int
    original_text: str = Field(min_length=1)
    tags: str = ""


class BulletUpdate(BaseModel):
    original_text: Optional[str] = Field(default=None, min_length=1)
    ai_enhanced_text: Optional[str] = None
    tags: Optional[str] = None


class BulletRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    entity_type: EntityType
    entity_id: int
    original_text: str
    ai_enhanced_text: Optional[str] = None
    tags: str


# --- Aggregate Vault -------------------------------------------------------
class VaultRead(BaseModel):
    """Whole Vault in one response.

    The frontend loads this once on dashboard mount rather than firing four
    parallel requests - a student's Vault is small (tens of rows), so one
    round trip is strictly better here.
    """

    user: UserRead
    educations: list[EducationRead]
    experiences: list[ExperienceRead]
    projects: list[ProjectRead]
    bullets: list[BulletRead]


# --- GitHub ----------------------------------------------------------------
# GitHub usernames: alphanumeric plus single hyphens, max 39 chars.
_GITHUB_USERNAME_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$")


class GitHubUsernameRequest(BaseModel):
    username: str = Field(min_length=1, max_length=39)

    @field_validator("username")
    @classmethod
    def valid_username(cls, value: str) -> str:
        """Reject anything that is not a syntactically valid GitHub username.

        This is a security control as much as a convenience one: the value is
        interpolated into an outbound API path, so the character set has to be
        pinned down here.
        """
        cleaned = value.strip().lstrip("@")
        if not _GITHUB_USERNAME_RE.match(cleaned):
            raise ValueError("That is not a valid GitHub username.")
        return cleaned


class GitHubRepoSummary(BaseModel):
    """One public repo, as shown in the pick-list before import."""

    name: str
    full_name: str
    description: Optional[str] = None
    html_url: str
    language: Optional[str] = None
    stars: int = 0
    updated_at: Optional[str] = None
    is_fork: bool = False
    # True when this repo is already in the student's vault, so the UI can
    # disable the checkbox instead of letting them create a duplicate.
    already_imported: bool = False


class GitHubRepoListResponse(BaseModel):
    username: str
    repos: list[GitHubRepoSummary]


# Bounds a batch import: each repo costs one Gemini call plus three GitHub
# calls, so an unbounded list would be a slow request and a large bill.
MAX_BATCH_IMPORT = 10


class GitHubImportRequest(BaseModel):
    """Single-repo import by URL. Kept for direct links to someone else's repo
    that the student contributed to, which the username listing cannot find."""

    repo_url: str = Field(
        min_length=1,
        max_length=512,
        description="Public repo URL, e.g. https://github.com/owner/name",
    )

    @field_validator("repo_url")
    @classmethod
    def must_be_github(cls, value: str) -> str:
        """Reject anything that is not a github.com URL.

        This is a security control, not a convenience check: the value is fed
        to an outbound HTTP client, so without it the endpoint becomes an SSRF
        primitive that an attacker could point at internal metadata services.
        """
        normalised = value.strip().lower()
        allowed_prefixes = (
            "https://github.com/",
            "http://github.com/",
            "https://www.github.com/",
            "http://www.github.com/",
        )
        if not normalised.startswith(allowed_prefixes):
            raise ValueError("URL must start with https://github.com/")
        return value.strip()


class GitHubBatchImportRequest(BaseModel):
    repo_full_names: list[str] = Field(
        min_length=1,
        max_length=MAX_BATCH_IMPORT,
        description='Repos to import as "owner/name", from the listing endpoint.',
    )

    @field_validator("repo_full_names")
    @classmethod
    def valid_full_names(cls, values: list[str]) -> list[str]:
        pattern = re.compile(r"^[A-Za-z0-9._-]{1,100}/[A-Za-z0-9._-]{1,100}$")
        for item in values:
            if not pattern.match(item.strip()):
                raise ValueError(f"Not a valid owner/name pair: {item!r}")
        return [item.strip() for item in values]


class GitHubImportResponse(BaseModel):
    """The Project row plus the AI-written bullets that were created with it."""

    project: ProjectRead
    bullets: list[BulletRead]


class GitHubImportFailure(BaseModel):
    repo_full_name: str
    error: str


class GitHubBatchImportResponse(BaseModel):
    """Per-repo outcomes.

    A batch is explicitly NOT all-or-nothing: one repo with an unreadable
    README should not discard four good imports. The frontend reports both
    lists.
    """

    imported: list[GitHubImportResponse]
    failed: list[GitHubImportFailure]


# --- Tailoring -------------------------------------------------------------
class JobDescriptionSource(BaseModel):
    """Where the JD text came from, echoed back so the student can confirm the
    upload actually parsed before trusting the resume built from it."""

    filename: str
    char_count: int
    preview: str


class GeneratedResumeRead(BaseModel):
    """A stored tailoring run. `resume_json` is the exact @react-pdf payload."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    job_title: str
    resume_json: dict
    created_at: datetime


class GeneratedResumeSummary(BaseModel):
    """History list item - omits the payload so the list stays cheap."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    job_title: str
    created_at: datetime


# ===========================================================================
# SECTION 2 - AI structured outputs (Gemini `response_schema`)
# ===========================================================================
# Reminder: plain types only in this section. See the module docstring.


class JDAnalysis(BaseModel):
    """Step 1 of the tailoring engine: what does this job actually want?"""

    job_title: str = Field(description="Normalised role title, e.g. 'Backend Intern'.")
    company: str = Field(description="Hiring company, or empty string if absent.")
    hard_skills: list[str] = Field(
        description="Concrete technologies and tools: languages, frameworks, "
        "databases, cloud services."
    )
    soft_skills: list[str] = Field(
        description="Behavioural requirements: collaboration, ownership, communication."
    )
    keywords: list[str] = Field(
        description="Lowercase ATS keywords to match against Vault bullet tags."
    )
    seniority: str = Field(description="One of: internship, entry, mid, senior.")


class RepoBullet(BaseModel):
    """One AI-written achievement line derived from a GitHub repository."""

    text: str = Field(
        description="Resume bullet starting with a past-tense action verb. "
        "No invented metrics."
    )
    tags: list[str] = Field(description="Lowercase technology/skill tags.")


class RepoAnalysis(BaseModel):
    """Everything Gemini returns for one imported repository."""

    project_title: str = Field(description="Human-readable project name.")
    tech_stack: list[str] = Field(description="Technologies actually evidenced.")
    bullets: list[RepoBullet] = Field(description="4-5 achievement bullets.")


# --- Final resume payload --------------------------------------------------
# These mirror the LaTeX template in resume-template.tex exactly. Each model is
# one of that template's custom commands, so the React renderer can lay it out
# without inventing structure. Do not add fields that the template has no slot
# for - there is no summary section, for instance, because the template has none.


class ResumeHeader(BaseModel):
    """The centred block: name, then a pipe-separated contact line."""

    full_name: str
    phone: str = Field(description="Empty string when unknown.")
    email: str
    linkedin: str = Field(description="Bare URL like 'linkedin.com/in/name', or ''.")
    github: str = Field(description="Bare URL like 'github.com/name', or ''.")
    portfolio: str = Field(description="Personal site URL, or ''.")


class ResumeEducation(BaseModel):
    """One \\resumeSubheading in the Education section.

    Renders as two rows: bold institution with location right-aligned, then
    italic qualification with the italic date range right-aligned.
    """

    institution: str
    location: str = Field(description="City, or empty string.")
    qualification: str = Field(
        description="The italic line. For a degree: 'B.E. Computer Science'. "
        "For school: 'CBSE - Class XII (PCMB)' or 'ICSE - Class X'."
    )
    score: str = Field(
        description="Rendered after the qualification, e.g. 'CGPA: 8.7/10' or "
        "'Percentage: 92.4%'. Empty string when the student gave no score."
    )
    date_range: str = Field(
        description="Copy verbatim from the vault, e.g. 'Aug. 2022 - May 2026'."
    )


class ResumeExperience(BaseModel):
    """One \\resumeSubheading in the Experience section.

    Note the slot order differs from Education: the template puts the role
    title and dates on the first row, organisation and location on the second.
    """

    title: str
    date_range: str = Field(description="Copy verbatim from the vault.")
    organization: str
    location: str = Field(description="City, or empty string.")
    bullets: list[str] = Field(description="3-4 rewritten achievement lines.")


class ResumeProject(BaseModel):
    """One \\resumeProjectHeading in the Projects section.

    Renders as: **Name** | *Tech, Stack, Here*  ................  Date range
    """

    name: str
    tech_stack: str = Field(
        description="AT MOST 5 technologies, comma-separated, most relevant to "
        "the job description first, e.g. 'Python, FastAPI, PostgreSQL'. More "
        "than five wraps the heading onto a second line."
    )
    date_range: str = Field(description="Copy verbatim from the vault, or ''.")
    bullets: list[str] = Field(description="3-4 rewritten achievement lines.")


class SkillCategory(BaseModel):
    """One line of the Technical Skills section.

    The template groups skills under bold category labels rather than listing
    them flat - 'Languages: Java, Python, ...' on its own line.
    """

    category: str = Field(
        description="Bold label, e.g. 'Languages', 'Frameworks', "
        "'Developer Tools', 'Libraries', 'Databases'."
    )
    items: str = Field(description="Comma-separated skills in that category.")


class ResumePayload(BaseModel):
    """The complete one-page resume, ready to render.

    Section order is fixed by the template: Education, Experience, Projects,
    Technical Skills.
    """

    header: ResumeHeader
    education: list[ResumeEducation] = Field(
        description="Most recent first. Degree, then Class XII, then Class X."
    )
    experience: list[ResumeExperience]
    projects: list[ResumeProject]
    skills: list[SkillCategory] = Field(description="3-4 categories.")

    # Shown in the preview so the student can judge the AI's choices before
    # sending the resume. Deliberately NOT rendered onto the document - the
    # template has no slot for it and a recruiter should never see it.
    selection_rationale: str = Field(
        default="",
        description="One or two sentences on why THESE experiences and "
        "projects were chosen for THIS role, naming the specific "
        "requirement each one answers. Written to the student, e.g. "
        "'Led with the Razorpay internship because the role asks for "
        "production Python; the scheduler project shows the constraint "
        "solving they mention.'",
    )


class TailorResponse(BaseModel):
    """What `POST /api/tailor` returns to React."""

    resume_id: int
    job_title: str
    analysis: JDAnalysis
    resume: ResumePayload
    source: JobDescriptionSource
