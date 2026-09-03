import { describe, expect, it } from 'vitest'

import { bulletsFor, groupBullets } from './useVault'
import type { Bullet } from '../lib/types'

/**
 * Bullets point at their parent polymorphically, so the backend cannot nest
 * them and the join happens here. Getting this wrong shows bullets under the
 * wrong entity - which looks like an AI mistake rather than a UI one.
 */

const bullet = (id: number, entity_type: Bullet['entity_type'], entity_id: number): Bullet => ({
  id,
  entity_type,
  entity_id,
  original_text: `bullet ${id}`,
  ai_enhanced_text: null,
  tags: '',
})

describe('groupBullets', () => {
  it('keys on type AND id, so an experience and a project sharing an id do not collide', () => {
    const grouped = groupBullets([
      bullet(1, 'EXPERIENCE', 1),
      bullet(2, 'PROJECT', 1),
      bullet(3, 'EXPERIENCE', 1),
    ])

    expect(bulletsFor(grouped, 'EXPERIENCE', 1).map((b) => b.id)).toEqual([1, 3])
    expect(bulletsFor(grouped, 'PROJECT', 1).map((b) => b.id)).toEqual([2])
  })

  it('returns an empty array for an entity with no bullets', () => {
    expect(bulletsFor(groupBullets([]), 'PROJECT', 99)).toEqual([])
  })
})
