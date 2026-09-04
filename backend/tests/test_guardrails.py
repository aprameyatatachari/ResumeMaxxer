"""
The two AI guardrails from product.md section 5.

Both exist because prompt instructions are a suggestion and these are a
guarantee, so they are worth testing directly rather than through the model.
"""

from __future__ import annotations

import pytest

from ai_service import (
    MAX_BULLETS_PER_ENTRY,
    MAX_EDUCATION,
    MAX_ENTRIES_TOTAL,
    MAX_SKILL_CATEGORIES,
    MAX_SKILLS_PER_CATEGORY,
    enforce_no_fabrication,
    enforce_one_page,
)
from schemas import (
    ResumeEducation,
    ResumeExperience,
    ResumeHeader,
    ResumePayload,
    ResumeProject,
    SkillCategory,
)

SOURCE = "Built a REST API in Python. Handled 500 requests during the demo."


@pytest.mark.parametrize(
    "generated, expected",
    [
        pytest.param(
            "Built REST API, reduced latency by 40%, using Redis",
            "Built REST API, using Redis",
            id="drops-the-clause-with-an-invented-number",
        ),
        pytest.param(
            "Built REST API handling 500 requests",
            "Built REST API handling 500 requests",
            id="keeps-a-number-that-is-in-the-source",
        ),
        pytest.param(
            "Designed a caching layer",
            "Designed a caching layer",
            id="leaves-text-without-numbers-alone",
        ),
        pytest.param(
            "Improved throughput by 300%",
            "Improved throughput by 300%",
            id="keeps-the-bullet-rather-than-emptying-it",
        ),
    ],
)
def test_no_fabrication_strips_invented_metrics(generated, expected):
    assert enforce_no_fabrication(generated, SOURCE) == expected


def _entry(kind, index):
    bullets = [f"Built thing {i}" for i in range(7)]
    if kind == "experience":
        return ResumeExperience(
            title=f"Role {index}", date_range="Jan. 2024 - Present",
            organization="Org", location="Bengaluru", bullets=bullets,
        )
    return ResumeProject(
        name=f"Project {index}", tech_stack="Python, FastAPI",
        date_range="Jan. 2024", bullets=bullets,
    )


def _oversized_payload() -> ResumePayload:
    """Deliberately over every cap, to prove each one is applied."""
    return ResumePayload(
        header=ResumeHeader(
            full_name="Ananya Krishnan", phone="+91 98765 43210",
            email="a@vit.ac.in", linkedin="", github="", portfolio="",
        ),
        education=[
            ResumeEducation(
                institution=f"School {i}", location="Bengaluru",
                qualification="B.Tech", score="CGPA: 8.7",
                date_range="Aug. 2022 - May 2026",
            )
            for i in range(6)
        ],
        experience=[_entry("experience", i) for i in range(5)],
        projects=[_entry("project", i) for i in range(5)],
        skills=[
            SkillCategory(
                category=f"Category {i}",
                items=", ".join(f"skill{j}" for j in range(20)),
            )
            for i in range(8)
        ],
    )


def test_one_page_rule_trims_every_dimension():
    payload = enforce_one_page(_oversized_payload())

    assert len(payload.education) == MAX_EDUCATION
    assert len(payload.experience) + len(payload.projects) == MAX_ENTRIES_TOTAL
    assert len(payload.skills) == MAX_SKILL_CATEGORIES

    for entry in [*payload.experience, *payload.projects]:
        assert len(entry.bullets) <= MAX_BULLETS_PER_ENTRY

    for category in payload.skills:
        assert len(category.items.split(",")) <= MAX_SKILLS_PER_CATEGORY


def test_one_page_rule_fills_experience_before_projects():
    """Paid work outranks side projects when space runs out."""
    payload = _oversized_payload()
    payload.experience = [_entry("experience", i) for i in range(MAX_ENTRIES_TOTAL)]
    trimmed = enforce_one_page(payload)

    assert len(trimmed.experience) == MAX_ENTRIES_TOTAL
    assert trimmed.projects == []


def test_one_page_rule_drops_empty_skill_categories():
    """A bold label with nothing after it is a rendering bug on the PDF."""
    payload = _oversized_payload()
    payload.skills = [
        SkillCategory(category="Languages", items="Python, TypeScript"),
        SkillCategory(category="Empty", items="   "),
    ]
    trimmed = enforce_one_page(payload)

    assert [c.category for c in trimmed.skills] == ["Languages"]
