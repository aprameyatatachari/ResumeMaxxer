import { useState } from 'react'

import { useApi } from '../../hooks/useApi'
import { ApiError } from '../../lib/api'
import {
  BOARD_LABELS,
  LEVEL_LABELS,
  STREAM_LABELS,
  type Board,
  type Education,
  type EducationInput,
  type EducationLevel,
  type ScoreType,
  type Stream,
} from '../../lib/types'
import Alert from '../Alert'

/**
 * Education, shaped around the Indian system.
 *
 * The levels have genuinely different fields, so the form switches on `level`
 * rather than showing everything and hoping:
 *
 *   College    - degree, MM-YYYY start and end, CGPA, coursework
 *   Class XII  - board + stream, year of passing only, score
 *   Class X    - board, year of passing only, score
 *   School     - one school's whole tenure (years), with whichever of the
 *                Class X / XII results were taken there. They print as bullets
 *                under one heading instead of as separate headings.
 *
 * Class X / XII rows show only the year of passing on the resume, so the form
 * asks for nothing else. A student who changed schools adds one School entry
 * per school.
 *
 * The backend rejects mismatched combinations outright, so keeping this form
 * in step with those rules is what stops the student hitting a 422.
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const CURRENT_YEAR = new Date().getFullYear()
// Six years forward covers an expected graduation; thirty back covers the
// start of a whole school tenure for any current student.
const YEARS = Array.from({ length: 36 }, (_, i) => CURRENT_YEAR + 6 - i)

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
  // School entry: which results were taken here, and what they were.
  has_class10: true,
  class10_board: '' as Board | '',
  class10_score: '',
  class10_score_type: 'PERCENTAGE' as ScoreType,
  has_class12: true,
  class12_board: '' as Board | '',
  class12_stream: '' as Stream | '',
  class12_score: '',
  class12_score_type: 'PERCENTAGE' as ScoreType,
  start_grade: '',
  end_grade: '',
}

type FormState = typeof EMPTY

const LEVEL_ORDER: EducationLevel[] = ['HIGHER_ED', 'CLASS_12', 'CLASS_10', 'SCHOOL']

function boardLabel(board: Board | null): string {
  if (!board) return ''
  return board === 'STATE' ? 'State Board' : board
}

/** Render one stored qualification the way it will read on the resume.
 *  Mirrors `_format_qualification` in backend/routers/tailor.py. */
function describe(education: Education): string {
  if (education.level === 'HIGHER_ED') return education.degree ?? 'Degree'
  if (education.level === 'SCHOOL') {
    const has10 = Boolean(education.class10_board)
    const has12 = Boolean(education.class12_board)
    const start = education.start_grade
    const end = education.end_grade
    // Mirrors the backend: typed grades describe the span when given.
    const exams =
      start && end ? `${start} to ${end}`
        : start ? `From ${start}`
          : end ? `Up to ${end}`
            : has10 && has12 ? 'Class X & XII' : has12 ? 'Class XII' : 'Class X'
    const boards = new Set([education.class10_board, education.class12_board].filter(Boolean))
    return boards.size === 1
      ? `${boardLabel([...boards][0] as Board)} - ${exams}`
      : exams
  }
  const label = education.level === 'CLASS_10' ? 'Class X' : 'Class XII'
  const stream = education.stream ? ` (${education.stream})` : ''
  return `${boardLabel(education.board)} - ${label}${stream}`.replace(/^ - /, '')
}

/** Mirrors `_format_education_dates`: Class X / XII show only the year of
 *  passing; everything else shows a range. */
function formatPeriod(education: Education): string {
  if (education.level === 'CLASS_10' || education.level === 'CLASS_12') {
    return education.end_year ? String(education.end_year) : ''
  }
  if (education.start_year == null) return String(education.end_year ?? '')
  const start = education.start_month
    ? `${MONTHS[education.start_month - 1]} ${education.start_year}`
    : String(education.start_year)
  if (!education.end_year) return `${start} - Present`
  const end = education.end_month
    ? `${MONTHS[education.end_month - 1]} ${education.end_year}`
    : String(education.end_year)
  return `${start} - ${end}`
}

function shortScore(score: string | null, type: ScoreType | null): string {
  if (!score) return ''
  const cleaned = score.trim()
  if (type === 'CGPA') return `CGPA ${cleaned}`
  return `${cleaned}${cleaned.endsWith('%') ? '' : '%'}`
}

/** Mirrors `_school_highlights`: one bullet per result, most recent first. */
function schoolBullets(education: Education): string[] {
  if (education.level !== 'SCHOOL') return []
  const mixed =
    Boolean(education.class10_board && education.class12_board) &&
    education.class10_board !== education.class12_board
  const rows: [string, Board | null, Stream | null, string | null, ScoreType | null][] = [
    ['Class XII', education.class12_board, education.class12_stream,
      education.class12_score, education.class12_score_type],
    ['Class X', education.class10_board, null,
      education.class10_score, education.class10_score_type],
  ]
  return rows
    .filter(([, board]) => board)
    .map(([label, board, stream, score, type]) => {
      let name = mixed ? `${label}, ${boardLabel(board)}` : label
      if (stream) name = `${name} (${stream})`
      const result = shortScore(score, type)
      return result ? `${name}: ${result}` : name
    })
}

/** Board picker, reused by every school-level block. */
function BoardSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: Board | ''
  onChange: (board: Board | '') => void
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="input"
        required
        value={value}
        onChange={(event) => onChange(event.target.value as Board)}
      >
        <option value="">Select a board…</option>
        {(Object.keys(BOARD_LABELS) as Board[]).map((board) => (
          <option key={board} value={board}>
            {BOARD_LABELS[board]}
          </option>
        ))}
      </select>
    </div>
  )
}

function StreamSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: Stream | ''
  onChange: (stream: Stream | '') => void
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="input"
        required
        value={value}
        onChange={(event) => onChange(event.target.value as Stream)}
      >
        <option value="">Select a stream…</option>
        {(Object.keys(STREAM_LABELS) as Stream[]).map((stream) => (
          <option key={stream} value={stream}>
            {STREAM_LABELS[stream]}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Score value plus its unit. `label` names the field and `typeLabel` the unit
 *  picker; they must not contain one another, or a label lookup matches both. */
function ScoreInput({
  id,
  label,
  typeLabel,
  score,
  scoreType,
  onScore,
  onType,
}: {
  id: string
  label: string
  typeLabel: string
  score: string
  scoreType: ScoreType
  onScore: (value: string) => void
  onType: (value: ScoreType) => void
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label} <span className="text-slate-400">(optional)</span>
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          className="input"
          value={score}
          onChange={(event) => onScore(event.target.value)}
          placeholder={scoreType === 'CGPA' ? '8.7' : '92.4'}
        />
        <select
          className="input w-40 shrink-0"
          aria-label={typeLabel}
          value={scoreType}
          onChange={(event) => onType(event.target.value as ScoreType)}
        >
          <option value="CGPA">CGPA</option>
          <option value="PERCENTAGE">Percentage</option>
        </select>
      </div>
    </div>
  )
}

function YearSelect({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
}) {
  return (
    <select
      className="input"
      required={required}
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Year</option>
      {YEARS.map((year) => (
        <option key={year} value={year}>
          {year}
        </option>
      ))}
    </select>
  )
}

function MonthSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <select
      className="input"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Month</option>
      {MONTHS.map((month, index) => (
        <option key={month} value={index + 1}>
          {month}
        </option>
      ))}
    </select>
  )
}

/** Build the API payload for the current level, sending null (not '') for
 *  every field that does not apply - the backend rejects fields belonging to
 *  another level. */
function toPayload(form: FormState): EducationInput {
  const none = {
    board: null, stream: null, degree: null,
    start_year: null, end_year: null, start_month: null, end_month: null,
    score: null, score_type: null, coursework: '',
    class10_board: null, class10_score: null, class10_score_type: null,
    class12_board: null, class12_stream: null, class12_score: null,
    class12_score_type: null, start_grade: null, end_grade: null,
  }
  const base = {
    ...none,
    level: form.level,
    institution: form.institution.trim(),
    location: form.location.trim(),
  }
  const year = (value: string) => (value ? Number(value) : null)
  const score = form.score.trim()

  switch (form.level) {
    case 'HIGHER_ED':
      return {
        ...base,
        degree: form.degree.trim() || null,
        start_year: year(form.start_year),
        end_year: year(form.end_year),
        start_month: year(form.start_month),
        end_month: year(form.end_month),
        score: score || null,
        score_type: score ? form.score_type : null,
        coursework: form.coursework.trim(),
      }
    case 'CLASS_10':
    case 'CLASS_12':
      return {
        ...base,
        board: (form.board || null) as Board | null,
        stream: form.level === 'CLASS_12' ? ((form.stream || null) as Stream | null) : null,
        end_year: year(form.end_year),
        score: score || null,
        score_type: score ? form.score_type : null,
      }
    case 'SCHOOL': {
      const s10 = form.class10_score.trim()
      const s12 = form.class12_score.trim()
      return {
        ...base,
        start_year: year(form.start_year),
        end_year: year(form.end_year),
        start_grade: form.start_grade.trim() || null,
        end_grade: form.end_grade.trim() || null,
        ...(form.has_class10 && {
          class10_board: (form.class10_board || null) as Board | null,
          class10_score: s10 || null,
          class10_score_type: s10 ? form.class10_score_type : null,
        }),
        ...(form.has_class12 && {
          class12_board: (form.class12_board || null) as Board | null,
          class12_stream: (form.class12_stream || null) as Stream | null,
          class12_score: s12 || null,
          class12_score_type: s12 ? form.class12_score_type : null,
        }),
      }
    }
  }
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

  const isClassLevel = form.level === 'CLASS_10' || form.level === 'CLASS_12'
  const isSchool = form.level === 'SCHOOL'
  const isDegree = form.level === 'HIGHER_ED'

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  /** Switching level resets the fields that no longer apply, so a stale
   *  `stream` from a Class XII draft cannot ride along into a degree entry.
   *  Name and location carry over - they are usually still right. */
  function changeLevel(level: EducationLevel) {
    setForm((previous) => ({
      ...EMPTY,
      level,
      institution: previous.institution,
      location: previous.location,
      score_type: level === 'HIGHER_ED' ? 'CGPA' : 'PERCENTAGE',
    }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (isSchool && !form.has_class10 && !form.has_class12) {
      setError('Tick Class X, Class XII or both - a School entry needs at least one result.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.createEducation(toPayload(form))
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

  // Most recent first: degree, then school-level rows by year, then Class X.
  const levelOrder: Record<EducationLevel, number> = {
    HIGHER_ED: 0,
    SCHOOL: 1,
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
              {LEVEL_ORDER.map((level) => (
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
              ))}
            </div>
            {(isClassLevel || isSchool) && (
              <p className="mt-2 text-xs text-slate-500">
                {isSchool
                  ? 'One heading for your time at this school, with your Class X / XII results as bullets underneath. Changed schools? Add one School entry for each.'
                  : 'Prefer one heading per school with your results as bullets? Use "School (X & XII together)" instead.'}
              </p>
            )}
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="institution">
                {isDegree ? 'College / University' : 'School name'}
              </label>
              <input
                id="institution"
                className="input"
                required
                value={form.institution}
                onChange={(event) => update('institution', event.target.value)}
                placeholder={isDegree ? 'VIT Vellore' : 'Delhi Public School'}
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

            {/* --- Class X / XII: board and stream -------------------- */}
            {isClassLevel && (
              <BoardSelect
                id="board"
                label="Board"
                value={form.board}
                onChange={(value) => update('board', value)}
              />
            )}
            {form.level === 'CLASS_12' && (
              <StreamSelect
                id="stream"
                label="Stream / specialisation"
                value={form.stream}
                onChange={(value) => update('stream', value)}
              />
            )}

            {/* --- Higher education only: degree --------------------- */}
            {isDegree && (
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

          {/* --- Dates ------------------------------------------------- */}
          {isClassLevel ? (
            // A board result is one moment: only the year of passing, which is
            // all the resume shows.
            <div className="sm:w-1/2">
              <span className="label">
                Year of passing{' '}
                <span className="text-slate-400">(or expected)</span>
              </span>
              <YearSelect
                label="Year of passing"
                required
                value={form.end_year}
                onChange={(value) => update('end_year', value)}
              />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="label">{isSchool ? 'Joined this school' : 'Started'}</span>
                <div className="flex gap-2">
                  {isDegree && (
                    <MonthSelect
                      label="Start month"
                      value={form.start_month}
                      onChange={(value) => update('start_month', value)}
                    />
                  )}
                  <YearSelect
                    label="Start year"
                    required
                    value={form.start_year}
                    onChange={(value) => update('start_year', value)}
                  />
                </div>
              </div>

              <div>
                <span className="label">
                  {isSchool ? 'Left this school' : 'Graduating'}{' '}
                  <span className="text-slate-400">(blank if ongoing)</span>
                </span>
                <div className="flex gap-2">
                  {isDegree && (
                    <MonthSelect
                      label="End month"
                      value={form.end_month}
                      onChange={(value) => update('end_month', value)}
                    />
                  )}
                  <YearSelect
                    label="End year"
                    value={form.end_year}
                    onChange={(value) => update('end_year', value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* --- Score: degree and Class X / XII ----------------------- */}
          {!isSchool && (
            <div className="grid gap-3 sm:grid-cols-2">
              <ScoreInput
                id="score"
                label={form.score_type === 'CGPA' ? 'CGPA' : 'Percentage'}
                typeLabel="Score type"
                score={form.score}
                scoreType={form.score_type}
                onScore={(value) => update('score', value)}
                onType={(value) => update('score_type', value)}
              />

              {isDegree && (
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
          )}

          {/* --- School: grade span, free text for any system -------- */}
          {isSchool && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="start-grade">
                  From grade <span className="text-slate-400">(optional)</span>
                </label>
                <input
                  id="start-grade"
                  className="input"
                  maxLength={30}
                  value={form.start_grade}
                  onChange={(event) => update('start_grade', event.target.value)}
                  placeholder="LKG"
                />
              </div>
              <div>
                <label className="label" htmlFor="end-grade">
                  To grade <span className="text-slate-400">(optional)</span>
                </label>
                <input
                  id="end-grade"
                  className="input"
                  maxLength={30}
                  value={form.end_grade}
                  onChange={(event) => update('end_grade', event.target.value)}
                  placeholder="Class XII"
                />
              </div>
            </div>
          )}

          {/* --- School: the results taken here ----------------------- */}
          {isSchool && (
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={form.has_class12}
                    onChange={(event) => update('has_class12', event.target.checked)}
                  />
                  I took Class XII at this school
                </label>
                {form.has_class12 && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <BoardSelect
                      id="class12-board"
                      label="Class XII board"
                      value={form.class12_board}
                      onChange={(value) => update('class12_board', value)}
                    />
                    <StreamSelect
                      id="class12-stream"
                      label="Class XII stream"
                      value={form.class12_stream}
                      onChange={(value) => update('class12_stream', value)}
                    />
                    <ScoreInput
                      id="class12-score"
                      label="Class XII score"
                      typeLabel="Class XII scale"
                      score={form.class12_score}
                      scoreType={form.class12_score_type}
                      onScore={(value) => update('class12_score', value)}
                      onType={(value) => update('class12_score_type', value)}
                    />
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={form.has_class10}
                    onChange={(event) => update('has_class10', event.target.checked)}
                  />
                  I took Class X at this school
                </label>
                {form.has_class10 && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <BoardSelect
                      id="class10-board"
                      label="Class X board"
                      value={form.class10_board}
                      onChange={(value) => update('class10_board', value)}
                    />
                    <ScoreInput
                      id="class10-score"
                      label="Class X score"
                      typeLabel="Class X scale"
                      score={form.class10_score}
                      scoreType={form.class10_score_type}
                      onScore={(value) => update('class10_score', value)}
                      onType={(value) => update('class10_score_type', value)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {sorted.map((education) => {
          const bullets = schoolBullets(education)
          const score = shortScore(education.score, education.score_type)
          return (
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
                    {score && ` · ${score}`}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatPeriod(education)}
                  </p>
                  {bullets.length > 0 && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
                      {bullets.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
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
          )
        })}

        {educations.length === 0 && !open && (
          <p className="text-sm text-slate-500">Nothing added yet.</p>
        )}
      </div>
    </section>
  )
}
