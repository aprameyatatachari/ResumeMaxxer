import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import Alert from '../components/Alert'
import ResumePreview from '../components/ResumePreview'
import Spinner from '../components/Spinner'
import { useApi } from '../hooks/useApi'
import { ApiError } from '../lib/api'
import type { GeneratedResumeDetail, GeneratedResumeSummary } from '../lib/types'

/**
 * Past tailoring runs.
 *
 * The list endpoint omits `resume_json`, so opening one is a second fetch.
 * That keeps this page fast when a student has fifty saved resumes, and the
 * stored payload re-renders byte-identically even if their vault has changed
 * since.
 */
export default function History() {
  const api = useApi()
  const [items, setItems] = useState<GeneratedResumeSummary[]>([])
  const [selected, setSelected] = useState<GeneratedResumeDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await api.getHistory())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your history.')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  async function open(id: number) {
    setOpening(id)
    setError(null)
    try {
      setSelected(await api.getGeneratedResume(id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open that resume.')
    } finally {
      setOpening(null)
    }
  }

  async function remove(id: number) {
    try {
      await api.deleteGeneratedResume(id)
      if (selected?.id === id) setSelected(null)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete that.')
    }
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner label="Loading your resumes…" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">History</h1>
        <p className="mt-1 text-sm text-slate-600">
          Every resume you have generated, re-downloadable exactly as it was.
        </p>
      </header>

      {error && (
        <Alert variant="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {items.length === 0 ? (
        <div className="card text-center">
          <p className="text-sm text-slate-600">Nothing here yet.</p>
          <Link to="/tailor" className="btn-primary mt-4">
            Tailor your first resume
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="card flex items-center justify-between gap-4 py-3"
            >
              <div>
                <p className="font-medium text-slate-900">{item.job_title}</p>
                <p className="text-xs text-slate-500">
                  {new Date(item.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  onClick={() => void open(item.id)}
                  disabled={opening === item.id}
                >
                  {opening === item.id ? 'Opening…' : 'Open'}
                </button>
                <button
                  type="button"
                  className="btn-danger text-xs"
                  onClick={() => void remove(item.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <ResumePreview resume={selected.resume_json} jobTitle={selected.job_title} />
      )}
    </div>
  )
}
