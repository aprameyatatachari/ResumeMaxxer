"""
latex_renderer.py
=================
Turns a `ResumePayload` into LaTeX and compiles it to a PDF.

This replaces the previous browser-side @react-pdf/renderer approach. That was
an approximation of `resume-template.tex`; this *is* the template, so the
output is the real thing - Latin Modern with genuine small caps, real
`\\titlerule` section rules, and LaTeX's own spacing and justification.

The preamble below is `resume-template.tex` verbatim, with two lines removed:

    \\input{glyphtounicode}
    \\pdfgentounicode=1

Both are pdfTeX-only primitives. The compiler behind the API is Tectonic
(XeTeX), which fails on them with "glyphtounicode:7: Undefined control
sequence". They existed to make the PDF machine-readable for ATS parsers, and
Tectonic already emits Unicode-mapped, extractable text - verified: a compiled
resume yields ~2700 characters of clean extracted text.

No font package is enabled, exactly as in the template, so the document uses
LaTeX's default Latin Modern.

Security
--------
Every value that reaches the document goes through `escape()`. Vault text is
user-controlled, and unescaped LaTeX is code: a bullet containing
`\\input{/etc/passwd}` would otherwise be executed by the compiler.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Optional

import httpx

from schemas import ResumePayload

logger = logging.getLogger("resumemaxxer.latex")

LATEX_API_URL: str = os.getenv("LATEX_API_URL", "http://localhost:2020").rstrip("/")
LATEX_API_KEY: str = os.getenv("LATEX_API_KEY", "resumemaxxer-local-dev")

# A cold compile downloads TeX packages and can take ~2 minutes; a warm one is
# about a second. The generous ceiling only matters on a fresh container.
COMPILE_TIMEOUT_SECONDS = 180.0

# Cap on the technologies shown after a project name. More than this wraps onto
# a second line and turns the heading into noise.
MAX_TECH_STACK_ITEMS = 5


class LatexRenderError(RuntimeError):
    """The document could not be built or compiled.

    Routers map this to HTTP 502 - it is a downstream service failure, not a
    bad request from the student.
    """


# ---------------------------------------------------------------------------
# Escaping
# ---------------------------------------------------------------------------
# Characters whose replacement is a plain escape. Safe in any order once the
# sentinel pass below has removed the literal backslashes.
_ESCAPES = [
    ("&", r"\&"),
    ("%", r"\%"),
    ("$", r"\$"),
    ("#", r"\#"),
    ("_", r"\_"),
    ("{", r"\{"),
    ("}", r"\}"),
]

# The three replacements that themselves contain braces must sit out the brace
# pass, or `\textbackslash{}` comes back as `\textbackslash\{\}` - malformed
# LaTeX that prints literal braces instead of a backslash. Each is parked under
# a sentinel first and restored afterwards.
#
# The sentinels are private-use codepoints, so they cannot collide with
# anything a student could actually type.
_SENTINELS = [
    ("\\", "\ue000", r"\textbackslash{}"),
    ("~", "\ue001", r"\textasciitilde{}"),
    ("^", "\ue002", r"\textasciicircum{}"),
]


def escape(text: Optional[str]) -> str:
    """Make arbitrary user text safe to place in a LaTeX document."""
    if not text:
        return ""

    out = str(text)

    # 1. Park the replacements that contain braces.
    for char, sentinel, _ in _SENTINELS:
        out = out.replace(char, sentinel)

    # 2. Escape everything else, braces included.
    for char, replacement in _ESCAPES:
        out = out.replace(char, replacement)

    # 3. Restore, now that no further brace escaping will run.
    for _, sentinel, replacement in _SENTINELS:
        out = out.replace(sentinel, replacement)

    # Smart punctuation that students paste in from Word. Latin Modern has
    # these glyphs, but the raw bytes confuse some ATS text extractors.
    out = (
        out.replace("\u2019", "'")
        .replace("\u2018", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2013", "--")
        .replace("\u2014", "---")
        .replace("\u2026", "...")
    )
    return out.strip()


# ---------------------------------------------------------------------------
# Link handling
# ---------------------------------------------------------------------------
_SCHEME = re.compile(r"^https?://", re.I)


def _split_link(value: str, host: str) -> tuple[str, str]:
    """Return `(display, href)` for a profile link.

    Students type these inconsistently - "ananyak", "github.com/ananyak", or
    the full "https://github.com/ananyak". All three should render the same
    way, so the value is reduced to a handle and rebuilt against `host`.
    """
    cleaned = (value or "").strip().rstrip("/")
    if not cleaned:
        return "", ""

    cleaned = _SCHEME.sub("", cleaned)
    cleaned = re.sub(r"^www\.", "", cleaned, flags=re.I)

    # Strip the host (and, for LinkedIn, its /in/ prefix) if it was included.
    lowered = cleaned.lower()
    if lowered.startswith(host.lower()):
        cleaned = cleaned[len(host) :].lstrip("/")
        if host == "linkedin.com" and cleaned.lower().startswith("in/"):
            cleaned = cleaned[3:]

    if not cleaned:
        return "", ""

    display = f"{host}/in/{cleaned}" if host == "linkedin.com" else f"{host}/{cleaned}"
    return display, f"https://{display}"


def _portfolio_link(value: str) -> tuple[str, str]:
    cleaned = (value or "").strip().rstrip("/")
    if not cleaned:
        return "", ""
    display = _SCHEME.sub("", cleaned)
    href = cleaned if _SCHEME.match(cleaned) else f"https://{cleaned}"
    return display, href


def _href(display: str, href: str) -> str:
    """`\\href{...}{\\underline{...}}`, matching the template's contact line."""
    return f"\\href{{{href}}}{{\\underline{{{escape(display)}}}}}"


def trim_tech_stack(tech_stack: str) -> str:
    """Keep the first few technologies, comma-and-space separated.

    Two fixes in one: an imported repo often lists a dozen technologies, which
    wraps the project heading onto a second line; and values arrive
    comma-separated with no space after the comma, which reads as one run-on
    token.
    """
    items = [item.strip() for item in (tech_stack or "").split(",") if item.strip()]
    return ", ".join(items[:MAX_TECH_STACK_ITEMS])


# ---------------------------------------------------------------------------
# Preamble - resume-template.tex verbatim, less the two pdfTeX-only lines
# ---------------------------------------------------------------------------
PREAMBLE = r"""%-------------------------
% Resume in Latex
% Author : Jake Gutierrez
% Based off of: https://github.com/sb2nov/resume
% License : MIT
%------------------------

\documentclass[letterpaper,11pt]{article}

\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}

% NOTE: \input{glyphtounicode} and \pdfgentounicode=1 from the original
% template are omitted. They are pdfTeX primitives and the compiler here is
% Tectonic (XeTeX), which halts on them. Tectonic already produces
% text-extractable, ATS-parsable output.

%----------FONT OPTIONS----------
% Deliberately all commented out, as in the template: the document uses
% LaTeX's default Latin Modern.
% sans-serif
% \usepackage[sfdefault]{FiraSans}
% \usepackage[sfdefault]{roboto}
% \usepackage[sfdefault]{noto-sans}
% \usepackage[default]{sourcesanspro}

% serif
% \usepackage{CormorantGaramond}
% \usepackage{charter}

\pagestyle{fancy}
\fancyhf{} % clear all header and footer fields
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

% Adjust margins
\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}

\urlstyle{same}

\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

% Sections formatting
\titleformat{\section}{
  \vspace{-4pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

%-------------------------
% Custom commands
\newcommand{\resumeItem}[1]{
  \item\small{
    {#1 \vspace{-2pt}}
  }
}

\newcommand{\resumeSubheading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & #2 \\
      \textit{\small#3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubSubheading}[2]{
    \item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \textit{\small#1} & \textit{\small #2} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeProjectHeading}[2]{
    \item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \small#1 & #2 \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubItem}[1]{\resumeItem{#1}\vspace{-4pt}}

\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}

%-------------------------------------------
%%%%%%  RESUME STARTS HERE  %%%%%%%%%%%%%%%%%%%%%%%%%%%%

\begin{document}
"""


# ---------------------------------------------------------------------------
# Document body
# ---------------------------------------------------------------------------
def _render_header(payload: ResumePayload) -> str:
    """The centred name and the pipe-separated contact line.

    `\\\\ \\vspace{1pt}` after the name is what puts a gap between it and the
    contact line - the previous renderer had them touching.
    """
    header = payload.header
    parts: list[str] = []

    if header.phone:
        parts.append(escape(header.phone))
    if header.email:
        parts.append(_href(header.email, f"mailto:{header.email}"))

    for value, host in (
        (header.linkedin, "linkedin.com"),
        (header.github, "github.com"),
    ):
        display, href = _split_link(value, host)
        if display:
            parts.append(_href(display, href))

    display, href = _portfolio_link(header.portfolio)
    if display:
        parts.append(_href(display, href))

    contact = " $|$\n    ".join(parts)

    return (
        "\n\\begin{center}\n"
        f"    \\textbf{{\\Huge \\scshape {escape(header.full_name)}}} \\\\ \\vspace{{1pt}}\n"
        f"    \\small {contact}\n"
        "\\end{center}\n"
    )


def _render_education(payload: ResumePayload) -> str:
    if not payload.education:
        return ""

    lines = ["\n%-----------EDUCATION-----------", "\\section{Education}",
             "  \\resumeSubHeadingListStart"]
    for item in payload.education:
        # The template has no slot for a score, so it rides on the italic
        # qualification line - the only place it fits without inventing
        # structure the template does not have.
        qualification = escape(item.qualification)
        if item.score:
            qualification = f"{qualification}, {escape(item.score)}"
        lines.append("    \\resumeSubheading")
        lines.append(
            f"      {{{escape(item.institution)}}}{{{escape(item.location)}}}"
        )
        lines.append(f"      {{{qualification}}}{{{escape(item.date_range)}}}")
    lines.append("  \\resumeSubHeadingListEnd\n")
    return "\n".join(lines)


def _render_bullets(bullets: list[str]) -> list[str]:
    if not bullets:
        return []
    lines = ["      \\resumeItemListStart"]
    lines += [f"        \\resumeItem{{{escape(b)}}}" for b in bullets if b.strip()]
    lines.append("      \\resumeItemListEnd")
    return lines


def _render_experience(payload: ResumePayload) -> str:
    if not payload.experience:
        return ""

    lines = ["\n%-----------EXPERIENCE-----------", "\\section{Experience}",
             "  \\resumeSubHeadingListStart"]
    for entry in payload.experience:
        # Note the slot order differs from Education: title and dates on the
        # first row, organisation and location on the second.
        lines.append("    \\resumeSubheading")
        lines.append(f"      {{{escape(entry.title)}}}{{{escape(entry.date_range)}}}")
        lines.append(
            f"      {{{escape(entry.organization)}}}{{{escape(entry.location)}}}"
        )
        lines += _render_bullets(entry.bullets)
    lines.append("  \\resumeSubHeadingListEnd\n")
    return "\n".join(lines)


def _render_projects(payload: ResumePayload) -> str:
    if not payload.projects:
        return ""

    lines = ["\n%-----------PROJECTS-----------", "\\section{Projects}",
             "    \\resumeSubHeadingListStart"]
    for entry in payload.projects:
        stack = trim_tech_stack(entry.tech_stack)
        heading = f"\\textbf{{{escape(entry.name)}}}"
        if stack:
            heading += f" $|$ \\emph{{{escape(stack)}}}"
        lines.append("      \\resumeProjectHeading")
        lines.append(f"          {{{heading}}}{{{escape(entry.date_range)}}}")
        lines += _render_bullets(entry.bullets)
    lines.append("    \\resumeSubHeadingListEnd\n")
    return "\n".join(lines)


def _render_skills(payload: ResumePayload) -> str:
    if not payload.skills:
        return ""

    rows = []
    for group in payload.skills:
        rows.append(
            f"     \\textbf{{{escape(group.category)}}}{{: {escape(group.items)}}}"
        )
    # `\\` between rows, none after the last.
    body = " \\\\\n".join(rows)

    return (
        "\n%-----------PROGRAMMING SKILLS-----------\n"
        "\\section{Technical Skills}\n"
        " \\begin{itemize}[leftmargin=0.15in, label={}]\n"
        "    \\small{\\item{\n"
        f"{body}\n"
        "    }}\n"
        " \\end{itemize}\n"
    )


def render_latex(payload: ResumePayload) -> str:
    """Build the complete .tex document for one resume."""
    return (
        PREAMBLE
        + _render_header(payload)
        + _render_education(payload)
        + _render_experience(payload)
        + _render_projects(payload)
        + _render_skills(payload)
        + "\n%-------------------------------------------\n\\end{document}\n"
    )


# ---------------------------------------------------------------------------
# Compilation
# ---------------------------------------------------------------------------
def compile_pdf(latex: str) -> bytes:
    """Compile LaTeX to PDF bytes via the latex-pdf service.

    Raises `LatexRenderError` with a message written for the student, since it
    is surfaced in the UI.
    """
    try:
        response = httpx.post(
            f"{LATEX_API_URL}/convert",
            json={"latex": latex},
            headers={"x-api-key": LATEX_API_KEY},
            timeout=COMPILE_TIMEOUT_SECONDS,
        )
    except httpx.RequestError as exc:
        logger.exception("Could not reach the LaTeX service at %s", LATEX_API_URL)
        raise LatexRenderError(
            "The PDF service is not running. Start it with "
            "`docker compose up -d` and try again."
        ) from exc

    if response.status_code == 401:
        raise LatexRenderError(
            "The PDF service rejected our API key. LATEX_API_KEY in "
            "backend/.env must match API_KEY in docker-compose.yml."
        )
    if response.status_code != 200:
        # The service returns a generic message; the specific TeX error is in
        # its own container logs (`docker compose logs latex-pdf`).
        logger.error(
            "LaTeX compile failed: %s %s", response.status_code, response.text[:500]
        )
        raise LatexRenderError(
            "The resume could not be compiled. If you have unusual characters "
            "in your vault, try simplifying them."
        )

    pdf = response.content
    if not pdf.startswith(b"%PDF-"):
        raise LatexRenderError("The PDF service returned something that is not a PDF.")

    return pdf


def render_pdf(payload: ResumePayload) -> bytes:
    """Convenience: payload straight to PDF bytes."""
    return compile_pdf(render_latex(payload))
