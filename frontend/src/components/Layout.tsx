import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { clearAuthToken, signOut, useSession } from '../lib/auth-client'
import { LogoMark, Wordmark } from './brand/Logo'
import { Close, Menu } from './icons'
import ThemeToggle from './ThemeToggle'
import WelcomeLoader from './WelcomeLoader'

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `inline-flex min-h-10 items-center rounded-full px-3.5 text-sm transition-colors duration-200 ${
          isActive ? 'bg-white/12 text-white' : 'text-ink-muted hover:text-white'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

/** App shell: blurred sticky header, routed content, quiet footer. */
export default function Layout() {
  const { data: session, isPending } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const signedIn = Boolean(session?.user)
  const onLanding = location.pathname === '/'
  const [menuOpen, setMenuOpen] = useState(false)

  // Close the mobile menu whenever the route changes.
  useEffect(() => setMenuOpen(false), [location.pathname])

  async function handleSignOut() {
    await signOut()
    // The JWT cache is module state and outlives the session, so it has to be
    // cleared explicitly or the next user in this tab reuses this token.
    clearAuthToken()
    navigate('/', { replace: true })
  }

  const links = signedIn ? (
    <>
      <NavItem to="/vault">Vault</NavItem>
      <NavItem to="/tailor">Tailor</NavItem>
      <NavItem to="/history">History</NavItem>
    </>
  ) : null

  // One floating cluster, dark glass on every page: a round home mark and a
  // pill holding the navigation, the account and the call to action.
  const glass =
    'border border-white/10 bg-[rgb(20_20_20/0.9)] shadow-[0_10px_30px_-10px_rgb(0_0_0/0.6)] backdrop-blur-xl'

  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <header className="band-void pointer-events-none fixed inset-x-0 top-0 z-40 !bg-transparent px-3 pt-4">
        <div className="pointer-events-auto mx-auto flex w-fit max-w-full items-center gap-2">
          <Link
            to="/"
            aria-label="ResumeMaxxer home"
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-white transition-transform duration-300 hover:rotate-45 ${glass}`}
          >
            <LogoMark size={24} />
          </Link>

          <div className={`flex min-h-12 items-center gap-1 rounded-full p-1 pl-2 ${glass}`}>
            <ThemeToggle />
            {/* Render nothing while the session resolves, rather than flashing
                "Sign in" at someone who is already signed in. */}
            {!isPending && (
              <>
                {signedIn && (
                  <button
                    type="button"
                    className="grid h-10 w-10 place-items-center rounded-full text-white md:hidden"
                    aria-expanded={menuOpen}
                    aria-controls="mobile-nav"
                    aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                    onClick={() => setMenuOpen((open) => !open)}
                  >
                    {menuOpen ? <Close size={18} /> : <Menu size={18} />}
                  </button>
                )}
                <nav className="hidden items-center md:flex" aria-label="Main">
                  {links}
                </nav>
                {signedIn && (
                  <span className="hidden max-w-48 truncate px-2 text-xs text-ink-muted lg:inline">
                    {session?.user.email}
                  </span>
                )}
                {signedIn ? (
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    className="btn-white hidden min-h-10 md:inline-flex"
                  >
                    Sign out
                  </button>
                ) : (
                  <>
                    <Link
                      to="/sign-in"
                      className="inline-flex min-h-10 items-center rounded-full px-3.5 text-sm text-ink-muted transition-colors hover:text-white"
                    >
                      Sign in
                    </Link>
                    <Link to="/sign-up" className="btn-white min-h-10">
                      Get started
                    </Link>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {signedIn && menuOpen && (
          <nav
            id="mobile-nav"
            aria-label="Main"
            className={`pointer-events-auto mx-auto mt-2 flex max-w-sm flex-col gap-1 rounded-[28px] p-3 md:hidden ${glass}`}
          >
            {links}
            <p className="truncate px-3.5 pt-2 text-sm text-ink-muted">{session?.user.email}</p>
            <button type="button" onClick={() => void handleSignOut()} className="btn-white mt-2">
              Sign out
            </button>
          </nav>
        )}
      </header>

      {location.pathname === '/vault' && <WelcomeLoader />}

      <main
        className={
          onLanding ? 'w-full flex-1' : 'mx-auto w-full max-w-[1200px] flex-1 px-4 pb-20 pt-28 sm:px-6'
        }
      >
        <Outlet />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-10 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Link to="/" className="text-ink" aria-label="ResumeMaxxer home">
            <Wordmark />
          </Link>
          <p>Built for students. Your vault is the only source of truth.</p>
        </div>
      </footer>
    </div>
  )
}
