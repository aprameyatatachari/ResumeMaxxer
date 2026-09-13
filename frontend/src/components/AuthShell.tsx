import { LogoMark } from './brand/Logo'

/**
 * Sign-in and sign-up frame: the form on a quiet surface, beside a dark vault
 * panel with the door dial glowing behind it - the same door that swings open
 * on the next screen.
 */
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-[calc(100vh-10rem)] items-center gap-10 py-8 lg:grid-cols-[minmax(0,420px)_1fr] lg:gap-16">
      <div className="w-full">{children}</div>
      <div
        className="band-void relative hidden h-full min-h-[520px] overflow-hidden rounded-[30px] border border-line lg:grid lg:place-items-center"
        aria-hidden="true"
      >
        <div className="absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,137,100,0.35),rgba(86,131,218,0.18)_45%,transparent_70%)]" />
        <div className="relative grid h-72 w-72 place-items-center rounded-full border border-line-strong bg-[radial-gradient(circle_at_40%_35%,#303236,#111111_70%)] shadow-[0_6px_25px_rgba(0,0,0,0.5)]">
          <div className="grid h-40 w-40 place-items-center rounded-full border border-line-strong">
            <LogoMark size={88} />
          </div>
        </div>
        <p className="absolute bottom-8 left-8 right-8 text-sm text-ink-muted">
          Everything you have done, in one place. Every resume, cut from it.
        </p>
      </div>
    </div>
  )
}
