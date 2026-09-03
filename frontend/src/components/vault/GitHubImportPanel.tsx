import { useState } from 'react'

import { useApi } from '../../hooks/useApi'
import { ApiError } from '../../lib/api'
import { MAX_BATCH_IMPORT, type GitHubRepoSummary } from '../../lib/types'
import Alert from '../Alert'

/**
 * Import GitHub projects by username instead of one URL at a time.
 *
 * Flow: type a username, get the public repos back, tick the ones worth
 * putting on a resume, import them in one request. Listing is free and
 * instant (no AI); importing costs one Gemini call per repo, which is why the
 * selection is capped server-side at MAX_BATCH_IMPORT.
 *
 * Repos already in the vault come back flagged rather than hidden - "already
 * imported" is more useful than a silently missing row.
 */
export default function GitHubImportPanel({ onChange }: { onChange: () => void }) {
  const api = useApi()
  const [username, setUsername] = useState('')
  const [repos, setRepos] = useState<GitHubRepoSummary[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [includeForks, setIncludeForks] = useState(false)
  const [searching, setSearching] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [failures, setFailures] = useState<{ repo: string; error: string }[]>([])

  async function search(event: React.FormEvent) {
    event.preventDefault()
    setSearching(true)
    setError(null)
    setNotice(null)
    setFailures([])
    setSelected(new Set())
    try {
      const result = await api.listRepos(username.trim(), includeForks)
      setRepos(result.repos)
      if (result.repos.length === 0) {
        setNotice(`${result.username} has no public repositories with code in them.`)
      }
    } catch (err) {
      setRepos(null)
      setError(err instanceof ApiError ? err.message : 'Could not reach GitHub.')
    } finally {
      setSearching(false)
    }
  }

  function toggle(fullName: string) {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(fullName)) {
        next.delete(fullName)
      } else if (next.size < MAX_BATCH_IMPORT) {
        next.add(fullName)
      }
      return next
    })
  }

  async function importSelected() {
    if (selected.size === 0) return
    setImporting(true)
    setError(null)
    setNotice(null)
    setFailures([])
    try {
      const result = await api.importRepos([...selected])

      if (result.imported.length > 0) {
        const bulletCount = result.imported.reduce(
          (total, item) => total + item.bullets.length,
          0,
        )
        setNotice(
          `Imported ${result.imported.length} project${
            result.imported.length === 1 ? '' : 's'
          } with ${bulletCount} AI-written bullets. Review them before you apply.`,
        )
      }
      // Partial success is normal: one unreadable README does not discard the
      // rest, so both outcomes are reported.
      setFailures(
        result.failed.map((item) => ({
          repo: item.repo_full_name,
          error: item.error,
        })),
      )

      // Mark what landed so the list reflects reality without a refetch.
      const importedUrls = new Set(
        result.imported.map((item) => item.project.repo_url ?? ''),
      )
      setRepos((previous) =>
        previous
          ? previous.map((repo) =>
              importedUrls.has(repo.html_url)
                ? { ...repo, already_imported: true }
                : repo,
            )
          : previous,
      )
      setSelected(new Set())
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

  const selectable = (repos ?? []).filter((repo) => !repo.already_imported)
  const atLimit = selected.size >= MAX_BATCH_IMPORT

  return (
    <div className="card mb-3">
      <form onSubmit={search}>
        <label className="label" htmlFor="gh-username">
          Import from GitHub
        </label>
        <div className="flex gap-2">
          <input
            id="gh-username"
            className="input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="your-github-username"
            autoComplete="off"
          />
          <button
            type="submit"
            className="btn-primary shrink-0"
            disabled={searching || username.trim() === ''}
          >
            {searching ? 'Fetching…' : 'Find repos'}
          </button>
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={includeForks}
            onChange={(event) => setIncludeForks(event.target.checked)}
          />
          Include forks
          <span className="text-slate-400">
            (off by default - a fork you never committed to is someone else's work)
          </span>
        </label>
      </form>

      {error && (
        <div className="mt-3">
          <Alert variant="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}
      {notice && (
        <div className="mt-3">
          <Alert variant="success" onDismiss={() => setNotice(null)}>
            {notice}
          </Alert>
        </div>
      )}
      {failures.length > 0 && (
        <div className="mt-3">
          <Alert variant="error" onDismiss={() => setFailures([])}>
            <p className="font-medium">These could not be imported:</p>
            <ul className="mt-1 list-disc pl-4">
              {failures.map((item) => (
                <li key={item.repo}>
                  <span className="font-mono text-xs">{item.repo}</span> - {item.error}
                </li>
              ))}
            </ul>
          </Alert>
        </div>
      )}

      {repos && repos.length > 0 && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <p className="text-sm text-slate-600">
              {selectable.length} repo{selectable.length === 1 ? '' : 's'} available ·{' '}
              <span className={atLimit ? 'font-medium text-brand-700' : ''}>
                {selected.size} of {MAX_BATCH_IMPORT} selected
              </span>
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void importSelected()}
              disabled={importing || selected.size === 0}
            >
              {importing
                ? `Importing ${selected.size}…`
                : `Import ${selected.size || ''} selected`}
            </button>
          </div>

          {importing && (
            <p className="mt-2 text-xs text-slate-500">
              Each repo needs its own AI call, so this takes a few seconds per
              project. Leave this tab open.
            </p>
          )}

          <ul className="mt-3 max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {repos.map((repo) => {
              const checked = selected.has(repo.full_name)
              const disabled =
                repo.already_imported || importing || (!checked && atLimit)
              return (
                <li key={repo.full_name}>
                  <label
                    className={`flex items-start gap-3 py-2.5 ${
                      disabled && !checked
                        ? 'cursor-not-allowed opacity-50'
                        : 'cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 shrink-0"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(repo.full_name)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">{repo.name}</span>
                        {repo.language && <span className="chip">{repo.language}</span>}
                        {repo.stars > 0 && (
                          <span className="text-xs text-slate-400">
                            ★ {repo.stars}
                          </span>
                        )}
                        {repo.is_fork && (
                          <span className="text-xs text-slate-400">fork</span>
                        )}
                        {repo.already_imported && (
                          <span className="text-xs font-medium text-emerald-600">
                            already in vault
                          </span>
                        )}
                      </span>
                      {repo.description && (
                        <span className="mt-0.5 block truncate text-sm text-slate-500">
                          {repo.description}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
