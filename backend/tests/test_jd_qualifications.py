"""
Finding the qualifications section of a job description.

This decides what the whole tailoring run optimises for, so it is worth
pinning down hard: a false positive tailors against the wrong text, and a false
negative silently reverts to the weaker whole-document inference.

The first two fixtures are real postings, kept verbatim - including the
mid-sentence line wraps that PDF extraction produces and the first item that
has no bullet at all.
"""

from __future__ import annotations

import pytest

import jd_qualifications as jq

FINANCE_JD = """About the Team
Our markets group builds tooling for the trading desk.

Responsibilities
- Support the desk with daily analysis
- Build dashboards for portfolio managers

Basic Qualifications
Strong interest and familiarity with finance, global financial markets, and economic developments
- Ability to work flexibly in teams and manage a varied workload to meet deadlines
- Highly motivated with strong academic background and a commitment to excellence
- Strong organizational skills and the ability to manage multiple assignments concurrently
- Be a strategic and analytical thinker, possessing strong problem-solving and data gathering skills, and able to
provide creative & innovative solutions
- Excellent communication and interpersonal skills, written and oral; confident in interaction with stakeholders

Benefits
Health cover and a learning stipend.
"""

ANALYTICS_JD = """Data Analyst Intern

What you'll do
Work with the analytics pod on hypothesis-driven studies.

Required Qualifications
1. Master's degree (Engineering, Pharma, Biotech, Operations, Business) or bachelor's degree in a
relevant field with >=70% or 7.0 CGPA (flexible for strong projects/internships).
2. Passion for data analysis and hypothesis-driven thinking.
3. Curious, self-driven learner who connects insights across functions.
4. Clear written and verbal communication.
5. Basic-to-strong analytical and structured problem-solving skills with understanding of analytics
concepts (segmentation, trends, forecasting, KPIs).
6. Experience or willingness to work with large datasets; analytics tools knowledge is a plus.
7. Exposure to biotech/pharma or healthcare data is a plus.

Preferred Qualifications
- Exposure to SQL and Python
- Prior internship in consulting

How to apply
Send a CV to jobs@example.com
"""

NO_SECTION_JD = """Software Engineering Intern

We are a fast growing startup. You will work on our Python backend, help ship
features with FastAPI, and learn a great deal along the way. Bengaluru based,
six months, stipend provided.
"""


def test_finds_a_bulleted_basic_qualifications_section():
    result = jq.extract(FINANCE_JD)

    assert result is not None
    assert result.heading == "Basic Qualifications"
    assert len(result.required) == 6

    # The first item has no bullet glyph at all - prose directly under the
    # heading, which is common and easy to drop.
    assert result.required[0].startswith("Strong interest and familiarity with finance")

    # This one wraps mid-sentence across two physical lines; the halves must be
    # rejoined or the requirement reads as truncated nonsense.
    wrapped = [item for item in result.required if item.startswith("Be a strategic")]
    assert wrapped and wrapped[0].endswith("creative & innovative solutions")


def test_finds_a_numbered_required_section_and_its_preferred_list():
    result = jq.extract(ANALYTICS_JD)

    assert result is not None
    assert result.heading == "Required Qualifications"
    assert len(result.required) == 7
    assert result.required[0].startswith("Master's degree")
    assert "7.0 CGPA" in result.required[0]

    # Nice-to-haves are captured separately so they are never treated as hard
    # requirements.
    assert result.preferred == [
        "Exposure to SQL and Python",
        "Prior internship in consulting",
    ]


def test_the_section_stops_at_the_next_heading():
    """Bleeding into "Benefits" or "How to apply" would poison the keywords."""
    finance = jq.extract(FINANCE_JD)
    analytics = jq.extract(ANALYTICS_JD)

    assert not any("Health cover" in item for item in finance.required)
    assert not any("jobs@example.com" in item for item in analytics.required)
    assert not any("Send a CV" in item for item in analytics.preferred)


def test_a_posting_with_no_such_section_returns_none():
    """The signal to fall back to whole-document inference."""
    assert jq.extract(NO_SECTION_JD) is None


@pytest.mark.parametrize(
    "heading",
    [
        "Basic Qualifications",
        "Minimum Qualifications",
        "Required Qualifications",
        "Expected Qualifications",
        "Qualifications",
        "Requirements",
        "Eligibility",
        "Who You Are",
        "What We're Looking For",
        "What You'll Need",
        "Must Have",
        "Candidate Profile",
        "REQUIREMENTS:",
        "requirements",
    ],
)
def test_the_common_heading_variants_are_all_recognised(heading):
    jd = f"About us\nWe are a company.\n\n{heading}\n- Strong Python skills\n- SQL\n"
    result = jq.extract(jd)

    assert result is not None, f"{heading!r} not recognised"
    assert result.required == ["Strong Python skills", "SQL"]


@pytest.mark.parametrize(
    "marker",
    ["-", "*", "•", "‣", "●", "▪", "1.", "2)", "(3)", "a.", "b)"],
)
def test_every_common_list_marker_is_stripped(marker):
    jd = f"Requirements\n{marker} Strong Python skills\n"
    result = jq.extract(jd)

    assert result is not None
    assert result.required == ["Strong Python skills"]


def test_a_sentence_mentioning_requirements_is_not_a_heading():
    """The length guard: prose that happens to contain the word must not open
    a section, or the "requirements" become a paragraph of marketing."""
    jd = (
        "About the role\n"
        "There are no formal requirements for this position beyond enthusiasm "
        "and a willingness to learn quickly on the job.\n"
    )
    assert jq.extract(jd) is None


def test_a_preferred_only_posting_is_marked_as_preferred():
    """Weak signal, but it must not be promoted to a hard requirement."""
    jd = "About us\nWe are a company.\n\nNice to have\n- Kubernetes\n- Go\n"
    result = jq.extract(jd)

    assert result is not None
    assert result.required == []
    assert result.preferred == ["Kubernetes", "Go"]


def test_the_prompt_block_separates_required_from_preferred():
    block = jq.extract(ANALYTICS_JD).as_prompt_block()

    assert "Required Qualifications" in block
    assert "Master's degree" in block
    # The model must be able to tell the two lists apart.
    assert "Nice to have (lower priority):" in block
    assert block.index("Master's degree") < block.index("Nice to have")


def test_empty_input_is_handled():
    assert jq.extract("") is None
    assert jq.extract("\n\n\n") is None
