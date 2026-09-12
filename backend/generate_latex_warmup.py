"""
generate_latex_warmup.py
========================
Regenerates `latex/warmup.tex`, the document compiled at Docker build time to
bake Tectonic's package cache into the image layer.

Why this exists
---------------
Locally, `docker-compose.yml` gives the LaTeX container a named volume for
`/root/.cache/Tectonic`. Tectonic downloads the TeX packages it needs on first
use, so that volume is the difference between a ~110s first compile and a
~1.3s one.

On Vercel the container runs as a Function: no persistent volume, and it scales
to zero after five minutes of idle. Every cold start would pay the download
again. So the cache is warmed at *build* time instead - `latex/Dockerfile.vercel`
compiles this document, and the packages it pulls end up in the image.

For that to work the warm-up has to pull exactly the packages a real resume
pulls. Rather than hand-maintaining a second copy of the preamble - which would
silently drift the moment someone edits `latex_renderer.PREAMBLE` - the warm-up
IS a real resume, rendered by the real renderer from the fixture below.

    python generate_latex_warmup.py        # rewrite latex/warmup.tex

`tests/test_latex_warmup.py` fails if the committed file is out of date, so a
preamble change cannot ship without a matching warm-up.
"""

from __future__ import annotations

from pathlib import Path

import latex_renderer
from schemas import (
    ResumeEducation,
    ResumeExperience,
    ResumeHeader,
    ResumePayload,
    ResumeProject,
    SkillCategory,
)

# Where the Dockerfile expects to find it.
WARMUP_PATH = Path(__file__).resolve().parent.parent / "latex" / "warmup.tex"

# Every section populated, because an empty section renders to nothing and
# would leave its packages un-exercised. The content is deliberately dull; only
# the LaTeX commands it triggers matter.
#
# `&`, `%`, `_`, `#`, `$`, `~`, `^` and a backslash are in here on purpose:
# they force the escaping path in `latex_renderer.escape`, so a warm-up that
# compiles proves the escaper emits valid TeX.
FIXTURE = ResumePayload(
    header=ResumeHeader(
        full_name="Warmup Build",
        phone="+91 00000 00000",
        email="warmup@example.com",
        linkedin="linkedin.com/in/warmup",
        github="github.com/warmup",
        portfolio="warmup.example.com",
    ),
    education=[
        ResumeEducation(
            institution="Warm-up Institute of Technology",
            location="Bengaluru, Karnataka",
            qualification="B.E. Computer Science",
            score="CGPA: 9.0/10",
            date_range="Aug. 2022 - May 2026",
        ),
        ResumeEducation(
            institution="Warm-up Senior Secondary School",
            location="Chennai, Tamil Nadu",
            qualification="CBSE - Class XII (PCMB)",
            score="Percentage: 95%",
            date_range="2020 - 2022",
        ),
    ],
    experience=[
        ResumeExperience(
            title="Software Engineering Intern",
            date_range="May 2025 - July 2025",
            organization="Warm-up Systems",
            location="Remote",
            bullets=[
                "Built a caching layer in Python & FastAPI, cutting p99 latency",
                "Automated 100% of the release checklist with a CI/CD pipeline",
            ],
        ),
    ],
    projects=[
        ResumeProject(
            name="Cache Warmer",
            tech_stack="Python, FastAPI, PostgreSQL, Docker, Redis",
            date_range="Jan. 2025",
            bullets=[
                r"Escaped the awkward set: & % _ # $ ~ ^ \ in one bullet",
                "Shipped a scheduler that survives a cold start",
            ],
        ),
    ],
    skills=[
        SkillCategory(category="Languages", items="Python, TypeScript, SQL"),
        SkillCategory(category="Developer Tools", items="Docker, Git, Vercel"),
    ],
    selection_rationale="Not rendered - the template has no such section.",
)


def build() -> str:
    """The warm-up document, as the renderer would produce it."""
    return latex_renderer.render_latex(FIXTURE)


def main() -> None:
    WARMUP_PATH.parent.mkdir(parents=True, exist_ok=True)
    # newline="\n" matters: the file is read by Tectonic inside a Linux
    # container, and .gitattributes keeps it LF in the repo.
    WARMUP_PATH.write_text(build(), encoding="utf-8", newline="\n")
    print(f"Wrote {WARMUP_PATH} ({len(build())} bytes)")


if __name__ == "__main__":
    main()
