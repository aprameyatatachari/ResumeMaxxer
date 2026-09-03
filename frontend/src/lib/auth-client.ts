import { createAuthClient } from 'better-auth/react'

/**
 * Better Auth client, pointed at the auth service (`auth-server/`).
 *
 * The session lives in a cookie set by that service, so every call must send
 * credentials - it is a different origin from the Vite app.
 */
export const AUTH_URL = import.meta.env.VITE_AUTH_URL ?? 'http://localhost:3000'

export const authClient = createAuthClient({
  baseURL: AUTH_URL,
  fetchOptions: {
    // Required: the session cookie is cross-origin. The auth service allows
    // this origin explicitly (see its CORS middleware and `trustedOrigins`).
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
