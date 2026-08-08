import { describe, expect, it } from 'vitest'
import { ROSTER } from '../characters'
import { createDefaultSkillLevels } from '../realtimeBattle/SkillProgressionSystem'
import { EMPTY_PROGRESS, type OwnedCharacter, type Player } from '../../types/player'
import { applyGachaRolls } from './gachaPipeline'
import { GACHA_BANNERS } from './gachaConfig'
import { createDefaultPityState, createSeededRandom, rollGachaMulti } from './gachaRoll'

function stubPlayer(owned: OwnedCharacter[], gem = 10_000): Player {
  return {
    id: 'p1',
    uid: '1234567890',
    name: 'ทดสอบ',
    title: 'นักรบ',
    level: 1,
    exp: 0,
    expToNext: 100,
    currency: { gold: 0, gem },
    ownedCharacters: owned,
    inventory: [],
    friends: [],
    teamSlots: [null, null, null, null],
    frameId: 'default',
    progress: EMPTY_PROGRESS,
  }
}

describe('gachaPipeline', () => {
  const banner = GACHA_BANNERS.standard

  it('duplicate → เพิ่ม shard ไม่สร้างแถว owned ซ้ำ', () => {
    const owned: OwnedCharacter = {
      characterId: 'pig-warrior',
      level: 1,
      exp: 0,
      expToNext: 100,
      obtainedAt: '2026-01-01T00:00:00.000Z',
      skillLevels: createDefaultSkillLevels(),
      star: 1,
      duplicateShards: 0,
    }
    const player = stubPlayer([owned])
    const rolls = rollGachaMulti(banner, createDefaultPityState(), 1, createSeededRandom(777)).map(
      (roll) => ({ ...roll, characterId: 'pig-warrior' }),
    )

    const summary = applyGachaRolls(player, banner, rolls, 'test-ref')
    expect(summary.player.ownedCharacters).toHaveLength(1)
    expect(summary.results[0]?.isNew).toBe(false)
    expect(summary.player.ownedCharacters[0]?.star).toBeGreaterThan(1)
  })

  it('ตัวใหม่ → เพิ่ม ownedCharacters', () => {
    const player = stubPlayer([])
    const rolls = rollGachaMulti(banner, createDefaultPityState(), 1, createSeededRandom(888))
    const summary = applyGachaRolls(player, banner, rolls, 'test-ref-new')
    expect(summary.player.ownedCharacters).toHaveLength(1)
    expect(summary.results[0]?.isNew).toBe(true)
    expect(ROSTER.some((hero) => hero.id === summary.results[0]?.characterId)).toBe(true)
  })
})
