import { Link } from 'react-router-dom'

import SiteImage from '../components/SiteImage'

export default function NotFound() {
  return (
    <div className="grid items-center gap-10 py-16 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <h1 className="display text-[clamp(2.5rem,6vw,4.5rem)] text-ink">Nothing in this drawer.</h1>
        <p className="mt-5 max-w-[40ch] text-ink-muted">
          The page you were looking for does not exist, or it has moved.
        </p>
        <Link to="/" className="btn-primary mt-8">
          Back home
        </Link>
      </div>
      <SiteImage
        src="/images/not-found.webp"
        className="w-full rounded-xl border border-line"
      />
    </div>
  )
}
