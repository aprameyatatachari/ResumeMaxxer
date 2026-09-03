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

const BASE_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173'

export const auth = betterAuth({
  baseURL: BASE_URL,
  secret: process.env.BETTER_AUTH_SECRET,

  // Same Neon instance as the API. Better Auth talks to it through Kysely and
  // manages its own tables, so the two schemas never collide.
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
    // Neon requires TLS. `rejectUnauthorized: false` is acceptable here because
    // the hostname is pinned in the connection string and Neon terminates TLS
    // with a certificate chain node does not always have locally.
    ssl: { rejectUnauthorized: false },
    max: 5,
  }),

  emailAndPassword: {
    enabled: true,
    // Students sign up with a college email; leaving verification off keeps the
    // MVP loop short. Turn this on (and wire an email sender) before launch.
    requireEmailVerification: false,
    minPasswordLength: 8,
  },

  // The browser sends cookies to this origin from the Vite app, so that origin
  // has to be trusted explicitly - this is the CSRF protection.
  trustedOrigins: [FRONTEND_URL],

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
