import { useCallback, useEffect, useState } from 'react'

import { ApiError } from '../lib/api'
import type { Bullet, EntityType, Vault } from '../lib/types'
import { useApi } from './useApi'

/**
 * Loads the whole Vault once and exposes a `reload` for after mutations.
 *
 * Optimistic updates are deliberately avoided here: the Vault is small and the
 * refetch is one request, so reloading after a write keeps client and server
 * trivially in sync at negligible cost.
 *
 * `loading` means "first load", not "a request is in flight" - see `reload`.
 */
export function useVault() {
  const api = useApi()
  const [vault, setVault] = useState<Vault | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    // `loading` is only ever true for the FIRST load. Flipping it back on
    // every refetch made <Vault> swap the whole page for a spinner after any
    // write, which unmounted the section that had just been saved - so its
    // "Saved." confirmation vanished instantly, open forms closed, and the
    // scroll position jumped. Refetches now swap the data underneath a mounted
    // tree instead.
    setError(null)
    try {
      setVault(await api.getVault())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your vault.')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void reload()
  }, [reload])

  return { vault, loading, error, reload, setVault }
}

/**
 * Group bullets by their polymorphic parent.
 *
 * The backend cannot nest these under their entity (no foreign key exists), so
 * the join happens client-side. Key format: "EXPERIENCE:12".
 */
export function groupBullets(bullets: Bullet[]): Map<string, Bullet[]> {
  const grouped = new Map<string, Bullet[]>()
  for (const bullet of bullets) {
    const key = `${bullet.entity_type}:${bullet.entity_id}`
    const existing = grouped.get(key)
    if (existing) existing.push(bullet)
    else grouped.set(key, [bullet])
  }
  return grouped
}

export function bulletsFor(
  grouped: Map<string, Bullet[]>,
  entityType: EntityType,
  entityId: number,
): Bullet[] {
  return grouped.get(`${entityType}:${entityId}`) ?? []
}
