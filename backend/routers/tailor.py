"""
routers/tailor.py
=================
The tailoring engine (product.md section 3B).

    Step 0  Parse    - pull plain text out of the uploaded PDF / DOCX.
    Step 1  Extract  - Gemini pulls structured requirements out of that text.
    Step 2  Filter   - Python scores vault bullets against those keywords.
    Step 3  Rewrite  - Gemini rewrites the shortlist into a one-page resume.
    Step 4  Store    - persist the payload; React renders the PDF client-side.

Step 0 exists because companies send job descriptions as attachments, not as
pasteable text. The endpoint therefore takes a file upload rather than a JSON
body, and echoes a preview of what it read back to the student so a bad parse
is visible before they trust the resume built from it.

Why is step 2 plain Python and not another AI call?
---------------------------------------------------
Cost and latency. Keyword scoring over a few dozen rows is microseconds and
free, and it keeps the step-3 prompt small, which measurably improves output
quality. When the corpus outgrows this, swap `_score_bullet` for pgvector
similarity - the interface stays the same.
"""

from __future__ import annotations

import logging
import re
from datetime import date
from typing import Optional, Sequence

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from sqlmodel import Session, select

import ai_service
import jd_parser
import jd_qualifications
import latex_renderer
import quota
from auth import get_current_user
from database import get_session
from gemini_key import get_student_api_key
from models import (
    Bullet,
    Education,
    EducationLevel,
    EntityType,
    Experience,
    GeneratedResume,
    Project,
    ScoreType,
    User,
)
from schemas import (
    GeneratedResumeRead,
    GeneratedResumeSummary,
    JobDescriptionSource,
    QuotaStatus,
    ResumePayload,
    TailorResponse,
)

logger = logging.getLogger("resumemaxxer.tailor")

router = APIRouter()

# How many bullets survive the filter and reach the rewrite prompt. Generous
# enough that Gemini has real choice, small enough to keep the prompt tight.
MAX_SHORTLISTED_BULLETS = 30

_TOKEN_RE = re.compile(r"[a-z0-9+#.]+")

# Abbreviated month names, matching the resume template's "Aug. 2022" style.
_MONTHS = (
    "Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July",
    "Aug.", "Sept.", "Oct.", "Nov.", "Dec.",
)


# ---------------------------------------------------------------------------
# Step 2 helpers - scoring and context building
# ---------------------------------------------------------------------------
def _tokenise(text: str) -> set[str]:
    """Lowercase word set. Keeps `c++`, `c#`, `node.js` intact."""
    return set(_TOKEN_RE.findall(text.lower()))


# Relevance weights. Two independent axes, multiplied:
#
#   where the match is   tag 3x  vs  body text 1x
#     Tags were assigned deliberately - by Gemini at ingestion or by the
#     student - whereas a body-text match can be incidental.
#
#   what was matched     stated requirement 2x  vs  inferred keyword 1x
#     A term from the posting's own qualifications section is what the role is
#     screened on. An inferred keyword is our guess about the rest of the
#     document.
TAG_WEIGHT = 3
TEXT_WEIGHT = 1
REQUIRED_MULTIPLIER = 2


def _score_bullet(
    bullet: Bullet,
    keyword_tokens: set[str],
    required_tokens: set[str] | None = None,
) -> int:
    """Rank one bullet's relevance to the job description.

    `required_tokens` are the terms drawn from the posting's qualifications
    section; they count double. When the posting has no such section the set is
    empty and this reduces exactly to the previous behaviour.

    Every bullet scores at least 0, so a student with an unusual background
    still gets a resume rather than an empty page.
    """
    required = required_tokens or set()
    # A required term is not also counted as a general one, or it would be
    # scored three times rather than twice.
    general = keyword_tokens - required

    tag_tokens = _tokenise(bullet.tags.replace(",", " "))
    text_tokens = _tokenise(f"{bullet.original_text} {bullet.ai_enhanced_text or ''}")

    def score(tokens: set[str], weight: int) -> int:
        return weight * (
            REQUIRED_MULTIPLIER * len(tokens & required) + len(tokens & general)
        )

    return score(tag_tokens, TAG_WEIGHT) + score(text_tokens, TEXT_WEIGHT)


def _format_date_range(start: date, end: Optional[date]) -> str:
    """'Aug. 2024 - Present' style range, matching the resume template."""
    started = f"{_MONTHS[start.month - 1]} {start.year}"
    finished = f"{_MONTHS[end.month - 1]} {end.year}" if end else "Present"
    return f"{started} - {finished}"


def _format_education_dates(education: Education) -> str:
    """Date range for one education row.

    School rows carry years only, degrees carry month and year, so the two
    render differently: "2020 - 2022" versus "Aug. 2022 - May 2026". This is
    computed here rather than asked of the AI, which has no business doing
    arithmetic on the student's dates.
    """
    if education.start_month:
        start = f"{_MONTHS[education.start_month - 1]} {education.start_year}"
    else:
        start = str(education.start_year)

    if education.end_year is None:
        return f"{start} - Present"

    if education.end_month:
        end = f"{_MONTHS[education.end_month - 1]} {education.end_year}"
    else:
        end = str(education.end_year)

    return f"{start} - {end}"


def _format_score(education: Education) -> str:
    """'CGPA: 8.7/10' or 'Percentage: 92.4%', or empty when unscored."""
    if not education.score:
        return ""
    if education.score_type is ScoreType.CGPA:
        return f"CGPA: {education.score}"
    if education.score_type is ScoreType.PERCENTAGE:
        # Students type "92.4" or "92.4%"; do not double the sign.
        score = education.score.strip()
        suffix = "" if score.endswith("%") else "%"
        return f"Percentage: {score}{suffix}"
    return education.score


def _format_qualification(education: Education) -> str:
    """The italic line under the institution name.

    Degrees use the degree text. School rows are assembled into the shape
    Indian resumes use - "CBSE - Class XII (PCMB)" - so the AI only has to copy
    it rather than compose it from enum values.
    """
    if education.level is EducationLevel.HIGHER_ED:
        return education.degree or "Degree"

    board = education.board.value if education.board else ""
    if education.board and education.board.value == "STATE":
        board = "State Board"

    label = "Class X" if education.level is EducationLevel.CLASS_10 else "Class XII"
    stream = f" ({education.stream.value})" if education.stream else ""

    return f"{board} - {label}{stream}".strip(" -")


def _build_vault_context(
    *,
    user: User,
    educations: Sequence[Education],
    experiences: Sequence[Experience],
    projects: Sequence[Project],
    bullets_by_key: dict[tuple[str, int], list[Bullet]],
) -> str:
    """Render the filtered vault as plain text for the rewrite prompt.

    Plain text beats JSON here: it costs fewer tokens and the model follows the
    "only use what is listed" instruction more reliably against prose than
    against a nested object.

    Everything the AI is told to copy verbatim - date ranges, scores,
    qualifications - is pre-formatted here, so the model never has to derive a
    display string and cannot get it subtly wrong.
    """
    sections: list[str] = []

    # --- Contact -----------------------------------------------------------
    sections.append("## CONTACT")
    sections.append(f"- full_name: {user.first_name} {user.last_name}".rstrip())
    sections.append(f"- email: {user.email}")
    for label, value in (
        ("phone", user.phone),
        ("location", user.location),
        ("linkedin", user.linkedin_url),
        ("github", user.github_url),
        ("portfolio", user.portfolio_url),
    ):
        sections.append(f"- {label}: {value or '(not provided - use empty string)'}")

    # --- Education ---------------------------------------------------------
    if educations:
        # Most recent first: degree, then Class XII, then Class X.
        order = {
            EducationLevel.HIGHER_ED: 0,
            EducationLevel.CLASS_12: 1,
            EducationLevel.CLASS_10: 2,
        }
        ordered = sorted(
            educations, key=lambda e: (order.get(e.level, 9), -(e.end_year or 9999))
        )
        sections.append("\n## EDUCATION")
        for education in ordered:
            sections.append(f"- institution: {education.institution}")
            sections.append(f"  location: {education.location or ''}")
            sections.append(f"  qualification: {_format_qualification(education)}")
            sections.append(f"  score: {_format_score(education)}")
            sections.append(f"  date_range: {_format_education_dates(education)}")
            if education.coursework:
                sections.append(f"  coursework: {education.coursework}")

    # --- Experience and projects ------------------------------------------
    def render_entries(heading: str, rows: Sequence, entity_type: EntityType) -> None:
        relevant = [
            row for row in rows if bullets_by_key.get((entity_type.value, row.id))
        ]
        if not relevant:
            return
        sections.append(f"\n## {heading}")
        for row in relevant:
            if entity_type is EntityType.EXPERIENCE:
                sections.append(f"- title: {row.title}")
                sections.append(f"  organization: {row.organization}")
                sections.append(f"  location: {row.location or ''}")
                sections.append(
                    f"  date_range: {_format_date_range(row.start_date, row.end_date)}"
                )
                sections.append(f"  kind: {row.type.value}")
            else:
                sections.append(f"- name: {row.title}")
                sections.append(f"  tech_stack: {row.tech_stack or ''}")
                sections.append("  date_range: ")
            sections.append("  bullets:")
            for bullet in bullets_by_key[(entity_type.value, row.id)]:
                text = bullet.ai_enhanced_text or bullet.original_text
                sections.append(f"    * {text}")
                if bullet.tags:
                    sections.append(f"      (tags: {bullet.tags})")

    render_entries("EXPERIENCE", experiences, EntityType.EXPERIENCE)
    render_entries("PROJECTS", projects, EntityType.PROJECT)

    return "\n".join(sections)


# ---------------------------------------------------------------------------
# Main endpoint
# ---------------------------------------------------------------------------
def _as_quota_status(state: quota.QuotaState) -> QuotaStatus:
    """Map the domain object onto the wire schema."""
    return QuotaStatus(
        used=state.used,
        limit=state.limit,
        remaining=state.remaining,
        resets_on=state.resets_on,
        using_own_key=state.using_own_key,
    )


def _quota_error(exc: quota.QuotaExceeded) -> HTTPException:
    """Turn an exhausted allowance into a 429 the frontend can act on.

    429 rather than 402 or 403: this is a rate limit that time will clear, and
    the status alone tells the frontend to open the "add your own key" dialog
    instead of showing a dead end. The reset date goes in a header as well as
    the prose so the UI never has to parse the sentence.
    """
    state = exc.state
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=(
            f"That is all {state.limit} free tailoring runs for this week. "
            f"Add your own Gemini API key to keep going now - it is free and "
            f"takes a minute - or come back on "
            f"{state.resets_on.strftime('%A %d %B')} when these reset."
        ),
        headers={
            "X-Quota-Resets-On": state.resets_on.isoformat(),
            "X-Quota-Limit": str(state.limit),
        },
    )


@router.get(
    "/quota",
    response_model=QuotaStatus,
    summary="Free tailoring runs left this week",
)
def read_quota(
    current_user: User = Depends(get_current_user),
    student_api_key: Optional[str] = Depends(get_student_api_key),
) -> QuotaStatus:
    """How many free runs are left, so the UI can say so before they spend one.

    Pure read - calling this never consumes anything. If the request carries
    the student's own key, `using_own_key` comes back true and the counters are
    informational only.
    """
    return _as_quota_status(
        quota.peek(current_user, using_own_key=bool(student_api_key))
    )


@router.post("", response_model=TailorResponse, summary="Tailor a resume to a JD file")
async def tailor_resume(
    file: UploadFile = File(
        ..., description="Job description as PDF, DOCX, TXT or MD."
    ),
    job_title: Optional[str] = Form(
        default=None, description="Optional override; otherwise inferred from the JD."
    ),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    student_api_key: Optional[str] = Depends(get_student_api_key),
) -> TailorResponse:
    """Run the tailoring engine over an uploaded job description.

    Multipart rather than JSON: the JD arrives as a file. The response includes
    a `source` block echoing what was actually read out of it, so the student
    can spot a failed parse instead of wondering why the resume is generic.

    This is the slowest endpoint in the app - two sequential Gemini calls, so
    expect several seconds. The frontend must show a real progress state.

    Cost model: the two Gemini calls run on the student's own key when they
    sent one, and otherwise on the app's key against a small weekly allowance.
    """
    using_own_key = bool(student_api_key)

    # Checked before anything expensive. A student who is out of free runs gets
    # told in milliseconds rather than after a 5 MB upload and a file parse -
    # and, more to the point, before we spend money we have decided not to
    # spend.
    try:
        quota.check(current_user, using_own_key=using_own_key)
    except quota.QuotaExceeded as exc:
        raise _quota_error(exc) from exc

    # --- Step 0: read and parse the upload --------------------------------
    raw = await file.read()
    try:
        jd_text = jd_parser.extract_text(file.filename, raw)
    except jd_parser.JDParseError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    # The posting's own requirements section, if it has one. Extracted
    # deterministically rather than by the AI: it decides what the whole
    # tailoring run optimises for, and a wrong answer would silently skew every
    # resume. `None` means no such section, and everything falls back to
    # whole-document inference.
    qualifications = jd_qualifications.extract(jd_text)
    qualifications_block = qualifications.as_prompt_block() if qualifications else ""

    source = JobDescriptionSource(
        filename=file.filename or "job-description",
        char_count=len(jd_text),
        preview=jd_text[:600],
        qualifications_heading=qualifications.heading if qualifications else "",
        required_qualifications=qualifications.required if qualifications else [],
        preferred_qualifications=qualifications.preferred if qualifications else [],
    )

    # --- Load the vault ---------------------------------------------------
    educations = session.exec(
        select(Education).where(Education.user_id == current_user.id)
    ).all()
    experiences = session.exec(
        select(Experience).where(Experience.user_id == current_user.id)
    ).all()
    projects = session.exec(
        select(Project).where(Project.user_id == current_user.id)
    ).all()
    all_bullets = session.exec(
        select(Bullet).where(Bullet.user_id == current_user.id)
    ).all()

    if not all_bullets:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Your vault has no achievement bullets yet. Add an experience "
                "or import a GitHub repo before tailoring."
            ),
        )

    # --- Step 1: extract requirements from the JD ------------------------
    try:
        analysis = ai_service.analyse_job_description(
            jd_text,
            qualifications_block=qualifications_block,
            api_key=student_api_key,
        )
    except ai_service.InvalidApiKeyError as exc:
        # 400, not 502: the key is wrong, which is the caller's to fix. A 502
        # would tell the student to wait and retry, and it would never work.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except ai_service.AIServiceError as exc:
        logger.error("JD analysis failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not analyse that job description: {exc}",
        ) from exc

    # --- Step 2: filter the vault (pure Python) --------------------------
    keyword_tokens = _tokenise(
        " ".join([*analysis.keywords, *analysis.hard_skills, *analysis.soft_skills])
    )
    # Terms the posting explicitly requires, scored at double weight. Both the
    # AI's reading of the section and its raw text are used - the raw text
    # catches specifics the model may have normalised away.
    required_tokens: set[str] = set()
    if qualifications:
        required_tokens = _tokenise(
            " ".join([*analysis.required_keywords, *qualifications.required])
        ) & keyword_tokens

    scored = sorted(
        ((_score_bullet(b, keyword_tokens, required_tokens), b) for b in all_bullets),
        key=lambda pair: pair[0],
        reverse=True,
    )
    shortlist = [bullet for _, bullet in scored[:MAX_SHORTLISTED_BULLETS]]

    # If nothing matched at all, fall back to the whole vault rather than
    # sending Gemini an empty context - a generic resume beats no resume.
    if all(score == 0 for score, _ in scored[:MAX_SHORTLISTED_BULLETS]):
        logger.info("No keyword overlap for user %s; using full vault", current_user.id)
        shortlist = list(all_bullets)[:MAX_SHORTLISTED_BULLETS]

    bullets_by_key: dict[tuple[str, int], list[Bullet]] = {}
    for bullet in shortlist:
        bullets_by_key.setdefault(
            (bullet.entity_type.value, bullet.entity_id), []
        ).append(bullet)

    vault_context = _build_vault_context(
        user=current_user,
        educations=educations,
        experiences=experiences,
        projects=projects,
        bullets_by_key=bullets_by_key,
    )

    # --- Step 3: rewrite into a one-page resume --------------------------
    student_name = f"{current_user.first_name} {current_user.last_name}".strip()
    try:
        resume = ai_service.tailor_resume(
            analysis=analysis,
            vault_context=vault_context,
            student_name=student_name or "Your Name",
            student_email=current_user.email,
            qualifications_block=qualifications_block,
            api_key=student_api_key,
        )
    except ai_service.InvalidApiKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except ai_service.AIServiceError as exc:
        logger.error("Resume generation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not generate the resume: {exc}",
        ) from exc

    # --- Step 4: store the snapshot --------------------------------------
    title = job_title or analysis.job_title or "Untitled Role"
    record = GeneratedResume(
        user_id=current_user.id,
        job_title=title[:255],
        jd_text=jd_text,
        resume_json=resume.model_dump(),
    )
    session.add(record)
    session.commit()
    session.refresh(record)

    # --- Step 5: charge the allowance ------------------------------------
    # Deliberately last. A run that died on a Gemini timeout or a bad parse
    # must not cost the student anything - with only three a week, losing one
    # to our failure is a third of their week. Charging after the resume is
    # safely stored means the only runs that count are the ones that worked.
    #
    # The cost of that ordering is the opposite race: two requests started at
    # once can both pass `quota.check` and both succeed, so a determined
    # student could get a fourth run. That is a far better failure than
    # charging for work we did not deliver.
    quota_state = quota.consume(session, current_user, using_own_key=using_own_key)

    logger.info("Generated resume %s for user %s", record.id, current_user.id)

    return TailorResponse(
        resume_id=record.id,
        job_title=title,
        analysis=analysis,
        resume=resume,
        source=source,
        quota=_as_quota_status(quota_state),
    )


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------
@router.get(
    "/history",
    response_model=list[GeneratedResumeSummary],
    summary="Previously generated resumes",
)
def list_history(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Sequence[GeneratedResume]:
    """Newest first. Omits `resume_json` so the list stays cheap."""
    return session.exec(
        select(GeneratedResume)
        .where(GeneratedResume.user_id == current_user.id)
        .order_by(GeneratedResume.created_at.desc())
        .limit(50)
    ).all()


@router.get(
    "/history/{resume_id}",
    response_model=GeneratedResumeRead,
    summary="Re-download a stored resume",
)
def read_generated_resume(
    resume_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> GeneratedResume:
    """Return the stored payload so React can re-render the identical PDF."""
    record = session.get(GeneratedResume, resume_id)
    if record is None or record.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found."
        )
    return record


# ---------------------------------------------------------------------------
# PDF rendering
# ---------------------------------------------------------------------------
def _pdf_response(payload: ResumePayload, job_title: str) -> Response:
    """Compile a payload to PDF and return it inline.

    `inline` rather than `attachment`: the frontend shows this in an iframe as
    the live preview, and the same bytes are what the download button saves.
    """
    try:
        pdf = latex_renderer.render_pdf(payload)
    except latex_renderer.LatexRenderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)
        ) from exc

    name = re.sub(r"[^A-Za-z0-9]+", "_", f"{payload.header.full_name} {job_title}")
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{name.strip("_")}.pdf"',
            # The payload can change between renders (the student edits it), so
            # never let a proxy or the browser serve a stale document.
            "Cache-Control": "no-store",
        },
    )


@router.post("/render", summary="Compile a resume payload to PDF")
def render_resume(
    payload: ResumePayload,
    job_title: str = "Resume",
    current_user: User = Depends(get_current_user),
) -> Response:
    """Render an arbitrary payload.

    This is what makes the preview editable: the student changes a bullet in
    the browser, the edited payload comes back here, and they get the real
    document rather than an approximation of it. Nothing is stored - use
    `PATCH /history/{id}` to persist an edit.
    """
    return _pdf_response(payload, job_title)


@router.get("/history/{resume_id}/pdf", summary="Download a stored resume as PDF")
def download_generated_resume(
    resume_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    """Recompile a stored payload.

    The PDF is not kept - only the JSON is - so a resume downloaded months
    later is regenerated from the exact payload and comes out identical.
    """
    record = session.get(GeneratedResume, resume_id)
    if record is None or record.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found."
        )
    return _pdf_response(
        ResumePayload.model_validate(record.resume_json), record.job_title
    )


@router.patch(
    "/history/{resume_id}",
    response_model=GeneratedResumeRead,
    summary="Save an edited resume",
)
def update_generated_resume(
    resume_id: int,
    payload: ResumePayload,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> GeneratedResume:
    """Persist edits the student made in the preview."""
    record = session.get(GeneratedResume, resume_id)
    if record is None or record.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found."
        )

    record.resume_json = payload.model_dump()
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


@router.delete("/history/{resume_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_generated_resume(
    resume_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    record = session.get(GeneratedResume, resume_id)
    if record is None or record.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found."
        )
    session.delete(record)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
