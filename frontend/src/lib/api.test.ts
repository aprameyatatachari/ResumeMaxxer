import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, createApiClient } from './api'
import { clearGeminiKey, setGeminiKey } from './gemini-key'

/**
 * The API client's error handling and request shaping.
 *
 * These are the parts that decide what a student actually sees when something
 * goes wrong, and the multipart handling is a detail that silently breaks
 * uploads if it regresses.
 */

const token = async () => 'test-jwt'

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
    ...response,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  clearGeminiKey()
})

describe("the student's own Gemini key", () => {
  const STUDENT_KEY = 'AIzaSyExampleKeyThatIsLongEnough00000000'

  it('is sent as a header when one is saved', async () => {
    setGeminiKey(STUDENT_KEY)
    const fetchMock = mockFetch({ json: async () => ({}) })

    await createApiClient(token).getVault()

    // Must match backend/gemini_key.py::HEADER_NAME.
    expect(fetchMock.mock.calls[0][1].headers['X-Gemini-Api-Key']).toBe(
      STUDENT_KEY,
    )
  })

  it('is omitted entirely when none is saved', async () => {
    const fetchMock = mockFetch({ json: async () => ({}) })

    await createApiClient(token).getVault()

    expect(
      fetchMock.mock.calls[0][1].headers['X-Gemini-Api-Key'],
    ).toBeUndefined()
  })

  it('rides along on the multipart upload too', async () => {
    // The tailoring endpoint is the one that actually needs it, and it is the
    // only multipart request in the app - a header dropped here would mean
    // BYOK silently never worked.
    setGeminiKey(STUDENT_KEY)
    const fetchMock = mockFetch({ json: async () => ({ resume_id: 1 }) })
    const file = new File([new Uint8Array([1])], 'jd.pdf', {
      type: 'application/pdf',
    })

    await createApiClient(token).tailor(file)

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['X-Gemini-Api-Key']).toBe(STUDENT_KEY)
    // And still no hand-set Content-Type, or the boundary is lost.
    expect(init.headers['Content-Type']).toBeUndefined()
  })

  it('is picked up on a key saved after the client was built', async () => {
    // `useApi()` memoises one client for the whole session, so a key read once
    // at construction time would never be seen until a page reload.
    const client = createApiClient(token)
    setGeminiKey(STUDENT_KEY)
    const fetchMock = mockFetch({ json: async () => ({}) })

    await client.getVault()

    expect(fetchMock.mock.calls[0][1].headers['X-Gemini-Api-Key']).toBe(
      STUDENT_KEY,
    )
  })

  it('is sent on PDF requests as well', async () => {
    setGeminiKey(STUDENT_KEY)
    const fetchMock = mockFetch({ blob: async () => new Blob(['%PDF-']) })

    await createApiClient(token).downloadStoredPdf(7)

    expect(fetchMock.mock.calls[0][1].headers['X-Gemini-Api-Key']).toBe(
      STUDENT_KEY,
    )
  })
})

describe('auth header', () => {
  it('sends the JWT as a Bearer token', async () => {
    const fetchMock = mockFetch({ json: async () => ({ id: 'u1' }) })
    await createApiClient(token).getMe()

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer test-jwt')
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('omits the Authorization header when signed out', async () => {
    const fetchMock = mockFetch({ json: async () => ({}) })
    await createApiClient(async () => null).getVault()

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })
})

describe('file upload', () => {
  it('does not set Content-Type on FormData', async () => {
    // The browser must set it itself so it can append the multipart boundary;
    // setting it by hand produces a request the server cannot parse.
    const fetchMock = mockFetch({ json: async () => ({ resume_id: 1 }) })
    const file = new File([new Uint8Array([1, 2, 3])], 'jd.pdf', {
      type: 'application/pdf',
    })

    await createApiClient(token).tailor(file, 'Backend Intern')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/tailor')
    expect(init.headers['Content-Type']).toBeUndefined()
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('job_title')).toBe('Backend Intern')
  })
})

describe('error handling', () => {
  it('surfaces a FastAPI string detail', async () => {
    mockFetch({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'Legacy .doc files are not supported.' }),
    })

    await expect(createApiClient(token).getVault()).rejects.toThrowError(
      /Legacy \.doc/,
    )
  })

  it('flattens a 422 validation array into one readable line', async () => {
    mockFetch({
      ok: false,
      status: 422,
      json: async () => ({
        detail: [
          { loc: ['body', 'stream'], msg: 'stream is required for Class XII' },
          { loc: ['body', 'board'], msg: 'board is required' },
        ],
      }),
    })

    await expect(createApiClient(token).getVault()).rejects.toThrowError(
      /stream is required for Class XII; board is required/,
    )
  })

  it('reports an unreachable API as status 0, not a generic fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const error = await createApiClient(token)
      .getVault()
      .catch((err: unknown) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(0)
    expect((error as ApiError).message).toMatch(/Is the backend running/)
  })

  it('returns undefined for 204 rather than trying to parse a body', async () => {
    mockFetch({
      status: 204,
      json: async () => {
        throw new Error('204 has no body')
      },
    })

    await expect(createApiClient(token).deleteBullet(1)).resolves.toBeUndefined()
  })
})
