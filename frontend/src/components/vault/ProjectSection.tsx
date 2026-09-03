import { useState } from 'react'

import { bulletsFor } from '../../hooks/useVault'
import { useApi } from '../../hooks/useApi'
import { ApiError } from '../../lib/api'
import type { Bullet, Project } from '../../lib/types'
import Alert from '../Alert'
import BulletList from './BulletList'
import GitHubImportPanel from './GitHubImportPanel'

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
  const [manual, setManual] = useState({ title: '', repo_url: '', tech_stack: '' })
  const [manualOpen, setManualOpen] = useState(false)
  const [busy, setBusy] = useState(false)
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

  async function addManual(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.createProject({
        title: manual.title.trim(),
        repo_url: manual.repo_url.trim() || null,
        tech_stack: manual.tech_stack.trim(),
      })
      setManual({ title: '', repo_url: '', tech_stack: '' })
      setManualOpen(false)
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that.')
    } finally {
      setBusy(false)
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
        <h2 className="text-lg font-semibold text-slate-900">Projects</h2>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setManualOpen((value) => !value)}
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
        <summary className="cursor-pointer text-sm text-slate-500 hover:text-slate-700">
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
        <form onSubmit={addManual} className="card mb-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="proj-title">
                Title
              </label>
              <input
                id="proj-title"
                className="input"
                required
                value={manual.title}
                onChange={(event) =>
                  setManual((previous) => ({ ...previous, title: event.target.value }))
                }
                placeholder="Course Scheduler"
              />
            </div>
            <div>
              <label className="label" htmlFor="proj-url">
                Link <span className="text-slate-400">(optional)</span>
              </label>
              <input
                id="proj-url"
                className="input"
                value={manual.repo_url}
                onChange={(event) =>
                  setManual((previous) => ({ ...previous, repo_url: event.target.value }))
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
                value={manual.tech_stack}
                onChange={(event) =>
                  setManual((previous) => ({
                    ...previous,
                    tech_stack: event.target.value,
                  }))
                }
                placeholder="React, TypeScript, PostgreSQL"
              />
            </div>
          </div>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save project'}
          </button>
        </form>
      )}

      {/* --- List ---------------------------------------------------------- */}
      <div className="space-y-3">
        {projects.map((project) => (
          <div key={project.id} className="card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                  {project.title}
                  {project.is_github_imported && (
                    <span className="chip">AI-drafted · review</span>
                  )}
                </h3>
                {project.tech_stack && (
                  <p className="mt-0.5 text-xs text-slate-500">{project.tech_stack}</p>
                )}
                {project.repo_url && (
                  <a
                    href={project.repo_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs text-brand-600 hover:underline"
                  >
                    {project.repo_url}
                  </a>
                )}
              </div>
              <button
                type="button"
                className="btn-danger text-xs"
                onClick={() => void remove(project.id)}
              >
                Delete
              </button>
            </div>

            <BulletList
              entityType="PROJECT"
              entityId={project.id}
              bullets={bulletsFor(groupedBullets, 'PROJECT', project.id)}
              onChange={onChange}
            />
          </div>
        ))}

        {projects.length === 0 && !manualOpen && (
          <p className="text-sm text-slate-500">
            No projects yet. Importing a GitHub repo is the fastest start.
          </p>
        )}
      </div>
    </section>
  )
}
