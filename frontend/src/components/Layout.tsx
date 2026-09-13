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
          isActive ? 'bg-ink/10 text-ink' : 'text-ink-muted hover:text-ink'
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
  const [scrolled, setScrolled] = useState(false)

  // Close the mobile menu whenever the route changes.
  useEffect(() => setMenuOpen(false), [location.pathname])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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

  // On the landing page the header floats over the always-dark hero.
  const headerTone = onLanding
    ? `band-void ${scrolled ? 'bg-void/80 border-line' : 'bg-transparent border-transparent'} fixed inset-x-0`
    : `sticky ${scrolled ? 'bg-bg/80 border-line' : 'bg-bg border-transparent'}`

  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <header
        className={`${headerTone} top-0 z-40 border-b backdrop-blur-md transition-colors duration-300`}
      >
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="text-ink" aria-label="ResumeMaxxer home">
            <Wordmark />
          </Link>

          {/* Render nothing while the session resolves, rather than flashing
              "Sign in" at someone who is already signed in. */}
          {!isPending && (
            <>
              <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
                {links}
              </nav>

              <div className="flex items-center gap-2">
                {signedIn ? (
                  <>
                    <span className="hidden max-w-56 truncate text-sm text-ink-faint lg:inline">
                      {session?.user.email}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleSignOut()}
                      className="btn-secondary text-xs hidden md:inline-flex"
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <Link to="/sign-in" className="btn-secondary text-xs">
                      Sign in
                    </Link>
                    <Link to="/sign-up" className="btn-primary text-xs">
                      Get started
                    </Link>
                  </>
                )}
                <ThemeToggle />
                {signedIn && (
                  <button
                    type="button"
                    className="grid h-10 w-10 place-items-center rounded-full border border-line text-ink md:hidden"
                    aria-expanded={menuOpen}
                    aria-controls="mobile-nav"
                    aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                    onClick={() => setMenuOpen((open) => !open)}
                  >
                    {menuOpen ? <Close size={18} /> : <Menu size={18} />}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {signedIn && menuOpen && (
          <nav
            id="mobile-nav"
            aria-label="Main"
            className="flex flex-col gap-1 border-t border-line bg-bg px-4 pb-4 pt-3 md:hidden"
          >
            {links}
            <p className="truncate px-3.5 pt-2 text-sm text-ink-faint">{session?.user.email}</p>
            <button type="button" onClick={() => void handleSignOut()} className="btn-secondary mt-2">
              Sign out
            </button>
          </nav>
        )}
      </header>

      {location.pathname === '/vault' && <WelcomeLoader />}

      <main
        className={
          onLanding ? 'w-full flex-1' : 'mx-auto w-full max-w-[1200px] flex-1 px-4 pb-20 pt-8 sm:px-6'
        }
      >
        <Outlet />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-8 text-sm text-ink-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <LogoMark size={20} />
            <span>ResumeMaxxer</span>
          </div>
          <p>Built for students. Your vault is the only source of truth.</p>
        </div>
      </footer>
    </div>
  )
}
