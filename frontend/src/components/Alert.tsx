type Variant = 'error' | 'success' | 'info'

const STYLES: Record<Variant, string> = {
  error: 'border-red-200 bg-red-50 text-red-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  info: 'border-brand-200 bg-brand-50 text-brand-700',
}

/**
 * Inline status message.
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
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${STYLES[variant]}`}
    >
      <div>{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 opacity-60 hover:opacity-100"
        >
          ×
        </button>
      )}
    </div>
  )
}
