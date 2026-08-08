import { describe, expect, test } from 'vitest'
import type { Player } from '../../types/player'
import { createRealtimeBattle } from './createRealtimeBattle'
import { applyBattleExp, calculateBattleReward } from './RewardSystem'
import { createDefaultSkillLevels } from './SkillProgressionSystem'

function stubPlayer(): Player {
  return {
    id: 'p1',
    uid: '1234567890',
    name: 'ทดสอบ',
    title: 'ผู้จาริกหน้าใหม่',
    level: 1,
    exp: 0,
    expToNext: 100,
    currency: { gold: 0, gem: 0 },
    ownedCharacters: [
      {
        characterId: 'monkey-king',
        level: 1,
        exp: 0,
        expToNext: 500,
        obtainedAt: '2026-01-01T00:00:00.000Z',
        skillLevels: createDefaultSkillLevels(),
      },
    ],
    inventory: [],
    friends: [],
    teamSlots: ['monkey-king', null, null, null],
    frameId: 'arcane',
    progress: { flags: {}, defeatedNpcIds: [], battleHistory: [] },
  }
}

describe('calculateBattleReward', () => {
  test('defeat yields zero rewards', () => {
    const state = createRealtimeBattle('trial-01', stubPlayer())
    if (!state) throw new Error('expected battle state')
    state.defeatedEnemyIds = state.enemies.map((e) => e.id)
    expect(calculateBattleReward(state, 'defeat')).toEqual({
      earnedExp: 0,
      earnedGold: 0,
      droppedItems: [],
    })
  })

  test('victory scales with defeated enemies and is deterministic', () => {
    const state = createRealtimeBattle('trial-01', stubPlayer())
    if (!state) throw new Error('expected battle state')
    state.defeatedEnemyIds = state.enemies.map((e) => e.id)
    state.currentWaveIndex = 0

    const a = calculateBattleReward(state, 'victory')
    const b = calculateBattleReward(state, 'victory')
    expect(a).toEqual(b)
    // 3× shadow-soldier (22/40) + 1 wave clear (15/25)
    expect(a.earnedGold).toBe(3 * 22 + 15)
    expect(a.earnedExp).toBe(3 * 40 + 25)
    expect(a.droppedItems).toEqual([
      { itemId: 'iron-essence', quantity: 1 },
      { itemId: 'spirit-incense', quantity: 1 },
    ])
  })

  test('Done-criterion 3: calculateBattleReward does not mutate its state argument', () => {
    const state = createRealtimeBattle('trial-01', stubPlayer())
    if (!state) throw new Error('expected battle state')
    state.defeatedEnemyIds = state.enemies.map((e) => e.id)
    state.currentWaveIndex = 1

    const stateClone = JSON.parse(JSON.stringify(state))
    calculateBattleReward(state, 'victory')
    expect(state).toEqual(stateClone)
  })

  test('Done-criterion 5: droppedItems ids only contain approved materials/consumables and no equipment/affixes', () => {
    const state = createRealtimeBattle('trial-01', stubPlayer())
    if (!state) throw new Error('expected battle state')
    state.defeatedEnemyIds = state.enemies.map((e) => e.id)
    state.currentWaveIndex = 2

    const reward = calculateBattleReward(state, 'victory')
    const approvedIds = new Set(['iron-essence', 'spirit-incense', 'healing-peach'])

    expect(reward.droppedItems.length).toBeGreaterThan(0)
    for (const item of reward.droppedItems) {
      expect(approvedIds.has(item.itemId)).toBe(true)
    }
  })
})

describe('applyBattleExp', () => {
  test('levels up player and lead character when crossing threshold', () => {
    const next = applyBattleExp(stubPlayer(), 100)
    expect(next.level).toBe(2)
    expect(next.exp).toBe(0)
    expect(next.expToNext).toBe(120)
    expect(next.ownedCharacters[0]?.exp).toBe(100)
  })

  test('zero exp is a no-op', () => {
    const player = stubPlayer()
    expect(applyBattleExp(player, 0)).toBe(player)
  })

  test('Done-criterion 4: applyBattleExp does not write or mutate currency or inventory fields', () => {
    const originalPlayer = stubPlayer()
    const currencyClone = { ...originalPlayer.currency }
    const inventoryClone = [...originalPlayer.inventory]

    const nextPlayer = applyBattleExp(originalPlayer, 250)

    expect(nextPlayer.currency).toEqual(currencyClone)
    expect(nextPlayer.inventory).toEqual(inventoryClone)
    expect(nextPlayer.level).toBeGreaterThan(originalPlayer.level)
  })
})
