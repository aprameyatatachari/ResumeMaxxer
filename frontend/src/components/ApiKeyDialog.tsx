import { useEffect, useRef, useState } from 'react'

import {
  clearGeminiKey,
  describeKeyProblem,
  getGeminiKey,
  maskGeminiKey,
  setGeminiKey,
} from '../lib/gemini-key'

const AI_STUDIO_URL = 'https://aistudio.google.com/apikey'

/**
 * Where a student adds their own Gemini API key.
 *
 * Opened either deliberately, or automatically when the free weekly allowance
 * runs out - which is the moment that matters. Someone hitting a wall
 * mid-application needs to be walked through minting a key, not told to go
 * read Google's documentation, so the steps are spelled out in full rather
 * than reduced to a link.
 *
 * The key never leaves this browser except as a request header. See
 * `lib/gemini-key.ts` for the storage model and what it trades away.
 */
export default function ApiKeyDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  /** Fired after a save or a removal, so the caller can refresh the quota -
   *  the numbers mean something different once a key is in play. */
  onSaved: () => void
}) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Seeded straight from storage by a lazy initialiser, rather than mirrored
  // in by an effect. The parent mounts this component only while it is open
  // (`{open && <Dialog/>}`), so every opening re-runs these initialisers and
  // there is nothing stale to re-synchronise - which is why this file has no
  // state-resetting effect.
  const [saved, setSaved] = useState<string | null>(getGeminiKey)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the field, so a student who came here to paste can just paste.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Escape closes. Expected of anything modal, and its absence is the kind of
  // thing only keyboard users notice - which is exactly why it matters.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function save() {
    const problem = describeKeyProblem(draft)
    if (problem) {
      setError(problem)
      return
    }
    if (!setGeminiKey(draft)) {
      // Storage refused - private mode, or site data blocked. Saying so beats
      // pretending it worked and losing the key on reload.
      setError(
        'This browser would not let the key be saved. It may be in private mode, or set to block site data.',
      )
      return
    }
    setError(null)
    setSaved(getGeminiKey())
    setDraft('')
    onSaved()
    onClose()
  }

  function remove() {
    clearGeminiKey()
    setSaved(null)
    setDraft('')
    setError(null)
    onSaved()
  }

  return (
    <div
      // Clicking the backdrop closes; clicking inside must not, hence the
      // stopPropagation on the panel.
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 py-10 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-key-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-lg"
      >
        <div className="flex items-start justify-between gap-4">
          <h2
            id="api-key-title"
            className="text-lg font-semibold tracking-tight text-slate-900"
          >
            Use your own Gemini API key
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-xl leading-none text-slate-400 hover:text-slate-600"
          >
            ×
          </button>
        </div>

        <p className="mt-2 text-sm text-slate-600">
          ResumeMaxxer covers a few tailoring runs each week. Add your own key
          and you get unlimited runs on Google's free tier instead - it takes
          about a minute, and the key stays in this browser.
        </p>

        {/* --- The instructions ------------------------------------------
            Written out in full on purpose. A student who has just been told
            "you are out of free runs" is mid-task and frustrated; sending them
            off to find Google's docs loses them. */}
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-800">
            How to get one
          </h3>
          <ol className="mt-2 space-y-2 text-sm text-slate-700">
            <li className="flex gap-2">
              <span className="font-semibold text-brand-600">1.</span>
              <span>
                Open{' '}
                <a
                  href={AI_STUDIO_URL}
                  target="_blank"
                  // noreferrer alongside noopener: this is an external tab and
                  // it has no business knowing where it was opened from.
                  rel="noopener noreferrer"
                  className="font-medium text-brand-600 underline"
                >
                  aistudio.google.com/apikey
                </a>{' '}
                and sign in with your Google account. Any Gmail or college
                account works.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-brand-600">2.</span>
              <span>
                Click <strong>Create API key</strong>. If it asks which Google
                Cloud project to use, take the one it suggests - a new account
                gets a default project made for it automatically.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-brand-600">3.</span>
              <span>
                Copy the key it shows you. It is a long string starting with{' '}
                <code className="rounded bg-slate-200 px-1 py-0.5 text-xs">
                  AIza
                </code>
                . Copy all of it - the end is easy to miss.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-brand-600">4.</span>
              <span>Paste it below and save. That is it.</span>
            </li>
          </ol>

          <p className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500">
            Google's free tier covers this kind of use. If you ever want the key
            back or want to switch it off, the same page lists your keys and can
            delete them - deleting it there stops it working here immediately.
          </p>
        </div>

        {/* --- Current key ----------------------------------------------- */}
        {saved && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-emerald-800">
                A key is saved in this browser
              </p>
              {/* Masked, never whole: enough to recognise the key you chose,
                  useless to anyone reading over a shoulder. */}
              <p className="font-mono text-xs text-emerald-700">
                {maskGeminiKey(saved)}
              </p>
            </div>
            <button type="button" onClick={remove} className="btn-danger shrink-0">
              Remove
            </button>
          </div>
        )}

        {/* --- Input ------------------------------------------------------ */}
        <div className="mt-4">
          <label className="label" htmlFor="gemini-key">
            {saved ? 'Replace with a different key' : 'Your Gemini API key'}
          </label>
          <input
            ref={inputRef}
            id="gemini-key"
            // `password` so it is masked on screen and browsers do not offer
            // to remember it as ordinary text. autoComplete off for the same
            // reason: this is a credential, not a form field to helpfully
            // recall.
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="input font-mono"
            placeholder="AIza…"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                save()
              }
            }}
          />
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {error}
            </p>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="btn-primary"
            disabled={!draft.trim()}
          >
            Save key
          </button>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          The key is stored in this browser only and sent with your tailoring
          requests so they run on your Google quota. ResumeMaxxer never saves it
          on the server, so you will need to paste it again on another device.
        </p>
      </div>
    </div>
  )
}
