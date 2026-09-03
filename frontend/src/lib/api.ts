/**
 * api.ts
 * ======
 * Typed client for the FastAPI backend.
 *
 * Auth model: every call attaches a Better Auth JWT as a Bearer header. The
 * token is minted by the auth service and cached in `lib/auth-client.ts` until
 * shortly before it expires, so this is a cheap in-memory read on the hot
 * path.
 */

import type {
  Bullet,
  BulletInput,
  Education,
  EducationInput,
  Experience,
  ExperienceInput,
  GeneratedResumeDetail,
  GeneratedResumeSummary,
  GitHubBatchImportResponse,
  GitHubImportResponse,
  GitHubRepoListResponse,
  Project,
  ProjectInput,
  TailorResponse,
  User,
  UserUpdate,
  Vault,
} from './types'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

/** Fetches a valid JWT for the current session, or null when signed out. */
export type TokenGetter = () => Promise<string | null>

/**
 * An API error carrying the HTTP status, so callers can branch on it.
 * `status === 0` means the request never reached the server.
 */
export class ApiError extends Error {
  // Declared and assigned explicitly rather than as a constructor parameter
  // property: this template enables `erasableSyntaxOnly`, which bans TS syntax
  // that has no plain-JS equivalent.
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(
  getToken: TokenGetter,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getToken()

  // FormData must NOT get an explicit Content-Type: the browser has to set it
  // itself so it can append the multipart boundary. Setting it by hand produces
  // a request the server cannot parse.
  const isFormData = init.body instanceof FormData

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    })
  } catch {
    // A network-level failure. In development this is almost always "the
    // FastAPI server is not running", so say that rather than "Failed to fetch".
    throw new ApiError(
      0,
      `Could not reach the API at ${API_BASE}. Is the backend running?`,
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(response.status, extractErrorMessage(body, response.status))
  }

  return body as T
}

/** Turn FastAPI's several error shapes into one human-readable string. */
function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    // 422 validation errors arrive as an array of {loc, msg, type}.
    if (Array.isArray(detail)) {
      return detail
        .map((item) =>
          item && typeof item === 'object' && 'msg' in item
            ? String((item as { msg: unknown }).msg)
            : String(item),
        )
        .join('; ')
    }
  }
  return `Request failed with status ${status}`
}

/**
 * Build the API surface, bound to a token getter.
 *
 * Called once per session by `useApi()` - do not call it inside a render body
 * without memoising, or every render produces new function identities and any
 * effect depending on the client re-fires forever.
 */
export function createApiClient(getToken: TokenGetter) {
  const json = (body: unknown) => ({ body: JSON.stringify(body) })

  return {
    // --- Vault ------------------------------------------------------------
    getMe: () => request<User>(getToken, '/api/vault/me'),
    updateMe: (data: UserUpdate) =>
      request<User>(getToken, '/api/vault/me', { method: 'PATCH', ...json(data) }),
    getVault: () => request<Vault>(getToken, '/api/vault'),

    createEducation: (data: EducationInput) =>
      request<Education>(getToken, '/api/vault/education', {
        method: 'POST',
        ...json(data),
      }),
    updateEducation: (id: number, data: Partial<EducationInput>) =>
      request<Education>(getToken, `/api/vault/education/${id}`, {
        method: 'PATCH',
        ...json(data),
      }),
    deleteEducation: (id: number) =>
      request<void>(getToken, `/api/vault/education/${id}`, { method: 'DELETE' }),

    createExperience: (data: ExperienceInput) =>
      request<Experience>(getToken, '/api/vault/experience', {
        method: 'POST',
        ...json(data),
      }),
    updateExperience: (id: number, data: Partial<ExperienceInput>) =>
      request<Experience>(getToken, `/api/vault/experience/${id}`, {
        method: 'PATCH',
        ...json(data),
      }),
    deleteExperience: (id: number) =>
      request<void>(getToken, `/api/vault/experience/${id}`, { method: 'DELETE' }),

    createProject: (data: ProjectInput) =>
      request<Project>(getToken, '/api/vault/project', {
        method: 'POST',
        ...json(data),
      }),
    updateProject: (id: number, data: Partial<ProjectInput>) =>
      request<Project>(getToken, `/api/vault/project/${id}`, {
        method: 'PATCH',
        ...json(data),
      }),
    deleteProject: (id: number) =>
      request<void>(getToken, `/api/vault/project/${id}`, { method: 'DELETE' }),

    createBullet: (data: BulletInput) =>
      request<Bullet>(getToken, '/api/vault/bullet', { method: 'POST', ...json(data) }),
    updateBullet: (id: number, data: Partial<Omit<Bullet, 'id'>>) =>
      request<Bullet>(getToken, `/api/vault/bullet/${id}`, {
        method: 'PATCH',
        ...json(data),
      }),
    deleteBullet: (id: number) =>
      request<void>(getToken, `/api/vault/bullet/${id}`, { method: 'DELETE' }),

    // --- GitHub -----------------------------------------------------------
    listRepos: (username: string, includeForks = false) =>
      request<GitHubRepoListResponse>(
        getToken,
        `/api/github/repos/${encodeURIComponent(username)}` +
          `?include_forks=${includeForks}`,
      ),
    importRepos: (repoFullNames: string[]) =>
      request<GitHubBatchImportResponse>(getToken, '/api/github/import-batch', {
        method: 'POST',
        ...json({ repo_full_names: repoFullNames }),
      }),
    importRepo: (repoUrl: string) =>
      request<GitHubImportResponse>(getToken, '/api/github/import', {
        method: 'POST',
        ...json({ repo_url: repoUrl }),
      }),

    // --- Tailoring --------------------------------------------------------
    /** Upload a job description file (PDF/DOCX/TXT/MD) and tailor a resume. */
    tailor: (file: File, jobTitle?: string) => {
      const form = new FormData()
      form.append('file', file)
      if (jobTitle) form.append('job_title', jobTitle)
      return request<TailorResponse>(getToken, '/api/tailor', {
        method: 'POST',
        body: form,
      })
    },
    getHistory: () =>
      request<GeneratedResumeSummary[]>(getToken, '/api/tailor/history'),
    getGeneratedResume: (id: number) =>
      request<GeneratedResumeDetail>(getToken, `/api/tailor/history/${id}`),
    deleteGeneratedResume: (id: number) =>
      request<void>(getToken, `/api/tailor/history/${id}`, { method: 'DELETE' }),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
