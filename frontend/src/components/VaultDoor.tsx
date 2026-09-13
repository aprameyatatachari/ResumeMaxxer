import { useEffect, useState } from 'react'

const FLAG = 'resumemaxxer.open_vault'

/** Called by sign-in and sign-up just before they navigate to the vault. */
export function armVaultDoor() {
  try {
    sessionStorage.setItem(FLAG, '1')
  } catch {
    // Storage blocked: the vault simply opens without the door.
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

const BOLTS = Array.from({ length: 8 }, (_, i) => i * 45)

/**
 * The vault opening: a dark steel door fills the screen the moment the vault
 * page mounts, its dial turns, the bolts draw back, a seam of iris-to-ember
 * light cracks around the rim and the door swings away to reveal the page
 * underneath. Purely decorative (aria-hidden, no pointer events), plays only
 * straight after signing in, and never under reduced motion.
 */
export default function VaultDoor() {
  const [show] = useState(
    () => takeFlag() && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!show) return
    const timer = setTimeout(() => setDone(true), 2300)
    return () => clearTimeout(timer)
  }, [show])

  if (!show || done) return null

  return (
    <div className="vault-door-stage" aria-hidden="true">
      <div className="vault-door-light" />
      <div className="vault-door">
        <div className="vault-door__rim" />
        {BOLTS.map((deg) => (
          <span key={deg} className="vault-door__bolt-arm" style={{ transform: `rotate(${deg}deg)` }}>
            <span className="vault-door__bolt" />
          </span>
        ))}
        <div className="vault-door__face">
          <div className="vault-door__dial">
            {Array.from({ length: 24 }, (_, i) => (
              <span key={i} className="vault-door__tick" style={{ transform: `rotate(${i * 15}deg)` }} />
            ))}
            <span className="vault-door__hub" />
          </div>
        </div>
      </div>
    </div>
  )
}
