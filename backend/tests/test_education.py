"""
Education: the per-level validation rules and the display formatting.

These two things carry most of the Indian-education logic, and both fail
silently if wrong - a bad level check saves nonsense, and bad formatting only
shows up on the finished PDF.

Four shapes:

  Class X / XII   one board result; only the year of passing is recorded
  School          one school's whole tenure, its X / XII results as bullets
  Degree          month-and-year dates, CGPA, coursework
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

import latex_renderer
from models import Board, Education, EducationLevel, ScoreType, Stream
from routers.tailor import (
    _format_education_dates,
    _format_qualification,
    _format_score,
    _rehydrate_education,
    _school_highlights,
    education_entries,
)
from schemas import (
    EducationCreate,
    ResumeEducation,
    ResumeHeader,
    ResumePayload,
)

CLASS_10 = dict(
    level="CLASS_10", institution="St. Xavier", board="CBSE",
    end_year=2020, score="96.8", score_type="PERCENTAGE",
)
CLASS_12 = dict(
    level="CLASS_12", institution="DPS", board="STATE", stream="PCMB",
    end_year=2022, score="94.2", score_type="PERCENTAGE",
)
DEGREE = dict(
    level="HIGHER_ED", institution="VIT", degree="B.Tech CSE",
    start_year=2022, start_month=8, end_year=2026, end_month=5,
    score="8.74", score_type="CGPA",
)
SCHOOL = dict(
    level="SCHOOL", institution="Delhi Public School", location="Bengaluru",
    start_year=2010, end_year=2022,
    class10_board="CBSE", class10_score="96", class10_score_type="PERCENTAGE",
    class12_board="CBSE", class12_stream="PCMC", class12_score="94.2",
    class12_score_type="PERCENTAGE",
)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "payload",
    [
        pytest.param(CLASS_10, id="class-10-year-of-passing-only"),
        pytest.param(CLASS_12, id="class-12-with-stream"),
        pytest.param(DEGREE, id="degree-with-months"),
        pytest.param({**DEGREE, "end_year": None, "end_month": None}, id="still-studying"),
        pytest.param({**DEGREE, "score": None, "score_type": None}, id="no-score"),
        pytest.param(SCHOOL, id="school-with-both-results"),
        pytest.param(
            {k: v for k, v in SCHOOL.items() if not k.startswith("class10")},
            id="school-with-only-class-12",
        ),
        pytest.param(
            {k: v for k, v in SCHOOL.items() if not k.startswith("class12")},
            id="school-with-only-class-10",
        ),
        pytest.param({**SCHOOL, "end_year": None}, id="school-still-studying"),
        pytest.param(
            {**SCHOOL, "class10_score": None, "class10_score_type": None},
            id="school-result-without-score",
        ),
    ],
)
def test_valid_education_is_accepted(payload):
    assert EducationCreate(**payload)


@pytest.mark.parametrize(
    "payload, expected_message",
    [
        pytest.param(
            {k: v for k, v in CLASS_12.items() if k != "stream"},
            "stream is required for Class XII",
            id="class-12-needs-stream",
        ),
        pytest.param(
            {**CLASS_10, "stream": "PCMB"},
            "common curriculum",
            id="class-10-rejects-stream",
        ),
        pytest.param(
            {**CLASS_10, "end_month": 6},
            "year only",
            id="school-level-rejects-months",
        ),
        pytest.param(
            {**CLASS_10, "start_year": 2018},
            "only the year of passing",
            id="class-10-rejects-a-start-year",
        ),
        pytest.param(
            {**CLASS_12, "end_year": None},
            "year of passing",
            id="class-12-needs-its-year-of-passing",
        ),
        pytest.param(
            {k: v for k, v in CLASS_10.items() if k != "board"},
            "board is required",
            id="class-level-needs-board",
        ),
        pytest.param(
            {**CLASS_10, "degree": "B.Tech"},
            "degree does not apply",
            id="class-level-rejects-degree",
        ),
        pytest.param(
            {**CLASS_10, "class10_board": "CBSE"},
            "School entries only",
            id="class-level-rejects-school-results",
        ),
        pytest.param(
            {k: v for k, v in DEGREE.items() if k != "degree"},
            "degree is required",
            id="degree-needs-degree-name",
        ),
        pytest.param(
            {**DEGREE, "board": "CBSE"},
            "apply to school entries",
            id="degree-rejects-board",
        ),
        pytest.param(
            {k: v for k, v in DEGREE.items() if k != "start_year"},
            "start_year is required",
            id="degree-needs-start-year",
        ),
        pytest.param(
            {**DEGREE, "start_year": 2026, "end_year": 2022},
            "end year cannot be before start year",
            id="end-before-start",
        ),
        pytest.param(
            {**DEGREE, "score_type": None},
            "score_type is required",
            id="score-without-unit",
        ),
        pytest.param(
            {k: v for k, v in SCHOOL.items() if not k.startswith(("class10", "class12"))},
            "at least one result",
            id="school-needs-a-result",
        ),
        pytest.param(
            {k: v for k, v in SCHOOL.items() if k != "start_year"},
            "start_year is required for a School entry",
            id="school-needs-its-tenure",
        ),
        pytest.param(
            {**SCHOOL, "board": "CBSE"},
            "keeps its results in class10_",
            id="school-rejects-top-level-board",
        ),
        pytest.param(
            {k: v for k, v in SCHOOL.items() if k != "class12_stream"},
            "stream is required for Class XII",
            id="school-class-12-needs-stream",
        ),
        pytest.param(
            {**SCHOOL, "class10_score_type": None},
            "Class X score needs a score type",
            id="school-score-without-unit",
        ),
        pytest.param(
            {**{k: v for k, v in SCHOOL.items() if k != "class12_board"}},
            "needs a board",
            id="school-score-without-board",
        ),
        pytest.param(
            {**SCHOOL, "start_year": 2023},
            "end year cannot be before start year",
            id="school-tenure-backwards",
        ),
    ],
)
def test_invalid_education_is_rejected(payload, expected_message):
    with pytest.raises(ValidationError) as exc:
        EducationCreate(**payload)
    assert expected_message in str(exc.value)


# ---------------------------------------------------------------------------
# Formatting
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "row, qualification, dates, score",
    [
        pytest.param(
            Education(
                user_id="u", level=EducationLevel.HIGHER_ED, institution="VIT",
                degree="B.Tech CSE", start_year=2022, start_month=8,
                end_year=2026, end_month=5, score="8.74", score_type=ScoreType.CGPA,
            ),
            "B.Tech CSE", "Aug. 2022 - May 2026", "CGPA: 8.74",
            id="degree-uses-month-and-year",
        ),
        pytest.param(
            Education(
                user_id="u", level=EducationLevel.CLASS_12, institution="DPS",
                board=Board.CBSE, stream=Stream.PCMB,
                end_year=2022, score="94.2", score_type=ScoreType.PERCENTAGE,
            ),
            "CBSE - Class XII (PCMB)", "2022", "Percentage: 94.2%",
            id="class-12-shows-only-the-year-of-passing",
        ),
        pytest.param(
            Education(
                user_id="u", level=EducationLevel.CLASS_10, institution="SX",
                board=Board.STATE, start_year=2018, end_year=2020,
                score="96.8%", score_type=ScoreType.PERCENTAGE,
            ),
            "State Board - Class X", "2020", "Percentage: 96.8%",
            id="legacy-row-with-a-start-year-still-shows-only-passing-year",
        ),
        pytest.param(
            Education(
                user_id="u", level=EducationLevel.HIGHER_ED, institution="IIT",
                degree="M.Tech", start_year=2026, start_month=7,
            ),
            "M.Tech", "July 2026 - Present", "",
            id="ongoing-and-unscored",
        ),
        pytest.param(
            Education(user_id="u", **{**SCHOOL, "level": EducationLevel.SCHOOL,
                "class10_board": Board.CBSE, "class12_board": Board.CBSE,
                "class12_stream": Stream.PCMC,
                "class10_score_type": ScoreType.PERCENTAGE,
                "class12_score_type": ScoreType.PERCENTAGE}),
            "CBSE - Class X & XII", "2010 - 2022", "",
            id="school-names-both-exams-and-the-tenure",
        ),
    ],
)
def test_education_is_formatted_for_the_resume(row, qualification, dates, score):
    assert _format_qualification(row) == qualification
    assert _format_education_dates(row) == dates
    assert _format_score(row) == score


def _school(**overrides) -> Education:
    base = dict(
        user_id="u", level=EducationLevel.SCHOOL, institution="DPS",
        start_year=2010, end_year=2022,
    )
    return Education(**{**base, **overrides})


def test_school_results_become_bullets_most_recent_first():
    row = _school(
        class10_board=Board.CBSE, class10_score="96", class10_score_type=ScoreType.PERCENTAGE,
        class12_board=Board.CBSE, class12_stream=Stream.PCMC, class12_score="94.2%",
        class12_score_type=ScoreType.PERCENTAGE,
    )
    assert _school_highlights(row) == ["Class XII (PCMC): 94.2%", "Class X: 96%"]


def test_different_boards_are_named_in_each_bullet_not_the_heading():
    """IGCSE for Class X and CBSE for XII at the same school: one board in the
    heading would be wrong for half the results."""
    row = _school(
        class10_board=Board.CAMBRIDGE, class10_score="9.2", class10_score_type=ScoreType.CGPA,
        class12_board=Board.CBSE, class12_stream=Stream.PCM,
    )
    assert _format_qualification(row) == "Class X & XII"
    assert _school_highlights(row) == ["Class XII, CBSE (PCM)", "Class X, CAMBRIDGE: CGPA 9.2"]


def test_a_school_with_only_one_result_names_just_that_exam():
    """The student who moved schools after Class X."""
    row = _school(class12_board=Board.STATE, class12_stream=Stream.COMMERCE)
    assert _format_qualification(row) == "State Board - Class XII"
    assert _school_highlights(row) == ["Class XII (COMMERCE)"]


def test_non_school_rows_have_no_bullets():
    row = Education(user_id="u", level=EducationLevel.CLASS_10, institution="SX",
                    board=Board.CBSE, end_year=2020)
    assert _school_highlights(row) == []


def test_two_schools_are_both_listed_most_recent_first():
    """Different schools across a student's life - one School entry each."""
    early = _school(institution="Kendriya Vidyalaya", start_year=2008, end_year=2018,
                    class10_board=Board.CBSE)
    late = _school(institution="Narayana Junior College", start_year=2018, end_year=2020,
                   class12_board=Board.STATE, class12_stream=Stream.PCM)
    degree = Education(user_id="u", level=EducationLevel.HIGHER_ED, institution="VIT",
                       degree="B.Tech", start_year=2020)

    names = [e.institution for e in education_entries([early, degree, late])]
    assert names == ["VIT", "Narayana Junior College", "Kendriya Vidyalaya"]


# ---------------------------------------------------------------------------
# The AI cannot rewrite education
# ---------------------------------------------------------------------------
def _payload(education: list[ResumeEducation]) -> ResumePayload:
    return ResumePayload(
        header=ResumeHeader(full_name="A", phone="", email="a@b.c",
                            linkedin="", github="", portfolio=""),
        education=education, experience=[], projects=[], skills=[],
        selection_rationale="",
    )


def test_ai_education_is_replaced_with_the_exact_vault_text():
    row = _school(
        class10_board=Board.CBSE, class10_score="96", class10_score_type=ScoreType.PERCENTAGE,
        class12_board=Board.CBSE, class12_stream=Stream.PCMC, class12_score="94.2",
        class12_score_type=ScoreType.PERCENTAGE,
    )
    truth = education_entries([row])
    # What a model might plausibly send back: reworded, bullets lost.
    paraphrased = ResumeEducation(
        institution="DPS", location="", qualification="CBSE Schooling",
        score="94%", date_range="2010-22", highlights=[],
    )

    result = _rehydrate_education(_payload([paraphrased]), truth)

    assert result.education == truth
    assert result.education[0].highlights == ["Class XII (PCMC): 94.2%", "Class X: 96%"]


def test_an_education_row_the_vault_does_not_have_is_dropped():
    truth = education_entries([_school(class10_board=Board.CBSE)])
    invented = ResumeEducation(institution="Harvard", location="", qualification="MBA",
                               score="", date_range="2020", highlights=[])

    result = _rehydrate_education(_payload([invented]), truth)

    assert result.education == []


def test_the_ai_may_still_choose_to_leave_a_row_out():
    truth = education_entries([
        Education(user_id="u", level=EducationLevel.HIGHER_ED, institution="VIT",
                  degree="B.Tech", start_year=2020),
        _school(class10_board=Board.CBSE),
    ])
    kept_only_degree = [truth[0].model_copy(update={"qualification": "B.Tech"})]

    result = _rehydrate_education(_payload(kept_only_degree), truth)

    assert [e.institution for e in result.education] == ["VIT"]


def test_school_bullets_reach_the_latex_document():
    row = _school(class10_board=Board.CBSE, class10_score="96",
                  class10_score_type=ScoreType.PERCENTAGE)
    tex = latex_renderer.render_latex(_payload(education_entries([row])))

    heading_at = tex.index("{DPS}")
    bullet_at = tex.index(r"\resumeItem{Class X: 96\%}")
    assert heading_at < bullet_at
