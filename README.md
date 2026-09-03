# ResumeMaxxer

Built for Indian college students. Keep one Master Vault of everything you have
done, upload the job description a company sent you, and Gemini selects and
rewrites the relevant parts into a one-page, ATS-friendly PDF rendered in the
browser.

The PDF is a faithful reproduction of [resume-template.tex](resume-template.tex)
(Jake Gutierrez's template, based on sb2nov) - the layout is a fixed
requirement, not a design choice.

See [product.md](product.md) for the full product spec.

```
auth-server/  Better Auth (Node + Express)     :3000
backend/      FastAPI + SQLModel + Gemini      :8000
frontend/     Vite + React + TS + Tailwind     :5173
```

All three share one NeonDB instance. Start everything at once on Windows:

```bash
start.bat
```

It checks the config files and dependencies first, then opens each service in
its own window.

### Why auth is a separate service

Better Auth is a Node library, so it cannot run inside a Python API. It runs on
its own and the two are bridged by JWTs:

```
browser --cookie--> auth-server --JWT--> browser --Bearer--> FastAPI
                                                                 |
                                    verified against JWKS <------+
```

FastAPI caches the auth service's public keys and verifies every request
locally, so there is no per-request hop and no shared secret. Better Auth signs
with EdDSA (Ed25519) by default; `backend/auth.py` accepts that plus RS256.

---

## External services you need

Four accounts. All have free tiers that cover development. Budget about 15
minutes total.

### 1. NeonDB — serverless PostgreSQL

1. Sign up at <https://neon.tech> (GitHub login works).
2. **Create a project.** Any name. Pick the region closest to you — this is
   the single biggest factor in local API latency.
3. On the project dashboard, open **Connection string** and copy it. It looks
   like:
   ```
   postgresql://neondb_owner:npg_XXXX@ep-cool-name-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. Prefer the **Pooled connection** toggle (host contains `-pooler`). Serverless
   Postgres runs out of direct connections quickly.
5. Paste it into `backend/.env` as `DATABASE_URL`.

Tables are created automatically on first backend start. Nothing to run by hand.

> Neon suspends idle compute after ~5 minutes on the free plan. The first
> request after a quiet period takes a second or two while it wakes. This is
> normal, and `/health` will report `degraded` if it cannot connect at all.

### 2. Google Gemini — the AI engine

1. Go to <https://aistudio.google.com/apikey>.
2. **Create API key**, pick a Google Cloud project (or let it make one).
3. Copy the key into `backend/.env` as `GEMINI_API_KEY`.

The SDK is `google-genai`, Google's current one. (product.md names
`google-generativeai`; that package is retired and prints a deprecation notice
on import, so the backend uses the successor instead.)

The default model is `gemini-2.0-flash`, set via `GEMINI_MODEL`. Flash is the
right call here: the tailoring prompt is extraction and rewriting, not open
creative work, and it is markedly cheaper and faster than Pro.

> No billing account is needed for the free tier, but it is rate limited. If
> you see 429s while testing, that is the quota, not a bug.

### 3. Authentication — self-hosted, nothing to sign up for

Better Auth runs from `auth-server/` against your own Neon database, so there
is no third-party account and no dashboard. You only need to generate a signing
secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put it in `auth-server/.env` as `BETTER_AUTH_SECRET`, alongside the **same**
`DATABASE_URL` the backend uses. Then create its tables:

```bash
cd auth-server && npm install && npm run migrate
```

`BETTER_AUTH_URL` must be identical in `auth-server/.env`, `backend/.env` and
`frontend/.env.local` (as `VITE_AUTH_URL`) — it is the JWT issuer *and*
audience, and both are verified.

> `npm run migrate` runs the migration through the installed `better-auth`
> package rather than `@better-auth/cli`. The CLI is versioned separately, and
> an older one writes a schema the library then fails against at runtime
> (`column "issuer" of relation "account" does not exist`).

### 4. GitHub token — optional

Only needed for the repo import feature, and only to raise the rate limit.
Without a token GitHub allows 60 API requests per hour per IP; with one, 5,000.

1. <https://github.com/settings/tokens> → **Generate new token (fine-grained)**.
2. It needs **no scopes at all** — public repository metadata is public. Leave
   every permission unselected.
3. Put it in `backend/.env` as `GITHUB_TOKEN`.

---

## Running it locally

You need **Python 3.11+** and **Node 20+**. On Windows, `start.bat` runs all
three services at once once the steps below are done for the first time.

### Auth service

```bash
cd auth-server
npm install
npm run migrate
npm run dev
```

### Backend

```bash
cd backend
python -m venv .venv
```

Activate it — `.venv\Scripts\activate` on Windows PowerShell, or
`source .venv/bin/activate` on macOS/Linux — then:

```bash
pip install -r requirements.txt
```

Copy `backend/.env.example` to `backend/.env` and fill in `DATABASE_URL`,
`GEMINI_API_KEY` and `BETTER_AUTH_URL`. Then:

```bash
uvicorn main:app --reload --port 8000
```

- API docs: <http://localhost:8000/docs>
- Health probe: <http://localhost:8000/health> — returns `200` with
  `"database": "ok"` when Neon is reachable, `503` when it is not.

### Frontend

```bash
cd frontend
npm install
```

Copy `frontend/.env.example` to `frontend/.env.local` (the defaults are
correct for local development). Then:

```bash
npm run dev
```

Open <http://localhost:5173>. The port is pinned in `vite.config.ts` because
the backend's CORS allowlist points at it; if it moves, requests fail preflight.

### After a schema change

`create_all` never ALTERs an existing table, so a model change needs the
development database rebuilt:

```bash
cd backend && python dev_reset_db.py
```

This **permanently deletes every row**. It refuses to run against
`ENVIRONMENT=production` and asks you to type `DELETE` first.

### Dev-only extra

`/pdf-sandbox` renders the resume template against a worst-case fixture, so you
can iterate on the PDF layout without signing in or spending a Gemini call. It
is excluded from production builds.

---

## Architecture notes

**The vault is the only source of truth.** The AI selects and rewrites; it never
authors. Beyond the prompt rules, `ai_service.enforce_no_fabrication()`
mechanically strips any number from generated text that does not appear in the
student's own source material.

**The one-page rule is enforced in Python, not by asking nicely.**
`enforce_one_page()` trims to 1 education block, 4 entries, 4 bullets each and
18 skills. Prompt instructions are a suggestion; the trim is a guarantee.

**Structured outputs everywhere.** Every Gemini call passes a Pydantic model as
`response_schema`, so the backend cannot crash parsing a malformed string.

**Bullets are polymorphic.** A `Bullet` points at either an `Experience` or a
`Project` via `entity_type` + `entity_id`. SQL cannot express that as one
foreign key, so ownership is enforced in the service layer and orphans are
cleaned up explicitly on parent delete.

**Education follows the Indian system.** One `educations` table with a `level`
discriminator covers Class X, Class XII and a degree, because Indian resumes
list board results alongside the degree. Which columns apply depends on the
level - school rows carry a board and years only, Class XII adds a stream
(PCMB, PCMC, ...), degrees carry a month-and-year range, CGPA and coursework.
The API rejects mismatched combinations rather than silently dropping fields.

**Job descriptions arrive as files.** Companies send PDFs and Word documents,
so `/api/tailor` takes a multipart upload, not pasted text.
`backend/jd_parser.py` extracts the text (including DOCX tables, which JDs
routinely use for requirements) and the response echoes back what it actually
read, so a failed parse is visible rather than producing a quietly generic
resume. Scanned PDFs are detected and rejected with an explanation - OCR is a
much heavier dependency than the feature earns.

**GitHub import is by username.** Type a username, get the public repos back,
tick the ones worth listing, import up to 10 at once. Listing is free and
instant; each import costs one Gemini call, which is why the batch is capped.
Partial success is deliberate - one unreadable README does not discard the
rest.

**PDFs never touch the server.** `@react-pdf/renderer` builds the file in the
browser from the stored JSON payload. The backend stores the payload, not a
binary, so a resume re-downloaded months later is byte-identical even after the
vault changes.

---

## Before deploying

- [ ] Replace `create_all` with Alembic migrations, and delete
      `backend/dev_reset_db.py`. `create_all` only ever CREATEs — it will not
      ALTER a table whose columns changed — and the reset script would destroy
      real users' vaults. `create_all` is already disabled when
      `ENVIRONMENT=production`.
- [ ] Set `CORS_ORIGINS` to your real frontend domain, and `FRONTEND_URL` /
      `BETTER_AUTH_URL` on the auth service to their real origins.
- [ ] Turn on `requireEmailVerification` in `auth-server/src/auth.ts` and wire
      up an email sender. It is off so the MVP loop stays short.
- [ ] Generate a fresh `BETTER_AUTH_SECRET` for production — never reuse the
      development one.
- [ ] Set `ENVIRONMENT=production`, which also hides `/docs` and `/openapi.json`.
- [ ] Rate-limit `/api/tailor` and `/api/github/import`. Both spend money per
      call and neither is throttled.
