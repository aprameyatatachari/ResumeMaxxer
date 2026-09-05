# Product Specification: ResumeMaxxer (Student MVP)

## 1. Product Vision
ResumeMaxxer is an AI-driven application that solves the "resume tailoring" problem for Indian college students. Students build a comprehensive "Master Vault" of all their academic projects, GitHub repositories, extracurriculars, and jobs. When applying for a role, they upload the Job Description (JD) as the company sent it - PDF or Word. The AI selects the most relevant experiences from the Vault, rewrites them to match the JD's keywords (without fabricating), and generates a 1-page ATS-friendly PDF following `resume-template.tex`.

## 2. Tech Stack
*   **Frontend:** Vite, React, TypeScript, Tailwind CSS, React Router (`react-router-dom`), `better-auth`.
*   **Backend:** Python 3.11+, FastAPI, Pydantic.
*   **Database:** NeonDB (Serverless PostgreSQL).
*   **ORM:** SQLModel.
*   **Authentication:** Better Auth, self-hosted in `auth-server/` (Node +
    Express) against the same Neon database. It issues JWTs; FastAPI verifies
    them against its JWKS endpoint. Replaced Clerk - no third-party dependency
    and no per-seat cost.
*   **AI Engine:** Google Gemini API (via the `google-genai` SDK - the
    `google-generativeai` package named originally is retired upstream).

## 3. Core Workflows

### A. Master Vault Ingestion
*   **Manual Entry:** Users add education, jobs, and leadership roles via standard React forms.
*   **GitHub Import:** Users enter their GitHub username and tick the public repos they want from a list (up to 10 per batch); a single-URL import remains as a fallback. The FastAPI backend fetches `README.md` and languages data via GitHub's REST API, sends it to Gemini to generate 4-5 tagged bullet points, and stores it in NeonDB under the user's Vault.

### B. The Tailoring Engine
*   User uploads a JD file (PDF/DOCX/TXT/MD) on the Vite frontend and clicks "Tailor Resume". FastAPI extracts the text server-side (`jd_parser.py`).
*   **Step 1 (Extract):** FastAPI sends the JD to Gemini to extract core keywords and role requirements.
*   **Step 2 (Filter):** FastAPI queries NeonDB to find the user's `bullets` that match the extracted keywords/tags.
*   **Step 3 (Rewrite):** FastAPI sends the JD keywords and selected vault bullets to Gemini with a strict prompt to rewrite them into a unified JSON resume structure, keeping to 1 page.
*   **Step 4 (Render):** FastAPI turns the JSON payload into LaTeX using `resume-template.tex` and compiles it via a Tectonic container; React shows the returned PDF. The student can edit any text in the preview and re-render before downloading.

## 4. Database Schema (SQLModel / PostgreSQL)

### `User`
*   `id`: String (Primary Key, matches the Better Auth user id)
*   `email`: String
*   `first_name`: String
*   `last_name`: String
*   `created_at`: DateTime

### `Education`
Reworked for the Indian system: one table covering Class X, Class XII and
higher education, discriminated by `level`. Indian resumes list board results
alongside the degree, and recruiters screen on them.

*   `id`: Integer (Primary Key)
*   `user_id`: String (Foreign Key -> User.id)
*   `level`: String ('CLASS_10', 'CLASS_12', 'HIGHER_ED')
*   `institution`: String
*   `location`: String
*   `board`: String (school only: CBSE / ICSE / STATE / IB / CAMBRIDGE / NIOS / OTHER)
*   `stream`: String (Class XII only: PCMB / PCMC / PCME / PCM / PCB / COMMERCE / ...)
*   `degree`: String (higher education only)
*   `start_year` / `end_year`: Integer
*   `start_month` / `end_month`: Integer (higher education only - MM-YYYY)
*   `score`: String (Optional) + `score_type`: 'PERCENTAGE' | 'CGPA'
*   `coursework`: String (Comma-separated, higher education only)

### `Experience` (Jobs, Clubs, Internships)
*   `id`: Integer (Primary Key)
*   `user_id`: String (Foreign Key -> User.id)
*   `title`: String
*   `organization`: String
*   `start_date`: Date
*   `end_date`: Date (Nullable)
*   `type`: String ('WORK', 'EXTRACURRICULAR')

### `Project`
*   `id`: Integer (Primary Key)
*   `user_id`: String (Foreign Key -> User.id)
*   `title`: String
*   `repo_url`: String (Optional)
*   `tech_stack`: String (Comma-separated)
*   `is_github_imported`: Boolean

### `Bullet` (The Core AI Data)
*   `id`: Integer (Primary Key)
*   `user_id`: String (Foreign Key -> User.id)
*   `entity_type`: String ('EXPERIENCE', 'PROJECT')
*   `entity_id`: Integer
*   `original_text`: Text
*   `ai_enhanced_text`: Text
*   `tags`: String (Comma-separated keywords)

### `GeneratedResume`
*   `id`: Integer (Primary Key)
*   `user_id`: String (Foreign Key -> User.id)
*   `job_title`: String
*   `jd_text`: Text
*   `resume_json`: JSON (The exact payload sent to React PDF renderer)
*   `created_at`: DateTime

## 5. AI Prompt Guardrails & Constraints
*   **Strict JSON Output:** The Gemini API must *always* be invoked using Pydantic schemas (Structured Outputs) to ensure the Python backend never crashes due to malformed string parsing.
*   **The "No Fluff" Rule:** AI outputs for resume bullets must begin with an action verb, utilize the "X by Y using Z" formula where applicable, and absolutely never fabricate metrics or experiences not present in the user's Vault.
*   **The "One-Page" Rule:** The AI must cap the generated output to a maximum of 3 Education blocks (degree, Class XII, Class X), 4 Experiences/Projects combined, 3-4 bullets per entity, and 4 skill categories, to ensure it fits on a single PDF page. Enforced numerically in `ai_service.enforce_one_page()`, not by prompt alone.
*   **The Template Rule:** The PDF *is* `resume-template.tex`, compiled by Tectonic - not a reimplementation of it. The font is LaTeX's default Latin Modern, because the template leaves every font package commented out. Do not enable one.
*   **The Escaping Rule:** Every value reaching the document goes through `latex_renderer.escape()`. Vault text is user input and LaTeX is executable.