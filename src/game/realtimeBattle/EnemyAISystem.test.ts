import { describe, expect, it } from 'vitest'
import { createEnemyBrain, ENEMY_ATTACK_TIMING, stepEnemyAI } from './EnemyAISystem'
import { createRealtimeBattle } from './createRealtimeBattle'
import { RealtimeBattleRuntime } from './RealtimeBattleRuntime'
import { getEnemyTemplate } from './stageConfig'
import type { RealtimeBattleEntity } from './types'
import type { Player } from '../../types/player'
import { EMPTY_PROGRESS } from '../../types/player'

const ATTACK_PHASE_MS =
  ENEMY_ATTACK_TIMING.startupMs + ENEMY_ATTACK_TIMING.activeMs + ENEMY_ATTACK_TIMING.recoveryMs

const ATTACK_TOTAL_MS = ENEMY_ATTACK_TIMING.telegraphMs + ATTACK_PHASE_MS

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
      },
    ],
    inventory: [],
    friends: [],
    teamSlots: ['monkey-king', null, null, null],
    frameId: 'default',
    progress: EMPTY_PROGRESS,
  }
}

function entity(overrides: Partial<RealtimeBattleEntity> = {}): RealtimeBattleEntity {
  return {
    id: 'e1',
    entityType: 'enemy',
    name: 'ศัตรูทดสอบ',
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    facing: 'down',
    combatFacing: 'right',
    state: 'idle',
    hp: 100,
    maxHp: 100,
    atk: 20,
    def: 10,
    speed: 130,
    collisionRadius: 34,
    hurtboxRadius: 40,
    attackCooldownRemainingMs: 0,
    skillCooldownsMs: { skill1: 0, skill2: 0, skill3: 0 },
    ultimateGauge: 0,
    invulnerableUntilMs: 0,
    hitStunRemainingMs: 0,
    knockdownRemainingMs: 0,
    getUpRemainingMs: 0,
    enemyId: 'shadow-soldier',
    ...overrides,
  }
}

const template = getEnemyTemplate('shadow-soldier')
if (!template) throw new Error('ไม่พบแม่แบบ shadow-soldier')

function advanceEnemyAI(
  enemy: RealtimeBattleEntity,
  brain: ReturnType<typeof createEnemyBrain>,
  player: RealtimeBattleEntity,
  totalMs: number,
) {
  const stepMs = 16
  for (let t = 0; t < totalMs; t += stepMs) {
    stepEnemyAI(enemy, brain, player, stepMs)
  }
}

describe('stepEnemyAI', () => {
  it('อยู่ไกลเกิน detectRange = ไม่ขยับ', () => {
    const enemy = entity({ position: { x: 0, y: 0 } })
    const player = entity({
      id: 'player',
      entityType: 'player',
      position: { x: template.detectRange + 100, y: 0 },
    })
    const brain = createEnemyBrain()

    const decision = stepEnemyAI(enemy, brain, player, 16)

    expect(brain.state).toBe('idle')
    expect(decision.move).toEqual({ x: 0, y: 0 })
  })

  it('เข้าระยะตรวจจับแล้วเริ่มไล่ และเดินเข้าหาผู้เล่น', () => {
    const enemy = entity({ position: { x: 0, y: 0 } })
    const player = entity({ id: 'player', entityType: 'player', position: { x: 300, y: 0 } })
    const brain = createEnemyBrain()

    stepEnemyAI(enemy, brain, player, 16) // idle → chase
    const decision = stepEnemyAI(enemy, brain, player, 16)

    expect(brain.state).toBe('chase')
    expect(enemy.state).toBe('walk')
    expect(decision.move.x).toBeCloseTo(1)
    expect(decision.move.y).toBeCloseTo(0)
  })

  it('เข้าระยะโจมตีแล้วเข้า telegraph ก่อน attack และหยุดเดินตลอดท่า', () => {
    const enemy = entity({ position: { x: 0, y: 0 } })
    const player = entity({
      id: 'player',
      entityType: 'player',
      position: { x: template.attackRange - 10, y: 0 },
    })
    const brain = createEnemyBrain()

    stepEnemyAI(enemy, brain, player, 16) // → chase
    const telegraph = stepEnemyAI(enemy, brain, player, 16) // → telegraph

    expect(brain.state).toBe('telegraph')
    expect(enemy.state).toBe('telegraph')
    expect(telegraph.move).toEqual({ x: 0, y: 0 })
    expect(enemy.attackCooldownRemainingMs).toBe(template.attackCooldownMs)

    stepEnemyAI(enemy, brain, player, ENEMY_ATTACK_TIMING.telegraphMs + 16)
    expect(brain.state).toBe('attack')
    expect(enemy.state).toBe('attack')

    const during = stepEnemyAI(enemy, brain, player, ENEMY_ATTACK_TIMING.startupMs)
    expect(brain.state).toBe('attack')
    expect(during.move).toEqual({ x: 0, y: 0 })
  })

  it('จบท่าโจมตีแล้วเข้าสู่ช่วงพัก ก่อนกลับไปไล่ต่อ', () => {
    const enemy = entity({ position: { x: 0, y: 0 } })
    const player = entity({
      id: 'player',
      entityType: 'player',
      position: { x: template.attackRange - 10, y: 0 },
    })
    const brain = createEnemyBrain()

    stepEnemyAI(enemy, brain, player, 16)
    stepEnemyAI(enemy, brain, player, 16)
    advanceEnemyAI(enemy, brain, player, ATTACK_TOTAL_MS)
    expect(brain.state).toBe('recover')

    stepEnemyAI(enemy, brain, player, 500)
    expect(brain.state).toBe('chase')
  })

  it('โดนตีจนเซ = หยุดทุกอย่างและท่าโจมตีถูกยกเลิก', () => {
    const enemy = entity({ position: { x: 0, y: 0 }, hitStunRemainingMs: 200 })
    const player = entity({ id: 'player', entityType: 'player', position: { x: 50, y: 0 } })
    const brain = createEnemyBrain()

    const decision = stepEnemyAI(enemy, brain, player, 16)

    expect(brain.state).toBe('hit')
    expect(enemy.state).toBe('hit')
    expect(decision.move).toEqual({ x: 0, y: 0 })
  })

  it('ตายแล้ว AI หยุดถาวร ไม่ไล่ ไม่โจมตี', () => {
    const enemy = entity({ hp: 0 })
    const player = entity({ id: 'player', entityType: 'player', position: { x: 10, y: 0 } })
    const brain = createEnemyBrain()

    const decision = stepEnemyAI(enemy, brain, player, 16)

    expect(brain.state).toBe('dead')
    expect(enemy.state).toBe('dead')
    expect(decision.move).toEqual({ x: 0, y: 0 })
  })

  it('ผู้เล่นตายแล้วศัตรูเลิกไล่', () => {
    const enemy = entity({ position: { x: 0, y: 0 } })
    const player = entity({ id: 'player', entityType: 'player', position: { x: 200, y: 0 }, hp: 0 })
    const brain = createEnemyBrain()

    stepEnemyAI(enemy, brain, player, 16)
    expect(brain.state).toBe('idle')
  })

  it('ยังไม่พ้นคูลดาวน์ = เข้าใกล้แล้วยืนรอ ไม่เข้าท่าโจมตี', () => {
    const enemy = entity({
      position: { x: 0, y: 0 },
      attackCooldownRemainingMs: 800,
    })
    const player = entity({
      id: 'player',
      entityType: 'player',
      position: { x: template.attackRange - 10, y: 0 },
    })
    const brain = createEnemyBrain()

    stepEnemyAI(enemy, brain, player, 16)
    const decision = stepEnemyAI(enemy, brain, player, 16)

    expect(brain.state).toBe('chase')
    expect(enemy.state).toBe('idle')
    expect(decision.move).toEqual({ x: 0, y: 0 })
  })
})

/** เดินเวลาเป็นก้าวคงที่เหมือนลูปจริง ไม่ใช่ก้อนเดียวใหญ่ ๆ */
function advance(runtime: RealtimeBattleRuntime, ms: number) {
  const stepMs = 1000 / 60
  for (let t = 0; t < ms; t += stepMs) runtime.step(stepMs)
}

describe('runtime กับศัตรูทั้งกอง', () => {
  function runtimeWithEnemies() {
    const state = createRealtimeBattle('trial-01', makePlayer())
    if (!state) throw new Error('สร้างสถานะไม่สำเร็จ')
    return new RealtimeBattleRuntime(state)
  }

  it('ศัตรูเดินเข้าหาผู้เล่นเมื่อการต่อสู้เริ่มแล้ว', () => {
    const runtime = runtimeWithEnemies()
    const state = runtime.getState()
    const enemy = state.enemies[0]
    const before = Math.hypot(
      enemy.position.x - state.player.position.x,
      enemy.position.y - state.player.position.y,
    )

    advance(runtime, 2000)

    const after = Math.hypot(
      enemy.position.x - state.player.position.x,
      enemy.position.y - state.player.position.y,
    )
    expect(after).toBeLessThan(before)
  })

  it('ศัตรูไม่กองทับกันเป็นตัวเดียวแม้จะวิ่งเข้าหาจุดเดียวกัน', () => {
    const runtime = runtimeWithEnemies()
    const state = runtime.getState()

    advance(runtime, 6000)

    for (let i = 0; i < state.enemies.length; i += 1) {
      for (let j = i + 1; j < state.enemies.length; j += 1) {
        const a = state.enemies[i]
        const b = state.enemies[j]
        const gap = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y)
        // ยอมให้คลาดเคลื่อนเล็กน้อยจากการดันในเฟรมเดียวกัน
        expect(gap).toBeGreaterThan((a.collisionRadius + b.collisionRadius) * 0.9)
      }
    }
  })

  it('ศัตรูไม่หลุดออกนอกห้อง', () => {
    const runtime = runtimeWithEnemies()
    const state = runtime.getState()

    advance(runtime, 4000)

    for (const enemy of state.enemies) {
      expect(enemy.position.x).toBeGreaterThanOrEqual(enemy.collisionRadius - 0.01)
      expect(enemy.position.x).toBeLessThanOrEqual(state.stage.width - enemy.collisionRadius + 0.01)
      expect(enemy.position.y).toBeGreaterThanOrEqual(enemy.collisionRadius - 0.01)
      expect(enemy.position.y).toBeLessThanOrEqual(
        state.stage.height - enemy.collisionRadius + 0.01,
      )
    }
  })

  it('การต่อสู้จบแล้ว (exiting) ศัตรูหยุดสนิท', () => {
    const runtime = runtimeWithEnemies()
    advance(runtime, 2000)

    runtime.requestExit()
    const state = runtime.getState()
    const positions = state.enemies.map((enemy) => ({ ...enemy.position }))

    advance(runtime, 2000)

    state.enemies.forEach((enemy, index) => {
      expect(enemy.position).toEqual(positions[index])
    })
  })
})
