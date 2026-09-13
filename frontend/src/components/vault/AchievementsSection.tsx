import { useState } from 'react'

import { useApi } from '../../hooks/useApi'
import { ApiError } from '../../lib/api'
import { movedIds } from '../../lib/reorder'
import type { Achievement, AchievementInput } from '../../lib/types'
import Alert from '../Alert'
import MoveButtons from './MoveButtons'
import SortableCard from './SortableCard'

const EMPTY: AchievementInput = {
  title: '',
  description: '',
  date_text: '',
  include_on_resume: true,
}

/** Title, detail and date - shared by "add" and "edit". */
function AchievementForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: AchievementInput
  submitLabel: string
  onSubmit: (payload: AchievementInput) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSubmit({
        ...form,
        title: form.title.trim(),
        description: form.description.trim(),
        date_text: form.date_text.trim(),
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
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div>
          <label className="label" htmlFor="ach-title">
            Achievement
          </label>
          <input
            id="ach-title"
            className="input"
            required
            maxLength={200}
            value={form.title}
            onChange={(event) => setForm((f) => ({ ...f, title: event.target.value }))}
            placeholder="Winner, Smart India Hackathon"
          />
        </div>
        <div>
          <label className="label" htmlFor="ach-date">
            When <span className="text-slate-400">(optional)</span>
          </label>
          <input
            id="ach-date"
            className="input"
            maxLength={40}
            value={form.date_text}
            onChange={(event) => setForm((f) => ({ ...f, date_text: event.target.value }))}
            placeholder="Mar. 2024"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="ach-detail">
            Detail <span className="text-slate-400">(optional)</span>
          </label>
          <input
            id="ach-detail"
            className="input"
            maxLength={300}
            value={form.description}
            onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
            placeholder="1st of 400 teams, national round"
          />
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

/**
 * Awards, competitions, scholarships, ratings.
 *
 * Printed on the resume exactly as written here - the AI never rewords an
 * achievement, since that is where "finalist" quietly becomes "winner". Each
 * line has its own "show on resume" switch and its place in the order.
 */
export default function AchievementsSection({
  achievements,
  onChange,
}: {
  achievements: Achievement[]
  onChange: () => void
}) {
  const api = useApi()
  // One form at a time, so field ids never collide on the page.
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The switch updates at once rather than waiting for the save and reload.
  const [shown, setShown] = useState<Record<number, boolean>>({})

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

  async function toggleShown(achievement: Achievement, value: boolean) {
    setShown((current) => ({ ...current, [achievement.id]: value }))
    const ok = await run(
      () => api.updateAchievement(achievement.id, { include_on_resume: value }),
      'Could not update that.',
    )
    if (!ok) setShown((current) => ({ ...current, [achievement.id]: achievement.include_on_resume }))
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Achievements</h2>
          <p className="text-xs text-slate-500">
            Hackathons, competitions, scholarships, coding ratings. Printed exactly
            as you write them.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary shrink-0"
          onClick={() => {
            setEditingId(null)
            setAdding((value) => !value)
          }}
        >
          {adding ? 'Cancel' : 'Add achievement'}
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
        <AchievementForm
          initial={EMPTY}
          submitLabel="Save achievement"
          onSubmit={async (payload) => {
            await api.createAchievement(payload)
            setAdding(false)
            onChange()
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      <div className="space-y-2">
        {achievements.map((achievement, index) =>
          editingId === achievement.id ? (
            <AchievementForm
              key={achievement.id}
              initial={achievement}
              submitLabel="Save changes"
              onSubmit={async (payload) => {
                await api.updateAchievement(achievement.id, payload)
                setEditingId(null)
                onChange()
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <SortableCard
              key={achievement.id}
              type="achievement"
              index={index}
              onDrop={(from, to) =>
                void run(
                  () => api.reorderAchievements(movedIds(achievements, from, to)),
                  'Could not reorder.',
                )
              }
              className="card flex items-center gap-3 py-3"
            >
              <MoveButtons
                name={achievement.title}
                index={index}
                count={achievements.length}
                onMove={(from, to) =>
                  void run(
                    () => api.reorderAchievements(movedIds(achievements, from, to)),
                    'Could not reorder.',
                  )
                }
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-800">
                  <span className="font-semibold">{achievement.title}</span>
                  {achievement.description && `: ${achievement.description}`}
                </p>
                {achievement.date_text && (
                  <p className="text-xs text-slate-500">{achievement.date_text}</p>
                )}
              </div>
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={shown[achievement.id] ?? achievement.include_on_resume}
                  aria-label={`Show ${achievement.title} on resume`}
                  onChange={(event) => void toggleShown(achievement, event.target.checked)}
                />
                Show on resume
              </label>
              <button
                type="button"
                className="btn-secondary shrink-0 text-xs"
                aria-label={`Edit ${achievement.title}`}
                onClick={() => {
                  setAdding(false)
                  setEditingId(achievement.id)
                }}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn-danger shrink-0 text-xs"
                aria-label={`Delete ${achievement.title}`}
                onClick={() =>
                  void run(() => api.deleteAchievement(achievement.id), 'Could not delete that.')
                }
              >
                Delete
              </button>
            </SortableCard>
          ),
        )}

        {achievements.length === 0 && !adding && (
          <p className="text-sm text-slate-500">
            Nothing yet. A hackathon placing or a scholarship is worth a line.
          </p>
        )}
      </div>
    </section>
  )
}
