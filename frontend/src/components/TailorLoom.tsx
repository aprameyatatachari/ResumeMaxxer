import { Check } from './icons'

/**
 * The made-to-measure loader. A blank sheet is cut for the role while the
 * stages run: a seam of iris-to-ember light travels down the page and the
 * resume's lines are laid in behind it, one section per stage. The stage list
 * beside it is the real progress text, announced to screen readers.
 */
const SECTIONS = [
  [70, 45],
  [92, 84, 60],
  [88, 76, 90, 52],
  [80, 94, 68],
  [64, 40],
]

export default function TailorLoom({
  stages,
  stage,
  jobTitle,
}: {
  stages: string[]
  stage: number
  jobTitle: string
}) {
  return (
    <div className="band-void glow-ember grid gap-8 overflow-hidden rounded-[40px] border border-line p-6 sm:grid-cols-[220px_1fr] sm:p-10">
      <div
        className="relative mx-auto aspect-[1/1.3] w-full max-w-[220px] overflow-hidden rounded-[4px] bg-white p-5"
        style={{ '--loom-travel': '290px' } as React.CSSProperties}
        aria-hidden="true"
      >
        <div className="mx-auto h-2.5 w-1/2 rounded-full bg-[#1a1a1a]" />
        <div className="mx-auto mt-1.5 h-1.5 w-3/4 rounded-full bg-[#c4c4c4]" />
        <div className="mt-4 space-y-3">
          {SECTIONS.slice(0, stage + 1).map((lines, s) => (
            <div key={s} className="space-y-1">
              <div className="loom-line h-1.5 w-1/3 rounded-full bg-[#839aff]" />
              {lines.map((w, i) => (
                <div
                  key={i}
                  className="loom-line h-1 rounded-full bg-[#e6e6e6]"
                  style={{ width: `${w}%`, animationDelay: `${(i + 1) * 110}ms` }}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="loom-thread pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#c9aaff] to-transparent shadow-[0_0_18px_4px_rgba(201,170,255,0.6)]" />
      </div>

      <div className="flex flex-col justify-center">
        <span className="chip chip-ember self-start">Cut for {jobTitle.trim() || 'this role'}</span>
        <p className="display-sm mt-4 text-[clamp(1.75rem,3.5vw,2.5rem)] text-white">
          Tailoring a resume nobody else will get.
        </p>
        <ol className="mt-6 space-y-2.5 text-sm" role="status" aria-live="polite">
          {stages.map((label, i) => (
            <li
              key={label}
              className={`flex items-center gap-3 transition-colors duration-500 ${
                i < stage ? 'text-ink-muted' : i === stage ? 'text-white' : 'text-ink-faint'
              }`}
            >
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                  i < stage ? 'border-ink bg-ink text-bg' : i === stage ? 'border-iris' : 'border-line-strong'
                }`}
              >
                {i < stage && <Check size={12} strokeWidth={2.6} />}
                {i === stage && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-iris" />}
              </span>
              {label}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
