"""
models.py
=========
SQLModel table definitions - the single source of truth for ResumeMaxxer's
PostgreSQL schema. Mapped 1:1 to product.md section 4.

Design notes
------------
* **The auth service owns identity.** `User.id` is a *string* primary key
  holding the Better Auth user id rather than a serial integer. That removes an
  entire class of "which id do I use here?" bugs: the JWT `sub` claim is the
  primary key. Better Auth's own `user` table lives in the same database and
  joins to this one by id.

* **`Bullet` is intentionally polymorphic.** A bullet can belong to either an
  `Experience` or a `Project`, so it stores an `entity_type` discriminator plus
  a plain `entity_id`. This cannot be expressed as a single SQL foreign key,
  which is why referential integrity for that edge is enforced in the service
  layer (always filter by `user_id` + `entity_type` + `entity_id`).

* **Enums are stored as VARCHAR, not native PG enums** - see `enum_column`
  below for why, and for the subtle bug that a plain `String` column causes.

* **Every user-owned table indexes `user_id`.** Effectively every query in the
  app is "give me rows for this signed-in user", so the index is not optional.

* **No `from __future__ import annotations` in this file.** That import turns
  every annotation into a string, and SQLModel then hands SQLAlchemy the
  literal text ``list['Education']`` as a relationship target, which it cannot
  resolve:

      InvalidRequestError: expression "relationship("list['Education']")"
      seems to be using a generic class as the argument to relationship()

  The mappers only configure on the first real ORM query, so the app starts
  fine and then fails at runtime. Other modules may use the future import
  freely - this restriction applies to files declaring SQLModel tables.
"""

from datetime import date, datetime, timezone
from enum import Enum
from typing import Any, Optional

from sqlalchemy import JSON, Column, DateTime, Enum as SAEnum, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel

# JSONB on PostgreSQL, plain JSON everywhere else. Production is unaffected -
# Neon still gets JSONB - but the variant lets the whole schema be created on
# in-memory SQLite, so ORM tests run without a live database.
JSONBType = JSONB().with_variant(JSON(), "sqlite")


def enum_column(python_enum: type[Enum], length: int = 50) -> SAEnum:
    """Store an enum as VARCHAR while still loading it back as the enum.

    Three things have to be true at once here, and getting any one wrong is a
    bug that only shows up at runtime:

    * **VARCHAR, not a native PG enum type.** A native enum needs an
      ``ALTER TYPE`` migration every time a variant is added.
    * **No CHECK constraint** (`create_constraint=False`, the SQLAlchemy 2.0
      default) - same migration problem, just spelled differently.
    * **Coerced back to the Python enum on load.** Plain ``String`` does not do
      this: rows come back as ``str``, so ``row.level.value`` raises
      ``AttributeError`` and - far worse - ``row.level is Level.HIGHER_ED``
      silently evaluates to False forever, because a ``str`` is never the enum
      member. The `str, Enum` mixin makes ``==`` still work, which is exactly
      what makes that bug so easy to miss.
    """
    return SAEnum(
        python_enum,
        native_enum=False,
        length=length,
        create_constraint=False,
        # Store "CBSE", not the member name, so the DB is readable and matches
        # what the API sends and receives.
        values_callable=lambda enum_cls: [member.value for member in enum_cls],
        validate_strings=True,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def utcnow() -> datetime:
    """Timezone-aware UTC timestamp. Used as the default for `created_at`.

    We deliberately avoid the deprecated `datetime.utcnow()` (which returns a
    *naive* datetime) so timestamps round-trip correctly through PostgreSQL's
    ``TIMESTAMPTZ`` and reach the frontend as unambiguous ISO-8601.
    """
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------
class ExperienceType(str, Enum):
    """Discriminates paid work from campus/volunteer involvement.

    The tailoring engine uses this to keep the resume balanced - e.g. it will
    not fill a page with clubs when the JD is asking for engineering work.
    """

    WORK = "WORK"
    EXTRACURRICULAR = "EXTRACURRICULAR"


class EntityType(str, Enum):
    """Tells a `Bullet` which table its `entity_id` points at."""

    EXPERIENCE = "EXPERIENCE"
    PROJECT = "PROJECT"


class EducationLevel(str, Enum):
    """Which stage of the Indian education system an `Education` row describes.

    Indian resumes conventionally list Class X and Class XII alongside the
    degree, because recruiters and many campus-placement portals screen on
    those marks. The level decides which of this table's nullable columns
    actually apply - see `Education` for the split.
    """

    CLASS_10 = "CLASS_10"  # Secondary, board exam at ~age 15
    CLASS_12 = "CLASS_12"  # Senior secondary, board exam at ~age 17
    HIGHER_ED = "HIGHER_ED"  # Bachelor's, master's, diploma


class Board(str, Enum):
    """School examination board. Applies to Class X and XII only."""

    CBSE = "CBSE"  # Central Board of Secondary Education
    ICSE = "ICSE"  # Council for the Indian School Certificate Examinations
    STATE = "STATE"  # Any State Board - the specific state goes in `location`
    IB = "IB"  # International Baccalaureate
    CAMBRIDGE = "CAMBRIDGE"  # Cambridge Assessment (IGCSE / A-Levels)
    NIOS = "NIOS"  # National Institute of Open Schooling
    OTHER = "OTHER"


class Stream(str, Enum):
    """Class XII subject combination.

    The PC-prefixed values are the science streams: every one includes Physics
    and Chemistry, and the trailing letters give the remaining two subjects
    (M = Mathematics, B = Biology, C = Computer Science, E = Electronics).
    These are the labels Indian students actually use on a resume, so they are
    stored verbatim rather than expanded.
    """

    PCMB = "PCMB"  # Physics, Chemistry, Maths, Biology
    PCMC = "PCMC"  # Physics, Chemistry, Maths, Computer Science
    PCME = "PCME"  # Physics, Chemistry, Maths, Electronics
    PCM = "PCM"  # Physics, Chemistry, Maths
    PCB = "PCB"  # Physics, Chemistry, Biology
    COMMERCE = "COMMERCE"
    COMMERCE_MATHS = "COMMERCE_MATHS"
    ARTS = "ARTS"  # Arts / Humanities
    OTHER = "OTHER"


class ScoreType(str, Enum):
    """How an academic score is expressed.

    Both are needed. Boards report percentages, most universities report CGPA
    on a 10-point scale, and plenty of colleges still issue percentages - so
    the student picks rather than us guessing from the level.
    """

    PERCENTAGE = "PERCENTAGE"
    CGPA = "CGPA"


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------
class User(SQLModel, table=True):
    """A student.

    The row is created on the first authenticated request (just-in-time
    provisioning) from the verified Better Auth JWT - we never trust a user id
    that arrives in a request body.
    """

    __tablename__ = "users"  # "user" is a reserved word in PostgreSQL

    # The Better Auth user id. Not auto-generated - it comes from the JWT.
    id: str = Field(primary_key=True, index=True, max_length=255)

    email: str = Field(index=True, unique=True, max_length=320)  # RFC 5321 max
    first_name: str = Field(default="", max_length=100)
    last_name: str = Field(default="", max_length=100)

    # --- Resume contact line ---------------------------------------------
    # The template's header is name + phone | email | linkedin | github, so
    # these are layout inputs, not optional profile decoration. Sign-up collects
    # only name and email, and the student fills the rest in once.
    #
    # Phone is stored as typed rather than normalised: Indian students write
    # "+91 98765 43210" or "9876543210" and both are correct on a resume.
    phone: str = Field(default="", max_length=32)
    location: str = Field(default="", max_length=255)  # "Bengaluru, Karnataka"
    linkedin_url: str = Field(default="", max_length=512)
    github_url: str = Field(default="", max_length=512)
    portfolio_url: str = Field(default="", max_length=512)

    created_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )

    # --- Relationships ---------------------------------------------------
    # `cascade="all, delete-orphan"` means deleting a User wipes their whole
    # Vault in one statement - required for GDPR-style "delete my account".
    educations: list["Education"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    experiences: list["Experience"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    projects: list["Project"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    bullets: list["Bullet"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    generated_resumes: list["GeneratedResume"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


# ---------------------------------------------------------------------------
# Education
# ---------------------------------------------------------------------------
class Education(SQLModel, table=True):
    """One academic qualification: Class X, Class XII, or a degree.

    A single table with a `level` discriminator rather than three tables. The
    three levels share most of their columns (institution, location, dates,
    score) and differ in only a few, so splitting them would mean three sets of
    near-identical CRUD endpoints for no gain.

    Which columns apply, by level:

    ==============  =========  =========  ===========
    Column          CLASS_10   CLASS_12   HIGHER_ED
    ==============  =========  =========  ===========
    board           yes        yes        no
    stream          no         yes        no
    degree          no         no         yes
    start_month     no         no         yes
    end_month       no         no         yes
    coursework      no         no         yes
    ==============  =========  =========  ===========

    Dates are stored as separate year/month integers, not a `date`. School
    entries are recorded by year alone and degrees by month and year, so a
    `date` column would force a meaningless day-of-month onto every row and
    invite the UI to render "15 Aug 2022" when the student only ever said
    "2022". `schemas.EducationCreate` enforces the per-level rules.
    """

    __tablename__ = "educations"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(
        foreign_key="users.id",
        # ON DELETE CASCADE at the database level, so a user is fully
        # erased even by a raw SQL delete - the ORM-side cascade above
        # only fires when the deletion goes through a Session.
        ondelete="CASCADE",
        index=True,
        max_length=255,
    )

    level: EducationLevel = Field(
        index=True, sa_type=enum_column(EducationLevel), nullable=False
    )

    # School or college name.
    institution: str = Field(max_length=255)
    # City, and state where it disambiguates ("Pune, Maharashtra"). The resume
    # template puts this on the right of the institution line.
    location: str = Field(default="", max_length=255)

    # --- School only (CLASS_10 / CLASS_12) -------------------------------
    board: Optional[Board] = Field(default=None, sa_type=enum_column(Board))
    # CLASS_12 only. Class X has a common curriculum, so no stream applies.
    stream: Optional[Stream] = Field(default=None, sa_type=enum_column(Stream))

    # --- Higher education only -------------------------------------------
    # e.g. "B.E. Computer Science", "B.Tech Information Technology".
    degree: Optional[str] = Field(default=None, max_length=255)

    # --- Dates ------------------------------------------------------------
    start_year: int
    end_year: Optional[int] = Field(default=None)  # None while still studying
    # Month 1-12, higher education only. None for school rows.
    start_month: Optional[int] = Field(default=None)
    end_month: Optional[int] = Field(default=None)

    # --- Score ------------------------------------------------------------
    # String, not float: students write "92.4", "9.1/10" or "First Class".
    score: Optional[str] = Field(default=None, max_length=20)
    score_type: Optional[ScoreType] = Field(default=None, sa_type=enum_column(ScoreType))

    # Comma-separated course names, higher education only. Denormalised on
    # purpose - it is only ever read as one blob and shipped to Gemini.
    coursework: str = Field(default="", sa_column=Column(Text, nullable=False))

    user: Optional[User] = Relationship(back_populates="educations")


# ---------------------------------------------------------------------------
# Experience
# ---------------------------------------------------------------------------
class Experience(SQLModel, table=True):
    """A job, internship, club or leadership role.

    The achievement text lives in `Bullet` rows, not here - this table is just
    the header line of the resume entry.
    """

    __tablename__ = "experiences"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(
        foreign_key="users.id",
        # ON DELETE CASCADE at the database level, so a user is fully
        # erased even by a raw SQL delete - the ORM-side cascade above
        # only fires when the deletion goes through a Session.
        ondelete="CASCADE",
        index=True,
        max_length=255,
    )

    title: str = Field(max_length=255)
    organization: str = Field(max_length=255)
    # City. The resume template right-aligns this on the organisation row, so
    # it is part of the layout rather than optional metadata.
    location: str = Field(default="", max_length=255)
    start_date: date
    end_date: Optional[date] = Field(default=None)  # NULL means "Present"

    # `enum_column` keeps this a plain VARCHAR while still loading back as the
    # enum. Without it SQLModel emits `CREATE TYPE experiencetype AS ENUM (...)`
    # and every future variant needs an ALTER TYPE migration.
    type: ExperienceType = Field(
        default=ExperienceType.WORK,
        index=True,
        sa_type=enum_column(ExperienceType),
        nullable=False,
    )

    user: Optional[User] = Relationship(back_populates="experiences")


# ---------------------------------------------------------------------------
# Project
# ---------------------------------------------------------------------------
class Project(SQLModel, table=True):
    """A personal, academic or hackathon project.

    Optionally imported from a public GitHub repository (product.md 3A).
    """

    __tablename__ = "projects"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(
        foreign_key="users.id",
        # ON DELETE CASCADE at the database level, so a user is fully
        # erased even by a raw SQL delete - the ORM-side cascade above
        # only fires when the deletion goes through a Session.
        ondelete="CASCADE",
        index=True,
        max_length=255,
    )

    title: str = Field(max_length=255)
    repo_url: Optional[str] = Field(default=None, max_length=512)

    # Comma-separated, e.g. "Python,FastAPI,PostgreSQL". Seeded from GitHub's
    # /languages endpoint on import, then editable by the student.
    tech_stack: str = Field(default="", sa_column=Column(Text, nullable=False))

    # True when the bullets were AI-generated from the repo README. Lets the UI
    # nudge the student to review machine-written content before exporting.
    is_github_imported: bool = Field(default=False)

    user: Optional[User] = Relationship(back_populates="projects")


# ---------------------------------------------------------------------------
# Bullet - the core AI data
# ---------------------------------------------------------------------------
class Bullet(SQLModel, table=True):
    """One achievement line.

    `original_text` is the student's own words and is treated as **immutable** -
    it is the ground truth that the "No Fluff" rule protects against
    fabrication. `ai_enhanced_text` is a cached generic rewrite; the per-JD
    rewrite happens at tailoring time and is stored in
    `GeneratedResume.resume_json`, never written back here.
    """

    __tablename__ = "bullets"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(
        foreign_key="users.id",
        # ON DELETE CASCADE at the database level, so a user is fully
        # erased even by a raw SQL delete - the ORM-side cascade above
        # only fires when the deletion goes through a Session.
        ondelete="CASCADE",
        index=True,
        max_length=255,
    )

    # --- Polymorphic parent pointer --------------------------------------
    # No SQL foreign key: `entity_id` targets `experiences.id` OR `projects.id`
    # depending on `entity_type`. Always query using both columns together.
    entity_type: EntityType = Field(
        index=True, sa_type=enum_column(EntityType), nullable=False
    )
    entity_id: int = Field(index=True)

    original_text: str = Field(sa_column=Column(Text, nullable=False))
    ai_enhanced_text: Optional[str] = Field(
        default=None, sa_column=Column(Text, nullable=True)
    )

    # Comma-separated keywords ("python,rest-api,docker") produced by Gemini at
    # ingestion time. Step 2 of the tailoring engine filters on these.
    #
    # FUTURE: once the corpus grows, swap this for a PG full-text index or a
    # pgvector embedding column - the filter step is the natural upgrade point.
    tags: str = Field(default="", sa_column=Column(Text, nullable=False))

    user: Optional[User] = Relationship(back_populates="bullets")


# ---------------------------------------------------------------------------
# GeneratedResume
# ---------------------------------------------------------------------------
class GeneratedResume(SQLModel, table=True):
    """An immutable snapshot of one tailoring run.

    Storing the exact payload means a student can re-download a resume months
    later, byte-identical, even after editing their Vault.
    """

    __tablename__ = "generated_resumes"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(
        foreign_key="users.id",
        # ON DELETE CASCADE at the database level, so a user is fully
        # erased even by a raw SQL delete - the ORM-side cascade above
        # only fires when the deletion goes through a Session.
        ondelete="CASCADE",
        index=True,
        max_length=255,
    )

    job_title: str = Field(max_length=255)
    jd_text: str = Field(sa_column=Column(Text, nullable=False))

    # JSONB rather than JSON on Postgres: binary storage, so we can index and
    # query inside the document later. This is the exact object handed to
    # @react-pdf/renderer on the frontend.
    resume_json: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONBType, nullable=False),
    )

    created_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False, index=True),
    )

    user: Optional[User] = Relationship(back_populates="generated_resumes")
