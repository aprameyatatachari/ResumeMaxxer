/**
 * The mark: the full-colour logo (public/logo-mark.png, a transparent cut of
 * public/images/logo.png). Decorative - every use sits next to the name or
 * inside a link that carries it.
 */
export function LogoMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/logo-mark.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={`inline-block shrink-0 select-none ${className}`}
      draggable={false}
    />
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
