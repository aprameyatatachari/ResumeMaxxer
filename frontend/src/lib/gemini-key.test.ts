import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearGeminiKey,
  describeKeyProblem,
  getGeminiKey,
  hasGeminiKey,
  maskGeminiKey,
  setGeminiKey,
} from './gemini-key'

/**
 * The student's own Gemini key, in browser storage.
 *
 * Two things here are worth a test rather than a read-through: the storage
 * calls have to survive a browser that *throws* on `localStorage` access
 * rather than returning null, and the masking must never put a whole live
 * credential on screen.
 */

const KEY = 'AIzaSyExampleKeyThatIsLongEnough00000000'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('storage round trip', () => {
  it('saves and reads a key', () => {
    expect(setGeminiKey(KEY)).toBe(true)
    expect(getGeminiKey()).toBe(KEY)
    expect(hasGeminiKey()).toBe(true)
  })

  it('has no key to begin with', () => {
    expect(getGeminiKey()).toBeNull()
    expect(hasGeminiKey()).toBe(false)
  })

  it('trims surrounding whitespace, which a paste often brings', () => {
    setGeminiKey(`  ${KEY}\n`)
    expect(getGeminiKey()).toBe(KEY)
  })

  it('treats a blank value as a removal', () => {
    setGeminiKey(KEY)
    setGeminiKey('   ')
    expect(getGeminiKey()).toBeNull()
  })

  it('clears on request', () => {
    setGeminiKey(KEY)
    clearGeminiKey()
    expect(getGeminiKey()).toBeNull()
  })

  it('does not collide with other keys on this origin', () => {
    // The auth cookie and the Vite dev server share this origin; an
    // unprefixed name would be a landmine.
    setGeminiKey(KEY)
    const stored = Object.keys(window.localStorage)
    expect(stored).toEqual(['resumemaxxer.gemini_api_key'])
  })
})

describe('when the browser blocks storage', () => {
  /**
   * Safari in private mode and browsers set to block site data do not return
   * null from `localStorage` - they throw. An uncaught throw here would take
   * down the whole Tailor page instead of just this feature.
   */
  function stubThrowingStorage() {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('denied')
      },
      setItem: () => {
        throw new DOMException('denied')
      },
      removeItem: () => {
        throw new DOMException('denied')
      },
    })
  }

  it('reads as "no key" instead of throwing', () => {
    stubThrowingStorage()
    expect(getGeminiKey()).toBeNull()
    expect(hasGeminiKey()).toBe(false)
  })

  it('reports a failed save rather than pretending it worked', () => {
    // Silently "saving" a key that vanishes on reload is worse than saying no.
    stubThrowingStorage()
    expect(setGeminiKey(KEY)).toBe(false)
  })

  it('clearing is a no-op rather than a crash', () => {
    stubThrowingStorage()
    expect(() => clearGeminiKey()).not.toThrow()
  })
})

describe('masking', () => {
  it('shows only the first and last four characters', () => {
    expect(maskGeminiKey(KEY)).toBe('AIza…0000')
  })

  it('never reveals a short value at all', () => {
    // Better to show nothing useful than to print most of a credential.
    expect(maskGeminiKey('AIzaShort')).not.toContain('Short')
    expect(maskGeminiKey('AIzaShort')).toMatch(/^•+$/)
  })

  it('does not leak the whole key for any length', () => {
    for (const candidate of ['a'.repeat(13), KEY, 'x'.repeat(200)]) {
      expect(maskGeminiKey(candidate)).not.toBe(candidate)
    }
  })
})

describe('catching a mis-paste', () => {
  it('accepts a plausible key', () => {
    expect(describeKeyProblem(KEY)).toBeNull()
  })

  it.each([
    ['', 'nothing pasted'],
    ['   ', 'only whitespace'],
    ['AIzaShort', 'truncated'],
    ['AIza key with spaces 0000000000000000000', 'line break survived the copy'],
    ['https://aistudio.google.com/apikey', 'pasted the URL, not the key'],
  ])('rejects %j (%s)', (candidate) => {
    expect(describeKeyProblem(candidate)).toBeTruthy()
  })

  it('does not reject a key merely for lacking the AIza prefix', () => {
    // Every current AI Studio key starts with it, but hard-rejecting on a
    // prefix would lock every student out the day Google changes the format.
    expect(describeKeyProblem('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toBeNull()
  })
})
