"""
jd_qualifications.py
====================
Finds the "Basic Qualifications" / "Requirements" / "Who you are" section of a
job description.

Why this exists
---------------
A JD is mostly prose about the company, the team and the day-to-day. Buried in
it is a short list of what the role *actually screens on*, and that list is
what a recruiter checks against. Inferring keywords from the whole document
dilutes it: a paragraph about company culture contributes as much signal as the
line demanding PostgreSQL.

So the section is pulled out deterministically, before any AI call, and given
priority downstream:

  * `routers/tailor.py` scores vault bullets against these terms at double
    weight (see `_score_bullet`)
  * `ai_service` puts them at the top of both prompts, labelled as the
    requirements to satisfy first

When no such section is found - some JDs genuinely have none - everything falls
back to whole-document inference, which is the previous behaviour.

Deliberately not an AI call: this is heading-matching, it is cheap and
deterministic, and a wrong answer here would silently skew every resume.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

logger = logging.getLogger("resumemaxxer.jd_qualifications")

# Headings that introduce the must-have list. Ordered longest-first so
# "Basic Qualifications" wins over a bare "Qualifications" on the same line.
REQUIRED_HEADINGS = [
    "basic qualifications",
    "minimum qualifications",
    "required qualifications",
    "expected qualifications",
    "essential qualifications",
    "key qualifications",
    "qualifications required",
    "required skills and experience",
    "skills and qualifications",
    "required skills",
    "requirements",
    "eligibility criteria",
    "eligibility",
    "who you are",
    "what we are looking for",
    "what we're looking for",
    "who we are looking for",
    "who we're looking for",
    "what you will need",
    "what you'll need",
    "what you need",
    "you should have",
    "you will need",
    "must have",
    "must haves",
    "candidate profile",
    "desired profile",
    "qualifications",
]

# The same idea, but for the "would be nice" list. Matched separately so it is
# never treated as a hard requirement - claiming a nice-to-have as essential
# skews the resume toward the wrong material.
PREFERRED_HEADINGS = [
    "preferred qualifications",
    "desired qualifications",
    "nice to have",
    "nice to haves",
    "good to have",
    "bonus points",
    "plus points",
    "preferred skills",
    "desirable",
    "advantageous",
]

# Headings that end the section. Anything that starts a different topic.
TERMINATING_HEADINGS = [
    "responsibilities",
    "key responsibilities",
    "what you will do",
    "what you'll do",
    "role overview",
    "about the role",
    "about us",
    "about the company",
    "about the team",
    "benefits",
    "perks",
    "what we offer",
    "compensation",
    "salary",
    "how to apply",
    "application process",
    "equal opportunity",
    "diversity",
    "location",
    "job description",
    "job summary",
    "overview",
    "our mission",
    "why join",
]

# A leading bullet glyph or list number: "- ", "* ", "1. ", "1) ", "(a) ".
_LIST_MARKER = re.compile(
    r"^\s*(?:[-•‣●▪·*⁃∙]|"
    r"\(?\d{1,2}[.)]|\(?[a-z][.)])\s+",
    re.I,
)

_MAX_SECTION_LINES = 40


@dataclass
class Qualifications:
    """What was found. `heading` is the literal text matched, kept so the UI
    can show the student which section drove the tailoring."""

    heading: str
    required: list[str] = field(default_factory=list)
    preferred: list[str] = field(default_factory=list)

    @property
    def is_empty(self) -> bool:
        return not self.required and not self.preferred

    def as_prompt_block(self) -> str:
        """Render for inclusion in a prompt."""
        lines = [f"(from the job description's \"{self.heading}\" section)"]
        for item in self.required:
            lines.append(f"- {item}")
        if self.preferred:
            lines.append("Nice to have (lower priority):")
            for item in self.preferred:
                lines.append(f"- {item}")
        return "\n".join(lines)


def _normalise(line: str) -> str:
    """Lowercase, strip punctuation and list markers, for heading matching."""
    cleaned = _LIST_MARKER.sub("", line).strip()
    cleaned = cleaned.strip(" \t:：-–—*#").lower()
    # Collapse the smart apostrophes students' PDFs are full of.
    return cleaned.replace("’", "'").replace("  ", " ")


def _match_heading(line: str, headings: list[str]) -> str | None:
    """Return the heading this line announces, if any.

    A heading line is short and consists of (or starts with) one of the known
    phrases. The length guard is what stops a sentence like "we have no formal
    requirements for this role" being read as a section start.
    """
    stripped = line.strip()
    if not stripped or len(stripped) > 80:
        return None

    normalised = _normalise(stripped)
    if not normalised:
        return None

    for heading in headings:
        if normalised == heading or normalised.startswith(heading):
            # Reject "requirements are listed below in detail" - a heading is
            # the whole line, give or take a colon and a couple of words.
            if len(normalised) <= len(heading) + 20:
                return stripped.strip(" \t:：")
    return None


def _collect_items(lines: list[str], start: int) -> tuple[list[str], int]:
    """Read the list that follows a heading.

    Returns the items and the index where it stopped. Handles both bulleted and
    numbered lists, and the wrapped continuation lines that PDF extraction
    produces - a requirement often spans two or three physical lines.
    """
    items: list[str] = []
    index = start
    seen_blank = 0

    while index < len(lines) and len(items) < _MAX_SECTION_LINES:
        raw = lines[index]
        line = raw.strip()

        if not line:
            seen_blank += 1
            # One blank line inside a list is normal formatting; two usually
            # means the section ended.
            if seen_blank >= 2 and items:
                break
            index += 1
            continue

        # A new section heading ends this one.
        if _match_heading(line, TERMINATING_HEADINGS) or _match_heading(
            line, PREFERRED_HEADINGS
        ):
            break

        seen_blank = 0

        if _LIST_MARKER.match(raw):
            items.append(_LIST_MARKER.sub("", line).strip())
        elif items:
            # A continuation of the previous item, as long as it looks like
            # running text rather than a new heading.
            if _match_heading(line, REQUIRED_HEADINGS):
                break
            items[-1] = f"{items[-1]} {line}".strip()
        else:
            # Prose immediately under the heading, before any bullets. Some
            # JDs write the requirements as a paragraph.
            items.append(line)

        index += 1

    return [item for item in (i.strip(" .;") for i in items) if item], index


def extract(text: str) -> Qualifications | None:
    """Pull the qualifications section out of a job description.

    Returns `None` when the document has no such section, which is the signal
    to fall back to whole-document inference.
    """
    if not text:
        return None

    lines = text.split("\n")
    result: Qualifications | None = None

    for index, line in enumerate(lines):
        heading = _match_heading(line, REQUIRED_HEADINGS)
        if heading:
            items, _ = _collect_items(lines, index + 1)
            if items:
                result = Qualifications(heading=heading, required=items)
                break

    # The preferred list is independent - a JD can have one without the other,
    # and it is scanned across the whole document either way.
    preferred: list[str] = []
    for index, line in enumerate(lines):
        if _match_heading(line, PREFERRED_HEADINGS):
            preferred, _ = _collect_items(lines, index + 1)
            break

    if result is None:
        if not preferred:
            logger.info("No qualifications section found; using whole-JD inference")
            return None
        # Only a "nice to have" list. Weak, but better than nothing, and it is
        # still marked as preferred rather than required.
        return Qualifications(heading="Preferred qualifications", preferred=preferred)

    result.preferred = preferred
    logger.info(
        "Found %r with %d required and %d preferred items",
        result.heading, len(result.required), len(result.preferred),
    )
    return result
