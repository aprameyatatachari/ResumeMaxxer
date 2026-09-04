import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The JWT cache.
 *
 * It sits on the hot path of every API call, and both of its failure modes are
 * nasty: too eager and every request pays a round trip, too lazy and a stale
 * token is sent after sign-out.
 *
 * The module is re-imported per test so each one starts with an empty cache.
 */

function makeJwt(expiresInSeconds: number): string {
  const payload = { exp: Math.floor(Date.now() / 1000) + expiresInSeconds }
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_')
  return `header.${encode(payload)}.signature`
}

async function loadModule() {
  vi.resetModules()
  return import('./auth-client')
}

beforeEach(() => {
  vi.stubEnv('VITE_AUTH_URL', 'http://auth.test')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('getAuthToken', () => {
  it('fetches once and reuses the cached token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: makeJwt(900) }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getAuthToken } = await loadModule()
    const first = await getAuthToken()
    const second = await getAuthToken()

    expect(first).toBe(second)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include')
  })

  it('refetches a token that is about to expire', async () => {
    // Inside the expiry margin, so the cache must not be trusted.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: makeJwt(10) }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getAuthToken } = await loadModule()
    await getAuthToken()
    await getAuthToken()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('shares one in-flight request between concurrent callers', async () => {
    // The dashboard fires several API calls at once on mount.
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ ok: true, json: async () => ({ token: makeJwt(900) }) }), 5),
        ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { getAuthToken } = await loadModule()
    const results = await Promise.all([getAuthToken(), getAuthToken(), getAuthToken()])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(new Set(results).size).toBe(1)
  })

  it('returns null when signed out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))

    const { getAuthToken } = await loadModule()
    expect(await getAuthToken()).toBeNull()
  })

  it('returns null when the auth service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const { getAuthToken } = await loadModule()
    expect(await getAuthToken()).toBeNull()
  })

  it('clearAuthToken forces a refetch, so the next user never reuses this token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: makeJwt(900) }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getAuthToken, clearAuthToken } = await loadModule()
    await getAuthToken()
    clearAuthToken()
    await getAuthToken()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
