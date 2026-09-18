/**
 * The mark: the vault-door logo (public/logo-mark.png), drawn as a CSS mask
 * so it takes the current text colour - black on light surfaces, white on the
 * dark nav - from a single asset.
 */
export function LogoMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 bg-current [mask:url(/logo-mark.png)_center/contain_no-repeat] ${className}`}
      style={{ width: size, height: size }}
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
