import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import Alert from '../components/Alert'
import LazyResumePreview from '../components/LazyResumePreview'
import { useApi } from '../hooks/useApi'
import { ApiError } from '../lib/api'
import type { TailorResponse } from '../lib/types'

const ACCEPTED = '.pdf,.docx,.txt,.md'
const MAX_BYTES = 5 * 1024 * 1024 // mirrors jd_parser.MAX_UPLOAD_BYTES

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

export default function Tailor() {
  const api = useApi()
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [jobTitle, setJobTitle] = useState('')
  const [result, setResult] = useState<TailorResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
   *  instead of after a 5 MB upload. The server re-checks regardless. */
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
      setError(`That file is ${formatSize(candidate.size)}. The limit is 5 MB.`)
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
    try {
      setResult(await api.tailor(file, jobTitle.trim() || undefined))
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Something went wrong. Try again.',
      )
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
                  PDF, DOCX, TXT or MD · up to 5 MB
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
            <div className="mt-3 flex flex-wrap gap-1.5">
              {result.analysis.keywords.map((keyword) => (
                <span key={keyword} className="chip">
                  {keyword}
                </span>
              ))}
            </div>
          </div>

          <LazyResumePreview resume={result.resume} jobTitle={result.job_title} />

          <p className="text-center text-xs text-slate-500">
            Read it before you send it. The AI selects and rewrites - you are
            still the one signing your name to it.
          </p>
        </div>
      )}
    </div>
  )
}
