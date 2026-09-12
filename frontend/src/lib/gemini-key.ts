/**
 * gemini-key.ts
 * =============
 * The student's own Gemini API key, held in this browser only.
 *
 * The model
 * ---------
 * ResumeMaxxer funds a few tailoring runs a week per student. Past that, the
 * student supplies their own Gemini key - free from Google AI Studio - and
 * their runs come off their own quota instead.
 *
 * The key is stored in `localStorage` and sent on the requests that need it,
 * in the `X-Gemini-Api-Key` header. The server uses it for that one call and
 * forgets it: no column, no encryption key to manage, no table worth stealing.
 *
 * Why not store it server-side, given it reaches the server anyway? Because
 * "reaches the server" and "is kept by the server" are different exposures.
 * Gemini is called server-side, so the key must travel - that is unavoidable.
 * Keeping a copy at rest is avoidable, so it is avoided.
 *
 * What the student trades for that
 * --------------------------------
 * `localStorage` is per-origin and per-browser, so the key does not follow
 * them to their phone - they paste it again there. For a free key that takes a
 * minute to mint, that is the better side of the trade.
 *
 * It is also readable by any script running on this origin, so an XSS bug
 * would expose it. That is true of the session token sitting beside it, and
 * the mitigation is the same: do not have an XSS bug. The blast radius is one
 * revocable, free-tier API key.
 */

/** Deliberately namespaced: this origin also serves the auth cookie and the
 *  Vite dev server, and an unprefixed "apiKey" would be a landmine. */
const STORAGE_KEY = 'resumemaxxer.gemini_api_key'

/**
 * Read the saved key, or null.
 *
 * Wrapped in try/catch because `localStorage` does not merely come back empty
 * in a locked-down context - accessing it *throws*. Safari in private mode and
 * browsers configured to block site data both do this, and an uncaught throw
 * here would take down the whole Tailor page rather than just the key feature.
 */
export function getGeminiKey(): string | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored && stored.trim() ? stored.trim() : null
  } catch {
    return null
  }
}

/** Whether a key is saved. Cheaper to read than to reason about at call sites. */
export function hasGeminiKey(): boolean {
  return getGeminiKey() !== null
}

/**
 * Save a key, or clear it when given something blank.
 *
 * Returns false when storage refused - the caller needs to know, because
 * silently "saving" a key that vanishes on reload is worse than saying no.
 */
export function setGeminiKey(key: string): boolean {
  const trimmed = key.trim()
  try {
    if (!trimmed) {
      window.localStorage.removeItem(STORAGE_KEY)
    } else {
      window.localStorage.setItem(STORAGE_KEY, trimmed)
    }
    return true
  } catch {
    return false
  }
}

/** Forget the saved key. */
export function clearGeminiKey(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do: if storage is unavailable there is nothing stored either.
  }
}

/**
 * A masked form for display, e.g. `AIza…9f3K`.
 *
 * The settings UI has to show *something* so the student can tell whether the
 * key they saved is the one they meant, but showing the whole value puts a
 * live credential on screen - in a library, in a screen-share, in a
 * screenshot. First four and last four is enough to recognise a key you chose
 * and useless to anyone who did not.
 */
export function maskGeminiKey(key: string): string {
  const trimmed = key.trim()
  if (trimmed.length <= 12) return '•'.repeat(Math.max(trimmed.length, 4))
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`
}

/**
 * Catch a mis-paste before spending a request on it.
 *
 * Returns an error message, or null when the key looks plausible. This is not
 * validation - only Google can say whether a key works - it just catches the
 * three mistakes people actually make: pasting half the key, pasting a URL,
 * and pasting with a line break in it.
 *
 * The `AIza` prefix is a WARNING rather than a rejection. Every current AI
 * Studio key starts with it, but hard-rejecting on a prefix would lock out
 * every student the day Google changes the format.
 */
export function describeKeyProblem(key: string): string | null {
  const trimmed = key.trim()

  if (!trimmed) return 'Paste your API key first.'
  if (/\s/.test(trimmed)) {
    return 'That key has a space or line break in it, so it was copied with extra characters. Try again.'
  }
  if (trimmed.startsWith('http')) {
    return 'That looks like a URL, not a key. Copy the key itself from AI Studio.'
  }
  if (trimmed.length < 20) {
    return 'That key looks too short - it may have been cut off. Copy the whole thing.'
  }
  return null
}
