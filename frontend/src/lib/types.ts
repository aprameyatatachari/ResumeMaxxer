/**
 * types.ts
 * ========
 * TypeScript mirrors of the backend's Pydantic schemas.
 *
 * These are hand-maintained, so they can drift from `backend/schemas.py`. If
 * the API surface starts changing often, generate them instead:
 *
 *     npx openapi-typescript http://localhost:8000/openapi.json -o src/lib/api-types.ts
 */

export type ExperienceType = 'WORK' | 'EXTRACURRICULAR'
export type EntityType = 'EXPERIENCE' | 'PROJECT'

// --- Indian education system ----------------------------------------------
export type EducationLevel = 'CLASS_10' | 'CLASS_12' | 'HIGHER_ED'

export type Board = 'CBSE' | 'ICSE' | 'STATE' | 'IB' | 'CAMBRIDGE' | 'NIOS' | 'OTHER'

export type Stream =
  | 'PCMB'
  | 'PCMC'
  | 'PCME'
  | 'PCM'
  | 'PCB'
  | 'COMMERCE'
  | 'COMMERCE_MATHS'
  | 'ARTS'
  | 'OTHER'

export type ScoreType = 'PERCENTAGE' | 'CGPA'

/** Human-readable labels. Kept beside the unions so a new variant is a
 *  compile error here rather than a raw enum value leaking into the UI. */
export const BOARD_LABELS: Record<Board, string> = {
  CBSE: 'CBSE',
  ICSE: 'ICSE / ISC',
  STATE: 'State Board',
  IB: 'International Baccalaureate',
  CAMBRIDGE: 'Cambridge (IGCSE / A-Levels)',
  NIOS: 'NIOS',
  OTHER: 'Other',
}

export const STREAM_LABELS: Record<Stream, string> = {
  PCMB: 'PCMB (Physics, Chemistry, Maths, Biology)',
  PCMC: 'PCMC (Physics, Chemistry, Maths, Computer Science)',
  PCME: 'PCME (Physics, Chemistry, Maths, Electronics)',
  PCM: 'PCM (Physics, Chemistry, Maths)',
  PCB: 'PCB (Physics, Chemistry, Biology)',
  COMMERCE: 'Commerce',
  COMMERCE_MATHS: 'Commerce with Maths',
  ARTS: 'Arts / Humanities',
  OTHER: 'Other',
}

export const LEVEL_LABELS: Record<EducationLevel, string> = {
  HIGHER_ED: 'College / University',
  CLASS_12: 'Class XII (Senior Secondary)',
  CLASS_10: 'Class X (Secondary)',
}

export interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  phone: string
  location: string
  linkedin_url: string
  github_url: string
  portfolio_url: string
  created_at: string
}

export type UserUpdate = Partial<
  Pick<
    User,
    | 'first_name'
    | 'last_name'
    | 'phone'
    | 'location'
    | 'linkedin_url'
    | 'github_url'
    | 'portfolio_url'
  >
>

/**
 * One qualification. Which fields apply depends on `level`:
 *   CLASS_10  - board, years only
 *   CLASS_12  - board + stream, years only
 *   HIGHER_ED - degree, month + year, coursework
 * The backend rejects inapplicable combinations, so the form must switch on
 * `level` rather than showing every field at once.
 */
export interface Education {
  id: number
  level: EducationLevel
  institution: string
  location: string
  board: Board | null
  stream: Stream | null
  degree: string | null
  start_year: number
  end_year: number | null
  start_month: number | null
  end_month: number | null
  score: string | null
  score_type: ScoreType | null
  coursework: string
}

export type EducationInput = Omit<Education, 'id'>

export interface Experience {
  id: number
  title: string
  organization: string
  location: string
  start_date: string
  end_date: string | null // null renders as "Present"
  type: ExperienceType
}

export type ExperienceInput = Omit<Experience, 'id'>

export interface Project {
  id: number
  title: string
  repo_url: string | null
  tech_stack: string // comma-separated
  is_github_imported: boolean
}

export type ProjectInput = Omit<Project, 'id' | 'is_github_imported'>

export interface Bullet {
  id: number
  entity_type: EntityType
  entity_id: number
  original_text: string
  ai_enhanced_text: string | null
  tags: string // comma-separated
}

export interface BulletInput {
  entity_type: EntityType
  entity_id: number
  original_text: string
  tags: string
}

export interface Vault {
  user: User
  educations: Education[]
  experiences: Experience[]
  projects: Project[]
  bullets: Bullet[]
}

// --- GitHub ----------------------------------------------------------------
export interface GitHubRepoSummary {
  name: string
  full_name: string
  description: string | null
  html_url: string
  language: string | null
  stars: number
  updated_at: string | null
  is_fork: boolean
  already_imported: boolean
}

export interface GitHubRepoListResponse {
  username: string
  repos: GitHubRepoSummary[]
}

export interface GitHubImportResponse {
  project: Project
  bullets: Bullet[]
}

export interface GitHubImportFailure {
  repo_full_name: string
  error: string
}

export interface GitHubBatchImportResponse {
  imported: GitHubImportResponse[]
  failed: GitHubImportFailure[]
}

/** Server-side cap on one batch import. Mirrors MAX_BATCH_IMPORT. */
export const MAX_BATCH_IMPORT = 10

// --- Tailoring -------------------------------------------------------------
export interface JDAnalysis {
  job_title: string
  company: string
  hard_skills: string[]
  soft_skills: string[]
  keywords: string[]
  seniority: string
}

/**
 * The resume payload. These mirror resume-template.tex exactly - each type is
 * one of that template's custom commands. Do not add fields the template has
 * no slot for; there is no summary section, for instance.
 */
export interface ResumeHeader {
  full_name: string
  phone: string
  email: string
  linkedin: string
  github: string
  portfolio: string
}

export interface ResumeEducation {
  institution: string
  location: string
  qualification: string
  score: string
  date_range: string
}

export interface ResumeExperience {
  title: string
  date_range: string
  organization: string
  location: string
  bullets: string[]
}

export interface ResumeProject {
  name: string
  tech_stack: string
  date_range: string
  bullets: string[]
}

export interface SkillCategory {
  category: string
  items: string
}

export interface ResumePayload {
  header: ResumeHeader
  education: ResumeEducation[]
  experience: ResumeExperience[]
  projects: ResumeProject[]
  skills: SkillCategory[]
}

/** Echo of what was actually read out of the uploaded JD, so the student can
 *  confirm the parse worked before trusting the resume built from it. */
export interface JobDescriptionSource {
  filename: string
  char_count: number
  preview: string
}

export interface TailorResponse {
  resume_id: number
  job_title: string
  analysis: JDAnalysis
  resume: ResumePayload
  source: JobDescriptionSource
}

export interface GeneratedResumeSummary {
  id: number
  job_title: string
  created_at: string
}

export interface GeneratedResumeDetail extends GeneratedResumeSummary {
  resume_json: ResumePayload
}
