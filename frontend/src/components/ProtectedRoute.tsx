import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useSession } from '../lib/auth-client'
import Spinner from './Spinner'

/**
 * Gate for routes that need a signed-in user.
 *
 * This is a UX guard, not a security boundary - it prevents a signed-out user
 * from staring at an empty dashboard. Authorisation is enforced server-side on
 * every endpoint; anyone can edit client-side JS.
 */
export default function ProtectedRoute() {
  const { data: session, isPending } = useSession()
  const location = useLocation()

  // The session resolves asynchronously. Redirecting before it settles would
  // bounce already-signed-in users to the sign-in page on every refresh.
  if (isPending) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner label="Checking your session…" />
      </div>
    )
  }

  if (!session?.user) {
    // `state.from` lets the sign-in flow send the user back where they meant
    // to go, instead of dumping everyone on the dashboard.
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
