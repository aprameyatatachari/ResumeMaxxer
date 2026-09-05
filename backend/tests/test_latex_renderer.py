"""
LaTeX generation.

Escaping is the important part: vault text is user-controlled and LaTeX is a
programming language, so an unescaped backslash is code execution on the
compiler. The rest covers the formatting fixes - the gap under the name, link
normalisation, and the tech-stack cap.

Compilation itself is not exercised here; that needs the Docker service and is
covered by the e2e suite.
"""

from __future__ import annotations

import pytest

from latex_renderer import (
    MAX_TECH_STACK_ITEMS,
    _portfolio_link,
    _split_link,
    escape,
    render_latex,
    trim_tech_stack,
)
from schemas import (
    ResumeEducation,
    ResumeExperience,
    ResumeHeader,
    ResumePayload,
    ResumeProject,
    SkillCategory,
)


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("R&D at 50% scale", r"R\&D at 50\% scale"),
        ("cost $5 #1 a_b", r"cost \$5 \#1 a\_b"),
        ("{braces}", r"\{braces\}"),
        (r"\input{/etc/passwd}", r"\textbackslash{}input\{/etc/passwd\}"),
        ("100~200 x^2", r"100\textasciitilde{}200 x\textasciicircum{}2"),
        ("", ""),
        (None, ""),
    ],
)
def test_special_characters_are_escaped(raw, expected):
    assert escape(raw) == expected


def test_backslash_is_escaped_first_and_not_double_escaped():
    """If the backslash rule ran after the others it would corrupt them."""
    assert escape("a & b") == r"a \& b"
    # The escape for `&` introduces a backslash; it must survive intact.
    assert escape("&").count("\\") == 1


def test_smart_punctuation_is_flattened():
    assert escape("don’t — “ok”") == "don't --- \"ok\""


@pytest.mark.parametrize(
    "value, host, display",
    [
        ("ananyak", "github.com", "github.com/ananyak"),
        ("github.com/ananyak", "github.com", "github.com/ananyak"),
        ("https://github.com/ananyak", "github.com", "github.com/ananyak"),
        ("https://www.github.com/ananyak/", "github.com", "github.com/ananyak"),
        ("ananyak", "linkedin.com", "linkedin.com/in/ananyak"),
        ("linkedin.com/in/ananyak", "linkedin.com", "linkedin.com/in/ananyak"),
        ("https://www.linkedin.com/in/ananyak/", "linkedin.com", "linkedin.com/in/ananyak"),
        ("", "github.com", ""),
    ],
)
def test_profile_links_normalise_to_one_form(value, host, display):
    """Students type a handle or a full URL; both must render identically."""
    assert _split_link(value, host)[0] == display


def test_portfolio_keeps_its_own_domain():
    assert _portfolio_link("https://ananya.dev") == ("ananya.dev", "https://ananya.dev")
    assert _portfolio_link("ananya.dev") == ("ananya.dev", "https://ananya.dev")


@pytest.mark.parametrize(
    "raw, expected",
    [
        # The reported bug: no space after the comma, and far too many.
        (
            "Python,FastAPI,Docker,Groq,Llama 3.1,RoBERTa,Transformers,Uvicorn",
            "Python, FastAPI, Docker, Groq, Llama 3.1",
        ),
        ("Python, FastAPI", "Python, FastAPI"),
        ("", ""),
        ("  Python ,, FastAPI  ", "Python, FastAPI"),
    ],
)
def test_tech_stack_is_trimmed_and_spaced(raw, expected):
    assert trim_tech_stack(raw) == expected
    assert len(trim_tech_stack(raw).split(", ")) <= MAX_TECH_STACK_ITEMS or not raw


@pytest.fixture(name="payload")
def payload_fixture() -> ResumePayload:
    return ResumePayload(
        header=ResumeHeader(
            full_name="Ananya Krishnan", phone="+91 98765 43210",
            email="a@vit.ac.in", linkedin="ananyak", github="ananyak", portfolio="",
        ),
        education=[ResumeEducation(
            institution="VIT", location="Vellore", qualification="B.Tech CSE",
            score="CGPA: 8.74", date_range="Aug. 2022 - May 2026",
        )],
        experience=[ResumeExperience(
            title="SWE Intern", date_range="May 2025 - July 2025",
            organization="Razorpay", location="Bengaluru",
            bullets=["Built a reconciliation service"],
        )],
        projects=[ResumeProject(
            name="Scheduler", tech_stack="Python,FastAPI,Docker,Groq,Llama,Extra",
            date_range="Jan. 2025", bullets=["Built a solver"],
        )],
        skills=[SkillCategory(category="Languages", items="Python, TypeScript")],
        selection_rationale="Chosen because the role asks for Python.",
    )


def test_document_has_the_template_preamble_and_default_font(payload):
    tex = render_latex(payload)

    assert tex.startswith("%-------------------------")
    assert r"\documentclass[letterpaper,11pt]{article}" in tex
    # Every font package stays commented out, so the document uses LaTeX's
    # default Latin Modern - the font the template specifies by omission.
    for package in ("FiraSans", "roboto", "noto-sans", "sourcesanspro",
                    "CormorantGaramond", "charter"):
        for line in tex.splitlines():
            if package in line:
                assert line.lstrip().startswith("%"), f"{package} active: {line}"

    # pdfTeX-only primitives must not be ACTIVE: Tectonic halts on them. The
    # preamble explains their absence in a comment, so check uncommented lines
    # only rather than the raw string.
    active = [l for l in tex.splitlines() if not l.lstrip().startswith("%")]
    assert not [l for l in active if "glyphtounicode" in l]
    assert not [l for l in active if "pdfgentounicode" in l]


def test_name_and_contact_line_are_separated(payload):
    """The reported bug: name and contact line were touching."""
    tex = render_latex(payload)
    assert r"\ \vspace{1pt}" in tex
    assert tex.index(r"\vspace{1pt}") < tex.index("+91 98765 43210")


def test_all_four_sections_render_in_template_order(payload):
    tex = render_latex(payload)
    order = [
        tex.index(r"\section{Education}"),
        tex.index(r"\section{Experience}"),
        tex.index(r"\section{Projects}"),
        tex.index(r"\section{Technical Skills}"),
    ]
    assert order == sorted(order)

    # Experience uses \resumeSubheading (two rows); projects use
    # \resumeProjectHeading (one row). Mixing them up is an easy regression.
    assert r"\resumeSubheading" in tex
    assert r"\resumeProjectHeading" in tex


def test_experience_is_rendered_with_its_bullets(payload):
    tex = render_latex(payload)
    assert "SWE Intern" in tex
    assert "Razorpay" in tex
    assert r"\resumeItem{Built a reconciliation service}" in tex


def test_tech_stack_is_capped_in_the_document(payload):
    tex = render_latex(payload)
    assert r"\emph{Python, FastAPI, Docker, Groq, Llama}" in tex
    assert "Extra" not in tex


def test_the_rationale_never_reaches_the_document(payload):
    """It is guidance for the student, not resume content."""
    assert "Chosen because" not in render_latex(payload)


def test_empty_sections_are_omitted_entirely(payload):
    payload.experience = []
    payload.projects = []
    tex = render_latex(payload)
    assert r"\section{Experience}" not in tex
    assert r"\section{Projects}" not in tex
    assert r"\section{Education}" in tex


def test_malicious_vault_text_cannot_execute(payload):
    """A bullet is data. It must never become a LaTeX command."""
    payload.experience[0].bullets = [r"\input{/etc/passwd} \write18{rm -rf /}"]
    tex = render_latex(payload)
    assert r"\input{/etc/passwd}" not in tex
    assert r"\write18" not in tex
    assert r"\textbackslash{}input" in tex


def test_document_is_closed(payload):
    assert render_latex(payload).rstrip().endswith(r"\end{document}")
