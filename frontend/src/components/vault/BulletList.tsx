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
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draftText, setDraftText] = useState('')
  const [draftTags, setDraftTags] = useState('')

  function startEdit(bullet: Bullet) {
    setEditingId(bullet.id)
    // Edit what is shown, which is the AI version when there is one.
    setDraftText(bullet.ai_enhanced_text ?? bullet.original_text)
    setDraftTags(bullet.tags)
    setError(null)
  }

  async function saveEdit(id: number) {
    if (draftText.trim() === '') {
      setError('A bullet cannot be empty - delete it instead.')
      return
    }
    try {
      await api.updateBullet(id, {
        original_text: draftText.trim(),
        // The list shows the AI version when there is one, so leaving it in
        // place would hide the edit and make it look unsaved. The student's
        // own wording is the source of truth from here on.
        ai_enhanced_text: null,
        tags: draftTags.trim(),
      })
      setEditingId(null)
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that bullet.')
    }
  }

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
    <div className="mt-3 border-t border-line pt-3">
      <ul className="space-y-1.5">
        {bullets.map((bullet) => (
          editingId === bullet.id ? (
            <li key={bullet.id} className="space-y-2 rounded-xl bg-surface-2 p-2">
              <textarea
                className="input"
                rows={2}
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
                aria-label="Edit bullet text"
                autoFocus
              />
              <div className="flex gap-2">
                <input
                  className="input"
                  value={draftTags}
                  onChange={(event) => setDraftTags(event.target.value)}
                  aria-label="Edit tags"
                  placeholder="Tags: python, rest api"
                />
                <button
                  type="button"
                  className="btn-primary shrink-0 text-xs"
                  onClick={() => void saveEdit(bullet.id)}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="btn-secondary shrink-0 text-xs"
                  onClick={() => setEditingId(null)}
                >
                  Cancel
                </button>
              </div>
            </li>
          ) : (
          <li key={bullet.id} className="group flex items-start gap-2 text-sm">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
            <div className="flex-1">
              <p className="text-ink-muted">
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
              onClick={() => startEdit(bullet)}
              className="shrink-0 text-xs text-ink-faint hover:text-iris-fg"
              aria-label="Edit bullet"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => void removeBullet(bullet.id)}
              className="shrink-0 text-xs text-ink-faint hover:text-danger"
              aria-label="Delete bullet"
            >
              Delete
            </button>
          </li>
          )
        ))}

        {bullets.length === 0 && (
          <li className="text-sm text-ink-faint">
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
        <p className="text-xs text-ink-faint">
          Tags are how this bullet gets matched to a job description. Keep them
          short and lowercase.
        </p>
        {error && <p className="text-xs text-danger">{error}</p>}
      </form>
    </div>
  )
}
