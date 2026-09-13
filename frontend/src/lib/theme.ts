import { useCallback, useEffect, useState } from 'react'

/**
 * Light / night / follow-the-system theme.
 *
 * The initial value is applied by the inline script in index.html, before
 * React loads, so night mode never flashes a white page. This hook keeps the
 * `data-theme` attribute in sync afterwards and remembers the choice.
 */
export type ThemeChoice = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'resumemaxxer.theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

function readChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

function apply(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && media().matches)
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
}

export function useTheme() {
  const [choice, setChoiceState] = useState<ThemeChoice>(readChoice)

  // Follow the OS while the choice is "system".
  useEffect(() => {
    apply(choice)
    if (choice !== 'system') return
    const query = media()
    const onChange = () => apply('system')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [choice])

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Not remembered, but still applied for this visit.
    }
  }, [])

  return { choice, setChoice }
}
