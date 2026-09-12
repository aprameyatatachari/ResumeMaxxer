import { betterAuth } from 'better-auth'
import { bearer, jwt } from 'better-auth/plugins'
import { Pool } from 'pg'

/**
 * Better Auth configuration for ResumeMaxxer.
 *
 * Why this is a separate service
 * ------------------------------
 * Better Auth is a Node library and the API is Python, so it cannot be
 * embedded in FastAPI. It runs as its own small server and the two are bridged
 * by JWTs: this service issues them, FastAPI verifies them against the JWKS
 * endpoint below. No shared secret, no network hop per request.
 *
 * It shares the same Neon database as the API but owns its own tables
 * (`user`, `session`, `account`, `verification`, `jwks`), created by
 * `npm run migrate`. The API's `users` table is separate and is still keyed by
 * the auth user id - see `backend/auth.py`.
 */

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Copy auth-server/.env.example to auth-server/.env ' +
      'and paste the same Neon connection string the backend uses.',
  )
}

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error(
    'BETTER_AUTH_SECRET is not set. Generate one with:\n' +
      '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
  )
}

/**
 * Whether this database needs a TLS connection.
 *
 * Managed Postgres (Neon, RDS, Supabase) requires it; a database on localhost
 * generally has no TLS configured, and forcing it there fails the connection
 * rather than falling back. An explicit `sslmode` in the URL always wins.
 */
function requiresTls(connectionString: string | undefined): boolean {
  if (!connectionString) return false

  try {
    const url = new URL(connectionString)
    const sslmode = url.searchParams.get('sslmode')
    if (sslmode) return sslmode !== 'disable'
    return !['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    // Unparseable: assume remote, which is the safer default.
    return true
  }
}

/**
 * This service's own public origin.
 *
 * It is the JWT `iss` AND `aud` claim, and the backend verifies both, so
 * `backend/auth.py` implements this exact precedence. Change one, change the
 * other, or every request 401s with "Invalid authentication token".
 *
 *   1. BETTER_AUTH_URL           explicit, and what a real deployment should set
 *   2. VERCEL_PROJECT_PRODUCTION_URL   the project's shortest production domain,
 *                                      used only for production deployments
 *   3. VERCEL_URL                this deployment's own URL, which is what makes
 *                                preview deployments work without configuration
 *   4. localhost:3000            development
 *
 * Vercel's variables carry no scheme, hence the https:// prefix. They also
 * require "Enable access to System Environment Variables" in project settings;
 * without it only step 1 and step 4 can ever fire.
 */
function resolveBaseUrl(): string {
  const explicit = process.env.BETTER_AUTH_URL
  if (explicit) return explicit.replace(/\/$/, '')

  if (
    process.env.VERCEL_ENV === 'production' &&
    process.env.VERCEL_PROJECT_PRODUCTION_URL
  ) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`

  return 'http://localhost:3000'
}

const BASE_URL = resolveBaseUrl()

/**
 * Where the browser app is served from.
 *
 * Deployed, this is the same origin as BASE_URL - the frontend and this
 * service sit behind one domain, split by path - so it falls back to BASE_URL
 * rather than to a localhost port that would not be trusted in production.
 */
const FRONTEND_URL =
  process.env.FRONTEND_URL ?? (process.env.VERCEL ? BASE_URL : 'http://localhost:5173')

export const auth = betterAuth({
  baseURL: BASE_URL,
  secret: process.env.BETTER_AUTH_SECRET,

  // Same Neon instance as the API. Better Auth talks to it through Kysely and
  // manages its own tables, so the two schemas never collide.
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
    // TLS only when the database is remote. Neon requires it, but a local
    // PostgreSQL - a dev container, or the one CI spins up - does not speak
    // SSL at all and rejects the connection outright with "The server does not
    // support SSL connections". `rejectUnauthorized: false` is acceptable for
    // the remote case because the hostname is pinned in the connection string
    // and Neon terminates TLS with a chain node does not always have locally.
    ssl: requiresTls(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false,
    max: 5,
  }),

  emailAndPassword: {
    enabled: true,
    // Students sign up with a college email; leaving verification off keeps the
    // MVP loop short. Turn this on (and wire an email sender) before launch.
    requireEmailVerification: false,
    minPasswordLength: 8,
  },

  // The browser sends cookies to this origin from the app, so that origin has
  // to be trusted explicitly - this is the CSRF protection, and an origin
  // missing from here fails with a bare 403 that looks nothing like a CSRF
  // error, so it is worth being thorough.
  //
  // Both are listed because the two deployment shapes differ: locally they are
  // different ports, and on Vercel they are one origin (so this collapses to a
  // single entry). Deduplicated rather than conditional - a duplicate entry
  // would be harmless but confusing to read in a log.
  trustedOrigins: [...new Set([FRONTEND_URL, BASE_URL])],

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh the expiry once a day
  },

  plugins: [
    /**
     * Issues the JWTs that FastAPI verifies.
     *
     * Defaults worth knowing:
     *   - JWKS is published at `/api/auth/jwks`
     *   - a token is minted by `GET /api/auth/token` (needs a session)
     *   - `iss` and `aud` both default to this service's origin
     *   - the payload is the whole user object, with `sub` = user id, so the
     *     API gets email and name without a second lookup
     *   - keys are EdDSA (Ed25519) by default; `backend/auth.py` accepts that
     *     and RS256
     */
    jwt({
      jwt: {
        // Short-lived: the frontend fetches a fresh one per request anyway, and
        // a leaked token stops being useful quickly.
        expirationTime: '15m',
      },
    }),

    /**
     * Lets a client send `Authorization: Bearer <session-token>` instead of a
     * cookie. Not needed by the browser app, but it makes the auth server
     * testable with curl and keeps mobile clients possible later.
     */
    bearer(),
  ],
})

export type Session = typeof auth.$Infer.Session
