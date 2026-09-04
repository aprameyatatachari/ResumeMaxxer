"""
The parts of the tailoring engine that are pure Python: bullet scoring and the
vault context handed to Gemini.

Worth testing directly because they decide what the AI ever gets to see - a
scoring bug produces a plausible resume built from the wrong material.
"""

from __future__ import annotations

from datetime import date

import pytest

from models import Bullet, EntityType, Experience, Project, User
from routers.tailor import _build_vault_context, _score_bullet, _tokenise


def _bullet(text: str, tags: str) -> Bullet:
    return Bullet(
        user_id="u", entity_type=EntityType.PROJECT, entity_id=1,
        original_text=text, tags=tags,
    )


def test_tokenise_keeps_technology_names_intact():
    tokens = _tokenise("Built with C++, C#, Node.js and Go")
    assert {"c++", "c#", "node.js", "go"} <= tokens


def test_tag_matches_outrank_body_matches():
    """Tags were assigned deliberately; a body match can be incidental."""
    keywords = _tokenise("python")
    tagged = _bullet("Built an internal tool", "python")
    mentioned = _bullet("Rewrote the python script", "")

    assert _score_bullet(tagged, keywords) > _score_bullet(mentioned, keywords)


def test_irrelevant_bullets_score_zero_rather_than_negative():
    assert _score_bullet(_bullet("Organised a bake sale", "events"),
                         _tokenise("kubernetes rust")) == 0


@pytest.fixture(name="vault")
def vault_fixture():
    user = User(
        id="u", email="a@vit.ac.in", first_name="Ananya", last_name="Krishnan",
        phone="+91 98765 43210", github_url="github.com/ananyak",
    )
    experience = Experience(
        id=1, user_id="u", title="SWE Intern", organization="Razorpay",
        location="Bengaluru", start_date=date(2025, 5, 1), end_date=date(2025, 7, 31),
    )
    project = Project(id=1, user_id="u", title="Scheduler", tech_stack="Python,FastAPI")
    return user, experience, project


def test_vault_context_preformats_everything_the_ai_must_copy(vault):
    user, experience, project = vault
    context = _build_vault_context(
        user=user, educations=[], experiences=[experience], projects=[project],
        bullets_by_key={
            ("EXPERIENCE", 1): [_bullet("Built a service", "python")],
            ("PROJECT", 1): [_bullet("Shipped a solver", "python")],
        },
    )

    # Contact details reach the header.
    assert "full_name: Ananya Krishnan" in context
    assert "github: github.com/ananyak" in context
    # Dates are pre-formatted so the model never does arithmetic on them.
    assert "date_range: May 2025 - July 2025" in context
    assert "organization: Razorpay" in context
    assert "tech_stack: Python,FastAPI" in context
    assert "Shipped a solver" in context


def test_missing_contact_fields_are_marked_not_left_blank(vault):
    """An empty value would invite the model to invent one."""
    user, experience, project = vault
    context = _build_vault_context(
        user=user, educations=[], experiences=[experience], projects=[project],
        bullets_by_key={("EXPERIENCE", 1): [_bullet("Built a service", "python")]},
    )
    assert "linkedin: (not provided - use empty string)" in context


def test_entities_without_shortlisted_bullets_are_left_out(vault):
    """Step 2 filters bullets; an entity whose bullets all lost should not
    reach the prompt as an empty heading."""
    user, experience, project = vault
    context = _build_vault_context(
        user=user, educations=[], experiences=[experience], projects=[project],
        bullets_by_key={("EXPERIENCE", 1): [_bullet("Built a service", "python")]},
    )
    assert "## EXPERIENCE" in context
    assert "## PROJECTS" not in context
