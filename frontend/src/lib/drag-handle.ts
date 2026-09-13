import { createContext, useContext } from 'react'

/**
 * Connects a drag handle to the sortable card it lives in.
 *
 * `SortableCard` provides it; `MoveButtons` consumes it and renders the grip.
 * A context rather than a render prop, so wrapping an existing card in
 * `SortableCard` does not mean restructuring everything inside it.
 */
export type DragHandleRef = (node: HTMLElement | null) => void

export const DragHandleContext = createContext<DragHandleRef | null>(null)

/** The handle ref for the enclosing sortable card, or null outside one. */
export function useDragHandle(): DragHandleRef | null {
  return useContext(DragHandleContext)
}
