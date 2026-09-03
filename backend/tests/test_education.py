"""
Education: the per-level validation rules and the display formatting.

These two things carry most of the Indian-education logic, and both fail
silently if wrong - a bad level check saves nonsense, and bad formatting only
shows up on the finished PDF.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from models import Board, Education, EducationLevel, ScoreType, Stream
from routers.tailor import (
    _format_education_dates,
    _format_qualification,
    _format_score,
)
from schemas import EducationCreate

CLASS_10 = dict(
    level="CLASS_10", institution="St. Xavier", board="CBSE",
    start_year=2018, end_year=2020, score="96.8", score_type="PERCENTAGE",
)
CLASS_12 = dict(
    level="CLASS_12", institution="DPS", board="STATE", stream="PCMB",
    start_year=2020, end_year=2022, score="94.2", score_type="PERCENTAGE",
)
DEGREE = dict(
    level="HIGHER_ED", institution="VIT", degree="B.Tech CSE",
    start_year=2022, start_month=8, end_year=2026, end_month=5,
    score="8.74", score_type="CGPA",
)


@pytest.mark.parametrize(
    "payload",
    [
        pytest.param(CLASS_10, id="class-10"),
        pytest.param(CLASS_12, id="class-12-with-stream"),
        pytest.param(DEGREE, id="degree-with-months"),
        pytest.param({**DEGREE, "end_year": None, "end_month": None}, id="still-studying"),
        pytest.param({**DEGREE, "score": None, "score_type": None}, id="no-score"),
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
            {**CLASS_10, "start_month": 6},
            "year only",
            id="school-rejects-months",
        ),
        pytest.param(
            {k: v for k, v in CLASS_10.items() if k != "board"},
            "board is required",
            id="school-needs-board",
        ),
        pytest.param(
            {**CLASS_10, "degree": "B.Tech"},
            "degree does not apply",
            id="school-rejects-degree",
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
            {**DEGREE, "start_year": 2026, "end_year": 2022},
            "end year cannot be before start year",
            id="end-before-start",
        ),
        pytest.param(
            {**DEGREE, "score_type": None},
            "score_type is required",
            id="score-without-unit",
        ),
    ],
)
def test_invalid_education_is_rejected(payload, expected_message):
    with pytest.raises(ValidationError) as exc:
        EducationCreate(**payload)
    assert expected_message in str(exc.value)


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
                board=Board.CBSE, stream=Stream.PCMB, start_year=2020,
                end_year=2022, score="94.2", score_type=ScoreType.PERCENTAGE,
            ),
            "CBSE - Class XII (PCMB)", "2020 - 2022", "Percentage: 94.2%",
            id="class-12-year-only-and-adds-percent-sign",
        ),
        pytest.param(
            Education(
                user_id="u", level=EducationLevel.CLASS_10, institution="SX",
                board=Board.STATE, start_year=2018, end_year=2020,
                score="96.8%", score_type=ScoreType.PERCENTAGE,
            ),
            "State Board - Class X", "2018 - 2020", "Percentage: 96.8%",
            id="state-board-expanded-and-percent-not-doubled",
        ),
        pytest.param(
            Education(
                user_id="u", level=EducationLevel.HIGHER_ED, institution="IIT",
                degree="M.Tech", start_year=2026, start_month=7,
            ),
            "M.Tech", "July 2026 - Present", "",
            id="ongoing-and-unscored",
        ),
    ],
)
def test_education_is_formatted_for_the_resume(row, qualification, dates, score):
    assert _format_qualification(row) == qualification
    assert _format_education_dates(row) == dates
    assert _format_score(row) == score
