/**
 * The mark: a vault dial seen head-on - an iris ring, four bolt stubs and an
 * ember core. Drawn as a line icon so it sits in the monochrome icon family.
 */
export function LogoMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="16" cy="16" r="10" fill="none" stroke="#5683da" strokeWidth="2.4" />
      <circle cx="16" cy="16" r="3.6" fill="#ff8964" />
      <path
        d="M16 2.5v5M16 24.5v5M2.5 16h5M24.5 16h5"
        stroke="#5683da"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-[-0.02em]">ResumeMaxxer</span>
    </span>
  )
}
