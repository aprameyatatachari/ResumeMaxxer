import { Alert as AlertIcon, Check, Close } from './icons'

type Variant = 'error' | 'success' | 'info'

const STYLES: Record<Variant, string> = {
  error: 'bg-danger-wash border-danger/40',
  success: 'bg-success-wash border-success/40',
  info: 'bg-surface-2 border-line',
}

const ICON: Record<Variant, string> = {
  error: 'text-danger',
  success: 'text-success',
  info: 'text-iris-fg',
}

/**
 * Inline status note: a bordered 12px panel with a tinted wash and a coloured
 * icon.
 *
 * Errors use `role="alert"` so screen readers announce them immediately; the
 * quieter variants use `role="status"` so they do not interrupt.
 */
export default function Alert({
  variant = 'info',
  children,
  onDismiss,
}: {
  variant?: Variant
  children: React.ReactNode
  onDismiss?: () => void
}) {
  const Icon = variant === 'success' ? Check : AlertIcon
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed text-ink ${STYLES[variant]}`}
    >
      <Icon size={16} strokeWidth={2} className={`mt-0.5 shrink-0 ${ICON[variant]}`} />
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-ink/10 hover:text-ink"
        >
          <Close size={14} />
        </button>
      )}
    </div>
  )
}
