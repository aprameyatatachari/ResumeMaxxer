import { describe, expect, it } from 'vitest'

import { movedIds } from './reorder'

const items = [{ id: 10 }, { id: 20 }, { id: 30 }]

describe('movedIds', () => {
  it('moves an entry up one place', () => {
    expect(movedIds(items, 2, 1)).toEqual([10, 30, 20])
  })

  it('moves an entry down one place', () => {
    expect(movedIds(items, 0, 1)).toEqual([20, 10, 30])
  })

  it('always returns every id exactly once, as the API requires', () => {
    const result = movedIds(items, 0, 2)
    expect(result).toEqual([20, 30, 10])
    expect(new Set(result).size).toBe(items.length)
  })

  it('leaves the order alone for a move past either end', () => {
    expect(movedIds(items, 0, -1)).toEqual([10, 20, 30])
    expect(movedIds(items, 2, 3)).toEqual([10, 20, 30])
  })

  it('does not mutate the list it was given', () => {
    const copy = [...items]
    movedIds(items, 0, 2)
    expect(items).toEqual(copy)
  })
})
