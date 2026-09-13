import { useDragHandle } from '../../lib/drag-handle'

/**
 * Reordering controls for a vault entry: a drag grip between up and down
 * buttons.
 *
 * The grip works inside a `SortableCard` (drag-and-drop via react-dnd). The
 * buttons are kept alongside it on purpose: HTML5 drag-and-drop does not work
 * on touch screens and cannot be reached from a keyboard, while "move up one"
 * works everywhere, including with a screen reader. The order either sets is
 * the order the entries appear on the resume.
 */
export default function MoveButtons({
  name,
  index,
  count,
  onMove,
}: {
  /** What is being moved, for the accessible labels: "Move VIT up". */
  name: string
  index: number
  count: number
  onMove: (from: number, to: number) => void
}) {
  const dragHandle = useDragHandle()
  // Disabled arrows fade rather than disappear: an invisible control is also
  // absent from the accessibility tree, which is confusing to a screen reader
  // user and breaks anything that looks for it by role.
  const arrow =
    'rounded px-1.5 leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-default disabled:opacity-25 disabled:hover:bg-transparent'

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        className={arrow}
        aria-label={`Move ${name} up`}
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
      >
        ▲
      </button>
      {dragHandle && count > 1 && (
        <span
          ref={dragHandle}
          className="cursor-grab select-none px-1 text-slate-400 hover:text-slate-700 active:cursor-grabbing"
          title="Drag to reorder"
          aria-label={`Drag ${name} to reorder`}
          data-drag-handle
        >
          ⠿
        </span>
      )}
      <button
        type="button"
        className={arrow}
        aria-label={`Move ${name} down`}
        disabled={index === count - 1}
        onClick={() => onMove(index, index + 1)}
      >
        ▼
      </button>
    </div>
  )
}
