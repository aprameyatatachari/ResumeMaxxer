import { useCallback, useEffect, useRef, useState } from 'react'

import { useApi } from '../hooks/useApi'
import { ApiError } from '../lib/api'
import type { ResumePayload } from '../lib/types'
import Alert from './Alert'
import ResumeEditor from './ResumeEditor'
import Spinner from './Spinner'

/**
 * Live PDF preview.
 *
 * The document is compiled from real LaTeX by the backend, so this shows the
 * actual file rather than an approximation of it - what you see is byte-for-byte
 * what downloads.
 *
 * The trade-off versus the old in-browser renderer is a round trip per render,
 * which is why re-rendering is explicit (the student hits "Update preview")
 * rather than firing on every keystroke.
 */
export default function ResumePreview({
  resume,
  jobTitle,
  onChange,
  onSave,
  saving,
}: {
  resume: ResumePayload
  jobTitle: string
  /** Called when the student edits the payload. Omit to make the preview read-only. */
  onChange?: (next: ResumePayload) => void
  /** Called to persist edits. Omit to hide the save button. */
  onSave?: () => void
  saving?: boolean
}) {
  const api = useApi()
  const [url, setUrl] = useState<string | null>(null)
  const [rendering, setRendering] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  // The payload the preview currently shows, so the "unrendered edits" hint
  // knows whether the document is stale.
  const [renderedJson, setRenderedJson] = useState<string>('')
  // Held so the object URL can be revoked when it is replaced or unmounted -
  // without this, every re-render leaks a blob for the life of the tab.
  const urlRef = useRef<string | null>(null)

  const render = useCallback(
    async (payload: ResumePayload) => {
      setRendering(true)
      setError(null)
      try {
        const blob = await api.renderPdf(payload, jobTitle)
        const next = URL.createObjectURL(blob)
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        urlRef.current = next
        setUrl(next)
        setRenderedJson(JSON.stringify(payload))
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : 'Could not build the PDF.',
        )
      } finally {
        setRendering(false)
      }
    },
    [api, jobTitle],
  )

  // Render on mount, and whenever a different resume is passed in (opening
  // another one from history). Edits do NOT retrigger this - they are applied
  // on demand.
  useEffect(() => {
    void render(resume)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [render])

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  const stale = renderedJson !== '' && renderedJson !== JSON.stringify(resume)
  const filename = `${(resume.header.full_name || 'Resume').replace(/[^A-Za-z0-9]+/g, '_')}_${jobTitle.replace(/[^A-Za-z0-9]+/g, '_')}.pdf`

  return (
    <div className="space-y-3">
      {/* --- Why these entries were picked ------------------------------- */}
      {resume.selection_rationale && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">
            Why these were chosen
          </p>
          <p className="mt-1 text-sm text-slate-700">
            {resume.selection_rationale}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">Preview</h2>
          <p className="text-xs text-slate-500">
            Compiled from LaTeX — this is the exact file you will download.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onChange && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setEditing((value) => !value)}
            >
              {editing ? 'Done editing' : 'Edit text'}
            </button>
          )}
          {stale && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => void render(resume)}
              disabled={rendering}
            >
              {rendering ? 'Rendering…' : 'Update preview'}
            </button>
          )}
          {onSave && (
            <button
              type="button"
              className="btn-secondary"
              onClick={onSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          )}
          <a
            className={url && !stale ? 'btn-primary' : 'btn-secondary pointer-events-none opacity-50'}
            href={url ?? '#'}
            download={filename}
          >
            Download PDF
          </a>
        </div>
      </div>

      {stale && (
        <Alert variant="info">
          You have edits that are not in the preview yet. Hit{' '}
          <strong>Update preview</strong> to rebuild it, then download.
        </Alert>
      )}
      {error && <Alert variant="error">{error}</Alert>}

      {editing && onChange && (
        <ResumeEditor resume={resume} onChange={onChange} />
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {rendering && !url ? (
          <div className="grid h-[820px] place-items-center">
            <Spinner label="Compiling your resume…" />
          </div>
        ) : url ? (
          // An <iframe> rather than <embed>: it keeps the browser's own PDF
          // viewer, which students already know how to scroll and zoom.
          <iframe
            src={url}
            title="Resume preview"
            className="h-[820px] w-full"
            style={{ border: 'none' }}
          />
        ) : (
          <div className="grid h-[820px] place-items-center text-sm text-slate-500">
            No preview available.
          </div>
        )}
      </div>
    </div>
  )
}
