import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import Alert from '../components/Alert'
import { clearAuthToken, signUp, useSession } from '../lib/auth-client'

/** Minimum enforced by the auth service (`minPasswordLength: 8`). */
const MIN_PASSWORD_LENGTH = 8

export default function SignUpPage() {
  const navigate = useNavigate()
  const { refetch } = useSession()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const { error: authError } = await signUp.email({
      name: name.trim(),
      email: email.trim(),
      password,
    })

    if (authError) {
      setError(
        // 422 is the auth service's "email already registered". Unlike a
        // sign-in failure this is safe to state plainly - the person is
        // already telling us the address, and hiding it just confuses them.
        authError.status === 422
          ? 'An account with that email already exists. Try signing in.'
          : (authError.message ?? 'Could not create your account. Try again.'),
      )
      setBusy(false)
      return
    }

    // Sign-up signs the user straight in, so the stale-token clear matters
    // here too - and so does waiting for the session store to catch up before
    // navigating to a guarded route, or <ProtectedRoute> bounces us to
    // /sign-in while the header shows us signed in.
    clearAuthToken()
    await refetch()
    navigate('/vault', { replace: true })
  }

  return (
    <div className="mx-auto max-w-sm py-12">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Build your vault
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        One account, every application you ever send.
      </p>

      {error && (
        <div className="mt-4">
          <Alert variant="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      <form onSubmit={submit} className="card mt-5 space-y-3">
        <div>
          <label className="label" htmlFor="name">
            Full name
          </label>
          <input
            id="name"
            className="input"
            required
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ananya Krishnan"
          />
          <p className="mt-1 text-xs text-slate-400">
            This goes at the top of your resume. You can change it later.
          </p>
        </div>
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
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="mt-1 text-xs text-slate-400">
            At least {MIN_PASSWORD_LENGTH} characters.
          </p>
        </div>
        <button
          type="submit"
          className="btn-primary w-full"
          disabled={busy || tooShort}
        >
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link to="/sign-in" className="font-medium text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
