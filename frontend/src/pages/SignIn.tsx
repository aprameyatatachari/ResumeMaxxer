import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import Alert from '../components/Alert'
import { clearAuthToken, signIn, useSession } from '../lib/auth-client'

/**
 * Email + password sign-in.
 *
 * Replaces Clerk's prebuilt component, so this is our markup now. Two details
 * that matter beyond the happy path:
 *
 *  - `clearAuthToken()` on success. The JWT cache is module state, so without
 *    it a second sign-in in the same tab could keep using the previous user's
 *    token until it expired.
 *  - The error message stays generic. "No account with that email" tells an
 *    attacker which addresses are registered.
 *  - `refetch()` before navigating. Without it, <ProtectedRoute> reads a stale
 *    session store, decides the user is signed out, and bounces them straight
 *    back here - while the header simultaneously shows them signed in.
 */
export default function SignInPage() {
  const navigate = useNavigate()
  const { refetch } = useSession()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Where the user was headed before ProtectedRoute bounced them here.
  const destination = (location.state as { from?: string } | null)?.from ?? '/vault'

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const { error: authError } = await signIn.email({ email, password })

    if (authError) {
      setError(
        authError.status === 401 || authError.status === 403
          ? 'Email or password is incorrect.'
          : (authError.message ?? 'Could not sign you in. Try again.'),
      )
      setBusy(false)
      return
    }

    clearAuthToken()
    // See the note above `refetch` in the component doc: the session store
    // must reflect the new session before we navigate to a guarded route.
    await refetch()
    navigate(destination, { replace: true })
  }

  return (
    <div className="mx-auto max-w-sm py-12">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
      <p className="mt-1 text-sm text-slate-600">Sign in to your vault.</p>

      {error && (
        <div className="mt-4">
          <Alert variant="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      <form onSubmit={submit} className="card mt-5 space-y-3">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="input"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@college.edu"
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="input"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-slate-600">
        No account yet?{' '}
        <Link to="/sign-up" className="font-medium text-brand-600 hover:underline">
          Create one
        </Link>
      </p>
    </div>
  )
}
