"""
The Docker warm-up document stays in step with the renderer.

`latex/Dockerfile.vercel` compiles `latex/warmup.tex` at build time so
Tectonic's package cache ships inside the image. On Vercel there is no
persistent volume and the container scales to zero, so that baked cache is the
only thing standing between a student and a ~110 second cold compile.

The warm-up only pulls the right packages if it uses the same preamble a real
resume uses. Nothing at runtime would notice if it drifted - the image would
build, the service would start, and the first request of every cold start would
quietly pay to download whatever the preamble gained. So the check lives here.

If this fails, run:

    cd backend && python generate_latex_warmup.py
"""

from __future__ import annotations

from pathlib import Path

import pytest

import generate_latex_warmup
import latex_renderer

WARMUP = Path(__file__).resolve().parent.parent.parent / "latex" / "warmup.tex"


def test_the_warmup_file_exists():
    assert WARMUP.is_file(), (
        f"{WARMUP} is missing. The Docker build copies it, so the image would "
        "fail to build. Run `python generate_latex_warmup.py`."
    )


def test_the_warmup_matches_what_the_renderer_produces():
    """The drift guard.

    Compared with newlines normalised: the committed file is LF (enforced by
    .gitattributes, because Tectonic reads it inside a Linux container) while
    the renderer's output takes whatever the running platform uses.
    """
    committed = WARMUP.read_text(encoding="utf-8").replace("\r\n", "\n")
    expected = generate_latex_warmup.build().replace("\r\n", "\n")

    assert committed == expected, (
        "latex/warmup.tex is out of date with latex_renderer. Regenerate it:\n"
        "    cd backend && python generate_latex_warmup.py\n"
        "Otherwise the Vercel image bakes a cache for the wrong document and "
        "every cold start re-downloads the TeX tree."
    )


def test_the_warmup_carries_the_whole_preamble():
    """A warm-up missing a \\usepackage line leaves that package to be
    downloaded at runtime, which is the exact cost this is meant to avoid."""
    committed = WARMUP.read_text(encoding="utf-8")

    packages = [
        line for line in latex_renderer.PREAMBLE.splitlines()
        if line.strip().startswith("\\usepackage")
    ]
    assert packages, "no \\usepackage lines found - has the preamble moved?"

    for package in packages:
        assert package in committed, f"warmup.tex is missing: {package}"


@pytest.mark.parametrize(
    "section",
    ["\\section{Education}", "\\section{Experience}", "\\section{Projects}",
     "\\section{Technical Skills}"],
)
def test_the_warmup_exercises_every_section(section):
    """An empty section renders to nothing, so a warm-up that skipped one would
    never touch the commands that section uses."""
    assert section in WARMUP.read_text(encoding="utf-8")


def test_the_warmup_exercises_the_escaper():
    r"""The awkward characters are in the fixture on purpose: if escaping ever
    emits invalid TeX, the Docker build fails rather than a student's resume."""
    committed = WARMUP.read_text(encoding="utf-8")

    for escaped in (r"\&", r"\%", r"\_", r"\#", r"\$",
                    r"\textasciitilde{}", r"\textasciicircum{}",
                    r"\textbackslash{}"):
        assert escaped in committed, f"warmup.tex no longer exercises {escaped}"


def test_the_warmup_omits_the_pdftex_only_lines():
    """Tectonic halts on these. They are stripped from the preamble, and a
    warm-up carrying them would fail the image build.

    Only ACTIVE lines are checked. The preamble carries a comment explaining
    why the two primitives are absent, and that comment naturally contains
    their names - a plain substring search would match its own documentation.
    """
    active = [
        line for line in WARMUP.read_text(encoding="utf-8").splitlines()
        if not line.lstrip().startswith("%")
    ]

    for primitive in ("\\input{glyphtounicode}", "\\pdfgentounicode"):
        offenders = [line for line in active if primitive in line]
        assert not offenders, f"{primitive} is active in warmup.tex: {offenders}"
