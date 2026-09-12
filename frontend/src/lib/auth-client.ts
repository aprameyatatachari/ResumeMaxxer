import { createAuthClient } from 'better-auth/react'

/**
 * Better Auth client, pointed at the auth service (`auth-server/`).
 *
 * Two deployment shapes, one variable:
 *
 *   local       three ports. The auth service is a DIFFERENT origin from the
 *               Vite app, so the session cookie is cross-site and every call
 *               has to send credentials explicitly.
 *   deployed    one domain. `/api/auth/*` is rewritten to the auth service by
 *               `vercel.json`, so the cookie is first-party and none of the
 *               cross-origin rules apply.
 *
 * An empty `VITE_AUTH_URL` selects the second shape. It resolves to the
 * current origin rather than staying empty because Better Auth builds absolute
 * request URLs from `baseURL`.
 */
const CONFIGURED_AUTH_URL = import.meta.env.VITE_AUTH_URL ?? 'http://localhost:3000'

export const AUTH_URL = CONFIGURED_AUTH_URL || window.location.origin

export const authClient = createAuthClient({
  baseURL: AUTH_URL,
  fetchOptions: {
    // Harmless and correct in both shapes: required when the auth service is a
    // separate origin, a no-op when it is our own.
    credentials: 'include',
  },
})

export const { useSession, signIn, signUp, signOut } = authClient

/**
 * JWT cache
 * ---------
 * FastAPI authenticates with a short-lived JWT minted by the auth service, not
 * with the session cookie. Fetching a fresh one on every API call would add a
 * round trip to each request, so the token is cached until shortly before it
 * expires.
 *
 * The margin covers clock skew between the browser and the two servers, and
 * the flight time of the request the token is about to be used for.
 */
const EXPIRY_MARGIN_MS = 60_000

let cachedToken: string | null = null
let cachedExpiry = 0
let inFlight: Promise<string | null> | null = null

/** Read `exp` out of a JWT without verifying it.
 *
 *  Safe here because this is only used to decide when to refetch - the token
 *  is verified by the backend, which is the only place that matters. Never
 *  make an authorization decision from an unverified payload.
 */
function readExpiry(token: string): number {
  try {
    const [, payload] = token.split('.')
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : 0
  } catch {
    return 0
  }
}

/**
 * Return a valid JWT for the current session, or null when signed out.
 *
 * Concurrent callers share one in-flight request: the dashboard fires several
 * API calls at once on mount, and without this they would each mint their own
 * token.
 */
export async function getAuthToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedExpiry - EXPIRY_MARGIN_MS) {
    return cachedToken
  }
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const response = await fetch(`${AUTH_URL}/api/auth/token`, {
        credentials: 'include',
      })
      if (!response.ok) {
        // 401 here just means "not signed in" - callers handle that.
        clearAuthToken()
        return null
      }
      const { token } = (await response.json()) as { token?: string }
      if (!token) return null

      cachedToken = token
      cachedExpiry = readExpiry(token)
      return token
    } catch {
      return null
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/** Drop the cached JWT. Call on sign-out, or the next sign-in reuses a token
 *  belonging to the previous user until it expires. */
export function clearAuthToken(): void {
  cachedToken = null
  cachedExpiry = 0
}
