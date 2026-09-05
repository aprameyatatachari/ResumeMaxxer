import { useState } from 'react'

import { useApi } from '../../hooks/useApi'
import { ApiError } from '../../lib/api'
import type { User } from '../../lib/types'
import Alert from '../Alert'

/**
 * The contact details that make up the resume header.
 *
 * These are not account settings - they are layout inputs. The template's
 * header is `Name / phone | email | linkedin | github`, so an empty profile
 * produces a resume with a bare name and nothing else. Sign-up collects only
 * the name and email; the rest is filled in here once.
 *
 * Email is shown read-only: the auth service owns it, and letting the app
 * diverge from the identity provider causes a miserable class of bug.
 */
export default function ProfileSection({
  user,
  onChange,
}: {
  user: User
  onChange: () => void
}) {
  const api = useApi()
  const [form, setForm] = useState({
    first_name: user.first_name,
    last_name: user.last_name,
    phone: user.phone,
    location: user.location,
    linkedin_url: user.linkedin_url,
    github_url: user.github_url,
    portfolio_url: user.portfolio_url,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function update(field: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }))
    setSaved(false)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.updateMe(form)
      setSaved(true)
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  const incomplete = !form.phone.trim() || !form.first_name.trim()

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-slate-900">Contact details</h2>
        <p className="text-xs text-slate-500">
          These become the header line of every resume you generate. For
          LinkedIn and GitHub, enter just your username — the rest of the link
          is added for you.
        </p>
      </div>

      {incomplete && (
        <div className="mb-3">
          <Alert variant="info">
            Add your name and phone number - without them the resume header is
            nearly empty, and recruiters cannot contact you.
          </Alert>
        </div>
      )}
      {error && (
        <div className="mb-3">
          <Alert variant="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      <form onSubmit={submit} className="card space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="first-name">
              First name
            </label>
            <input
              id="first-name"
              className="input"
              value={form.first_name}
              onChange={(event) => update('first_name', event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="last-name">
              Last name
            </label>
            <input
              id="last-name"
              className="input"
              value={form.last_name}
              onChange={(event) => update('last_name', event.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="phone">
              Phone
            </label>
            <input
              id="phone"
              className="input"
              value={form.phone}
              onChange={(event) => update('phone', event.target.value)}
              placeholder="+91 98765 43210"
              inputMode="tel"
            />
          </div>
          <div>
            <label className="label" htmlFor="loc">
              Location
            </label>
            <input
              id="loc"
              className="input"
              value={form.location}
              onChange={(event) => update('location', event.target.value)}
              placeholder="Bengaluru, Karnataka"
            />
          </div>

          {/* The prefix is shown as a non-editable addon so there is no
              question what belongs in the box: the username, not a URL. The
              backend normalises a full URL if one is pasted anyway, but this
              stops people wondering. */}
          <div>
            <label className="label" htmlFor="linkedin">
              LinkedIn username
            </label>
            <div className="flex">
              <span className="inline-flex items-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-500">
                linkedin.com/in/
              </span>
              <input
                id="linkedin"
                className="input rounded-l-none"
                value={form.linkedin_url}
                onChange={(event) => update('linkedin_url', event.target.value)}
                placeholder="your-name"
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="github">
              GitHub username
            </label>
            <div className="flex">
              <span className="inline-flex items-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-500">
                github.com/
              </span>
              <input
                id="github"
                className="input rounded-l-none"
                value={form.github_url}
                onChange={(event) => update('github_url', event.target.value)}
                placeholder="your-username"
              />
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="portfolio">
              Portfolio <span className="text-slate-400">(optional)</span>
            </label>
            <input
              id="portfolio"
              className="input"
              value={form.portfolio_url}
              onChange={(event) => update('portfolio_url', event.target.value)}
              placeholder="your-name.dev — full domain, no https://"
            />
          </div>
        </div>

        <p className="text-xs text-slate-400">
          Email on your resume is {user.email}, taken from your sign-in account.
        </p>

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save contact details'}
          </button>
          {saved && <span className="text-sm text-emerald-600">Saved.</span>}
        </div>
      </form>
    </section>
  )
}
