import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import DialText from '../components/DialText'
import SiteImage from '../components/SiteImage'
import ScrubText from '../components/landing/ScrubText'
import { ArrowRight, Cap, Check, FileText, Pencil, Sparkle } from '../components/icons'
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

const FACTS = [
  '3 free tailors a week',
  'Class X, XII and CGPA',
  'One page by default',
  'Zero invented numbers',
  'Real LaTeX PDF',
]

const VALUES = [
  {
    icon: Pencil,
    title: 'Rewritten, never invented',
    body: 'Bullets are sharpened for the role. A number that is not in your vault never reaches the page.',
  },
  {
    icon: Cap,
    title: 'Built for Indian marks',
    body: 'Class X and XII, boards, percentages and CGPA are proper fields, not an afterthought.',
  },
  {
    icon: FileText,
    title: 'A PDF the ATS can read',
    body: 'Typeset in LaTeX: single column, real text, standard fonts, one page unless you say otherwise.',
  },
]

const STEPS = [
  {
    title: 'Fill your vault once',
    body: 'Education, internships, projects, clubs and achievements. Import projects from GitHub in a click.',
  },
  {
    title: 'Upload the job description',
    body: 'Drop in the PDF or Word file the company sent, exactly as it came.',
  },
  {
    title: 'The role is read like a recruiter would',
    body: 'Must-have qualifications are separated from nice-to-haves and weighted double.',
  },
  {
    title: 'Your best proof is chosen and sharpened',
    body: 'Matching items from your vault are picked, ordered your way, and rewritten for the role.',
  },
  {
    title: 'Edit, then download',
    body: 'Adjust any line, update the preview, and download the PDF. Every version stays in your history.',
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

const delay = (ms: number) => ({ '--reveal-delay': `${ms}ms` }) as React.CSSProperties

function SectionMark({ num, children }: { num: string; children: string }) {
  return (
    <p className="section-mark" data-num={num}>
      <span>{children}</span>
    </p>
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
      {/* Hero: the vault door in black and white, the one iridescent line. */}
      <section className="band-void relative isolate flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-4 pb-20 pt-32 text-center sm:px-6">
        <SiteImage
          src="/images/hero-vault.webp"
          eager
          className="hero-image mono pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover object-[70%_center]"
        />
        <div
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_65%_55%_at_50%_48%,rgb(10_10_10/0.78),rgb(10_10_10/0.35)_70%,rgb(10_10_10/0.2)),linear-gradient(180deg,transparent_70%,#0a0a0a)]"
          aria-hidden="true"
        />
        <p
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.04em] text-ink-muted backdrop-blur"
          data-reveal
        >
          <Sparkle size={14} className="text-white" />
          Resume tailoring for Indian students
        </p>
        <h1
          className="display text-iridescent mt-7 max-w-[13ch] pb-2 text-[clamp(3rem,8.5vw,6.25rem)]"
          data-reveal
          style={delay(80)}
        >
          Your whole record, locked in one vault.
        </h1>
        <p
          className="mt-6 max-w-[50ch] text-base leading-relaxed text-ink-muted sm:text-lg"
          data-reveal
          style={delay(160)}
        >
          Save your marks, internships, projects and clubs once. Hand over a job description and
          walk out with a resume cut for that role - rewritten from what you did, never invented.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3" data-reveal style={delay(240)}>
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
      </section>

      {/* 001 - what it is. */}
      <section className="bg-bg px-4 pt-28 sm:px-6 sm:pt-36">
        <div className="mx-auto max-w-[980px] text-center">
          <SectionMark num="001">What it is</SectionMark>
          <ScrubText
            className="display-sm mt-8 text-[clamp(1.75rem,4vw,3.25rem)] text-ink"
            text="ResumeMaxxer keeps everything you have ever done in one vault, reads each job description the way a recruiter screens it, and cuts a resume for that role from your real record."
          />
        </div>

        {/* Facts marquee behind a framed image, as one composition. */}
        <div className="relative mt-20 pb-28 sm:mt-24 sm:pb-36">
          <div className="marquee absolute inset-x-0 top-[42%] -translate-y-1/2" aria-hidden="true">
            {[0, 1].map((copy) => (
              <div key={copy} className="marquee__track">
                {FACTS.map((fact) => (
                  <span
                    key={fact}
                    className="display flex items-center gap-10 whitespace-nowrap pr-10 text-[clamp(3.5rem,10vw,8.5rem)] text-ink/15"
                  >
                    {fact}
                    <span className="h-4 w-4 rounded-full bg-[image:var(--iridescent)]" />
                  </span>
                ))}
              </div>
            ))}
          </div>
          <ul className="sr-only">
            {FACTS.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
          <figure
            className="relative mx-auto aspect-[4/3] w-[min(78vw,560px)] overflow-hidden rounded-[48px] border border-line bg-void shadow-[0_30px_80px_-30px_rgb(0_0_0/0.5)]"
            data-reveal
          >
            <SiteImage src="/images/auth-vault.webp" className="mono h-full w-full object-cover object-top" />
          </figure>
        </div>
      </section>

      {/* 002 - why. */}
      <section className="bg-bg px-4 pb-28 sm:px-6 sm:pb-36">
        <div className="mx-auto max-w-[1200px] text-center">
          <SectionMark num="002">Why it works</SectionMark>
          <DialText as="h2" className="display mt-5 text-[clamp(2.5rem,6vw,4.5rem)]" text="Why ResumeMaxxer?" />
          <p className="mx-auto mt-5 max-w-[52ch] text-ink-muted" data-reveal>
            Most resume tools make something up to fill the page. This one only works with what is
            already in your vault.
          </p>
          <div className="mt-16 grid gap-5 md:grid-cols-3">
            {VALUES.map(({ icon: Icon, title, body }, i) => (
              <article
                key={title}
                className="rounded-[44px] border border-line bg-surface-2 p-3"
                data-reveal
                style={delay(i * 90)}
              >
                <div className="dot-well relative grid aspect-[5/4] place-items-center rounded-[36px]">
                  <span className="orb h-24 w-24">
                    <Icon size={34} strokeWidth={1.6} />
                  </span>
                  <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-white/10 px-2 py-0.5 text-xs text-white/80">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="mx-auto mt-7 max-w-[18ch] text-xl font-medium tracking-[-0.03em]">{title}</h3>
                <p className="mx-auto mb-6 mt-3 max-w-[30ch] text-sm leading-relaxed text-ink-muted">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 003 - the job description is the map. */}
      <section id="how" className="scroll-mt-8 bg-bg-2 px-4 py-28 sm:px-6 sm:py-36">
        <div className="mx-auto max-w-[1200px]">
          <div className="text-center">
            <SectionMark num="003">Capabilities</SectionMark>
            <DialText
              as="h2"
              className="display mx-auto mt-5 max-w-[18ch] text-[clamp(2.25rem,5.5vw,4.25rem)]"
              text="Every line of the job description gets an answer."
            />
            <p className="mx-auto mt-5 max-w-[54ch] text-ink-muted" data-reveal>
              A sample posting. Scroll, and watch which part of it each piece of ResumeMaxxer is
              built to meet.
            </p>
          </div>

          <div className="mt-16 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <div className="rounded-[36px] border border-line bg-surface p-6 sm:p-8">
                <div className="mb-5 flex items-center gap-2 text-xs text-ink-faint">
                  <FileText size={14} />
                  <span>sample-job-description.pdf</span>
                  <span className="ml-auto rounded-full border border-line px-2.5 py-0.5">Example</span>
                </div>
                <ol className="space-y-1 text-sm leading-relaxed">
                  {JD_LINES.map((line, i) => {
                    const lit = line.feature !== undefined && line.feature === active
                    const heading =
                      i === 0 ||
                      line.text === 'About the role' ||
                      line.text.startsWith('Minimum') ||
                      line.text === 'Preferred'
                    return (
                      <li
                        key={line.text}
                        className={`relative px-4 py-1.5 transition-colors duration-500 ${
                          lit ? 'text-[#0a0a0a]' : i === 0 ? 'text-ink' : 'text-ink-faint'
                        } ${heading ? 'font-medium' : ''} ${i === 0 ? 'text-base' : ''}`}
                      >
                        <span
                          className={`absolute inset-0 rounded-[14px] bg-[image:var(--iridescent)] transition-opacity duration-500 ${
                            lit ? 'opacity-100' : 'opacity-0'
                          }`}
                          aria-hidden="true"
                        />
                        <span className="relative">{line.text}</span>
                      </li>
                    )
                  })}
                </ol>
              </div>
            </div>

            <div className="space-y-4 lg:py-[18vh]">
              {FEATURES.map((feature, i) => (
                <article
                  key={feature.title}
                  ref={(el) => {
                    refs.current[i] = el
                  }}
                  data-index={i}
                  className={`rounded-[36px] border p-8 transition-all duration-500 lg:min-h-[36vh] ${
                    active === i
                      ? 'border-line-strong bg-surface shadow-[0_20px_50px_-30px_rgb(0_0_0/0.35)]'
                      : 'border-transparent lg:opacity-80'
                  }`}
                >
                  <span className="text-xs text-ink-faint">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="mt-3 text-2xl font-medium tracking-[-0.035em] sm:text-3xl">{feature.title}</h3>
                  <p className="mt-4 max-w-[46ch] leading-relaxed text-ink-muted">{feature.body}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 004 - process. */}
      <section className="bg-bg px-4 py-28 sm:px-6 sm:py-36">
        <div className="mx-auto max-w-[1000px]">
          <div className="text-center">
            <SectionMark num="004">Process</SectionMark>
            <DialText as="h2" className="display mt-5 text-[clamp(2.5rem,6vw,4.5rem)]" text="How it works" />
          </div>
          <ol className="relative mt-16">
            <span className="absolute left-5 top-0 h-full w-px bg-line md:left-1/2" aria-hidden="true" />
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className={`relative grid gap-3 pb-14 pl-16 last:pb-0 md:w-1/2 ${
                  i % 2 ? 'md:ml-auto md:pl-14' : 'md:pl-0 md:pr-14 md:text-right'
                }`}
                data-reveal
              >
                <span
                  className={`absolute left-0 top-0 grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-sm font-medium ${
                    i % 2 ? 'md:-left-5' : 'md:left-auto md:-right-5'
                  }`}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="pt-1.5 text-2xl font-medium tracking-[-0.035em]">{step.title}</h3>
                <p className="leading-relaxed text-ink-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 005 - proof: a real compiled PDF. */}
      <section className="px-4 sm:px-6">
        <div className="band-void mx-auto grid max-w-[1280px] items-center gap-14 overflow-hidden rounded-[48px] px-6 py-16 sm:px-14 sm:py-20 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <SectionMark num="005">The output</SectionMark>
            <DialText
              as="h2"
              className="display mt-5 max-w-[14ch] text-[clamp(2.25rem,5vw,4rem)] text-ink"
              text="The page recruiters actually open."
            />
            <p className="mt-5 max-w-[46ch] leading-relaxed text-ink-muted" data-reveal>
              Typeset in LaTeX from your vault, so text stays text for the tracking system and
              spacing holds up when a human reads it.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-ink-muted" data-reveal>
              {[
                'One page by default, longer only when you allow it',
                'Edit the text and update the preview before you download',
                'See why each item was chosen for the role',
                'Every tailored resume kept in your history',
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[image:var(--iridescent)] text-[#0a0a0a]">
                    <Check size={12} strokeWidth={2.6} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <figure className="glow-ember relative rounded-[36px] border border-line bg-surface-2 p-4" data-reveal>
            <img
              src="/images/sample-resume.webp"
              alt="Example tailored resume for a fictional student, showing education with CGPA and Class XII marks, experience and projects on a single page."
              width={935}
              height={1210}
              loading="lazy"
              className="w-full rounded-[20px] bg-white"
            />
            <figcaption className="mt-3 px-2 text-xs text-ink-faint">
              Example output. The student and every detail are sample data.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* 006 - pricing. */}
      <section className="bg-bg px-4 py-28 sm:px-6 sm:py-36">
        <div className="mx-auto max-w-[1000px]">
          <div className="text-center">
            <SectionMark num="006">Pricing</SectionMark>
            <DialText
              as="h2"
              className="display mx-auto mt-5 max-w-[16ch] text-[clamp(2.25rem,5.5vw,4.25rem)]"
              text="Free to start. Yours to keep going."
            />
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-2">
            <article className="flex flex-col rounded-[40px] border border-line bg-surface p-8 sm:p-10" data-reveal>
              <h3 className="text-lg font-medium">Every account</h3>
              <p className="mt-1 text-sm text-ink-muted">For your first applications</p>
              <p className="display mt-8 text-6xl">
                3<span className="ml-2 text-lg font-medium tracking-normal text-ink-muted">tailors a week</span>
              </p>
              <ul className="mt-8 flex-1 space-y-3 text-sm text-ink-muted">
                {['Free, no card', 'Resets every Monday', 'Full vault, GitHub import and history'].map((item) => (
                  <li key={item} className="flex gap-3">
                    <Check size={16} className="mt-0.5 shrink-0 text-ink" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link to={primary.to} className="btn-secondary mt-10">
                {primary.label}
              </Link>
            </article>
            <article
              className="band-void glow-ember flex flex-col rounded-[40px] border border-line p-8 sm:p-10"
              data-reveal
              style={delay(90)}
            >
              <h3 className="text-lg font-medium">With your own key</h3>
              <p className="mt-1 text-sm text-ink-muted">When application season gets busy</p>
              <p className="display text-iridescent mt-8 pb-1 text-6xl">Unlimited</p>
              <ul className="mt-8 flex-1 space-y-3 text-sm text-ink-muted">
                {[
                  'Paste a free Gemini API key',
                  'Kept in your browser, sent only with your request',
                  'Step-by-step instructions to get one',
                ].map((item) => (
                  <li key={item} className="flex gap-3">
                    <Check size={16} className="mt-0.5 shrink-0 text-ink" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link to={primary.to} className="btn-white mt-10">
                {primary.label}
                <ArrowRight size={16} />
              </Link>
            </article>
          </div>
        </div>
      </section>

      {/* Final CTA. */}
      <section className="px-4 pb-24 sm:px-6">
        <div className="band-void relative isolate mx-auto flex min-h-[70vh] max-w-[1280px] flex-col items-center justify-center overflow-hidden rounded-[48px] px-6 py-24 text-center">
          <SiteImage
            src="/images/cta-vault.webp"
            className="mono pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover"
          />
          <div
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_55%_50%_at_center,rgb(10_10_10/0.75),rgb(10_10_10/0.3)_80%)]"
            aria-hidden="true"
          />
          <h2
            className="display text-iridescent mx-auto max-w-[15ch] pb-2 text-[clamp(2.5rem,6.5vw,5rem)]"
            data-reveal
          >
            Open your vault before the next deadline.
          </h2>
          <div className="mt-10 flex justify-center" data-reveal>
            <Link to={primary.to} className="btn-white min-h-12">
              {primary.label}
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
