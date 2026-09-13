import { useState } from 'react'

import { useApi } from '../../hooks/useApi'
import { ApiError } from '../../lib/api'
import { bulletsFor } from '../../hooks/useVault'
import type { Bullet, Experience, ExperienceInput, ExperienceType } from '../../lib/types'
import Alert from '../Alert'
import BulletList from './BulletList'
import { movedIds } from '../../lib/reorder'
import MoveButtons from './MoveButtons'
import SortableCard from './SortableCard'

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
  idPrefix,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  /** Keeps field ids unique when both sections have a form open. */
  idPrefix: string
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
          <label className="label" htmlFor={`${idPrefix}-title`}>
            Title
          </label>
          <input
            id={`${idPrefix}-title`}
            className="input"
            required
            value={form.title}
            onChange={(event) => update('title', event.target.value)}
            placeholder="Software Engineering Intern"
          />
        </div>
        <div>
          <label className="label" htmlFor={`${idPrefix}-org`}>
            Organization
          </label>
          <input
            id={`${idPrefix}-org`}
            className="input"
            required
            value={form.organization}
            onChange={(event) => update('organization', event.target.value)}
            placeholder="Acme Corp / Robotics Club"
          />
        </div>
        <div>
          <label className="label" htmlFor={`${idPrefix}-location`}>
            Location
          </label>
          <input
            id={`${idPrefix}-location`}
            className="input"
            value={form.location}
            onChange={(event) => update('location', event.target.value)}
            placeholder="Bengaluru, Karnataka"
          />
        </div>
        <div>
          <label className="label" htmlFor={`${idPrefix}-start`}>
            Started
          </label>
          <input
            id={`${idPrefix}-start`}
            type="date"
            className="input"
            required
            value={form.start_date}
            onChange={(event) => update('start_date', event.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor={`${idPrefix}-end`}>
            Ended <span className="text-ink-faint">(blank = current)</span>
          </label>
          <input
            id={`${idPrefix}-end`}
            type="date"
            className="input"
            value={form.end_date}
            onChange={(event) => update('end_date', event.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor={`${idPrefix}-type`}>
            Type
          </label>
          <select
            id={`${idPrefix}-type`}
            className="input"
            value={form.type}
            onChange={(event) => update('type', event.target.value as ExperienceType)}
          >
            <option value="WORK">Work / Internship</option>
            <option value="EXTRACURRICULAR">Extracurricular (club, society, volunteering)</option>
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

/** Wording that differs between the two sections this component renders. */
const COPY: Record<
  ExperienceType,
  { heading: string; add: string; save: string; empty: string; drag: string }
> = {
  WORK: {
    heading: 'Experience',
    add: 'Add role',
    save: 'Save role',
    empty: 'No roles yet. Add jobs and internships.',
    drag: 'experience',
  },
  EXTRACURRICULAR: {
    heading: 'Extracurricular activities',
    add: 'Add activity',
    save: 'Save activity',
    empty:
      'No activities yet. Clubs, societies, fests, sports and volunteering go here - they get their own section on your resume.',
    drag: 'extracurricular',
  },
}

/**
 * One kind of role - work, or extracurricular - each entry with its bullets.
 *
 * Both kinds live in the same table (an Experience with a `type`), because
 * they have the same shape, but they are separate sections on the resume, so
 * the vault shows them as separate sections too. The type picker in the form
 * still lets an entry move between them.
 */
export default function ExperienceSection({
  kind,
  experiences,
  groupedBullets,
  onChange,
}: {
  kind: ExperienceType
  /** Every experience in the vault, both kinds, in stored order. */
  experiences: Experience[]
  groupedBullets: Map<string, Bullet[]>
  onChange: () => void
}) {
  const api = useApi()
  const copy = COPY[kind]
  const shown = experiences.filter((experience) => experience.type === kind)
  const others = experiences.filter((experience) => experience.type !== kind)
  // One form at a time, so field ids never collide on the page.
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** Save a new order for this section. The endpoint takes every experience
   *  of both kinds, so the other section's entries ride along unchanged. The
   *  list re-renders from the server, so a failed save leaves the old order. */
  async function move(ids: number[]) {
    try {
      await api.reorderExperience([...ids, ...others.map((experience) => experience.id)])
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reorder.')
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
        <h2 className="text-lg font-semibold text-ink">{copy.heading}</h2>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setEditingId(null)
            setAdding((value) => !value)
          }}
        >
          {adding ? 'Cancel' : copy.add}
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
          idPrefix={copy.drag}
          initial={{ ...EMPTY, type: kind }}
          submitLabel={copy.save}
          onSubmit={async (payload) => {
            await api.createExperience(payload)
            setAdding(false)
            onChange()
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      <div className="space-y-3">
        {shown.map((experience, index) => (
          <SortableCard
            key={experience.id}
            type={copy.drag}
            index={index}
            onDrop={(from, to) => void move(movedIds(shown, from, to))}
            className="card"
          >
            {editingId === experience.id ? (
              // Editing swaps only the details; the bullets below stay
              // editable in their own right.
              <ExperienceForm
          idPrefix={copy.drag}
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
                <div className="flex items-start gap-2">
                  <MoveButtons
                    name={`${experience.title} at ${experience.organization}`}
                    index={index}
                    count={shown.length}
                    onMove={(from, to) => void move(movedIds(shown, from, to))}
                  />
                  <div>
                    <h3 className="font-semibold text-ink">
                      {experience.title}{' '}
                      <span className="font-normal text-ink-faint">
                        at {experience.organization}
                      </span>
                    </h3>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {experience.start_date} - {experience.end_date ?? 'Present'}
                      {experience.location && ` · ${experience.location}`}
                    </p>
                  </div>
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
          </SortableCard>
        ))}

        {shown.length === 0 && !adding && (
          <p className="text-sm text-ink-faint">{copy.empty}</p>
        )}
      </div>
    </section>
  )
}
