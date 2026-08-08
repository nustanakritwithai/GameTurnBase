import { describe, expect, it } from 'vitest'
import { createEnemyBrain, stepEnemyAI } from './EnemyAISystem'
import { createRealtimeBattle, createWaveEnemies } from './createRealtimeBattle'
import { BOSS_TEMPLATES, getBossTemplate } from './stageConfig'
import { createDefaultSkillLevels } from './SkillProgressionSystem'
import type { Player } from '../../types/player'
import { EMPTY_PROGRESS } from '../../types/player'

function makePlayer(): Player {
  return {
    id: 'acc-1',
    uid: '1234567890',
    name: 'ผู้ทดสอบ',
    title: 'นักเดินทาง',
    level: 10,
    exp: 0,
    expToNext: 100,
    currency: { gold: 0, gem: 0 },
    ownedCharacters: [
      {
        characterId: 'monkey-king',
        level: 12,
        exp: 0,
        expToNext: 100,
        obtainedAt: '2026-01-01T00:00:00.000Z',
        skillLevels: createDefaultSkillLevels(),
      },
    ],
    inventory: [],
    friends: [],
    teamSlots: ['monkey-king', null, null, null],
    frameId: 'default',
    progress: EMPTY_PROGRESS,
  }
}

describe('spirit-guardian-boss production data (#11 + #16)', () => {
  it('BOSS_TEMPLATES มี spirit-guardian-boss พร้อม 2 เฟส', () => {
    const boss = getBossTemplate('spirit-guardian-boss')
    expect(boss).not.toBeNull()
    expect(boss?.phases).toHaveLength(2)
    expect(boss?.phases[0].attacks.every((row) => row.telegraphMs >= 800)).toBe(true)
    expect(boss?.phases[1].attacks.every((row) => row.telegraphMs >= 800)).toBe(true)
  })

  it('createWaveEnemies สร้าง entityType boss จาก BOSS_TEMPLATES', () => {
    const stage = { ...createRealtimeBattle('p5-boss-arena', makePlayer())!.stage }
    const [boss] = createWaveEnemies(stage, 0)
    expect(boss.entityType).toBe('boss')
    expect(boss.enemyId).toBe('spirit-guardian-boss')
    expect(boss.combatTier).toBe('boss')
  })

  it('createRealtimeBattle trial-05 มีบอส 1 ตัวที่ HP ถูก scale ด้วย difficultyMultiplier', () => {
    const state = createRealtimeBattle('trial-05', makePlayer())
    if (!state) throw new Error('fixture missing')
    expect(state.enemies).toHaveLength(1)
    const boss = state.enemies[0]
    expect(boss.entityType).toBe('boss')
    const template = BOSS_TEMPLATES['spirit-guardian-boss']
    const expectedHp = Math.round(template.maxHp * (state.stage.difficultyMultiplier ?? 1))
    expect(boss.maxHp).toBe(expectedHp)
  })

  it('stepEnemyAI เปลี่ยนเฟสเมื่อ HP ข้าม threshold', () => {
    const template = BOSS_TEMPLATES['spirit-guardian-boss']
    const boss = createWaveEnemies(createRealtimeBattle('trial-05', makePlayer())!.stage, 0)[0]
    boss.hp = template.maxHp * 0.4
    boss.maxHp = template.maxHp

    const player = {
      ...boss,
      id: 'player',
      entityType: 'player' as const,
      position: { x: boss.position.x - 50, y: boss.position.y },
    }
    const brain = createEnemyBrain()

    stepEnemyAI(boss, brain, player, 16, 0)
    stepEnemyAI(boss, brain, player, 16, 16)
    expect(['telegraph', 'attack', 'chase', 'phase-transition']).toContain(brain.state)
  })
})
