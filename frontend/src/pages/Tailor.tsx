import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import Alert from '../components/Alert'
import ApiKeyDialog from '../components/ApiKeyDialog'
import ResumePreview from '../components/ResumePreview'
import { useApi } from '../hooks/useApi'
import { ApiError } from '../lib/api'
import { hasGeminiKey } from '../lib/gemini-key'
import type { QuotaStatus, ResumePayload, TailorResponse } from '../lib/types'

const ACCEPTED = '.pdf,.docx,.txt,.md'
// Mirrors jd_parser.MAX_UPLOAD_BYTES. Both are under Vercel's 4.5 MB request
// body limit on purpose - a bigger file is rejected by the platform before the
// API sees it, with an error that tells the student nothing.
const MAX_BYTES = 4 * 1024 * 1024

/**
 * Staged progress copy.
 *
 * Tailoring is a file parse plus two sequential Gemini calls plus a DB write -
 * several seconds. A spinner that never changes reads as "frozen", so the
 * label advances on a timer to show the work moving. These are honest stage
 * names, not fake percentages.
 */
const STAGES = [
  'Reading the job description file…',
  'Working out what the role screens for…',
  'Matching it against your vault…',
  'Rewriting your best material…',
  'Fitting it onto one page…',
]

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** "Monday 14 September", from the ISO date the API returns. */
function formatResetDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

/**
 * The free-allowance banner.
 *
 * Shown before the student spends a run rather than after, because "you have
 * one left" changes whether they bother tailoring for a role they are lukewarm
 * about. Runs on their own key are unmetered, so it says so and stops counting.
 */
function QuotaBanner({
  quota,
  onAddKey,
}: {
  quota: QuotaStatus
  onAddKey: () => void
}) {
  if (quota.using_own_key) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm">
        <span className="text-emerald-800">
          Running on your own Gemini key — unlimited tailoring.
        </span>
        <button
          type="button"
          onClick={onAddKey}
          className="font-medium text-emerald-700 underline"
        >
          Manage key
        </button>
      </div>
    )
  }

  const out = quota.remaining <= 0
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2.5 text-sm ${
        out
          ? 'border-amber-200 bg-amber-50'
          : 'border-slate-200 bg-white'
      }`}
    >
      <span className={out ? 'text-amber-900' : 'text-slate-600'}>
        {out ? (
          <>
            You have used all {quota.limit} free tailoring runs this week. They
            reset on {formatResetDate(quota.resets_on)}.
          </>
        ) : (
          <>
            <strong className="text-slate-900">
              {quota.remaining} of {quota.limit}
            </strong>{' '}
            free tailoring runs left this week.
          </>
        )}
      </span>
      <button
        type="button"
        onClick={onAddKey}
        className={`font-medium underline ${
          out ? 'text-amber-900' : 'text-brand-600'
        }`}
      >
        {out ? 'Add your own key to carry on' : 'Use your own key instead'}
      </button>
    </div>
  )
}

export default function Tailor() {
  const api = useApi()
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [jobTitle, setJobTitle] = useState('')
  const [result, setResult] = useState<TailorResponse | null>(null)
  // The payload the student may have edited. Kept apart from `result` so the
  // AI's original output is never lost by an edit.
  const [edited, setEdited] = useState<ResumePayload | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [quota, setQuota] = useState<QuotaStatus | null>(null)
  const [keyDialogOpen, setKeyDialogOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  /**
   * Load the allowance.
   *
   * Deliberately silent on failure: the counter is useful context, not
   * something worth showing an error for. A student who cannot see it can
   * still tailor, and the real enforcement is server-side anyway.
   */
  const refreshQuota = useCallback(() => {
    api
      .getQuota()
      .then(setQuota)
      .catch(() => setQuota(null))
  }, [api])

  useEffect(() => {
    refreshQuota()
  }, [refreshQuota])

  // Advance the progress label while a request is in flight.
  useEffect(() => {
    if (!busy) {
      setStage(0)
      return
    }
    const timer = setInterval(
      () => setStage((current) => Math.min(current + 1, STAGES.length - 1)),
      2500,
    )
    return () => clearInterval(timer)
  }, [busy])

  /** Validate client-side too, so an obviously wrong file fails instantly
   *  instead of after a 4 MB upload. The server re-checks regardless. */
  function accept(candidate: File | undefined) {
    if (!candidate) return
    setError(null)

    const name = candidate.name.toLowerCase()
    if (!ACCEPTED.split(',').some((extension) => name.endsWith(extension))) {
      setError(
        name.endsWith('.doc')
          ? 'Legacy .doc files cannot be read. Open it in Word or Google Docs and save it as .docx or PDF.'
          : 'Upload a PDF, DOCX, TXT or MD file.',
      )
      return
    }
    if (candidate.size > MAX_BYTES) {
      setError(`That file is ${formatSize(candidate.size)}. The limit is 4 MB.`)
      return
    }
    setFile(candidate)
    setResult(null)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!file) return

    setBusy(true)
    setError(null)
    setResult(null)
    setEdited(null)
    try {
      const response = await api.tailor(file, jobTitle.trim() || undefined)
      setResult(response)
      setEdited(response.resume)
      // The run reports the allowance it just spent, so the banner updates
      // without a second request.
      setQuota(response.quota)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Something went wrong. Try again.',
      )
      if (err instanceof ApiError && err.status === 429) {
        // Out of free runs. The way forward is their own key, so open the
        // dialog rather than leaving them to find the link - they are mid-task
        // and the message alone is a dead end.
        refreshQuota()
        if (!hasGeminiKey()) setKeyDialogOpen(true)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Tailor a resume
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Upload the job description exactly as the company sent it - PDF or Word.
          The text is read out of the file automatically.
        </p>
      </header>

      {quota && (
        <QuotaBanner quota={quota} onAddKey={() => setKeyDialogOpen(true)} />
      )}

      {/* Mounted only while open, so each opening starts from clean state
          without an effect to reset it. */}
      {keyDialogOpen && (
        <ApiKeyDialog
          onClose={() => setKeyDialogOpen(false)}
          // Adding or removing a key changes what the counters mean, so re-read
          // rather than guessing at the new state.
          onSaved={refreshQuota}
        />
      )}

      <form onSubmit={submit} className="card space-y-4">
        {/* --- Drop zone --------------------------------------------------
            A label wrapping a hidden input keeps this keyboard-accessible and
            screen-reader-correct, which a bare div with onClick would not. */}
        <div>
          <span className="label">Job description file</span>
          <label
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              accept(event.dataTransfer.files?.[0])
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
              dragging
                ? 'border-brand-500 bg-brand-50'
                : 'border-slate-300 bg-slate-50 hover:border-brand-300 hover:bg-brand-50/40'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              className="sr-only"
              onChange={(event) => accept(event.target.files?.[0])}
            />
            {file ? (
              <>
                <span className="font-medium text-slate-900">{file.name}</span>
                <span className="mt-1 text-xs text-slate-500">
                  {formatSize(file.size)} · click to choose a different file
                </span>
              </>
            ) : (
              <>
                <span className="font-medium text-slate-700">
                  Drop the JD here, or click to browse
                </span>
                <span className="mt-1 text-xs text-slate-500">
                  PDF, DOCX, TXT or MD · up to 4 MB
                </span>
              </>
            )}
          </label>
          <p className="mt-2 text-xs text-slate-400">
            Scanned PDFs will not work - the text has to be selectable. If yours
            is a scan, paste the text into a .txt file instead.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="job-title">
            Role title <span className="text-slate-400">(optional - AI infers it)</span>
          </label>
          <input
            id="job-title"
            className="input"
            value={jobTitle}
            onChange={(event) => setJobTitle(event.target.value)}
            placeholder="Backend Engineering Intern"
          />
        </div>

        <div className="flex items-center gap-4">
          <button type="submit" className="btn-primary" disabled={busy || !file}>
            {busy ? 'Tailoring…' : 'Tailor my resume'}
          </button>
          {busy && (
            <span className="flex items-center gap-2 text-sm text-slate-500">
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600"
                aria-hidden="true"
              />
              {STAGES[stage]}
            </span>
          )}
        </div>
      </form>

      {error && (
        <Alert variant="error" onDismiss={() => setError(null)}>
          {error}
          {error.includes('vault') && (
            <>
              {' '}
              <Link to="/vault" className="font-medium underline">
                Go to your vault
              </Link>
            </>
          )}
        </Alert>
      )}

      {result && (
        <div className="space-y-6">
          {/* What was actually read out of the file. A silently bad parse is
              the worst failure mode here - it produces a plausible but
              generic resume - so the student gets to see the evidence. */}
          <details className="card">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">
              Read {result.source.char_count.toLocaleString()} characters from{' '}
              {result.source.filename} — check this looks right
            </summary>
            <pre className="mt-3 max-h-48 overflow-y-auto rounded-lg bg-slate-50 p-3 text-xs whitespace-pre-wrap text-slate-600">
              {result.source.preview}
              {result.source.char_count > result.source.preview.length && '\n…'}
            </pre>
          </details>

          <div className="card">
            <h2 className="font-semibold text-slate-900">
              What this role screens for
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {result.analysis.job_title}
              {result.analysis.company ? ` · ${result.analysis.company}` : ''} ·{' '}
              {result.analysis.seniority}
            </p>

            {/* Which part of the posting drove the tailoring. Worth showing:
                a JD with a stated requirements list is tailored against that
                list, and one without falls back to reading the whole
                document - the results differ, so the student should know
                which happened. */}
            {result.source.qualifications_heading ? (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <p className="text-xs font-semibold text-emerald-800">
                  Prioritised the posting's “{result.source.qualifications_heading}”
                  section
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-slate-700">
                  {result.source.required_qualifications.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
                {result.source.preferred_qualifications.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    Plus {result.source.preferred_qualifications.length} nice-to-have
                    {result.source.preferred_qualifications.length === 1 ? '' : 's'},
                    weighted lower.
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                No stated qualifications section in this posting, so the whole
                document was used to infer what matters.
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5">
              {result.analysis.keywords.map((keyword) => (
                <span
                  key={keyword}
                  className={
                    result.analysis.required_keywords.includes(keyword)
                      ? 'chip bg-emerald-100 text-emerald-800'
                      : 'chip'
                  }
                  title={
                    result.analysis.required_keywords.includes(keyword)
                      ? 'From the stated qualifications - matched at double weight'
                      : 'Inferred from the rest of the posting'
                  }
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>

          {edited && (
            <ResumePreview
              resume={edited}
              jobTitle={result.job_title}
              onChange={setEdited}
              saving={saving}
              onSave={async () => {
                setSaving(true)
                setError(null)
                try {
                  await api.saveGeneratedResume(result.resume_id, edited)
                } catch (err) {
                  setError(
                    err instanceof ApiError ? err.message : 'Could not save.',
                  )
                } finally {
                  setSaving(false)
                }
              }}
            />
          )}

          <p className="text-center text-xs text-slate-500">
            Read it before you send it. The AI selects and rewrites - you are
            still the one signing your name to it.
          </p>
        </div>
      )}
    </div>
  )
}
