import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'

import { clearAuthToken, signOut, useSession } from '../lib/auth-client'

/** Nav link that highlights when its route is active. */
function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-brand-50 text-brand-700'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

/** App shell: header, routed content, footer. */
export default function Layout() {
  const { data: session, isPending } = useSession()
  const navigate = useNavigate()
  const signedIn = Boolean(session?.user)

  async function handleSignOut() {
    await signOut()
    // The JWT cache is module state and outlives the session, so it has to be
    // cleared explicitly or the next user in this tab reuses this token.
    clearAuthToken()
    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-sm text-white">
              R
            </span>
            ResumeMaxxer
          </Link>

          {/* Render nothing while the session resolves, rather than flashing
              "Sign in" at someone who is already signed in. */}
          {!isPending && (
            <nav className="flex items-center gap-1">
              {signedIn ? (
                <>
                  <NavItem to="/vault">Vault</NavItem>
                  <NavItem to="/tailor">Tailor</NavItem>
                  <NavItem to="/history">History</NavItem>
                  <span className="ml-2 hidden text-sm text-slate-500 sm:inline">
                    {session?.user.email}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    className="btn-secondary ml-2"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link to="/sign-in" className="btn-secondary">
                    Sign in
                  </Link>
                  <Link to="/sign-up" className="btn-primary">
                    Get started
                  </Link>
                </>
              )}
            </nav>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        Built for students. Your vault is the only source of truth - the AI
        never invents experience.
      </footer>
    </div>
  )
}
