import { useEffect, useState } from 'react'

import { LogoMark } from './brand/Logo'

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
 * A short, quiet welcome after creating an account: the logo settles in, a hairline fills beneath "Setting up your vault", and the overlay
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
        <LogoMark size={72} className="welcome-core text-ink" />
        <p className="mt-6 text-sm text-ink-muted">Setting up your vault</p>
        <div className="mt-3 h-px w-40 overflow-hidden bg-line">
          <div className="welcome-bar h-full w-full iri-flow bg-[image:var(--iridescent)]" />
        </div>
      </div>
    </div>
  )
}
