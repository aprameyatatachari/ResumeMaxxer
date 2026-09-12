"""
quota.py
========
The free tailoring allowance, and the rules around a student's own Gemini key.

The product decision
--------------------
Every tailoring run costs two Gemini calls, and this is an app for college
students - the ones who most need it are the least able to pay for it, and the
ones building it cannot absorb thousands of them either. So:

* a student gets `FREE_RUNS_PER_WEEK` tailoring runs a week on the app's key
* after that, they add their own Gemini API key, which is free to obtain from
  Google AI Studio
* a student who has added a key is never counted at all - unlimited runs, all
  billed to their own (free-tier) quota

Weekly rather than lifetime because job hunting is bursty. A student applying
to six companies in placement week needs more than three runs in that week and
none at all for the next month; a lifetime cap of twenty would be spent in a
fortnight and then the app is dead to them.

How the reset works
-------------------
There is no scheduled job. The user row stores the count and the Monday it
belongs to (`User.free_runs_week`); a stored week earlier than the current one
means the count is stale and reads as zero. So the quota resets by arithmetic
at read time rather than by anything running at midnight - nothing to schedule,
nothing to miss, and correct even if the app was down all week.

Monday in UTC, not local time. Indian students are UTC+5:30, so their week
turns over at 05:30 local. That is a deliberate trade: a single global instant
is unambiguous and matches what the API reports, and "resets Monday morning" is
true either way.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from sqlmodel import Session

from models import User

logger = logging.getLogger("resumemaxxer.quota")

# Three is enough to tailor for a couple of roles and see that the app works,
# and small enough that the API bill for a student who never adds a key stays
# bounded. Tune here; nothing else hard-codes it.
FREE_RUNS_PER_WEEK = 3


def week_start(moment: date | None = None) -> date:
    """The Monday of the week `moment` falls in, in UTC.

    `date.weekday()` is 0 for Monday, so subtracting it lands on Monday
    regardless of which day is passed in.
    """
    today = moment or datetime.now(timezone.utc).date()
    return today - timedelta(days=today.weekday())


def next_reset(moment: date | None = None) -> date:
    """The Monday the current allowance rolls over on."""
    return week_start(moment) + timedelta(days=7)


@dataclass(frozen=True)
class QuotaState:
    """A snapshot of one student's allowance, as reported to the frontend."""

    used: int
    limit: int
    remaining: int
    resets_on: date
    # True when the request carried the student's own key, in which case none
    # of the numbers above constrain anything.
    using_own_key: bool

    @property
    def exhausted(self) -> bool:
        return not self.using_own_key and self.remaining <= 0


def _current_used(user: User, today: date | None = None) -> int:
    """The student's count for THIS week.

    A count stored against an earlier week is stale, and stale reads as zero -
    this is the reset. The stored row is not rewritten here: a read must not
    write, and `consume` corrects the week on the next real run anyway.
    """
    if user.free_runs_week is None or user.free_runs_week < week_start(today):
        return 0
    return user.free_runs_used


def peek(user: User, *, using_own_key: bool = False, today: date | None = None) -> QuotaState:
    """Report the allowance without spending any of it."""
    used = _current_used(user, today)
    return QuotaState(
        used=used,
        limit=FREE_RUNS_PER_WEEK,
        remaining=max(0, FREE_RUNS_PER_WEEK - used),
        resets_on=next_reset(today),
        using_own_key=using_own_key,
    )


class QuotaExceeded(RuntimeError):
    """The student has used their free runs and has not supplied a key.

    `routers/tailor.py` turns this into an HTTP 429 carrying the state, so the
    frontend can show the real numbers and open the "add your key" dialog
    rather than printing a dead end.
    """

    def __init__(self, state: QuotaState) -> None:
        self.state = state
        super().__init__(
            f"Free weekly limit reached ({state.used}/{state.limit})."
        )


def consume(
    session: Session,
    user: User,
    *,
    using_own_key: bool = False,
    today: date | None = None,
) -> QuotaState:
    """Spend one run, or raise `QuotaExceeded`.

    Call this AFTER the work succeeded, not before. A student whose tailoring
    run died on a Gemini timeout should not have paid for it out of an
    allowance of three - the failure is ours, and a wasted run of three is a
    third of their week.

    A student on their own key is not counted, and their stored count is left
    exactly as it was: if they remove their key later, whatever they had left
    that week is still there.
    """
    state = peek(user, using_own_key=using_own_key, today=today)

    if using_own_key:
        return state

    if state.remaining <= 0:
        raise QuotaExceeded(state)

    # Rewrite the week as well as the count. When the stored week was stale,
    # `state.used` is already 0, so this both resets and increments in one go.
    user.free_runs_week = week_start(today)
    user.free_runs_used = state.used + 1
    session.add(user)
    session.commit()
    session.refresh(user)

    remaining = max(0, FREE_RUNS_PER_WEEK - user.free_runs_used)
    logger.info(
        "User %s used a free tailoring run (%d/%d this week)",
        user.id, user.free_runs_used, FREE_RUNS_PER_WEEK,
    )

    return QuotaState(
        used=user.free_runs_used,
        limit=FREE_RUNS_PER_WEEK,
        remaining=remaining,
        resets_on=next_reset(today),
        using_own_key=False,
    )


def check(user: User, *, using_own_key: bool = False, today: date | None = None) -> None:
    """Raise `QuotaExceeded` if there is nothing left to spend.

    Used before starting work, so an out-of-quota student is turned away in
    milliseconds instead of after a file upload and two Gemini calls that will
    be thrown away.
    """
    state = peek(user, using_own_key=using_own_key, today=today)
    if state.exhausted:
        raise QuotaExceeded(state)
