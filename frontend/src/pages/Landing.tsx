import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import AuroraBeam from '../components/landing/AuroraBeam'
import { ArrowRight, Check, FileText, Lock } from '../components/icons'
import { useReveal } from '../hooks/useReveal'
import { useSession } from '../lib/auth-client'

/**
 * The job description is the map. A sample JD sits pinned on the left; each
 * highlighted requirement line is answered by one feature on the right, and
 * the line lights up while its feature is in view.
 */
const JD_LINES: { text: string; feature?: number }[] = [
  { text: 'Software Engineer - Graduate Program 2026' },
  { text: 'About the role' },
  { text: 'You will join the payments platform team and ship production code from week one.' },
  { text: 'Minimum qualifications', feature: 0 },
  { text: 'B.Tech / B.E. in CS or related, CGPA 7.5+, 60% in Class X and XII.', feature: 1 },
  { text: 'Experience building backend services in Python or Java.', feature: 2 },
  { text: 'Clear written communication; do not overstate impact.', feature: 3 },
  { text: 'Preferred', feature: 4 },
  { text: 'Public projects on GitHub.', feature: 4 },
  { text: 'Leadership in student clubs, hackathons or competitions.', feature: 5 },
  { text: 'Submit a resume that parses cleanly in our applicant tracking system.', feature: 6 },
]

const FEATURES = [
  {
    title: 'Minimum qualifications count double.',
    body: 'The tailor reads the whole description, separates the must-haves from the nice-to-haves, and weighs your material against the must-haves first.',
  },
  {
    title: 'Class X, XII and CGPA, the Indian way.',
    body: 'Marks, percentages and CGPA are first-class fields. Keep each school as its own entry, or roll LKG to Class XII into one heading with scores as bullets.',
  },
  {
    title: 'Your vault is matched, not skimmed.',
    body: 'Every internship, project and role you have saved is scored against the role. Only the strongest proof makes the cut, in the order you set.',
  },
  {
    title: 'Rewritten, never invented.',
    body: 'Bullets are sharpened for the role, but a number that is not in your vault is stripped out. What ships on the page is what you actually did.',
  },
  {
    title: 'Import projects straight from GitHub.',
    body: 'Enter your username, pick the repositories, and the bullets are drafted from the READMEs. Edit anything before it lands in the vault.',
  },
  {
    title: 'Clubs and wins, kept verbatim.',
    body: 'Extracurriculars and achievements get their own sections. They are chosen for the role and carried across word for word.',
  },
  {
    title: 'A real LaTeX PDF the ATS can read.',
    body: 'Single column, real text, standard fonts. One page by default, or let it run longer when you say so.',
  },
]

function useActiveFeature(count: number) {
  const refs = useRef<(HTMLElement | null)[]>([])
  const [active, setActive] = useState(0)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index))
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    refs.current.slice(0, count).forEach((el) => el && observer.observe(el))
    return () => observer.disconnect()
  }, [count])

  return { refs, active }
}

function HeroProduct() {
  return (
    <div className="relative mx-auto mt-16 w-full max-w-[980px]" data-reveal style={{ '--reveal-delay': '300ms' } as React.CSSProperties}>
      <div className="rounded-[20px] border border-line bg-surface p-2 shadow-[0_6px_25px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5 text-xs text-ink-faint">
          <Lock size={13} />
          <span>Your vault</span>
          <span className="ml-auto rounded-full border border-line px-2 py-0.5">Example with sample data</span>
        </div>
        <div className="grid gap-2 p-2 md:grid-cols-[1.1fr_1fr]">
          <div className="space-y-2">
            {[
              ['Vellore Institute of Technology', 'B.Tech CSE · CGPA 8.74/10'],
              ['Delhi Public School', 'CBSE Class XII · 94.2%'],
              ['Payments intern, fintech startup', 'Python settlement service · 3 bullets'],
              ['campus-connect', 'Imported from GitHub · 2 bullets'],
            ].map(([title, meta], i) => (
              <div key={title} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-left">
                <span className={`h-2 w-2 shrink-0 rounded-full ${i === 2 ? 'bg-ember' : 'bg-iris'}`} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{title}</p>
                  <p className="truncate text-xs text-ink-faint">{meta}</p>
                </div>
                <Check size={15} className="ml-auto shrink-0 text-iris-fg" />
              </div>
            ))}
          </div>
          <div className="glow-ember rounded-xl border border-line bg-surface-2 p-4 text-left">
            <p className="text-xs text-ink-faint">Cut for</p>
            <p className="mt-1 text-lg font-medium tracking-[-0.02em] text-ink">Software Engineer, Graduate 2026</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {['Python', 'Backend services', 'CGPA 7.5+', 'GitHub'].map((tag) => (
                <span key={tag} className="chip">{tag}</span>
              ))}
            </div>
            <ul className="mt-5 space-y-2 text-xs leading-relaxed text-ink-muted">
              <li>Built a Python settlement service that reconciles daily payouts</li>
              <li>Shipped campus-connect, an event app used across student clubs</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Landing() {
  const { data: session } = useSession()
  const signedIn = Boolean(session?.user)
  const { refs, active } = useActiveFeature(FEATURES.length)
  useReveal()

  const primary = signedIn
    ? { to: '/vault', label: 'Open my vault' }
    : { to: '/sign-up', label: 'Build my vault' }

  return (
    <>
      {/* Hero - always dark: light leaking out of the vault. */}
      <section className="band-void relative isolate overflow-hidden px-4 pb-24 pt-36 sm:px-6 sm:pt-44">
        <AuroraBeam className="pointer-events-none absolute inset-0 -z-10 h-full w-full" />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-b from-transparent to-void"
          aria-hidden="true"
        />
        <div className="mx-auto max-w-[1200px] text-center">
          <h1 className="display mx-auto max-w-[14ch] text-[clamp(2.75rem,8vw,5.25rem)] text-white" data-reveal>
            Your whole record, locked in one vault.
          </h1>
          <p
            className="mx-auto mt-6 max-w-[52ch] text-base leading-relaxed text-ink-muted sm:text-lg"
            data-reveal
            style={{ '--reveal-delay': '120ms' } as React.CSSProperties}
          >
            Save your marks, internships, projects and clubs once. Hand over a job
            description and walk out with a resume cut for that role - rewritten from
            what you did, never invented.
          </p>
          <div
            className="mt-9 flex flex-wrap justify-center gap-3"
            data-reveal
            style={{ '--reveal-delay': '200ms' } as React.CSSProperties}
          >
            <Link to={primary.to} className="btn-primary">
              {primary.label}
              <ArrowRight size={16} />
            </Link>
            <a href="#how" className="btn-secondary">
              See how it tailors
            </a>
          </div>
          <HeroProduct />
        </div>
      </section>

      {/* The job description is the map. */}
      <section id="how" className="scroll-mt-16 bg-bg px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-[1200px]">
          <h2 className="display max-w-[18ch] text-[clamp(2.25rem,5vw,3.75rem)]" data-reveal>
            Every line of the job description gets an answer.
          </h2>
          <p className="mt-5 max-w-[56ch] text-ink-muted" data-reveal>
            Here is a sample posting. Scroll, and watch which part of it each piece of
            ResumeMaxxer is built to meet.
          </p>

          <div className="mt-16 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
                <div className="mb-4 flex items-center gap-2 text-xs text-ink-faint">
                  <FileText size={14} />
                  <span>sample-job-description.pdf</span>
                  <span className="ml-auto rounded-full border border-line px-2 py-0.5">Example</span>
                </div>
                <ol className="space-y-1 text-sm leading-relaxed">
                  {JD_LINES.map((line, i) => {
                    const lit = line.feature !== undefined && line.feature === active
                    const heading = i === 0 || line.text === 'About the role' || line.text.startsWith('Minimum') || line.text === 'Preferred'
                    return (
                      <li
                        key={line.text}
                        className={`rounded-[4px] px-3 py-1 transition-colors duration-500 ${
                          lit ? 'bg-ember/15 text-ink' : 'text-ink-faint'
                        } ${heading ? 'font-medium' : ''} ${i === 0 ? 'text-base text-ink' : ''}`}
                      >
                        {line.text}
                      </li>
                    )
                  })}
                </ol>
              </div>
            </div>

            <div className="space-y-4 lg:py-[20vh]">
              {FEATURES.map((feature, i) => (
                <article
                  key={feature.title}
                  ref={(el) => {
                    refs.current[i] = el
                  }}
                  data-index={i}
                  className={`rounded-xl border p-6 transition-colors duration-500 lg:min-h-[38vh] ${
                    active === i ? 'border-line-strong bg-surface' : 'border-line bg-bg'
                  }`}
                >
                  <h3 className="text-xl font-medium tracking-[-0.02em] sm:text-2xl">{feature.title}</h3>
                  <p className="mt-3 max-w-[48ch] leading-relaxed text-ink-muted">{feature.body}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Proof - a real compiled PDF. */}
      <section className="band-void relative isolate overflow-hidden px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto grid max-w-[1200px] items-center gap-14 lg:grid-cols-2">
          <div>
            <h2 className="display max-w-[14ch] text-[clamp(2.25rem,5vw,3.75rem)] text-white" data-reveal>
              The page recruiters actually open.
            </h2>
            <p className="mt-5 max-w-[48ch] leading-relaxed text-ink-muted" data-reveal>
              Typeset in LaTeX from your vault, so text stays text for the tracking
              system and spacing holds up when a human reads it.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-ink-muted" data-reveal>
              {[
                'One page by default, longer only when you allow it',
                'Edit the text and update the preview before you download',
                'See why each item was chosen for the role',
                'Every tailored resume kept in your history',
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <Check size={16} className="mt-0.5 shrink-0 text-iris-fg" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <figure className="glow-ember relative rounded-xl border border-line bg-surface p-3" data-reveal>
            <img
              src="/images/sample-resume.png"
              alt="Example tailored resume for a fictional student, showing education with CGPA and Class XII marks, experience and projects on a single page."
              width={935}
              height={1210}
              loading="lazy"
              className="w-full rounded-[4px] bg-white"
            />
            <figcaption className="mt-3 text-xs text-ink-faint">
              Example output. The student and every detail are sample data.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Access. */}
      <section className="bg-bg px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-[1200px]">
          <h2 className="display max-w-[16ch] text-[clamp(2.25rem,5vw,3.75rem)]" data-reveal>
            Free to start. Yours to keep going.
          </h2>
          <dl className="mt-12 divide-y divide-line border-y border-line">
            {[
              { title: '3 tailors every week', body: 'Every account gets three free tailored resumes, reset each Monday. No card.' },
              { title: 'Then bring your own Gemini key', body: 'Paste a free Gemini API key to keep going. It stays in your browser and is sent only with your request.' },
              { title: 'Built from your real work', body: 'Import repositories, set the order of every entry, and choose exactly which details reach the page.' },
            ].map(({ title, body }, i) => (
              <div
                key={title}
                className="grid gap-2 py-7 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-10"
                data-reveal
                style={{ '--reveal-delay': `${i * 90}ms` } as React.CSSProperties}
              >
                <dt className={`font-medium tracking-[-0.02em] ${i === 0 ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>{title}</dt>
                <dd className="leading-relaxed text-ink-muted">{body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Final CTA. */}
      <section className="band-void relative isolate overflow-hidden px-4 py-28 text-center sm:px-6">
        <div className="glow-ember pointer-events-none absolute inset-0 -z-10 [&::before]:left-1/2 [&::before]:top-auto [&::before]:-bottom-40 [&::before]:h-[520px] [&::before]:w-[820px] [&::before]:-translate-x-1/2" aria-hidden="true" />
        <h2 className="display mx-auto max-w-[16ch] text-[clamp(2.25rem,6vw,4.25rem)] text-white" data-reveal>
          Open your vault before the next deadline.
        </h2>
        <div className="mt-9 flex justify-center" data-reveal>
          <Link to={primary.to} className="btn-white">
            {primary.label}
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </>
  )
}
