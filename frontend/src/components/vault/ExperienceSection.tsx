import { useState } from 'react'

import { useApi } from '../../hooks/useApi'
import { ApiError } from '../../lib/api'
import { bulletsFor } from '../../hooks/useVault'
import type { Bullet, Experience, ExperienceType } from '../../lib/types'
import Alert from '../Alert'
import BulletList from './BulletList'

const EMPTY = {
  title: '',
  organization: '',
  location: '',
  start_date: '',
  end_date: '',
  type: 'WORK' as ExperienceType,
}

/** Jobs, internships, clubs and leadership roles, each with its bullets. */
export default function ExperienceSection({
  experiences,
  groupedBullets,
  onChange,
}: {
  experiences: Experience[]
  groupedBullets: Map<string, Bullet[]>
  onChange: () => void
}) {
  const api = useApi()
  const [form, setForm] = useState(EMPTY)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof typeof EMPTY>(field: K, value: (typeof EMPTY)[K]) {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.createExperience({
        title: form.title.trim(),
        organization: form.organization.trim(),
        location: form.location.trim(),
        start_date: form.start_date,
        end_date: form.end_date || null, // null renders as "Present"
        type: form.type,
      })
      setForm(EMPTY)
      setOpen(false)
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: number) {
    try {
      // The backend deletes this role's bullets in the same transaction.
      await api.deleteExperience(id)
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete that.')
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Experience</h2>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Cancel' : 'Add role'}
        </button>
      </div>

      {error && (
        <div className="mb-3">
          <Alert variant="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      {open && (
        <form onSubmit={submit} className="card mb-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="exp-title">
                Title
              </label>
              <input
                id="exp-title"
                className="input"
                required
                value={form.title}
                onChange={(event) => update('title', event.target.value)}
                placeholder="Software Engineering Intern"
              />
            </div>
            <div>
              <label className="label" htmlFor="exp-org">
                Organization
              </label>
              <input
                id="exp-org"
                className="input"
                required
                value={form.organization}
                onChange={(event) => update('organization', event.target.value)}
                placeholder="Acme Corp / Robotics Club"
              />
            </div>
            <div>
              <label className="label" htmlFor="exp-location">
                Location
              </label>
              <input
                id="exp-location"
                className="input"
                value={form.location}
                onChange={(event) => update('location', event.target.value)}
                placeholder="Bengaluru, Karnataka"
              />
            </div>
            <div>
              <label className="label" htmlFor="exp-start">
                Started
              </label>
              <input
                id="exp-start"
                type="date"
                className="input"
                required
                value={form.start_date}
                onChange={(event) => update('start_date', event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="exp-end">
                Ended <span className="text-slate-400">(blank = current)</span>
              </label>
              <input
                id="exp-end"
                type="date"
                className="input"
                value={form.end_date}
                onChange={(event) => update('end_date', event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="exp-type">
                Type
              </label>
              <select
                id="exp-type"
                className="input"
                value={form.type}
                onChange={(event) => update('type', event.target.value as ExperienceType)}
              >
                <option value="WORK">Work / Internship</option>
                <option value="EXTRACURRICULAR">Club / Leadership</option>
              </select>
            </div>
          </div>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save role'}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {experiences.map((experience) => (
          <div key={experience.id} className="card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-slate-900">
                  {experience.title}{' '}
                  <span className="font-normal text-slate-500">
                    at {experience.organization}
                  </span>
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {experience.start_date} → {experience.end_date ?? 'Present'}
                  {experience.location && ` · ${experience.location}`} ·{' '}
                  {experience.type === 'WORK' ? 'Work' : 'Extracurricular'}
                </p>
              </div>
              <button
                type="button"
                className="btn-danger text-xs"
                onClick={() => void remove(experience.id)}
              >
                Delete
              </button>
            </div>

            <BulletList
              entityType="EXPERIENCE"
              entityId={experience.id}
              bullets={bulletsFor(groupedBullets, 'EXPERIENCE', experience.id)}
              onChange={onChange}
            />
          </div>
        ))}

        {experiences.length === 0 && !open && (
          <p className="text-sm text-slate-500">
            No roles yet. Add jobs, internships and club positions.
          </p>
        )}
      </div>
    </section>
  )
}
