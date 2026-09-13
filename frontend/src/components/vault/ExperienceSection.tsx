import { useState } from 'react'

import { useApi } from '../../hooks/useApi'
import { ApiError } from '../../lib/api'
import { bulletsFor } from '../../hooks/useVault'
import type { Bullet, Experience, ExperienceInput, ExperienceType } from '../../lib/types'
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

type FormState = typeof EMPTY

function fromExperience(experience: Experience): FormState {
  return {
    title: experience.title,
    organization: experience.organization,
    location: experience.location,
    start_date: experience.start_date,
    end_date: experience.end_date ?? '',
    type: experience.type,
  }
}

/** The role form, shared by "add" and "edit" so the two can never drift. */
function ExperienceForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: FormState
  submitLabel: string
  onSubmit: (payload: ExperienceInput) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState<FormState>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSubmit({
        title: form.title.trim(),
        organization: form.organization.trim(),
        location: form.location.trim(),
        start_date: form.start_date,
        end_date: form.end_date || null, // null renders as "Present"
        type: form.type,
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="card mb-3 space-y-3">
      {error && (
        <Alert variant="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
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
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
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
  // One form at a time, so field ids never collide on the page.
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

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
          onClick={() => {
            setEditingId(null)
            setAdding((value) => !value)
          }}
        >
          {adding ? 'Cancel' : 'Add role'}
        </button>
      </div>

      {error && (
        <div className="mb-3">
          <Alert variant="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      {adding && (
        <ExperienceForm
          initial={EMPTY}
          submitLabel="Save role"
          onSubmit={async (payload) => {
            await api.createExperience(payload)
            setAdding(false)
            onChange()
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      <div className="space-y-3">
        {experiences.map((experience) => (
          <div key={experience.id} className="card">
            {editingId === experience.id ? (
              // Editing swaps only the details; the bullets below stay
              // editable in their own right.
              <ExperienceForm
                initial={fromExperience(experience)}
                submitLabel="Save changes"
                onSubmit={async (payload) => {
                  await api.updateExperience(experience.id, payload)
                  setEditingId(null)
                  onChange()
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
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
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    aria-label={`Edit ${experience.title} at ${experience.organization}`}
                    onClick={() => {
                      setAdding(false)
                      setEditingId(experience.id)
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-danger text-xs"
                    onClick={() => void remove(experience.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}

            <BulletList
              entityType="EXPERIENCE"
              entityId={experience.id}
              bullets={bulletsFor(groupedBullets, 'EXPERIENCE', experience.id)}
              onChange={onChange}
            />
          </div>
        ))}

        {experiences.length === 0 && !adding && (
          <p className="text-sm text-slate-500">
            No roles yet. Add jobs, internships and club positions.
          </p>
        )}
      </div>
    </section>
  )
}
