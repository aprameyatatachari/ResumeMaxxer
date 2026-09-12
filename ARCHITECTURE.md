# ResumeMaxxer — Complete Reference

Everything about what this app does and how it works, written so someone new
(person or LLM) can pick it up without reading the whole codebase first.

For setup instructions see [README.md](README.md). For the original product
brief see [product.md](product.md). This document is the operational truth: where
the two disagree, this one is right, and the reasons for each divergence are
recorded below.

---

## 1. What the product does

An AI resume tailor for **Indian college students**.

A student fills a **Master Vault** once with everything they have ever done —
Class X and XII marks, their degree, internships, club roles, and projects.
Then, per application, they upload the job description the company actually
sent them (a PDF or Word file), and the app produces a one-page, ATS-friendly
PDF that selects and rewrites only the material relevant to that role.

The core promise: **the AI never invents anything.** It selects from the vault
and rewrites for the target role. Everything on the resume traces back to
something the student wrote.

### The three rules

These are enforced in code, not just requested in prompts. That distinction is
the whole design philosophy — a prompt is a suggestion, Python is a guarantee.

| Rule | Meaning | Where enforced |
|---|---|---|
| **No Fluff** | Never invent metrics, jobs, or technologies | `ai_service.enforce_no_fabrication()` mechanically strips any number in the output that appears nowhere in the student's own text |
| **One Page** | The output physically fits on one page | `ai_service.enforce_one_page()` trims to hard caps |
| **The Template** | The PDF *is* `resume-template.tex` | `latex_renderer.py` builds that exact document; Latin Modern, no font package |

---

## 2. Architecture

Four processes. They share one PostgreSQL database (NeonDB in production).

```
┌───────────────┐   cookie    ┌──────────────┐
│   frontend    │ ──────────► │ auth-server  │  Better Auth (Node + Express)
│  Vite + React │ ◄────────── │              │  :3000
│     :5173     │    JWT      └──────┬───────┘
└───────┬───────┘                    │ owns: user, session, account, jwks
        │ Bearer JWT                 │
        ▼                            ▼
┌───────────────┐            ┌──────────────┐
│    backend    │───────────►│  PostgreSQL  │  one database, two schemas
│    FastAPI    │            │   (NeonDB)   │  joined by user id
│     :8000     │            └──────────────┘
└───────┬───────┘   owns: users, educations, experiences,
        │                  projects, bullets, generated_resumes
        │ POST /convert  {latex: "..."}
        ▼
┌───────────────┐
│  latex-pdf    │  Tectonic in Docker, :2020
│  (container)  │  returns application/pdf
└───────────────┘
        │
        ▼  also called out to:
   Google Gemini API   (google-genai SDK)
   GitHub REST API     (repo import)
```

### Why auth is a separate service

Better Auth is a Node library and the API is Python, so it cannot be embedded.
The two are bridged by JWTs: the auth service issues them, FastAPI verifies
them against the JWKS endpoint. No shared secret, and no network hop per
request — the public keys are cached.

Better Auth signs with **EdDSA (Ed25519)** by default, not RS256.
`backend/auth.py` accepts EdDSA, RS256 and ES256 so changing the key type does
not break the API.

### Why the LaTeX compiler is a container

The resume is real LaTeX. Compiling it needs a TeX distribution, which is not
something to install into the API image. `pranavgnn/latex-pdf` wraps
**Tectonic** behind `POST /convert {"latex": "..."} → application/pdf`, with an
`x-api-key` header.

**Tectonic is XeTeX, not pdfLaTeX.** This matters exactly once: `\input{glyphtounicode}`
and `\pdfgentounicode=1` from the original template are pdfTeX-only primitives
and Tectonic halts on them with `Undefined control sequence`. They are omitted.
They existed to make the PDF ATS-parsable, and Tectonic already emits
extractable text — asserted in `tests/test_latex_compile.py`.

Tectonic downloads TeX packages on first use: **~110 s cold, ~1.3 s warm.** The
cache lives in a named Docker volume so this happens once.

---

## 3. Data model

`backend/models.py`. All tables are keyed by the auth service's user id.

### `users`
The API's own row, created just-in-time on the first authenticated request from
the verified JWT (which carries email and name, so no callback is needed).
Separate from Better Auth's `user` table; joined by id.

Beyond identity it holds the **resume header**: `phone`, `location`,
`linkedin_url`, `github_url`, `portfolio_url`. These are layout inputs, not
profile decoration — the template's header is `Name / phone | email | linkedin
| github`, so without them the header is nearly empty.

### `educations` — the Indian system
One table, three shapes, discriminated by `level`. Indian resumes list board
results alongside the degree because campus placement portals screen on them.

| Column | CLASS_10 | CLASS_12 | HIGHER_ED |
|---|---|---|---|
| `board` (CBSE/ICSE/STATE/IB/CAMBRIDGE/NIOS) | ✓ | ✓ | — |
| `stream` (PCMB/PCMC/PCME/PCM/PCB/Commerce/Arts) | — | ✓ | — |
| `degree` | — | — | ✓ |
| `start_month`/`end_month` | — | — | ✓ (MM-YYYY) |
| `coursework` | — | — | ✓ |
| `start_year`/`end_year` | ✓ | ✓ | ✓ |
| `score` + `score_type` (PERCENTAGE/CGPA) | ✓ | ✓ | ✓ |

Dates are separate year/month integers, not a `date`. School entries are
recorded by year alone; a `date` column would force a meaningless day onto
every row. `schemas.EducationCreate` **rejects** inapplicable combinations
rather than silently dropping them — a silently ignored `stream` looks like a
frontend bug that "sometimes doesn't save".

### `experiences`, `projects`
Jobs/internships/clubs, and projects. `experiences.location` exists because the
template right-aligns it. `projects.is_github_imported` flags AI-drafted
content so the UI can prompt review.

### `bullets` — polymorphic, deliberately
A bullet belongs to an `Experience` **or** a `Project`, via `entity_type` +
`entity_id`. SQL cannot express that as one foreign key, so:

- **Always query with both columns and `user_id`.**
- Deleting a parent must delete its bullets explicitly — no FK cascade can do
  it. `routers/vault.py` does this; there is a test.

`original_text` is the student's own words and is treated as immutable — it is
the ground truth the No Fluff rule protects. `ai_enhanced_text` is a cached
generic rewrite. The per-JD rewrite lives in `generated_resumes.resume_json`
and is never written back.

### `generated_resumes`
One snapshot per tailoring run. `resume_json` (JSONB) is the exact payload the
renderer consumes. **The PDF is never stored** — only the JSON — so a resume
redownloaded months later recompiles identically even after the vault changed.
It also means "editing the preview" is just editing this payload.

### Enums
Stored as `VARCHAR(50)`, never native PG enum types (which need `ALTER TYPE` to
add a variant). See `models.enum_column()` — and read its docstring before
touching it. A plain `String` column looks like it works but returns `str` on
load, so `row.level is Level.HIGHER_ED` is silently always `False`. The
`str, Enum` mixin makes `==` still work, which is what makes that bug invisible.

---

## 4. The tailoring engine

`backend/routers/tailor.py`. Five steps.

### Step 0 — Parse the upload
`jd_parser.extract_text()`. PDF (pypdf), DOCX (python-docx, **including
tables** — JDs routinely put requirements in one), TXT, MD. Max 5 MB.

Rejected with an explanation: legacy `.doc` (needs LibreOffice), scanned PDFs
(no extractable text), unsupported types, empty files. The response echoes back
what was actually read, because a silently bad parse produces a plausible but
generic resume — worse than an error.

### Step 0.5 — Find the stated qualifications
`jd_qualifications.extract()`. **This is the highest-signal step.**

A JD is mostly prose about the company and the team. Buried in it is a short
list of what the role is actually screened on. Inferring keywords from the
whole document dilutes that: a paragraph on culture contributes as much as the
line demanding PostgreSQL.

So the section is found **deterministically, before any AI call** — heading
matching, no model involved. A wrong answer here would silently skew every
resume, and this is cheap and reproducible.

Recognised headings include: Basic/Minimum/Required/Expected Qualifications,
Requirements, Eligibility, Who You Are, What We're Looking For, What You'll
Need, Must Have, Candidate Profile. Preferred/nice-to-have lists are captured
**separately** so they are never treated as hard requirements.

It handles what real postings look like: bullet glyphs (`- * • ‣ ● ▪`),
numbered lists (`1.` `2)` `(3)` `a.`), items that wrap across physical lines
from PDF extraction, and prose sitting directly under the heading with no
bullet at all. It stops at the next section heading. A length guard stops a
sentence like *"there are no formal requirements for this role"* opening a
section.

**When no section is found it returns `None` and everything falls back to
whole-document inference** — the previous behaviour.

### Step 1 — Extract requirements (Gemini)
`ai_service.analyse_job_description(jd_text, qualifications_block)`. Returns
`JDAnalysis`: job title, company, hard/soft skills, ATS keywords, seniority,
and **`required_keywords`** — the subset drawn from the qualifications section.
When there is no such section that list is empty.

### Step 2 — Filter the vault (pure Python, no AI)
Keyword scoring over a few dozen rows is microseconds and free, and it keeps
the step-3 prompt small, which measurably improves output quality.

Two independent weight axes, multiplied:

| | Stated requirement | Inferred keyword |
|---|---|---|
| **Tag match** | 6 | 3 |
| **Body-text match** | 2 | 1 |

Tags outrank body text because tags were assigned deliberately; a body match
can be incidental. Stated requirements outrank inferred keywords because the
former is what the role is screened on. With no qualifications section the
required set is empty and this reduces exactly to the old 3:1 scoring.

Top 30 bullets go forward. If nothing matches at all, the whole vault is used —
a generic resume beats no resume.

*Upgrade path: replace `_score_bullet` with pgvector similarity. The interface
stays the same.*

### Step 3 — Rewrite (Gemini)
`ai_service.tailor_resume()`. The vault is rendered as **plain text, not
JSON** — fewer tokens, and the model follows "only use what is listed" more
reliably against prose.

Everything the model must copy verbatim — date ranges, scores, qualification
strings — is **pre-formatted in Python**. The model never does arithmetic on
the student's dates.

When a qualifications section exists it is placed at the top of the prompt,
labelled as what to satisfy first.

### Step 4 — Guardrails, then store
`enforce_no_fabrication()` on every bullet, then `enforce_one_page()`:

| Cap | Value |
|---|---|
| Education rows | 3 (degree, Class XII, Class X) |
| Experience + projects combined | 4 |
| Bullets per entry | 4 |
| Skill categories | 4 |
| Skills per category | 12 |
| Tech stack items per project | 5 |

Experience fills before projects — paid work outranks side projects when space
runs out.

*Divergence from product.md: it says 1 education row. Three short education
rows cost less vertical space than one extra experience bullet, and Indian
recruiters screen on board marks.*

---

## 5. Rendering

`backend/latex_renderer.py` builds the `.tex` and posts it to the compiler.

The preamble is `resume-template.tex` **verbatim**, minus the two pdfTeX lines.
Every font package stays commented out, so the document uses LaTeX's default
**Latin Modern** — verified by parsing the compiled PDF's embedded fonts.

The payload types mirror the template's own commands:

| Payload type | LaTeX command | Shape |
|---|---|---|
| `ResumeEducation` | `\resumeSubheading` | institution/location, then qualification/dates |
| `ResumeExperience` | `\resumeSubheading` | **title/dates**, then organisation/location |
| `ResumeProject` | `\resumeProjectHeading` | one row: **name** \| *stack* … dates |
| `SkillCategory` | bold label + colon | one line each |

Note the slot order differs between Education and Experience. That is the
template's design, not a mistake.

There is **no summary section** — the template has none, and the AI is told not
to invent one.

`selection_rationale` rides on the payload but is **never rendered**. It is
shown in the preview so the student can sanity-check the AI's choices.

### Escaping — read this before touching it

Vault text is user input and **LaTeX is a programming language**. A bullet
containing `\input{/etc/passwd}` would be executed by the compiler. Everything
reaching the document goes through `escape()`.

The implementation uses a sentinel pass, and the reason is subtle: the three
replacements that themselves contain braces (`\textbackslash{}`,
`\textasciitilde{}`, `\textasciicircum{}`) must sit out the brace-escaping
pass, or their braces get re-escaped into `\textbackslash\{\}` — malformed
LaTeX that prints literal braces instead of a backslash.

### Editing the preview
A PDF cannot be typed into, so `ResumeEditor` edits the payload it is built
from. Change a bullet → **Update preview** → `POST /api/tailor/render`
recompiles. Stale edits are flagged so nobody downloads a PDF that does not
match the screen. **Save changes** persists via `PATCH /api/tailor/history/{id}`.

---

## 6. GitHub import

Two flavours, in `routers/github.py`:

- `GET /api/github/repos/{username}` — lists public repos so the student can
  tick the ones worth listing. No AI, no writes, instant. Forks excluded by
  default (a fork you never committed to is someone else's work). Empty repos
  filtered. Already-imported repos are **flagged, not hidden**.
- `POST /api/github/import-batch` — up to 10 at once. One Gemini call each,
  which is why it is capped.
- `POST /api/github/import` — single repo by URL, for repos under someone
  else's account.

**Partial success is deliberate**: each import is its own transaction, so one
unreadable README does not discard the others. The response always returns 201;
read `failed` for what did not land.

**SSRF matters here.** The URL is user input fed to an outbound HTTP client.
`schemas.GitHubImportRequest` pins the host to github.com, and usernames are
validated against GitHub's character rules before being interpolated into an
API path.

---

## 7. API surface

All under `/api`. Everything except `/` and `/health` requires
`Authorization: Bearer <jwt>`.

```
GET    /health                              DB probe; 503 when unreachable

GET    /api/vault                           whole vault in one call
GET    /api/vault/me                        profile (JIT-provisions the row)
PATCH  /api/vault/me                        resume contact details

POST   /api/vault/education                 CRUD, per-level validation
GET    /api/vault/education
PATCH  /api/vault/education/{id}
DELETE /api/vault/education/{id}
          … same shape for /experience, /project, /bullet

GET    /api/github/repos/{username}          list public repos
POST   /api/github/import-batch              import up to 10
POST   /api/github/import                    import one by URL

POST   /api/tailor                           multipart: file + optional job_title
POST   /api/tailor/render                    payload -> PDF (the editable preview)
GET    /api/tailor/history                   summaries, no payload
GET    /api/tailor/history/{id}              full stored payload
GET    /api/tailor/history/{id}/pdf          recompile a stored resume
PATCH  /api/tailor/history/{id}              save edits
DELETE /api/tailor/history/{id}
```

**Ownership is checked on every single-row fetch**, and returns **404, not
403** — a 403 would confirm the row exists.

Interactive docs at `/docs` (hidden when `ENVIRONMENT=production`).

---

## 8. Frontend

Vite + React + TypeScript + Tailwind v4. No auth provider wrapper — Better
Auth's React client is a store, so `useSession()` works anywhere.

| Route | Guard | Purpose |
|---|---|---|
| `/` | public | landing |
| `/sign-in`, `/sign-up` | public | own pages (no prebuilt widget) |
| `/vault` | auth | contact details, education, experience, projects |
| `/tailor` | auth | upload a JD, preview, edit, download |
| `/history` | auth | past resumes, recompile |
| `/pdf-sandbox` | auth, **dev only** | renders a worst-case fixture — iterate on layout without a Gemini call. Tree-shaken from production builds |

Things worth knowing before editing:

- **`ProtectedRoute` is a UX guard, not security.** Enforcement is the JWT
  check on every endpoint.
- **`useVault`'s `loading` means "first load"**, not "a request is in flight".
  Flipping it on every refetch unmounted the whole page after any write,
  destroying save confirmations and open forms.
- **The JWT is cached** in `lib/auth-client.ts` until shortly before expiry,
  with concurrent callers sharing one in-flight request. `clearAuthToken()` on
  sign-out, or the next user in that tab reuses the token.
- **After sign-in/sign-up, `await refetch()` before navigating.** Otherwise
  `ProtectedRoute` reads a stale store and bounces the user back to sign-in
  while the header shows them signed in.
- **`tsconfig` enables `erasableSyntaxOnly`** — no constructor parameter
  properties, no enums.
- **FormData must not get an explicit `Content-Type`** or the multipart
  boundary is lost.

---

## 9. Testing

| Suite | Count | Runtime | Needs |
|---|---|---|---|
| `backend/tests` (pytest) | ~175 | ~12 s | nothing — in-memory SQLite, Gemini and GitHub mocked |
| `frontend/src/**.test.ts` (vitest) | 15 | ~18 s | nothing |
| `e2e/` (Playwright) | 17 | ~90 s | all services + PostgreSQL + LaTeX container |

Backend coverage **92%**, floor of 90% enforced in `.coveragerc`.

**Gemini is never called in tests.** Non-deterministic and costs money; covered
by mocks instead. No API key is needed to run anything.

`tests/test_latex_compile.py` compiles for real and parses the result with
pypdf — one page at the worst case, Latin Modern embedded, text extractable,
special characters surviving. It **skips** when the LaTeX service is down, so
`pytest` works without Docker; CI always has it.

```bash
cd backend && .venv/Scripts/python.exe -m pytest      # or pytest
cd frontend && npm test
cd e2e && npm test          # needs the stack running
```

---

## 10. CI

`.github/workflows/ci.yml`. `backend`, `frontend` and `auth-server` run in
parallel; `e2e` runs behind them with `postgres:16` and the LaTeX compiler as
service containers. A single aggregating `ci` job gives branch protection one
stable check to require.

CI warms the Tectonic cache through the real renderer before the suite —
otherwise the first compile inside a test would blow the timeout.

---

## 11. Landmines

Things that have already caused a bug here. Each cost real debugging time.

1. **No `from __future__ import annotations` in `models.py`.** It stringifies
   annotations, and SQLModel then hands SQLAlchemy the literal text
   `list['Education']`, which it cannot resolve. Mappers configure lazily, so
   the app starts fine and fails on the first ORM query.

2. **`session.exec(select(OneColumn))` yields scalars, not row tuples.**
   `for (url,) in ...` raises *"too many values to unpack"*.

3. **Enum columns must use `models.enum_column()`.** A plain `String` returns
   `str` on load, so `is` comparisons are silently always `False`.

4. **`create_all` never ALTERs.** After a model change, run
   `backend/dev_reset_db.py` (destructive, dev only). Adopt Alembic before real
   users.

5. **TLS is conditional on host.** Neon requires it; a local PostgreSQL rejects
   the connection outright with *"server does not support SSL connections"*.

6. **Tailwind v4 cannot `@apply` a class defined in the same layer.**

7. **`.gitattributes` forces LF.** Files committed from Windows with CRLF break
   the inline `run:` blocks on Ubuntu runners.

8. **`start.bat` uses `enabledelayedexpansion`**, which makes `!` a
   metacharacter — `[!]` in an `echo` prints as `[]`.

9. **Closing a service window does not kill what it started.** `npm run dev`
   and `npm run start` spawn a child that can outlive the console and keep its
   port. Use `stop.bat`; `start.bat` also offers to clear leftovers.

10. **Do not use `timeout /t` in a batch script here.** `timeout.exe` refuses
    to run when stdin is not a real console (*"Input redirection is not
    supported"*), and a coreutils `timeout` on PATH shadows it anyway. Use
    `"%SystemRoot%\System32\ping.exe" -n <sec+1> 127.0.0.1 >nul`.

11. **Run `backend/migrate.py` on every deploy that changes a model.**
    `create_all` never adds a column to a table that already exists. This has
    broken the app twice: once as `column users.phone does not exist`, and
    again while adding the quota columns, where a clean-looking deploy 500ed
    every authenticated endpoint. `migrate.py` now handles additive columns and
    verifies the result, but it only helps if it is actually run.

12. **`BETTER_AUTH_URL` must resolve identically in both services.** It is the
    JWT `iss` *and* `aud`, and both are verified. The precedence is duplicated
    in `auth-server/src/auth.ts` (`resolveBaseUrl`) and `backend/auth.py`
    (`_resolve_auth_url`) because the two cannot share code. A mismatch does
    not fail loudly - it 401s every authenticated request, which reads as a
    broken login rather than a config error.

13. **Never add a `USER` directive to `latex/Dockerfile.vercel`.** The warm-up
    compile caches into `$HOME/.cache/Tectonic` as root, and the running
    service reads it from there. A different user at runtime silently reverts
    cold starts to ~110s while everything still appears to work.

14. **The JD upload cap must stay under 4.5 MB.** Vercel rejects a larger body
    before the app sees it, with a bare platform 413 instead of the message
    that tells a student their file is a scan.

---

## 12. The free allowance and bring-your-own-key

Gemini costs money per call and tailoring makes two of them. This is an app for
Indian college students: the ones who need it most can pay least, and the
person building it cannot absorb thousands of runs either.

So the cost model has two tiers:

| | Who pays | Limit |
|---|---|---|
| Free | the app's `GEMINI_API_KEY` | `quota.FREE_RUNS_PER_WEEK` (3) per student per week |
| Own key | the student's Gemini free tier | unlimited |

### Weekly, and reset without a scheduler

`users.free_runs_used` holds the count and `users.free_runs_week` holds the
**Monday of the week it belongs to**. A stored week earlier than the current
one means the count is stale, and stale reads as zero.

That is the whole reset mechanism. No cron, no background worker, nothing
happens at midnight on Monday — so nothing can fail to happen at midnight on
Monday, and the arithmetic is still right if the app was down all week.

Weekly rather than lifetime because job hunting is bursty: a student applying
to six companies in placement week needs more than three that week and none the
next month. A lifetime cap of twenty is spent in a fortnight and then the app
is dead to them.

Monday in **UTC**. Indian students are UTC+5:30, so their week turns over at
05:30 local. A single global instant is unambiguous and matches what the API
reports, and "resets Monday morning" is true either way.

### The allowance is charged AFTER the work succeeds

`quota.check()` runs before anything expensive, so an out-of-quota student is
turned away in milliseconds rather than after an upload and two Gemini calls.
`quota.consume()` runs only once the resume is stored.

That ordering is deliberate and it is the important part. With three runs a
week, charging for a run that died on a Gemini timeout costs the student a
third of their week for our failure. The cost of the ordering is the opposite
race — two simultaneous requests can both pass the check and both succeed,
yielding a fourth run — which is a far better failure than billing for work
that was never delivered.

### The key never touches the server's disk

The student's key lives in their browser (`frontend/src/lib/gemini-key.ts`,
`localStorage`) and travels on each request as `X-Gemini-Api-Key`. The server
uses it for that call and forgets it. No column, no encryption key to manage,
no table worth stealing.

The key *has* to reach the server — Gemini is called server-side — but keeping
a copy at rest is avoidable, so it is avoided. What the student trades is
per-device convenience: they paste it again on their phone.

Rules that hold this together:

- **The key is never logged.** `ai_service._redact()` strips it from any SDK
  exception text before it reaches a log line or an error message, and nothing
  else writes it anywhere. Verified against real logs: zero occurrences.
- **The key is never returned.** The API reports *whether* a key was used
  (`QuotaStatus.using_own_key`), never its value. The UI shows only
  `AIza…last4`.
- **A rejected key is a 400, not a 502.** `InvalidApiKeyError` exists so a
  student whose key is wrong is told to fix their key, instead of being told
  the service is down and to retry — which would never work.

### Where the header goes

`X-Gemini-Api-Key` must appear in three places or the feature silently half
works:

1. `backend/gemini_key.py` — `HEADER_NAME`, and the FastAPI dependency
2. `backend/main.py` — the CORS `allow_headers` list, or the browser preflight
   rejects it in local development
3. `frontend/src/lib/api.ts` — `keyHeader()`, read **per request** rather than
   captured when the client is built, because `useApi()` memoises one client
   for the whole session and a key saved after mount would never be seen

GitHub import honours the key when present but is **not** charged against the
allowance — see §15.

---

## 13. Deployment

One Vercel project, four services, one domain, routed by path:

```
/api/auth/*  ->  auth-server/     (Express, zero-config)
/api/*       ->  backend/         (FastAPI, entrypoint main:app)
/*           ->  frontend/        (Vite static build)
internal     ->  latex/           (container, service binding, no public route)
```

Same-origin is load-bearing, not cosmetic: it keeps the Better Auth session
cookie first-party, which Safari already requires, and it makes every CORS rule
in the codebase redundant in production.

The LaTeX container has no persistent volume on Vercel and scales to zero after
five minutes, so Tectonic's package cache is **baked into the image at build
time** by `latex/Dockerfile.vercel`. Measured: a cold container compiles an
unseen document in 1.01s instead of ~110s.

`DEPLOYMENT.md` has the full setup, the measured limits, and the reasoning
`vercel.json` cannot carry because JSON has no comments.

---

## 14. Deliberate divergences from `product.md`

| product.md | Reality | Why |
|---|---|---|
| Clerk for auth | Better Auth, self-hosted | No third-party dependency or per-seat cost |
| `google-generativeai` SDK | `google-genai` | The former is retired upstream |
| `@react-pdf/renderer` in the browser | LaTeX compiled by Tectonic | The template is a fixed requirement; the React version only approximated it |
| Paste the JD as text | Upload PDF/DOCX | That is how companies actually send them |
| 1 education block | 3 | Indian resumes list board results |
| Paste repo URLs one by one | Username → tick-list → batch | Faster for the common case |

---

## 15. Known gaps

- **No Alembic.** `backend/migrate.py` covers the additive cases - new tables,
  new columns - and refuses anything destructive. Dropping, renaming or
  retyping a column still needs a hand-written migration, and there is no
  version history or down-migration. That is the remaining gap.
- **`/api/github/import-batch` is not rate limited** and spends one Gemini
  call per repo. `/api/tailor` is now bounded by the weekly free allowance
  (§12), but importing is deliberately not, because a student has to build a
  vault before tailoring is worth anything - gating the first step would mean
  hitting a wall before seeing the app work. A student who has added their own
  key runs imports on it, but a free user's imports still spend the app's key.
  Worth a cap if it is ever abused.
- **Email verification is off** in `auth-server/src/auth.ts`, to keep the MVP
  loop short.
- **`dev_reset_db.py` still exists** and would destroy real users' vaults.
  Delete it before launch.
- **Frontend types are hand-maintained** and can drift from `schemas.py`.
  Generate them if the API starts moving:
  `npx openapi-typescript http://localhost:8000/openapi.json`
- **The tailoring endpoint is synchronous** — two sequential Gemini calls plus
  a LaTeX compile, several seconds. A job queue would be better under load.
