import { describe, expect, it } from 'vitest'
import { EMPTY_PROGRESS, type Player } from '../../types/player'
import { createDefaultSkillLevels } from '../realtimeBattle/SkillProgressionSystem'
import { progressionConfig } from './progressionConfig'
import { buildHeroProgressionViewModel } from './progressionViewModel'
import { migrateOwnedCharacters } from './progressionMigration'

function stubPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'acc-1',
    uid: '1234567890',
    name: 'Tester',
    title: 'Novice',
    level: 1,
    exp: 0,
    expToNext: 100,
    currency: { gold: 500, gem: 0 },
    ownedCharacters: [
      {
        characterId: 'monkey-king',
        level: 1,
        exp: 40,
        expToNext: 100,
        obtainedAt: '2026-01-01T00:00:00.000Z',
        skillLevels: createDefaultSkillLevels(),
      },
    ],
    inventory: [],
    friends: [],
    teamSlots: ['monkey-king', null, null, null],
    frameId: 'default',
    progress: { ...EMPTY_PROGRESS },
    ...overrides,
  }
}

describe('buildHeroProgressionViewModel', () => {
  it('expProgressRatio คำนวณจาก threshold ของเลเวลปัจจุบัน', () => {
    const vm = buildHeroProgressionViewModel(stubPlayer(), 'monkey-king')
    expect(vm).not.toBeNull()
    expect(vm!.expProgressRatio).toBeCloseTo(0.4, 5)
    expect(vm!.nonProductionBalance).toBe(true)
  })

  it('atMaxLevel → expProgressRatio = 1 และ expToNext = 0', () => {
    const player = stubPlayer({
      ownedCharacters: [
        {
          characterId: 'monkey-king',
          level: progressionConfig.maxHeroLevel,
          exp: 0,
          expToNext: 0,
          obtainedAt: '2026-01-01T00:00:00.000Z',
          skillLevels: createDefaultSkillLevels(),
        },
      ],
    })
    const vm = buildHeroProgressionViewModel(player, 'monkey-king')
    expect(vm!.atMaxLevel).toBe(true)
    expect(vm!.expProgressRatio).toBe(1)
    expect(vm!.expToNext).toBe(0)
  })

  it('save/load round trip ผ่าน migrateOwnedCharacters ไม่เปลี่ยน level/exp', () => {
    const player = stubPlayer({
      ownedCharacters: [
        {
          characterId: 'monkey-king',
          level: 7,
          exp: 120,
          expToNext: 660,
          obtainedAt: '2026-01-01T00:00:00.000Z',
          skillLevels: createDefaultSkillLevels(),
          talentState: { unlockedNodes: ['mk-talent-1'] },
          awakeningState: { tier: 1, unlockedEffects: [] },
        },
      ],
    })
    const reloaded = migrateOwnedCharacters(player.ownedCharacters)
    const vmBefore = buildHeroProgressionViewModel(player, 'monkey-king')
    const vmAfter = buildHeroProgressionViewModel(
      { ...player, ownedCharacters: reloaded },
      'monkey-king',
    )
    expect(vmAfter!.level).toBe(vmBefore!.level)
    expect(vmAfter!.currentExp).toBe(vmBefore!.currentExp)
    expect(vmAfter!.expToNext).toBe(vmBefore!.expToNext)
  })
})
