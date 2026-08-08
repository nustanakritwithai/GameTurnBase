import { describe, expect, it } from 'vitest'
import { GACHA_BANNERS } from './gachaConfig'
import {
  createDefaultPityState,
  createSeededRandom,
  rollGachaMulti,
  rollGachaOnce,
} from './gachaRoll'

describe('gachaRoll', () => {
  const banner = GACHA_BANNERS.standard

  it('seed เดียวกัน → ผลเดียวกัน (deterministic)', () => {
    const pity = createDefaultPityState()
    const once = rollGachaMulti(banner, pity, 1, createSeededRandom(4242))
    const again = rollGachaMulti(banner, pity, 1, createSeededRandom(4242))
    expect(once).toEqual(again)
  })

  it('hard pity ครั้งที่ 90 รับประกัน legendary', () => {
    const result = rollGachaOnce(
      banner,
      { pullsSinceLastPityRarity: banner.hardPity - 1 },
      createSeededRandom(1),
    )
    expect(result.wasHardPity).toBe(true)
    expect(result.rarity).toBe('legendary')
    expect(result.pity.pullsSinceLastPityRarity).toBe(0)
  })

  it('ผล roll อยู่ใน pool เท่านั้น', () => {
    const poolIds = new Set(banner.pool.map((entry) => entry.characterId))
    const rolls = rollGachaMulti(banner, createDefaultPityState(), 20, createSeededRandom(99))
    for (const roll of rolls) {
      expect(poolIds.has(roll.characterId)).toBe(true)
    }
  })
})
