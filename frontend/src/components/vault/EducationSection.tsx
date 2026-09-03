import { useState } from 'react'

import { useApi } from '../../hooks/useApi'
import { ApiError } from '../../lib/api'
import {
  BOARD_LABELS,
  LEVEL_LABELS,
  STREAM_LABELS,
  type Board,
  type Education,
  type EducationLevel,
  type ScoreType,
  type Stream,
} from '../../lib/types'
import Alert from '../Alert'

/**
 * Education, shaped around the Indian system.
 *
 * The three levels have genuinely different fields, so the form switches on
 * `level` rather than showing everything and hoping:
 *
 *   Class X    - board, years only, percentage
 *   Class XII  - board + stream, years only, percentage
 *   College    - degree, MM-YYYY, CGPA, coursework
 *
 * The backend rejects mismatched combinations outright, so keeping this form
 * in step with those rules is what stops the student hitting a 422.
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const CURRENT_YEAR = new Date().getFullYear()
// Ten years back covers Class X for any current student; six forward covers an
// expected graduation date.
const YEARS = Array.from({ length: 17 }, (_, i) => CURRENT_YEAR + 6 - i)

const EMPTY = {
  level: 'HIGHER_ED' as EducationLevel,
  institution: '',
  location: '',
  board: '' as Board | '',
  stream: '' as Stream | '',
  degree: '',
  start_year: '',
  end_year: '',
  start_month: '',
  end_month: '',
  score: '',
  score_type: 'CGPA' as ScoreType,
  coursework: '',
}

type FormState = typeof EMPTY

/** Render one stored qualification the way it will read on the resume. */
function describe(education: Education): string {
  if (education.level === 'HIGHER_ED') return education.degree ?? 'Degree'
  const board =
    education.board === 'STATE' ? 'State Board' : (education.board ?? '')
  const label = education.level === 'CLASS_10' ? 'Class X' : 'Class XII'
  const stream = education.stream ? ` (${education.stream})` : ''
  return `${board} - ${label}${stream}`.replace(/^ - /, '')
}

function formatPeriod(education: Education): string {
  const start = education.start_month
    ? `${MONTHS[education.start_month - 1]} ${education.start_year}`
    : String(education.start_year)
  if (!education.end_year) return `${start} - Present`
  const end = education.end_month
    ? `${MONTHS[education.end_month - 1]} ${education.end_year}`
    : String(education.end_year)
  return `${start} - ${end}`
}

function formatScore(education: Education): string {
  if (!education.score) return ''
  if (education.score_type === 'CGPA') return `CGPA ${education.score}`
  const score = education.score.trim()
  return `${score}${score.endsWith('%') ? '' : '%'}`
}

export default function EducationSection({
  educations,
  onChange,
}: {
  educations: Education[]
  onChange: () => void
}) {
  const api = useApi()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSchool = form.level === 'CLASS_10' || form.level === 'CLASS_12'

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  /** Switching level resets the fields that no longer apply, so a stale
   *  `stream` from a Class XII draft cannot ride along into a degree entry. */
  function changeLevel(level: EducationLevel) {
    setForm((previous) => ({
      ...previous,
      level,
      board: '',
      stream: '',
      degree: '',
      start_month: '',
      end_month: '',
      coursework: level === 'HIGHER_ED' ? previous.coursework : '',
      score_type: level === 'HIGHER_ED' ? 'CGPA' : 'PERCENTAGE',
    }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const school = form.level !== 'HIGHER_ED'
    try {
      await api.createEducation({
        level: form.level,
        institution: form.institution.trim(),
        location: form.location.trim(),
        // Send null, not '', for anything that does not apply at this level -
        // the backend rejects fields belonging to another level.
        board: school ? ((form.board || null) as Board | null) : null,
        stream:
          form.level === 'CLASS_12' ? ((form.stream || null) as Stream | null) : null,
        degree: school ? null : form.degree.trim() || null,
        start_year: Number(form.start_year),
        end_year: form.end_year ? Number(form.end_year) : null,
        start_month: school || !form.start_month ? null : Number(form.start_month),
        end_month: school || !form.end_month ? null : Number(form.end_month),
        score: form.score.trim() || null,
        score_type: form.score.trim() ? form.score_type : null,
        coursework: school ? '' : form.coursework.trim(),
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
      await api.deleteEducation(id)
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete that.')
    }
  }

  // Most recent first: degree, then Class XII, then Class X.
  const levelOrder: Record<EducationLevel, number> = {
    HIGHER_ED: 0,
    CLASS_12: 1,
    CLASS_10: 2,
  }
  const sorted = [...educations].sort(
    (a, b) =>
      levelOrder[a.level] - levelOrder[b.level] ||
      (b.end_year ?? 9999) - (a.end_year ?? 9999),
  )

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Education</h2>
          <p className="text-xs text-slate-500">
            Add your degree plus Class XII and Class X - Indian recruiters screen
            on board marks.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary shrink-0"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Cancel' : 'Add qualification'}
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
        <form onSubmit={submit} className="card mb-3 space-y-4">
          {/* --- Level picker: drives everything below ------------------ */}
          <fieldset>
            <legend className="label">What are you adding?</legend>
            <div className="flex flex-wrap gap-2">
              {(['HIGHER_ED', 'CLASS_12', 'CLASS_10'] as EducationLevel[]).map(
                (level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => changeLevel(level)}
                    aria-pressed={form.level === level}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                      form.level === level
                        ? 'border-brand-500 bg-brand-50 font-medium text-brand-700'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {LEVEL_LABELS[level]}
                  </button>
                ),
              )}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="institution">
                {isSchool ? 'School name' : 'College / University'}
              </label>
              <input
                id="institution"
                className="input"
                required
                value={form.institution}
                onChange={(event) => update('institution', event.target.value)}
                placeholder={
                  isSchool ? 'Delhi Public School' : 'VIT Vellore'
                }
              />
            </div>

            <div>
              <label className="label" htmlFor="edu-location">
                Location
              </label>
              <input
                id="edu-location"
                className="input"
                value={form.location}
                onChange={(event) => update('location', event.target.value)}
                placeholder="Bengaluru, Karnataka"
              />
            </div>

            {/* --- School-only: board -------------------------------- */}
            {isSchool && (
              <div>
                <label className="label" htmlFor="board">
                  Board
                </label>
                <select
                  id="board"
                  className="input"
                  required
                  value={form.board}
                  onChange={(event) => update('board', event.target.value as Board)}
                >
                  <option value="">Select a board…</option>
                  {(Object.keys(BOARD_LABELS) as Board[]).map((board) => (
                    <option key={board} value={board}>
                      {BOARD_LABELS[board]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* --- Class XII only: stream ---------------------------- */}
            {form.level === 'CLASS_12' && (
              <div>
                <label className="label" htmlFor="stream">
                  Stream / specialisation
                </label>
                <select
                  id="stream"
                  className="input"
                  required
                  value={form.stream}
                  onChange={(event) => update('stream', event.target.value as Stream)}
                >
                  <option value="">Select a stream…</option>
                  {(Object.keys(STREAM_LABELS) as Stream[]).map((stream) => (
                    <option key={stream} value={stream}>
                      {STREAM_LABELS[stream]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* --- Higher education only: degree --------------------- */}
            {!isSchool && (
              <div className="sm:col-span-2">
                <label className="label" htmlFor="degree">
                  Degree
                </label>
                <input
                  id="degree"
                  className="input"
                  required
                  value={form.degree}
                  onChange={(event) => update('degree', event.target.value)}
                  placeholder="B.E. Computer Science"
                />
              </div>
            )}
          </div>

          {/* --- Dates: years only for school, MM-YYYY for a degree --- */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className="label">Started</span>
              <div className="flex gap-2">
                {!isSchool && (
                  <select
                    className="input"
                    aria-label="Start month"
                    value={form.start_month}
                    onChange={(event) => update('start_month', event.target.value)}
                  >
                    <option value="">Month</option>
                    {MONTHS.map((month, index) => (
                      <option key={month} value={index + 1}>
                        {month}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  className="input"
                  required
                  aria-label="Start year"
                  value={form.start_year}
                  onChange={(event) => update('start_year', event.target.value)}
                >
                  <option value="">Year</option>
                  {YEARS.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <span className="label">
                {isSchool ? 'Completed' : 'Graduating'}{' '}
                <span className="text-slate-400">(blank if ongoing)</span>
              </span>
              <div className="flex gap-2">
                {!isSchool && (
                  <select
                    className="input"
                    aria-label="End month"
                    value={form.end_month}
                    onChange={(event) => update('end_month', event.target.value)}
                  >
                    <option value="">Month</option>
                    {MONTHS.map((month, index) => (
                      <option key={month} value={index + 1}>
                        {month}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  className="input"
                  aria-label="End year"
                  value={form.end_year}
                  onChange={(event) => update('end_year', event.target.value)}
                >
                  <option value="">Year</option>
                  {YEARS.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* --- Score: percentage for school, CGPA for a degree ------ */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="score">
                {form.score_type === 'CGPA' ? 'CGPA' : 'Percentage'}{' '}
                <span className="text-slate-400">(optional)</span>
              </label>
              <div className="flex gap-2">
                <input
                  id="score"
                  className="input"
                  value={form.score}
                  onChange={(event) => update('score', event.target.value)}
                  placeholder={form.score_type === 'CGPA' ? '8.7' : '92.4'}
                />
                <select
                  className="input w-40 shrink-0"
                  aria-label="Score type"
                  value={form.score_type}
                  onChange={(event) =>
                    update('score_type', event.target.value as ScoreType)
                  }
                >
                  <option value="CGPA">CGPA</option>
                  <option value="PERCENTAGE">Percentage</option>
                </select>
              </div>
            </div>

            {!isSchool && (
              <div>
                <label className="label" htmlFor="coursework">
                  Relevant coursework
                </label>
                <input
                  id="coursework"
                  className="input"
                  value={form.coursework}
                  onChange={(event) => update('coursework', event.target.value)}
                  placeholder="Data Structures, DBMS, Operating Systems"
                />
              </div>
            )}
          </div>

          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {sorted.map((education) => (
          <div key={education.id} className="card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-slate-900">
                  {education.institution}
                  {education.location && (
                    <span className="font-normal text-slate-500">
                      {' '}
                      · {education.location}
                    </span>
                  )}
                </h3>
                <p className="text-sm text-slate-600">
                  {describe(education)}
                  {formatScore(education) && ` · ${formatScore(education)}`}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatPeriod(education)}
                </p>
                {education.coursework && (
                  <p className="mt-2 text-sm text-slate-600">
                    Coursework: {education.coursework}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="btn-danger text-xs"
                onClick={() => void remove(education.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        {educations.length === 0 && !open && (
          <p className="text-sm text-slate-500">Nothing added yet.</p>
        )}
      </div>
    </section>
  )
}
