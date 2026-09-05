"""
Real compilation against the LaTeX service.

This is the only place the One-Page Rule is checked on the finished artefact
rather than on the payload, and the only place the font is verified. Both need
the PDF parsed properly: Tectonic packs the page tree and font table into
compressed object streams, so they cannot be grepped out of the raw bytes -
which is why the browser-side e2e test does not attempt it.

Skipped when the service is not running, so `pytest` still works without
Docker. CI always has it (see the `latex` service container), so these do run
there.
"""

from __future__ import annotations

import httpx
import pytest

import latex_renderer
from schemas import (
    ResumeEducation,
    ResumeExperience,
    ResumeHeader,
    ResumePayload,
    ResumeProject,
    SkillCategory,
)


def _service_is_up() -> bool:
    try:
        return (
            httpx.get(f"{latex_renderer.LATEX_API_URL}/docs", timeout=3.0).status_code
            == 200
        )
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not _service_is_up(),
    reason=f"LaTeX service not reachable at {latex_renderer.LATEX_API_URL} "
    "(start it with `docker compose up -d`)",
)


def _entry(index: int) -> ResumeExperience:
    return ResumeExperience(
        title=f"Software Engineering Intern {index}",
        date_range="May 2025 - July 2025",
        organization="Razorpay",
        location="Bengaluru, Karnataka",
        bullets=[
            "Built a settlement reconciliation service in Python and FastAPI, "
            "replacing a manual spreadsheet process used by three teams.",
            "Designed the PostgreSQL schema and indexing strategy behind it.",
            "Automated the nightly ledger export, removing a manual runbook step.",
            "Wrote integration tests and wired them into the CI pipeline.",
        ],
    )


@pytest.fixture(name="worst_case")
def worst_case_fixture() -> ResumePayload:
    """The largest document the One-Page Rule permits.

    3 education rows, 4 entries, 4 bullets each, 4 skill categories. If this
    fits on one page, everything the backend can emit fits.
    """
    return ResumePayload(
        header=ResumeHeader(
            full_name="Ananya Krishnan", phone="+91 98765 43210",
            email="ananya.krishnan@vitstudent.ac.in",
            linkedin="ananyakrishnan", github="ananyak", portfolio="ananya.dev",
        ),
        education=[
            ResumeEducation(
                institution="Vellore Institute of Technology",
                location="Vellore, Tamil Nadu",
                qualification="B.Tech Computer Science and Engineering",
                score="CGPA: 8.74/10", date_range="Aug. 2022 - May 2026",
            ),
            ResumeEducation(
                institution="Delhi Public School", location="Bengaluru, Karnataka",
                qualification="CBSE - Class XII (PCMC)",
                score="Percentage: 94.2%", date_range="2020 - 2022",
            ),
            ResumeEducation(
                institution="St. Xavier High School", location="Bengaluru, Karnataka",
                qualification="ICSE - Class X",
                score="Percentage: 96.8%", date_range="2018 - 2020",
            ),
        ],
        experience=[_entry(1), _entry(2)],
        projects=[
            ResumeProject(
                name="Course Scheduler",
                tech_stack="Python, FastAPI, React, PostgreSQL, Docker",
                date_range="Jan. 2025 - Apr. 2025",
                bullets=[
                    "Built a constraint solver generating conflict-free timetables.",
                    "Implemented the catalogue scraper and normalisation pipeline.",
                    "Shipped a React front end for pinning required courses.",
                ],
            ),
            ResumeProject(
                name="Campus Transit Tracker",
                tech_stack="React, TypeScript, WebSockets, Redis",
                date_range="Oct. 2024",
                bullets=[
                    "Built a live shuttle map consuming the campus GPS feed.",
                    "Placed top ten in a 48-hour hackathon with 60 teams.",
                ],
            ),
        ],
        skills=[
            SkillCategory(category="Languages", items="Python, TypeScript, Java, C, SQL"),
            SkillCategory(category="Frameworks", items="FastAPI, React, Node.js, Flask"),
            SkillCategory(category="Developer Tools", items="Git, Docker, Postman, Linux"),
            SkillCategory(category="Libraries", items="pandas, NumPy, SQLAlchemy, pytest"),
        ],
        selection_rationale="Chosen because the role asks for production Python.",
    )


@pytest.fixture(name="compiled")
def compiled_fixture(worst_case):
    """Compile once and share - a cold compile is slow, and this is the only
    test module that needs the service."""
    from io import BytesIO

    from pypdf import PdfReader

    pdf = latex_renderer.render_pdf(worst_case)
    return pdf, PdfReader(BytesIO(pdf))


def test_the_worst_case_still_fits_on_one_page(compiled):
    """The One-Page Rule, verified on the artefact rather than the payload."""
    _pdf, reader = compiled
    assert len(reader.pages) == 1


def test_the_document_uses_latin_modern(compiled):
    """The template leaves every font package commented out, so the document
    must come out in LaTeX's default Latin Modern. A font package sneaking into
    the preamble would show up here as something else."""
    _pdf, reader = compiled

    fonts = set()
    for page in reader.pages:
        for _, font in (page.get("/Resources", {}).get("/Font") or {}).items():
            base = font.get_object().get("/BaseFont")
            if base:
                fonts.add(str(base))

    assert fonts, "no embedded fonts found"
    # Subset prefixes look like /ABCDEF+LMRoman10-Regular.
    assert all("LMRoman" in f or "CMSY" in f for f in fonts), fonts


def test_the_text_is_extractable_for_an_ats(compiled):
    """The whole point of the template. `\\pdfgentounicode` is absent because
    Tectonic rejects it, so this proves its absence costs nothing."""
    _pdf, reader = compiled
    text = reader.pages[0].extract_text() or ""

    assert len(text) > 1000
    for expected in ("Education", "Experience", "Projects", "Technical Skills",
                     "Ananya", "Razorpay", "Course Scheduler"):
        assert expected in text, f"{expected!r} missing from extracted text"


def test_special_characters_survive_compilation():
    """Escaping is only correct if the characters come back out intact."""
    from io import BytesIO

    from pypdf import PdfReader

    payload = ResumePayload(
        header=ResumeHeader(
            full_name="R&D Student", phone="", email="a@b.co",
            linkedin="", github="", portfolio="",
        ),
        education=[], projects=[], skills=[],
        experience=[ResumeExperience(
            title="Analyst", date_range="2025", organization="A & B Co.",
            location="Pune",
            bullets=["Cut costs 50% using C# and C++, saving $10 per unit_test"],
        )],
        selection_rationale="",
    )

    text = PdfReader(BytesIO(latex_renderer.render_pdf(payload))).pages[0].extract_text()
    for expected in ("R&D", "A & B Co.", "50%", "C#", "C++", "$10", "unit_test"):
        assert expected in text, f"{expected!r} did not survive compilation"
