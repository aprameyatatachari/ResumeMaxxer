import { useEffect, useState } from 'react'

const FLAG = 'resumemaxxer.welcome'

/** Called by sign-up just before it navigates to the vault. */
export function armWelcome() {
  try {
    sessionStorage.setItem(FLAG, '1')
  } catch {
    // Storage blocked: the vault simply opens without the welcome.
  }
}

function takeFlag(): boolean {
  try {
    const armed = sessionStorage.getItem(FLAG) === '1'
    sessionStorage.removeItem(FLAG)
    return armed
  } catch {
    return false
  }
}

/**
 * A short, quiet welcome after creating an account: the vault-dial mark draws
 * itself, a hairline fills beneath "Setting up your vault", and the overlay
 * fades onto the page. Decorative only, and skipped under reduced motion.
 */
export default function WelcomeLoader() {
  const [show] = useState(
    () => takeFlag() && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!show) return
    const timer = setTimeout(() => setDone(true), 1600)
    return () => clearTimeout(timer)
  }, [show])

  if (!show || done) return null

  return (
    <div className="welcome-stage" aria-hidden="true">
      <div className="flex flex-col items-center">
        <svg viewBox="0 0 32 32" width={64} height={64} fill="none" className="text-ink">
          <circle
            className="welcome-ring"
            cx="16"
            cy="16"
            r="10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            transform="rotate(-90 16 16)"
          />
          <circle className="welcome-core" cx="16" cy="16" r="3.6" fill="#c9aaff" />
        </svg>
        <p className="mt-6 text-sm text-ink-muted">Setting up your vault</p>
        <div className="mt-3 h-px w-40 overflow-hidden bg-line">
          <div className="welcome-bar h-full w-full bg-[image:var(--iridescent)]" />
        </div>
      </div>
    </div>
  )
}
