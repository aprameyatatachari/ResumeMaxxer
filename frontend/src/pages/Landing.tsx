import { Link } from 'react-router-dom'

import { useSession } from '../lib/auth-client'

const STEPS = [
  {
    title: 'Build your vault once',
    body: 'Class X and XII marks, your degree, projects, club roles and internships. Enter your GitHub username and pick the repos - the AI writes the bullets for you.',
  },
  {
    title: 'Upload the job description',
    body: 'Drop in the PDF or Word file the company sent. The AI reads it, works out what the role screens for, then picks the experience from your vault that proves it.',
  },
  {
    title: 'Download a one-page PDF',
    body: 'Single column, real text, standard fonts. Built to survive the applicant tracking system, not just look good.',
  },
]

export default function Landing() {
  const { data: session } = useSession()
  const signedIn = Boolean(session?.user)

  return (
    <div className="mx-auto max-w-3xl py-12 text-center">
      <span className="chip">For college students</span>

      <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
        One vault. Every application.
      </h1>

      <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
        Stop rewriting your resume for every posting. Keep your whole history in
        one place and let the AI tailor a one-page, ATS-ready PDF for each role.
      </p>

      <div className="mt-8 flex justify-center gap-3">
        {signedIn ? (
          <>
            <Link to="/vault" className="btn-primary px-6 py-2.5">
              Open my vault
            </Link>
            <Link to="/tailor" className="btn-secondary px-6 py-2.5">
              Tailor a resume
            </Link>
          </>
        ) : (
          <>
            <Link to="/sign-up" className="btn-primary px-6 py-2.5">
              Build my vault
            </Link>
            <Link to="/sign-in" className="btn-secondary px-6 py-2.5">
              Sign in
            </Link>
          </>
        )}
      </div>

      <div className="mt-16 grid gap-4 text-left sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <div key={step.title} className="card">
            <div className="mb-2 grid h-7 w-7 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
              {index + 1}
            </div>
            <h2 className="font-semibold text-slate-900">{step.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{step.body}</p>
          </div>
        ))}
      </div>

      <p className="mt-10 text-sm text-slate-500">
        The AI only ever rewrites what you put in your vault. It will not invent
        a metric, a job, or a technology you have never touched.
      </p>
    </div>
  )
}
