import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import SiteImage from '../SiteImage'
import { ArrowRight, Sparkle } from '../icons'

/**
 * The opening: "ResumeMaxxer" fills the first screen. Scrolling splits the
 * word at its seam - "Resume" slides left, "Maxxer" slides right, both lift
 * and shrink away like the two leaves of a vault door - and the hero rises
 * through the gap.
 *
 * A 200vh track with a sticky full-screen stage. Scroll progress (0..1) is
 * written to CSS custom properties from one rAF-throttled passive listener,
 * so nothing re-renders per frame and only transform/opacity animate.
 * Scrolling back up closes the doors again. Reduced motion skips straight to
 * the hero with no track.
 */
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const span = (p: number, a: number, b: number) => clamp01((p - a) / (b - a))
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

function Hero({ primary }: { primary: { to: string; label: string } }) {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col items-center text-center">
      <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.04em] text-ink-muted backdrop-blur">
        <Sparkle size={14} className="text-white" />
        Resume tailoring for Indian students
      </p>
      <h1 className="display text-iridescent mt-7 max-w-[13ch] pb-2 text-[clamp(3rem,8.5vw,6.25rem)]">
        Your whole record, locked in one vault.
      </h1>
      <p className="mt-6 max-w-[50ch] text-base leading-relaxed text-ink-muted sm:text-lg">
        Save your marks, internships, projects and clubs once. Hand over a job description and walk
        out with a resume cut for that role - rewritten from what you did, never invented.
      </p>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link to={primary.to} className="btn-iridescent group min-h-12 pr-2">
          {primary.label}
          <span className="grid h-8 w-8 place-items-center rounded-full bg-white/12 transition-transform duration-300 group-hover:translate-x-0.5">
            <ArrowRight size={15} />
          </span>
        </Link>
        <a href="#how" className="btn-glass min-h-12">
          See how it tailors
        </a>
      </div>
    </div>
  )
}

function Backdrop() {
  return (
    <>
      <SiteImage
        src="/images/hero-vault.webp"
        eager
        className="hero-image mono pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover object-[70%_center]"
      />
      <div
        className="split-shade pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_65%_55%_at_50%_48%,rgb(10_10_10/0.78),rgb(10_10_10/0.35)_70%,rgb(10_10_10/0.2)),linear-gradient(180deg,transparent_70%,#0a0a0a)]"
        aria-hidden="true"
      />
    </>
  )
}

export default function HeroSplit({ primary }: { primary: { to: string; label: string } }) {
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

      const split = easeInOut(span(p, 0, 0.6))
      const rise = easeOut(span(p, 0.35, 0.85))
      const s = stage.style
      s.setProperty('--split', String(split))
      s.setProperty('--word-opacity', String(1 - span(p, 0.3, 0.62)))
      s.setProperty('--rise', String(rise))
      s.setProperty('--cue', String(1 - span(p, 0, 0.1)))
      stage.dataset.phase = rise > 0.6 ? 'hero' : 'word'
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
      <section className="band-void relative isolate flex min-h-[100svh] items-center overflow-hidden px-4 pb-20 pt-32 sm:px-6">
        <Backdrop />
        <Hero primary={primary} />
      </section>
    )
  }

  return (
    <div ref={trackRef} className="band-void relative h-[200vh]">
      <div
        ref={stageRef}
        data-phase="word"
        className="split-stage sticky top-0 isolate flex h-[100svh] items-center justify-center overflow-hidden px-4 sm:px-6"
      >
        <Backdrop />

        {/* The wordmark. Decorative: the nav already names the product. */}
        <p className="split-word display pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center whitespace-nowrap text-[clamp(3rem,13.5vw,15rem)] leading-none" aria-hidden="true">
          <span className="split-left text-iridescent inline-block pb-[0.08em] [background-position:0%_0] [background-size:200%_100%]">
            Resume
          </span>
          <span className="split-right text-iridescent inline-block pb-[0.08em] [background-position:100%_0] [background-size:200%_100%]">
            Maxxer
          </span>
        </p>

        <div className="split-hero w-full pt-16">
          <Hero primary={primary} />
        </div>

        <div className="split-cue pointer-events-none absolute inset-x-0 bottom-8 flex flex-col items-center gap-2 text-xs uppercase tracking-[0.08em] text-ink-faint" aria-hidden="true">
          Scroll to open
          <span className="split-cue-line block h-10 w-px bg-gradient-to-b from-white/0 via-white/70 to-white/0" />
        </div>
      </div>
    </div>
  )
}
