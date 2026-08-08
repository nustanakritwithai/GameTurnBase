import { describe, expect, it } from 'vitest'
import { ROSTER } from '../characters'
import { createDefaultSkillLevels } from '../realtimeBattle/SkillProgressionSystem'
import type { OwnedCharacter } from '../../types/player'
import {
  applyDuplicatePull,
  assertStarPowerBound,
  ascendStar,
  canAscendStar,
  statsAtStar,
} from './starAscension'
import { MAX_STAR, SHARDS_TO_ASCEND } from './starAscensionConfig'

describe('starAscension', () => {
  it('§4.3 — ★6 total stats ≤ 130% ★1 สำหรับทุกตัวใน ROSTER', () => {
    for (const hero of ROSTER) {
      expect(assertStarPowerBound(hero.stats)).toBe(true)
    }
  })

  it('auto-ascend เมื่อ shard ครบ threshold', () => {
    const owned: OwnedCharacter = {
      characterId: 'monkey-king',
      level: 1,
      exp: 0,
      expToNext: 100,
      obtainedAt: '2026-01-01T00:00:00.000Z',
      skillLevels: createDefaultSkillLevels(),
      star: 1,
      duplicateShards: 0,
    }

    let next = owned
    for (let i = 0; i < SHARDS_TO_ASCEND[1]; i += 1) {
      next = applyDuplicatePull(next)
    }
    expect(next.star).toBe(2)
  })

  it('statsAtStar คูณตามตาราง multiplier', () => {
    const base = ROSTER[0].stats
    const atSix = statsAtStar(base, MAX_STAR)
    expect(atSix.hp).toBeGreaterThan(base.hp)
    expect(assertStarPowerBound(base)).toBe(true)
  })

  it('canAscendStar false เมื่อถึง MAX_STAR', () => {
    const owned: OwnedCharacter = {
      characterId: 'monkey-king',
      level: 1,
      exp: 0,
      expToNext: 100,
      obtainedAt: '2026-01-01T00:00:00.000Z',
      skillLevels: createDefaultSkillLevels(),
      star: MAX_STAR,
      duplicateShards: 99,
    }
    expect(canAscendStar(owned)).toBe(false)
    expect(ascendStar(owned).star).toBe(MAX_STAR)
  })
})
