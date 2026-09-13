import { useState } from 'react'

import { useApi } from '../../hooks/useApi'
import { ApiError } from '../../lib/api'
import type { ProfileLink, User } from '../../lib/types'
import Alert from '../Alert'
import { movedIds } from '../../lib/reorder'
import MoveButtons from './MoveButtons'
import SortableCard from './SortableCard'

/**
 * The contact details that make up the resume header.
 *
 * These are not account settings - they are layout inputs. The template's
 * header is `Name / phone | email | linkedin | github`, so an empty profile
 * produces a resume with a bare name and nothing else. Sign-up collects only
 * the name and email; the rest is filled in here once.
 *
 * Every field has a "show on resume" switch, and any number of extra links
 * (coding profiles, a blog) can be added below. The header is built from
 * exactly these settings, so a hidden field never appears on a resume.
 *
 * Email is shown read-only: the auth service owns it, and letting the app
 * diverge from the identity provider causes a miserable class of bug.
 */

/** "Show on resume" checkbox, labelled per field so each is distinct. */
function ShowToggle({
  field,
  checked,
  onChange,
}: {
  field: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={`Show ${field} on resume`}
      />
      Show on resume
    </label>
  )
}

/** Extra links: add, edit, reorder, show or hide, delete. */
function LinksEditor({ links, onChange }: { links: ProfileLink[]; onChange: () => void }) {
  const api = useApi()
  const [draft, setDraft] = useState({ label: '', url: '' })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [edit, setEdit] = useState({ label: '', url: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Show/hide changes the checkbox immediately instead of waiting for the save
  // and the vault reload - a checkbox that snaps back reads as broken. A
  // failed save puts it back.
  const [shown, setShown] = useState<Record<number, boolean>>({})

  async function toggleShown(link: ProfileLink, value: boolean) {
    setShown((current) => ({ ...current, [link.id]: value }))
    const ok = await run(
      () => api.updateLink(link.id, { include_on_resume: value }),
      'Could not update that link.',
    )
    if (!ok) setShown((current) => ({ ...current, [link.id]: link.include_on_resume }))
  }

  async function run(action: () => Promise<unknown>, failure: string) {
    setError(null)
    try {
      await action()
      onChange()
      return true
    } catch (err) {
      setError(err instanceof ApiError ? err.message : failure)
      return false
    }
  }

  async function add(event: React.FormEvent) {
    event.preventDefault()
    // Clear the boxes now rather than when the save returns: someone who
    // starts typing the next link while this one saves must not have it wiped.
    // Put the values back only if the save fails.
    const submitted = draft
    setDraft({ label: '', url: '' })
    setBusy(true)
    const ok = await run(
      () =>
        api.createLink({
          label: submitted.label.trim(),
          url: submitted.url.trim(),
          include_on_resume: true,
        }),
      'Could not add that link.',
    )
    if (!ok) setDraft((current) => (current.url || current.label ? current : submitted))
    setBusy(false)
  }

  async function saveEdit(id: number) {
    const ok = await run(
      () => api.updateLink(id, { label: edit.label.trim(), url: edit.url.trim() }),
      'Could not save that link.',
    )
    if (ok) setEditingId(null)
  }

  return (
    <div className="space-y-3 border-t border-slate-100 pt-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">More links</h3>
        <p className="text-xs text-slate-500">
          Coding profiles, Kaggle, a blog - anything else for your header. The
          display text is optional; leave it blank to show the link itself.
        </p>
      </div>

      {error && (
        <Alert variant="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {links.length > 0 && (
        <ul className="space-y-2">
          {links.map((link, index) => (
            <SortableCard
              key={link.id}
              as="li"
              type="link"
              index={index}
              onDrop={(from, to) =>
                void run(() => api.reorderLinks(movedIds(links, from, to)), 'Could not reorder.')
              }
              className="flex items-center gap-2 rounded-lg border border-slate-200 p-2"
            >
              <MoveButtons
                name={link.label || link.url}
                index={index}
                count={links.length}
                onMove={(from, to) =>
                  void run(() => api.reorderLinks(movedIds(links, from, to)), 'Could not reorder.')
                }
              />
              {editingId === link.id ? (
                <div className="flex flex-1 flex-wrap gap-2">
                  <input
                    className="input sm:w-40"
                    aria-label="Edit link display text"
                    value={edit.label}
                    onChange={(event) => setEdit((e) => ({ ...e, label: event.target.value }))}
                    placeholder="Display text"
                  />
                  <input
                    className="input flex-1"
                    aria-label="Edit link URL"
                    value={edit.url}
                    onChange={(event) => setEdit((e) => ({ ...e, url: event.target.value }))}
                  />
                  <button type="button" className="btn-primary text-xs" onClick={() => void saveEdit(link.id)}>
                    Save
                  </button>
                  <button type="button" className="btn-secondary text-xs" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {link.label || link.url.replace(/^https?:\/\//, '')}
                    </p>
                    {link.label && (
                      <p className="truncate text-xs text-slate-500">{link.url}</p>
                    )}
                  </div>
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={shown[link.id] ?? link.include_on_resume}
                      aria-label={`Show ${link.label || link.url} on resume`}
                      onChange={(event) => void toggleShown(link, event.target.checked)}
                    />
                    Show on resume
                  </label>
                  <button
                    type="button"
                    className="btn-secondary shrink-0 text-xs"
                    aria-label={`Edit link ${link.label || link.url}`}
                    onClick={() => {
                      setEditingId(link.id)
                      setEdit({ label: link.label, url: link.url })
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-danger shrink-0 text-xs"
                    aria-label={`Delete link ${link.label || link.url}`}
                    onClick={() => void run(() => api.deleteLink(link.id), 'Could not delete that link.')}
                  >
                    Delete
                  </button>
                </>
              )}
            </SortableCard>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input
          className="input sm:w-40"
          aria-label="New link display text"
          value={draft.label}
          onChange={(event) => setDraft((d) => ({ ...d, label: event.target.value }))}
          placeholder="LeetCode (optional)"
          maxLength={60}
        />
        <input
          className="input min-w-0 flex-1"
          aria-label="New link URL"
          required
          value={draft.url}
          onChange={(event) => setDraft((d) => ({ ...d, url: event.target.value }))}
          placeholder="leetcode.com/u/your-name"
        />
        <button type="submit" className="btn-secondary shrink-0" disabled={busy}>
          {busy ? 'Adding…' : 'Add link'}
        </button>
      </form>
    </div>
  )
}

export default function ProfileSection({
  user,
  links,
  onChange,
}: {
  user: User
  links: ProfileLink[]
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
    include_phone: user.include_phone,
    include_email: user.include_email,
    include_linkedin: user.include_linkedin,
    include_github: user.include_github,
    include_portfolio: user.include_portfolio,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function update<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
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
          These become the header line of every resume you generate. Untick
          "Show on resume" to keep something on file without printing it. For
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

      <div className="card space-y-3">
        <form onSubmit={submit} className="space-y-3">
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
              <ShowToggle
                field="phone"
                checked={form.include_phone}
                onChange={(value) => update('include_phone', value)}
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
              <ShowToggle
                field="LinkedIn"
                checked={form.include_linkedin}
                onChange={(value) => update('include_linkedin', value)}
              />
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
              <ShowToggle
                field="GitHub"
                checked={form.include_github}
                onChange={(value) => update('include_github', value)}
              />
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
              <ShowToggle
                field="portfolio"
                checked={form.include_portfolio}
                onChange={(value) => update('include_portfolio', value)}
              />
            </div>
          </div>

          <div>
            <p className="text-xs text-slate-400">
              Email on your resume is {user.email}, taken from your sign-in account.
            </p>
            <ShowToggle
              field="email"
              checked={form.include_email}
              onChange={(value) => update('include_email', value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save contact details'}
            </button>
            {saved && <span className="text-sm text-emerald-600">Saved.</span>}
          </div>
        </form>

        {/* Outside the contact form: each link saves on its own, so adding one
            never silently submits half-typed contact details. */}
        <LinksEditor links={links} onChange={onChange} />
      </div>
    </section>
  )
}
