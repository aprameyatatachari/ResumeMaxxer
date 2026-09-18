import { useId } from 'react'

/**
 * The mark: a vault dial seen head-on - a ring with four bolt stubs in the
 * current text colour, and an iridescent core. Monochrome everywhere except
 * that one point of colour.
 */
export function LogoMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  const id = useId()
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c9aaff" />
          <stop offset="0.35" stopColor="#ffcdfd" />
          <stop offset="0.7" stopColor="#b3e2ff" />
          <stop offset="1" stopColor="#839aff" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="10" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="16" cy="16" r="4.2" fill={`url(#${id})`} />
      <path d="M16 2.5v5M16 24.5v5M2.5 16h5M24.5 16h5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-[-0.04em]">ResumeMaxxer</span>
    </span>
  )
}
