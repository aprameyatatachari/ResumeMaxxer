/** Loading indicator: a thin iris arc turning around a vault-dial track.
 *  `label` is announced to screen readers, not just drawn. */
export default function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-ink-muted" role="status">
      <svg
        viewBox="0 0 24 24"
        width={18}
        height={18}
        className="animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" fill="none" stroke="var(--line-strong)" strokeWidth="2" />
        <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="#5683da" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span>{label}</span>
    </div>
  )
}
