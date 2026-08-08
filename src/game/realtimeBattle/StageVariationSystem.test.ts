import { describe, expect, it } from 'vitest'
import type { Player } from '../../types/player'
import { EMPTY_PROGRESS } from '../../types/player'
import { createDefaultSkillLevels } from './SkillProgressionSystem'
import { createEnemyBrain, stepEnemyAI, ENEMY_ATTACK_TIMING } from './EnemyAISystem'
import { getEnemyAttackById } from './attacks'
import {
  createRealtimeBattle,
  createWaveEnemies,
  type RealtimeBattleState,
} from './createRealtimeBattle'
import { RealtimeBattleRuntime } from './RealtimeBattleRuntime'
import { calculateBattleReward } from './RewardSystem'
import { toRealtimeBattleResult } from './BattleResultAdapter'
import { getRealtimeStage, type RealtimeBattleStage } from './stageConfig'
import { resolveStageOutcome } from './StageVariationSystem'

/**
 * เทสต์ตาม Done-criteria ของ docs/agent-blueprint/17-stage-variation-system.md
 * #1: ทั้ง 7 ชนิดด่านมีฟังก์ชันแพ้ชนะของตัวเอง เทสต์ deterministic (ไม่มี RNG)
 * #3: mini-boss เดิน EnemyAIState เดียวกับศัตรูทั่วไป ไม่มี fork พิเศษ
 * #4: Survival + Defend เล่นจบได้จริง (spawn → objective → win/lose → RewardSystem)
 */

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

/** สถานะห้องต่อสู้ทดสอบ — ยืม entity จาก trial-01 จริง แล้วสวม stage ปลอมทับเฉพาะที่ต้องการ */
function makeState(stageOverrides: Partial<RealtimeBattleStage> = {}): RealtimeBattleState {
  const base = createRealtimeBattle('trial-01', makePlayer())
  if (!base) throw new Error('เตรียม fixture ไม่สำเร็จ')
  return { ...base, stage: { ...base.stage, ...stageOverrides } }
}

function killAllEnemies(state: RealtimeBattleState): void {
  for (const enemy of state.enemies) {
    enemy.state = 'dead'
    enemy.hp = 0
  }
}

describe('resolveStageOutcome — wave', () => {
  it('เคลียร์ศัตรูหมดและไม่มีคลื่นถัดไป = ชนะ', () => {
    const state = makeState({ stageType: 'wave' })
    killAllEnemies(state)
    expect(resolveStageOutcome(state, 16)).toBe('victory')
  })

  it('เคลียร์คลื่นแรกแต่ยังมีคลื่นถัดไป = ยังไม่จบ และสร้างคลื่นใหม่เข้ามา', () => {
    const state = createRealtimeBattle('trial-02', makePlayer())
    if (!state) throw new Error('เตรียม fixture ไม่สำเร็จ')
    const firstWaveCount = state.enemies.length
    killAllEnemies(state)

    expect(resolveStageOutcome(state, 16)).toBeNull()
    expect(state.currentWaveIndex).toBe(1)
    expect(state.enemies.length).toBeGreaterThan(firstWaveCount)
  })

  it('ยังไม่มีศัตรูตายครบ = ยังไม่จบ', () => {
    const state = makeState({ stageType: 'wave' })
    expect(resolveStageOutcome(state, 16)).toBeNull()
  })
})

describe('resolveStageOutcome — survival', () => {
  it('รอดจนครบเวลา = ชนะ แม้ศัตรูยังไม่ตายสักตัว', () => {
    const state = makeState({ stageType: 'survival', survival: { durationMs: 1000 } })
    state.elapsedMs = 1000
    expect(resolveStageOutcome(state, 16)).toBe('victory')
  })

  it('ยังไม่ครบเวลา = ยังไม่จบ', () => {
    const state = makeState({ stageType: 'survival', survival: { durationMs: 1000 } })
    state.elapsedMs = 999
    expect(resolveStageOutcome(state, 16)).toBeNull()
  })
})

describe('resolveStageOutcome — defend', () => {
  it('objectiveHp หมด = แพ้ทันที แม้ศัตรูยังไม่ตายสักตัว', () => {
    const state = makeState({
      stageType: 'defend',
      defend: { objectiveHp: 100, position: { x: 0, y: 0 } },
    })
    state.objectiveHp = 0
    expect(resolveStageOutcome(state, 16)).toBe('defeat')
  })

  it('เคลียร์ศัตรูหมดก่อน objectiveHp หมด = ชนะ', () => {
    const state = makeState({
      stageType: 'defend',
      defend: { objectiveHp: 100, position: { x: 0, y: 0 } },
    })
    state.objectiveHp = 40
    killAllEnemies(state)
    expect(resolveStageOutcome(state, 16)).toBe('victory')
  })
})

describe('resolveStageOutcome — time-attack', () => {
  it('เวลาเกินงบก่อนเคลียร์เสร็จ = แพ้', () => {
    const state = makeState({ stageType: 'time-attack', timeAttack: { timeBudgetMs: 1000 } })
    state.elapsedMs = 1001
    expect(resolveStageOutcome(state, 16)).toBe('defeat')
  })

  it('เคลียร์ศัตรูหมดภายในเวลา = ชนะ', () => {
    const state = makeState({ stageType: 'time-attack', timeAttack: { timeBudgetMs: 1000 } })
    state.elapsedMs = 500
    killAllEnemies(state)
    expect(resolveStageOutcome(state, 16)).toBe('victory')
  })
})

describe('resolveStageOutcome — mini-boss', () => {
  it('ศัตรูตายหมด (ตัวเดียว) = ชนะ — ยืมตรรกะเดียวกับ wave ตรง ๆ', () => {
    const state = makeState({
      stageType: 'mini-boss',
      miniBoss: { templateId: 'demon-warlord' },
    })
    killAllEnemies(state)
    expect(resolveStageOutcome(state, 16)).toBe('victory')
  })
})

describe('resolveStageOutcome — chase', () => {
  const params = { targetPosition: { x: 500, y: 0 }, arrivalRadius: 20, timeBudgetMs: 1000 }

  it('ถึงตำแหน่งเป้าหมายในระยะที่กำหนด = ชนะ', () => {
    const state = makeState({ stageType: 'chase', chase: params })
    state.player.position = { x: 505, y: 0 }
    expect(resolveStageOutcome(state, 16)).toBe('victory')
  })

  it('เวลาเกินงบก่อนถึงเป้าหมาย = แพ้', () => {
    const state = makeState({ stageType: 'chase', chase: params })
    state.player.position = { x: 0, y: 0 }
    state.elapsedMs = 1001
    expect(resolveStageOutcome(state, 16)).toBe('defeat')
  })

  it('ยังไม่ถึงและเวลายังไม่หมด = ยังไม่จบ', () => {
    const state = makeState({ stageType: 'chase', chase: params })
    state.player.position = { x: 0, y: 0 }
    state.elapsedMs = 500
    expect(resolveStageOutcome(state, 16)).toBeNull()
  })
})

describe('resolveStageOutcome — hazard', () => {
  const params = { hazardHp: 100, decayPerSecond: 10 }

  it('hazardHp หมด = แพ้', () => {
    const state = makeState({ stageType: 'hazard', hazard: params })
    state.hazardHp = 100
    // 10 วิ ที่ 10/วิ = ไหลหมดพอดี
    for (let i = 0; i < 10; i += 1) resolveStageOutcome(state, 1000)
    expect(state.hazardHp).toBe(0)
    expect(resolveStageOutcome(state, 16)).toBe('defeat')
  })

  it('เคลียร์ศัตรูหมดก่อน hazardHp หมด = ชนะ', () => {
    const state = makeState({ stageType: 'hazard', hazard: params })
    state.hazardHp = 100
    killAllEnemies(state)
    expect(resolveStageOutcome(state, 16)).toBe('victory')
  })

  it('ไหลลงเท่ากันไม่ว่าจะแบ่ง step ก้อนใหญ่หรือหลายก้อนเล็ก (กัน desync ตาม Known-scars)', () => {
    const oneBigStep = makeState({ stageType: 'hazard', hazard: params })
    oneBigStep.hazardHp = 100
    resolveStageOutcome(oneBigStep, 3000)

    const manySmallSteps = makeState({ stageType: 'hazard', hazard: params })
    manySmallSteps.hazardHp = 100
    // 50ms × 60 ก้อน = 3000ms พอดี ให้ผลรวมเวลาเท่ากับก้อนใหญ่เป๊ะ (ไม่ใช่แค่ใกล้เคียง)
    for (let i = 0; i < 60; i += 1) resolveStageOutcome(manySmallSteps, 50)

    expect(manySmallSteps.hazardHp).toBeCloseTo(oneBigStep.hazardHp, 5)
  })
})

describe('resolveStageOutcome — custom', () => {
  it('ยังไม่มี predicate system เฉพาะ — ตกไปใช้ตรรกะเคลียร์คลื่นแทน (ไม่ค้าง)', () => {
    const state = makeState({ stageType: 'custom' })
    killAllEnemies(state)
    expect(resolveStageOutcome(state, 16)).toBe('victory')
  })
})

/**
 * Done-criteria #3: mini-boss ต้องเดิน EnemyBrain/EnemyAIState เดียวกับศัตรูทั่วไปเป๊ะ
 * ไม่มี fork/state พิเศษของ boss เลย — สร้างศัตรูจาก template Elite-tier (demon-warlord)
 * ผ่าน createWaveEnemies ตัวเดียวกับที่ด่าน wave ทั่วไปใช้ แล้วเดิน stepEnemyAI ตรง ๆ
 */
describe('mini-boss ใช้ EnemyAI เส้นทางเดียวกับศัตรูทั่วไป (§3.8.4)', () => {
  const miniBossStage: RealtimeBattleStage = {
    ...(getRealtimeStage('trial-01') as RealtimeBattleStage),
    id: 'test-mini-boss',
    stageType: 'mini-boss',
    miniBoss: { templateId: 'demon-warlord' },
    waves: [{ id: 'wave-1', enemies: [{ templateId: 'demon-warlord', spawnIndex: 0 }] }],
  }

  it('entity เกิดเป็น entityType เดิม (enemy) ไม่ใช่ boss — ไม่มี entity type พิเศษ', () => {
    const [boss] = createWaveEnemies(miniBossStage, 0)
    expect(boss.entityType).toBe('enemy')
    expect(boss.enemyId).toBe('demon-warlord')
  })

  it('เดิน idle → chase → attack เหมือนศัตรูทั่วไปทุกประการ ไม่มี state/fork พิเศษของ boss', () => {
    const [boss] = createWaveEnemies(miniBossStage, 0)
    const player = createPlayerEntityStub({ x: boss.position.x + 50, y: boss.position.y })
    const brain = createEnemyBrain()

    // ยังไม่เข้าระยะ = idle เหมือนศัตรูทั่วไป
    expect(brain.state).toBe('idle')

    // ระยะโจมตีจริง — ต้องเข้า chase → telegraph → attack ด้วยลำดับ state เดียวกับ EnemyAISystem.test.ts
    // (P4 combat core: ทุกท่าผ่าน telegraph state ก่อนเสมอ — enemy.state อ่านว่า 'attack' ตั้งแต่
    // ระหว่าง telegraph แล้ว เพราะไม่ใช่บอส ใช้ EntityState 'attack' เดิม)
    const telegraphMs = getEnemyAttackById('enemy-elite-slam').telegraphMs ?? 0
    stepEnemyAI(boss, brain, player, 16, 0) // → chase
    stepEnemyAI(boss, brain, player, 16, 16) // chase → telegraph
    expect(brain.state).toBe('telegraph')
    expect(boss.state).toBe('attack')
    stepEnemyAI(boss, brain, player, telegraphMs, 32) // telegraph → attack
    expect(brain.state).toBe('attack')
    expect(boss.state).toBe('attack')

    stepEnemyAI(boss, brain, player, ENEMY_ATTACK_TIMING.startupMs, 48)
    expect(brain.state).toBe('attack') // ยังไม่มี phase-transition state แทรก

    // ฟิลด์เฉพาะบอส (#11) ต้องนิ่งอยู่ค่าเริ่มต้นตลอด — พิสูจน์ว่า mini-boss ไม่แตะกลไก
    // Boss phase-transition เลย (bossTemplate ใน stepEnemyAI gate ด้วย entityType === 'boss'
    // เท่านั้น ตัวนี้เป็น 'enemy' ธรรมดา ต่างกันที่ tier ในข้อมูล ไม่ใช่โค้ด)
    // (selectedAttack เองไม่ใช่ฟิลด์เฉพาะบอสอีกต่อไปหลัง reconcile กับ P4 combat core —
    // ทั้ง mob และ boss path ใช้ฟิลด์เดียวกันนี้ร่วมกัน ต้อง "มีค่า" ไม่ใช่ null ถึงจะถูก)
    expect(brain.bossPhaseIndex).toBe(0)
    expect(brain.bossPendingPhaseTransition).toBe(false)
    expect(brain.selectedAttack).not.toBeNull()
  })
})

function createPlayerEntityStub(position: { x: number; y: number }) {
  return {
    id: 'player',
    entityType: 'player' as const,
    name: 'ผู้เล่นทดสอบ',
    position,
    velocity: { x: 0, y: 0 },
    facing: 'down' as const,
    combatFacing: 'right' as const,
    state: 'idle' as const,
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
    combatTier: 'mob' as const,
  }
}

/**
 * Done-criteria #4: อย่างน้อย 2 ชนิดที่ไม่ใช่ wave เล่นจบได้จริง — spawn → objective →
 * win/lose → RewardSystem payout ผ่าน runtime จริง (ไม่ใช่แค่มี type ไว้เฉย ๆ)
 */
describe('Survival เล่นจบได้จริง (Done-criteria #4)', () => {
  it('spawn → รอดครบเวลา → victory → RewardSystem จ่ายรางวัลจริง', () => {
    const state = createRealtimeBattle('trial-03', makePlayer())
    if (!state) throw new Error('เตรียม fixture ไม่สำเร็จ')
    expect(state.stage.stageType).toBe('survival')

    const runtime = new RealtimeBattleRuntime(state)
    runtime.step(1000) // ผ่านฉากเปิด

    const durationMs = state.stage.survival?.durationMs ?? 0
    runtime.step(durationMs + 16)

    expect(runtime.getSnapshot().status).toBe('victory')

    const result = toRealtimeBattleResult(state, 'victory')
    expect(result.outcome).toBe('victory')
    expect(result.earnedGold).toBeGreaterThan(0)
  })

  it('ผู้เล่นตายก่อนครบเวลา = defeat และไม่ได้รางวัล', () => {
    const state = createRealtimeBattle('trial-03', makePlayer())
    if (!state) throw new Error('เตรียม fixture ไม่สำเร็จ')
    const runtime = new RealtimeBattleRuntime(state)
    runtime.step(1000)

    state.player.state = 'dead'
    state.player.hp = 0
    runtime.step(16)

    expect(runtime.getSnapshot().status).toBe('defeat')
    const reward = calculateBattleReward(state, 'defeat')
    expect(reward).toEqual({ earnedExp: 0, earnedGold: 0, droppedItems: [] })
  })
})

describe('Defend เล่นจบได้จริง (Done-criteria #4)', () => {
  it('spawn → เคลียร์ศัตรูหมดโดย objectiveHp ยังเหลือ → victory → RewardSystem จ่ายรางวัลจริง', () => {
    const state = createRealtimeBattle('trial-04', makePlayer())
    if (!state) throw new Error('เตรียม fixture ไม่สำเร็จ')
    expect(state.stage.stageType).toBe('defend')
    expect(state.objectiveHp).toBe(state.stage.defend?.objectiveHp)

    const runtime = new RealtimeBattleRuntime(state)
    runtime.step(1000)

    killAllEnemies(state)
    runtime.step(16)

    expect(runtime.getSnapshot().status).toBe('victory')

    const result = toRealtimeBattleResult(state, 'victory')
    expect(result.earnedGold).toBeGreaterThan(0)
  })

  it('objectiveHp หมดก่อนเคลียร์ศัตรู = defeat แม้ผู้เล่นยังไม่ตาย', () => {
    const state = createRealtimeBattle('trial-04', makePlayer())
    if (!state) throw new Error('เตรียม fixture ไม่สำเร็จ')
    const runtime = new RealtimeBattleRuntime(state)
    runtime.step(1000)

    state.objectiveHp = 0
    runtime.step(16)

    expect(runtime.getSnapshot().status).toBe('defeat')
    expect(state.player.hp).toBeGreaterThan(0) // แพ้เพราะ objective ไม่ใช่เพราะผู้เล่นตาย
  })

  it('ศัตรูมีชีวิตอยู่ทำให้ objectiveHp ลดลงเรื่อย ๆ จนแพ้', () => {
    const state = createRealtimeBattle('trial-04', makePlayer())
    if (!state) throw new Error('เตรียม fixture ไม่สำเร็จ')
    const startHp = state.objectiveHp ?? 0
    const runtime = new RealtimeBattleRuntime(state)
    runtime.step(1000)

    runtime.step(600_000)

    expect(state.objectiveHp).toBeLessThan(startHp)
    expect(runtime.getSnapshot().status).toBe('defeat')
  })
})
