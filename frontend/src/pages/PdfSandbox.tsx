import { useState } from 'react'

import ResumePreview from '../components/ResumePreview'
import type { ResumePayload } from '../lib/types'

/**
 * Dev-only PDF sandbox, mounted at /pdf-sandbox (see App.tsx).
 *
 * Renders the resume template against a fixed fixture so the layout can be
 * checked against resume-template.tex without signing in, filling a vault and
 * burning a Gemini call each time. Excluded from production builds.
 *
 * The fixture is deliberately maximal - 3 education rows, 4 entries, 4 bullets
 * each, 4 skill categories, long bullet text - because that is the worst case
 * the One-Page Rule permits. If this fits on one page, everything the backend
 * can emit fits.
 */
const SAMPLE: ResumePayload = {
  header: {
    full_name: 'Ananya Krishnan',
    phone: '+91 98765 43210',
    email: 'ananya.krishnan@vitstudent.ac.in',
    linkedin: 'linkedin.com/in/ananyakrishnan',
    github: 'github.com/ananyak',
    portfolio: '',
  },
  education: [
    {
      institution: 'Vellore Institute of Technology',
      location: 'Vellore, Tamil Nadu',
      qualification: 'B.Tech Computer Science and Engineering',
      score: 'CGPA: 8.74/10',
      date_range: 'Aug. 2022 - May 2026',
    },
    {
      institution: 'Delhi Public School',
      location: 'Bengaluru, Karnataka',
      qualification: 'CBSE - Class XII (PCMC)',
      score: 'Percentage: 94.2%',
      date_range: '2020 - 2022',
    },
    {
      institution: 'St. Xavier High School',
      location: 'Bengaluru, Karnataka',
      qualification: 'ICSE - Class X',
      score: 'Percentage: 96.8%',
      date_range: '2018 - 2020',
    },
  ],
  experience: [
    {
      title: 'Software Engineering Intern',
      date_range: 'May 2025 - July 2025',
      organization: 'Razorpay',
      location: 'Bengaluru, Karnataka',
      bullets: [
        'Built a settlement reconciliation service in Python and FastAPI, replacing a manual spreadsheet process used by three operations teams.',
        'Designed the PostgreSQL schema and indexing strategy backing the reconciliation service.',
        'Automated the nightly ledger export, removing a recurring manual step from the on-call runbook.',
        'Wrote integration tests for the settlement endpoints and wired them into the CI pipeline.',
      ],
    },
    {
      title: 'Technical Lead',
      date_range: 'Sept. 2024 - Present',
      organization: 'IEEE Computer Society, VIT Chapter',
      location: 'Vellore, Tamil Nadu',
      bullets: [
        'Led a six-person team building the chapter event platform used by over 800 students.',
        'Introduced code review and a shared Git branching workflow, replacing files shared over WhatsApp.',
        'Mentored first-year members through their first merged contributions to the codebase.',
      ],
    },
  ],
  projects: [
    {
      name: 'Course Scheduler',
      tech_stack: 'Python, FastAPI, React, PostgreSQL, Docker',
      date_range: 'Jan. 2025 - Apr. 2025',
      bullets: [
        'Built a constraint solver generating conflict-free timetables from the university course catalogue.',
        'Implemented the catalogue scraper and normalisation pipeline handling inconsistent department formats.',
        'Shipped a React front end letting students pin required courses before solving.',
      ],
    },
    {
      name: 'Campus Transit Tracker',
      tech_stack: 'React, TypeScript, WebSockets, Redis',
      date_range: 'Oct. 2024',
      bullets: [
        'Built a live shuttle map consuming the campus GPS feed over WebSockets.',
        'Placed in the top ten of a 48-hour hackathon with 60 competing teams.',
        'Deployed the service on a free-tier container host with an automated build pipeline.',
      ],
    },
  ],
  selection_rationale:
    'Led with the Razorpay internship because the role asks for production '
    + 'Python and PostgreSQL; the Course Scheduler shows the constraint-solving '
    + 'the posting calls out.',
  skills: [
    { category: 'Languages', items: 'Python, TypeScript, Java, C, SQL, HTML/CSS' },
    { category: 'Frameworks', items: 'FastAPI, React, Node.js, Flask, Tailwind CSS' },
    {
      category: 'Developer Tools',
      items: 'Git, Docker, GitHub Actions, Postman, Linux, VS Code',
    },
    { category: 'Libraries', items: 'pandas, NumPy, SQLAlchemy, pytest, Redis' },
  ],
}

export default function PdfSandbox() {
  // Editable so the edit-and-re-render flow can be exercised here too. The
  // Tailor page is the only other place it appears, and reaching that needs a
  // live Gemini call.
  const [resume, setResume] = useState(SAMPLE)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          PDF sandbox
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Development only. Renders the resume template against a worst-case
          fixture so layout changes can be checked against resume-template.tex
          without a live AI call.
        </p>
      </header>

      <ResumePreview
        resume={resume}
        jobTitle="Backend Engineering Intern"
        onChange={setResume}
      />
    </div>
  )
}
