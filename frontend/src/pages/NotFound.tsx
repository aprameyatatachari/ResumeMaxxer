import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="text-sm font-semibold text-iris-fg">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-ink">Page not found</h1>
      <p className="mt-2 text-ink-muted">That page does not exist.</p>
      <Link to="/" className="btn-primary mt-6">
        Back home
      </Link>
    </div>
  )
}
