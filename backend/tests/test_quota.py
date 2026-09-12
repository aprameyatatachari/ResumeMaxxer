"""
The free weekly tailoring allowance.

This decides whether a student can use the app at all on a given day, and it
spends real money when it gets it wrong in one direction and blocks a paying-
for-themselves student when it gets it wrong in the other. The rollover is the
part worth pinning down hardest: there is no scheduled job, so the reset is
pure arithmetic on a stored date and a test is the only thing that proves it.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

import quota
from models import User

# A Wednesday, so `week_start` has something to actually subtract.
WEDNESDAY = date(2026, 9, 9)
THAT_MONDAY = date(2026, 9, 7)
NEXT_MONDAY = date(2026, 9, 14)


# ---------------------------------------------------------------------------
# Week arithmetic
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "day, expected",
    [
        (date(2026, 9, 7), date(2026, 9, 7)),    # Monday is its own week start
        (date(2026, 9, 9), date(2026, 9, 7)),    # Wednesday
        (date(2026, 9, 13), date(2026, 9, 7)),   # Sunday - still the same week
        (date(2026, 9, 14), date(2026, 9, 14)),  # next Monday, next week
        (date(2027, 1, 1), date(2026, 12, 28)),  # a week spanning a year end
    ],
)
def test_the_week_starts_on_monday(day, expected):
    assert quota.week_start(day) == expected


def test_the_reset_is_the_following_monday():
    assert quota.next_reset(WEDNESDAY) == NEXT_MONDAY
    # Called on the Monday itself, the reset is a full week away, not today -
    # otherwise the UI would say "resets today" all Monday long.
    assert quota.next_reset(THAT_MONDAY) == NEXT_MONDAY


# ---------------------------------------------------------------------------
# Reading the allowance
# ---------------------------------------------------------------------------
def test_a_new_student_has_the_full_allowance(user: User):
    state = quota.peek(user, today=WEDNESDAY)

    assert state.used == 0
    assert state.limit == quota.FREE_RUNS_PER_WEEK
    assert state.remaining == quota.FREE_RUNS_PER_WEEK
    assert state.resets_on == NEXT_MONDAY
    assert not state.exhausted


def test_last_weeks_count_reads_as_zero(user: User):
    """The rollover. No job runs at midnight on Monday - a count stored against
    an earlier week is simply stale, and stale means spent."""
    user.free_runs_used = quota.FREE_RUNS_PER_WEEK
    user.free_runs_week = THAT_MONDAY - timedelta(days=7)

    state = quota.peek(user, today=WEDNESDAY)

    assert state.used == 0
    assert state.remaining == quota.FREE_RUNS_PER_WEEK
    assert not state.exhausted


def test_this_weeks_count_still_counts(user: User):
    user.free_runs_used = 2
    user.free_runs_week = THAT_MONDAY

    state = quota.peek(user, today=WEDNESDAY)

    assert state.used == 2
    assert state.remaining == quota.FREE_RUNS_PER_WEEK - 2


def test_peek_never_writes(session, user: User):
    """A read must not spend anything, or merely opening the page would."""
    user.free_runs_used = 1
    user.free_runs_week = THAT_MONDAY
    session.add(user)
    session.commit()

    quota.peek(user, today=WEDNESDAY)
    quota.peek(user, today=WEDNESDAY)
    session.refresh(user)

    assert user.free_runs_used == 1


# ---------------------------------------------------------------------------
# Spending it
# ---------------------------------------------------------------------------
def test_runs_are_spent_until_the_allowance_is_gone(session, user: User):
    for expected_used in range(1, quota.FREE_RUNS_PER_WEEK + 1):
        state = quota.consume(session, user, today=WEDNESDAY)
        assert state.used == expected_used
        assert state.remaining == quota.FREE_RUNS_PER_WEEK - expected_used

    with pytest.raises(quota.QuotaExceeded) as exc:
        quota.consume(session, user, today=WEDNESDAY)

    # The exception carries the state, so the router can report real numbers
    # and a real reset date rather than a generic refusal.
    assert exc.value.state.remaining == 0
    assert exc.value.state.resets_on == NEXT_MONDAY


def test_spending_stamps_the_current_week(session, user: User):
    """Both the count and the week are written, so a stale row resets and
    increments in the same operation rather than needing two passes."""
    user.free_runs_used = quota.FREE_RUNS_PER_WEEK
    user.free_runs_week = THAT_MONDAY - timedelta(days=14)
    session.add(user)
    session.commit()

    state = quota.consume(session, user, today=WEDNESDAY)

    assert state.used == 1
    session.refresh(user)
    assert user.free_runs_week == THAT_MONDAY
    assert user.free_runs_used == 1


def test_the_allowance_comes_back_the_following_week(session, user: User):
    for _ in range(quota.FREE_RUNS_PER_WEEK):
        quota.consume(session, user, today=WEDNESDAY)

    with pytest.raises(quota.QuotaExceeded):
        quota.check(user, today=WEDNESDAY)

    # Same user row, one week later.
    quota.check(user, today=WEDNESDAY + timedelta(days=7))
    state = quota.consume(session, user, today=WEDNESDAY + timedelta(days=7))
    assert state.used == 1


# ---------------------------------------------------------------------------
# The student's own key
# ---------------------------------------------------------------------------
def test_a_student_on_their_own_key_is_never_charged(session, user: User):
    user.free_runs_used = quota.FREE_RUNS_PER_WEEK
    user.free_runs_week = THAT_MONDAY
    session.add(user)
    session.commit()

    # Exhausted on the free allowance, but their own key is not rationed.
    quota.check(user, using_own_key=True, today=WEDNESDAY)
    state = quota.consume(session, user, using_own_key=True, today=WEDNESDAY)

    assert state.using_own_key
    assert not state.exhausted

    # And the stored count is untouched, so whatever was left before they added
    # a key is still there if they remove it.
    session.refresh(user)
    assert user.free_runs_used == quota.FREE_RUNS_PER_WEEK


def test_an_own_key_run_does_not_consume_a_remaining_free_run(session, user: User):
    quota.consume(session, user, using_own_key=True, today=WEDNESDAY)

    session.refresh(user)
    assert user.free_runs_used == 0
    assert user.free_runs_week is None
