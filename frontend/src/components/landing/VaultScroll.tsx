import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { ArrowRight } from '../icons'

/**
 * Scroll into the vault.
 *
 * A tall track with a sticky full-screen stage. Scroll progress through the
 * track (0..1) scrubs one continuous shot:
 *
 *   0.00-0.30  headline lifts away and fades
 *   0.00-0.70  camera pushes into the gap of the ajar door (image scales up
 *              around the light seam)
 *   0.45-0.80  the seam flares into a wash of warm light
 *   0.62-0.85  the view resolves into the vault interior
 *   0.72-0.95  the product rises out of the light
 *
 * Progress is written straight to CSS custom properties on the stage from a
 * passive, rAF-throttled scroll listener - no React renders per frame, and it
 * works in every browser (no scroll-timeline dependency). Only transform and
 * opacity animate, so it stays on the compositor.
 *
 * Reduced motion gets the still version: the hero, then the product, stacked.
 */
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
/** Remap p from [a, b] to [0, 1]. */
const span = (p: number, a: number, b: number) => clamp01((p - a) / (b - a))
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

// Where the light seam sits in hero-vault.webp, as a fraction of the frame.
const SEAM_X = 0.535
const SEAM_Y = 0.52

function Headline({ primary }: { primary: { to: string; label: string } }) {
  return (
    <div className="max-w-[620px]">
      <h1 className="display text-[clamp(2.75rem,7vw,5.25rem)] text-white">
        Your whole record, locked in one vault.
      </h1>
      <p className="mt-6 max-w-[48ch] text-base leading-relaxed text-ink-muted sm:text-lg">
        Save your marks, internships, projects and clubs once. Hand over a job description
        and walk out with a resume cut for that role - rewritten from what you did, never
        invented.
      </p>
      <div className="mt-9 flex flex-wrap gap-3">
        <Link to={primary.to} className="btn-primary">
          {primary.label}
          <ArrowRight size={16} />
        </Link>
        <a href="#how" className="btn-secondary">
          See how it tailors
        </a>
      </div>
    </div>
  )
}

function InsideHeading() {
  return (
    <h2 className="display-sm max-w-[22ch] text-[clamp(1.75rem,3.5vw,2.5rem)] text-white">
      Inside: everything you have done, ready to be cut for any role.
    </h2>
  )
}

export default function VaultScroll({
  primary,
  product,
}: {
  primary: { to: string; label: string }
  product: React.ReactNode
}) {
  const [still] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const trackRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (still) return
    const track = trackRef.current
    const stage = stageRef.current
    if (!track || !stage) return

    let frame = 0
    const update = () => {
      frame = 0
      const rect = track.getBoundingClientRect()
      const travel = rect.height - window.innerHeight
      const p = travel > 0 ? clamp01(-rect.top / travel) : 0

      const push = easeInOut(span(p, 0, 0.7))
      const title = easeOut(span(p, 0, 0.3))
      const flareIn = span(p, 0.45, 0.66)
      const flareOut = span(p, 0.66, 0.84)
      const inside = easeOut(span(p, 0.62, 0.85))
      const rise = easeOut(span(p, 0.72, 0.95))

      const s = stage.style
      s.setProperty('--door-scale', String(1 + push * 2.4))
      s.setProperty('--door-opacity', String(1 - span(p, 0.6, 0.78)))
      s.setProperty('--shade', String(1 - push))
      s.setProperty('--title-y', `${-title * 18}vh`)
      s.setProperty('--title-opacity', String(1 - title))
      s.setProperty('--flare', String(flareIn * (1 - flareOut)))
      s.setProperty('--inside-opacity', String(inside))
      s.setProperty('--inside-scale', String(1.25 - inside * 0.25))
      s.setProperty('--rise-y', `${(1 - rise) * 30}vh`)
      s.setProperty('--rise-opacity', String(rise))
      s.setProperty('--cue', String(1 - span(p, 0, 0.08)))
      // Keep hidden layers out of the tab order and hit-testing.
      stage.dataset.phase = p < 0.3 ? 'door' : p > 0.8 ? 'inside' : 'moving'
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [still])

  if (still) {
    return (
      <>
        <section className="band-void relative isolate flex min-h-[100svh] items-center overflow-hidden px-4 pb-20 pt-28 sm:px-6">
          <img
            src="/images/hero-vault.webp"
            alt=""
            className="absolute inset-0 -z-20 h-full w-full object-cover object-[72%_center]"
          />
          <div className="vault-shade absolute inset-0 -z-10" aria-hidden="true" />
          <div className="mx-auto w-full max-w-[1200px]">
            <Headline primary={primary} />
          </div>
        </section>
        <section className="band-void px-4 pb-24 sm:px-6">
          <div className="mx-auto max-w-[1200px]">
            <InsideHeading />
            {product}
          </div>
        </section>
      </>
    )
  }

  return (
    <div ref={trackRef} className="band-void relative h-[320vh]">
      <div
        ref={stageRef}
        data-phase="door"
        className="vault-stage sticky top-0 isolate h-[100svh] overflow-hidden"
        style={{ '--seam-x': `${SEAM_X * 100}%`, '--seam-y': `${SEAM_Y * 100}%` } as React.CSSProperties}
      >
        {/* Interior, waiting behind the door. */}
        <img
          src="/images/cta-vault.webp"
          alt=""
          className="vault-inside absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-void/55" style={{ opacity: 'var(--inside-opacity)' }} aria-hidden="true" />

        {/* The door. Scales around the light seam. */}
        <img
          src="/images/hero-vault.webp"
          alt=""
          fetchPriority="high"
          className="vault-door-image absolute inset-0 h-full w-full object-cover"
        />
        <div className="vault-shade absolute inset-0" aria-hidden="true" />

        {/* The seam flaring into a wash of light. */}
        <div className="vault-flare absolute inset-0" aria-hidden="true" />

        {/* Headline over the door. */}
        <div className="vault-title absolute inset-0 flex items-center px-4 pt-16 sm:px-6">
          <div className="mx-auto w-full max-w-[1200px]">
            <Headline primary={primary} />
          </div>
        </div>

        {/* Scroll cue. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center"
          style={{ opacity: 'var(--cue)' }}
          aria-hidden="true"
        >
          <span className="vault-cue block h-10 w-px bg-gradient-to-b from-white/0 via-white/70 to-white/0" />
        </div>

        {/* The product rising out of the light. */}
        <div className="vault-rise absolute inset-0 flex items-center overflow-y-auto px-4 pt-16 sm:px-6">
          <div className="mx-auto w-full max-w-[1200px]">
            <InsideHeading />
            {product}
          </div>
        </div>
      </div>
    </div>
  )
}
