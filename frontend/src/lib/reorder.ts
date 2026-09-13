/**
 * The ids of `items` with the entry at `from` moved to `to`, everything else
 * keeping its relative order. This is the complete list the reorder endpoints
 * expect - they reject a partial one.
 */
export function movedIds<T extends { id: number }>(items: T[], from: number, to: number): number[] {
  const ids = items.map((item) => item.id)
  if (from < 0 || from >= ids.length || to < 0 || to >= ids.length) return ids
  const [moved] = ids.splice(from, 1)
  ids.splice(to, 0, moved)
  return ids
}
