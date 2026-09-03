import { useState } from 'react'

import { useApi } from '../../hooks/useApi'
import { ApiError } from '../../lib/api'
import type { Bullet, EntityType } from '../../lib/types'

/**
 * The achievement lines attached to one experience or project.
 *
 * Bullets are the raw material the tailoring engine works from, so the UI
 * pushes students toward good ones: the placeholder models the "X by Y using Z"
 * shape, and the tags field is explained rather than left as a mystery box.
 */
export default function BulletList({
  entityType,
  entityId,
  bullets,
  onChange,
}: {
  entityType: EntityType
  entityId: number
  bullets: Bullet[]
  onChange: () => void
}) {
  const api = useApi()
  const [text, setText] = useState('')
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function addBullet(event: React.FormEvent) {
    event.preventDefault()
    if (text.trim() === '') return

    setBusy(true)
    setError(null)
    try {
      await api.createBullet({
        entity_type: entityType,
        entity_id: entityId,
        original_text: text.trim(),
        tags: tags.trim(),
      })
      setText('')
      setTags('')
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add that bullet.')
    } finally {
      setBusy(false)
    }
  }

  async function removeBullet(id: number) {
    try {
      await api.deleteBullet(id)
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete that bullet.')
    }
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <ul className="space-y-1.5">
        {bullets.map((bullet) => (
          <li key={bullet.id} className="group flex items-start gap-2 text-sm">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
            <div className="flex-1">
              <p className="text-slate-700">
                {bullet.ai_enhanced_text ?? bullet.original_text}
              </p>
              {bullet.tags && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {bullet.tags
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean)
                    .map((tag) => (
                      <span key={tag} className="chip">
                        {tag}
                      </span>
                    ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void removeBullet(bullet.id)}
              className="shrink-0 text-xs text-slate-400 opacity-0 transition group-hover:opacity-100 hover:text-red-600"
              aria-label="Delete bullet"
            >
              Delete
            </button>
          </li>
        ))}

        {bullets.length === 0 && (
          <li className="text-sm text-slate-400">
            No bullets yet. The tailoring engine can only use what is here.
          </li>
        )}
      </ul>

      <form onSubmit={addBullet} className="mt-3 space-y-2">
        <input
          className="input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Built a REST API serving course data, using FastAPI and PostgreSQL"
          aria-label="Bullet text"
        />
        <div className="flex gap-2">
          <input
            className="input"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="Tags: python, rest api, postgresql"
            aria-label="Tags, comma separated"
          />
          <button type="submit" className="btn-secondary shrink-0" disabled={busy}>
            {busy ? 'Adding…' : 'Add bullet'}
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Tags are how this bullet gets matched to a job description. Keep them
          short and lowercase.
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
    </div>
  )
}
