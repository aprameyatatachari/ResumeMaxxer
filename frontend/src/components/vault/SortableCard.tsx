import { createElement, type ReactNode } from 'react'
import { useDrag, useDrop } from 'react-dnd'

import { DragHandleContext } from '../../lib/drag-handle'

interface DragItem {
  index: number
}

/**
 * One drag-and-drop sortable entry in a vault section.
 *
 * The whole card is the drop target, but only the grip (rendered by
 * `MoveButtons`) starts a drag - otherwise selecting text or clicking an
 * input inside the card would pick it up. `type` scopes dragging to one
 * section, so an experience can never be dropped among the projects.
 *
 * Dropping onto a card moves the dragged entry to that card's place. The
 * caller saves the new order; the list then re-renders from the server, so
 * a failed save simply leaves the old order on screen.
 *
 * Drag-and-drop is an addition to the up/down buttons, not a replacement:
 * the HTML5 backend does not work on touch screens, and it is not reachable
 * from a keyboard.
 */
export default function SortableCard({
  type,
  index,
  onDrop,
  as = 'div',
  className = '',
  children,
}: {
  type: string
  index: number
  onDrop: (from: number, to: number) => void
  as?: 'div' | 'li'
  className?: string
  children: ReactNode
}) {
  const [{ isDragging }, drag, preview] = useDrag(
    () => ({
      type,
      item: { index },
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [type, index],
  )

  const [{ isOver }, drop] = useDrop(
    () => ({
      accept: type,
      drop: (item: DragItem) => {
        if (item.index !== index) onDrop(item.index, index)
      },
      collect: (monitor) => ({
        isOver: monitor.isOver() && monitor.getItem<DragItem>()?.index !== index,
      }),
    }),
    [type, index, onDrop],
  )

  return (
    <DragHandleContext.Provider value={(node) => void drag(node)}>
      {createElement(
        as,
        {
          ref: (node: HTMLElement | null) => {
            drop(node)
            preview(node)
          },
          'data-sortable': type,
          className: [
            className,
            isDragging ? 'opacity-40' : '',
            // A clear landing indicator on the card being dropped onto.
            isOver ? 'ring-2 ring-iris ring-offset-2' : '',
          ]
            .filter(Boolean)
            .join(' '),
        },
        children,
      )}
    </DragHandleContext.Provider>
  )
}
