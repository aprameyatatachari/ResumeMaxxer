import { useState } from 'react'

import { bulletsFor } from '../../hooks/useVault'
import { useApi } from '../../hooks/useApi'
import { ApiError } from '../../lib/api'
import type { Bullet, Project, ProjectInput } from '../../lib/types'
import Alert from '../Alert'
import BulletList from './BulletList'
import { movedIds } from '../../lib/reorder'
import MoveButtons from './MoveButtons'
import SortableCard from './SortableCard'
import GitHubImportPanel from './GitHubImportPanel'

/** The project form, shared by "add manually" and "edit". */
function ProjectForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: { title: string; repo_url: string; tech_stack: string }
  submitLabel: string
  onSubmit: (payload: ProjectInput) => Promise<void>
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
        title: form.title.trim(),
        repo_url: form.repo_url.trim() || null,
        tech_stack: form.tech_stack.trim(),
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
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="proj-title">
            Title
          </label>
          <input
            id="proj-title"
            className="input"
            required
            value={form.title}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, title: event.target.value }))
            }
            placeholder="Course Scheduler"
          />
        </div>
        <div>
          <label className="label" htmlFor="proj-url">
            Link <span className="text-ink-faint">(optional)</span>
          </label>
          <input
            id="proj-url"
            className="input"
            value={form.repo_url}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, repo_url: event.target.value }))
            }
            placeholder="https://…"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="proj-stack">
            Tech stack
          </label>
          <input
            id="proj-stack"
            className="input"
            value={form.tech_stack}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, tech_stack: event.target.value }))
            }
            placeholder="React, TypeScript, PostgreSQL"
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
 * Projects, plus the GitHub import flow.
 *
 * Import is the headline feature of this section: one URL becomes a titled
 * project with 4-5 tagged bullets, which is the fastest way to get a thin
 * vault to a useful state.
 */
export default function ProjectSection({
  projects,
  groupedBullets,
  onChange,
}: {
  projects: Project[]
  groupedBullets: Map<string, Bullet[]>
  onChange: () => void
}) {
  const api = useApi()
  const [repoUrl, setRepoUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  // One form at a time, so field ids never collide on the page.
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function importRepo(event: React.FormEvent) {
    event.preventDefault()
    setImporting(true)
    setError(null)
    setNotice(null)
    try {
      const result = await api.importRepo(repoUrl.trim())
      setRepoUrl('')
      setNotice(
        `Imported ${result.project.title} with ${result.bullets.length} AI-written bullets. Review them before you apply.`,
      )
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

  /** Save a new order. The list re-renders from the server response, so a
   *  failed save simply leaves the old order on screen. */
  async function move(ids: number[]) {
    try {
      await api.reorderProjects(ids)
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reorder.')
    }
  }

  async function remove(id: number) {
    try {
      await api.deleteProject(id)
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete that.')
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Projects</h2>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setEditingId(null)
            setManualOpen((value) => !value)
          }}
        >
          {manualOpen ? 'Cancel' : 'Add manually'}
        </button>
      </div>

      {/* --- Bulk import by GitHub username ------------------------------- */}
      <GitHubImportPanel onChange={onChange} />

      {/* --- Fallback: one repo by URL ------------------------------------
          The username listing only finds repos the student owns. This covers
          a repo they contributed to under someone else's account. */}
      <details className="mb-3">
        <summary className="cursor-pointer text-sm text-ink-faint hover:text-ink-muted">
          Import a single repo by URL instead
        </summary>
        <form onSubmit={importRepo} className="card mt-2">
          <label className="label" htmlFor="repo-url">
            Repository URL
          </label>
          <div className="flex gap-2">
            <input
              id="repo-url"
              className="input"
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              placeholder="https://github.com/owner/project"
            />
            <button
              type="submit"
              className="btn-secondary shrink-0"
              disabled={importing || repoUrl.trim() === ''}
            >
              {importing ? 'Reading repo…' : 'Import'}
            </button>
          </div>
        </form>
      </details>

      {notice && (
        <div className="mb-3">
          <Alert variant="success" onDismiss={() => setNotice(null)}>
            {notice}
          </Alert>
        </div>
      )}
      {error && (
        <div className="mb-3">
          <Alert variant="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      {/* --- Manual entry -------------------------------------------------- */}
      {manualOpen && (
        <ProjectForm
          initial={{ title: '', repo_url: '', tech_stack: '' }}
          submitLabel="Save project"
          onSubmit={async (payload) => {
            await api.createProject(payload)
            setManualOpen(false)
            onChange()
          }}
          onCancel={() => setManualOpen(false)}
        />
      )}

      {/* --- List ---------------------------------------------------------- */}
      <div className="space-y-3">
        {projects.map((project, index) => (
          <SortableCard
            key={project.id}
            type="project"
            index={index}
            onDrop={(from, to) => void move(movedIds(projects, from, to))}
            className="card"
          >
            {editingId === project.id ? (
              <ProjectForm
                initial={{
                  title: project.title,
                  repo_url: project.repo_url ?? '',
                  tech_stack: project.tech_stack,
                }}
                submitLabel="Save changes"
                onSubmit={async (payload) => {
                  await api.updateProject(project.id, payload)
                  setEditingId(null)
                  onChange()
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2">
                <MoveButtons
                  name={project.title}
                  index={index}
                  count={projects.length}
                  onMove={(from, to) => void move(movedIds(projects, from, to))}
                />
                <div>
                  <h3 className="flex items-center gap-2 font-semibold text-ink">
                    {project.title}
                    {project.is_github_imported && (
                      <span className="chip">AI-drafted · review</span>
                    )}
                  </h3>
                  {project.tech_stack && (
                    <p className="mt-0.5 text-xs text-ink-faint">{project.tech_stack}</p>
                  )}
                  {project.repo_url && (
                    <a
                      href={project.repo_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs text-iris-fg hover:underline"
                    >
                      {project.repo_url}
                    </a>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  aria-label={`Edit ${project.title}`}
                  onClick={() => {
                    setManualOpen(false)
                    setEditingId(project.id)
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn-danger text-xs"
                  onClick={() => void remove(project.id)}
                >
                  Delete
                </button>
              </div>
            </div>
            )}

            <BulletList
              entityType="PROJECT"
              entityId={project.id}
              bullets={bulletsFor(groupedBullets, 'PROJECT', project.id)}
              onChange={onChange}
            />
          </SortableCard>
        ))}

        {projects.length === 0 && !manualOpen && (
          <p className="text-sm text-ink-faint">
            No projects yet. Importing a GitHub repo is the fastest start.
          </p>
        )}
      </div>
    </section>
  )
}
