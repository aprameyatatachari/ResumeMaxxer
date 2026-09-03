import { useMemo } from 'react'

import { createApiClient, type ApiClient } from '../lib/api'
import { getAuthToken } from '../lib/auth-client'

/**
 * The API client, bound to the current Better Auth session.
 *
 * `getAuthToken` is a module-level function with a stable identity and its own
 * JWT cache, so the client only needs building once for the whole app - hence
 * the empty dependency array. Without the memo, every render would produce new
 * function identities and any `useEffect` listing `api` as a dependency would
 * loop forever.
 */
export function useApi(): ApiClient {
  return useMemo<ApiClient>(() => createApiClient(getAuthToken), [])
}
