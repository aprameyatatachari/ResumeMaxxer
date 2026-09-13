import SiteImage from './SiteImage'

/**
 * Sign-in and sign-up frame: the form on a quiet surface, beside a dark panel
 * with the vault dial photographed close up.
 */
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-[calc(100vh-10rem)] items-center gap-10 py-8 lg:grid-cols-[minmax(0,420px)_1fr] lg:gap-16">
      <div className="w-full">{children}</div>
      <div
        className="band-void relative hidden h-full min-h-[560px] overflow-hidden rounded-[30px] border border-line lg:block"
        aria-hidden="true"
      >
        <SiteImage
          src="/images/auth-vault.webp"
          eager
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-void" />
        <div className="absolute bottom-10 left-10 right-10">
          <p className="display-sm text-[clamp(1.75rem,2.6vw,2.5rem)] text-white">
            Everything you have done, in one place.
          </p>
          <p className="mt-3 text-sm text-ink-muted">Every resume, cut from it.</p>
        </div>
      </div>
    </div>
  )
}
