import { describe, expect, it } from 'vitest'
import { createRealtimeBattle } from './createRealtimeBattle'
import { RealtimeBattleRuntime } from './RealtimeBattleRuntime'
import { PLAYER_ATTACK_CHAIN } from './attacks'
import type { Player } from '../../types/player'
import { createDefaultSkillLevels } from './SkillProgressionSystem'
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

describe('Basic Attack Lunge Movement', () => {
  function setupRuntime() {
    const state = createRealtimeBattle('trial-01', makePlayer())
    if (!state) throw new Error('Failed to create battle state')

    // Add a dummy enemy far away to prevent early victory transition
    const dummyEnemy = {
      id: 'dummy-enemy',
      entityType: 'enemy' as const,
      name: 'หุ่นจำลอง',
      position: { x: 1500, y: 500 },
      velocity: { x: 0, y: 0 },
      facing: 'left' as const,
      combatFacing: 'left' as const,
      state: 'idle' as const,
      hp: 99999,
      maxHp: 99999,
      atk: 0,
      def: 0,
      speed: 0,
      collisionRadius: 30,
      hurtboxRadius: 30,
      attackCooldownRemainingMs: 0,
      skillCooldownsMs: { skill1: 0, skill2: 0, skill3: 0 },
      ultimateGauge: 0,
      invulnerableUntilMs: 0,
      hitStunRemainingMs: 0,
      knockdownRemainingMs: 0,
      getUpRemainingMs: 0,
      combatTier: 'mob' as const,
      characterId: 'monkey-king',
    }
    state.enemies = [dummyEnemy]

    const runtime = new RealtimeBattleRuntime(state)
    // Run past intro status
    runtime.step(1000)
    return { runtime, state }
  }

  it('lunge forward correctly along player facing direction (facing right)', () => {
    const { runtime, state } = setupRuntime()
    const startX = state.player.position.x
    state.player.facing = 'right'

    // Attack 1: startupMs = 110, lungeDistance = 32
    runtime.requestAttack()

    // Step half way through startup phase
    runtime.step(55)
    expect(state.player.position.x).toBeCloseTo(startX + 16, 1)

    // Step to finish startup phase
    runtime.step(55)
    expect(state.player.position.x).toBeCloseTo(startX + 32, 1)

    // Further steps inside active/recovery phase should NOT apply lunge
    runtime.step(100)
    expect(state.player.position.x).toBeCloseTo(startX + 32, 1)
  })

  it('lunge forward correctly along player facing direction (facing left)', () => {
    const { runtime, state } = setupRuntime()
    const startX = state.player.position.x
    state.player.facing = 'left'
    state.player.combatFacing = 'left'

    // Attack 1: startupMs = 110, lungeDistance = 32
    runtime.requestAttack()

    // Step to finish startup phase
    runtime.step(110)
    expect(state.player.position.x).toBeCloseTo(startX - 32, 1)
  })

  it('combo chain lunges sequentially (attacks 1, 2, and 3)', () => {
    const { runtime, state } = setupRuntime()
    state.player.facing = 'right'
    let currentX = state.player.position.x

    // Attack 1 (lunge = 32)
    runtime.requestAttack()
    runtime.step(PLAYER_ATTACK_CHAIN[0].startupMs)
    expect(state.player.position.x).toBeCloseTo(currentX + 32, 1)

    // Finish Attack 1 duration
    runtime.step(PLAYER_ATTACK_CHAIN[0].activeMs + PLAYER_ATTACK_CHAIN[0].recoveryMs)
    currentX = state.player.position.x

    // Attack 2 (lunge = 36)
    runtime.requestAttack()
    runtime.step(PLAYER_ATTACK_CHAIN[1].startupMs)
    expect(state.player.position.x).toBeCloseTo(currentX + 36, 1)

    // Finish Attack 2 duration
    runtime.step(PLAYER_ATTACK_CHAIN[1].activeMs + PLAYER_ATTACK_CHAIN[1].recoveryMs)
    currentX = state.player.position.x

    // Attack 3 (lunge = 44)
    runtime.requestAttack()
    runtime.step(PLAYER_ATTACK_CHAIN[2].startupMs)
    expect(state.player.position.x).toBeCloseTo(currentX + 44, 1)
  })

  it('collides with enemies and resolves overlap instead of phasing through them', () => {
    const { runtime, state } = setupRuntime()

    // Create an enemy directly in front of the player (e.g. right facing)
    // Player width collision radius = 34, hurtbox radius = 42
    // Place enemy at x = startX + 50 (overlapping space during lunge)
    const startX = 200
    state.player.position = { x: startX, y: 300 }
    state.player.facing = 'right'
    state.player.collisionRadius = 30

    const enemy = {
      id: 'enemy-1',
      entityType: 'enemy' as const,
      name: 'ศัตรู',
      position: { x: startX + 75, y: 300 }, // Total separation must be >= 60 (30 + 30)
      velocity: { x: 0, y: 0 },
      facing: 'left' as const,
      combatFacing: 'left' as const,
      state: 'idle' as const,
      hp: 100,
      maxHp: 100,
      atk: 10,
      def: 10,
      speed: 200,
      collisionRadius: 30,
      hurtboxRadius: 30,
      attackCooldownRemainingMs: 0,
      skillCooldownsMs: { skill1: 0, skill2: 0, skill3: 0 },
      ultimateGauge: 0,
      invulnerableUntilMs: 0,
      hitStunRemainingMs: 0,
      knockdownRemainingMs: 0,
      getUpRemainingMs: 0,
      combatTier: 'mob' as const,
      characterId: 'monkey-king',
    }
    state.enemies = [enemy]

    // Without collision, player would land at 232.
    // With enemy collision at 275 and radius 30 + 30 = 60, player x should be restricted to <= 215.
    runtime.requestAttack()
    runtime.step(110)

    expect(state.player.position.x).toBeLessThanOrEqual(215)
  })

  it('clamps player position within the arena boundary during lunge', () => {
    const { runtime, state } = setupRuntime()

    // Place player close to the right edge of the stage
    const radius = state.player.collisionRadius
    const rightEdge = state.stage.width

    // Start player at rightEdge - radius - 10
    // Lunge distance is 32, which should exceed the edge if not clamped
    state.player.position = { x: rightEdge - radius - 10, y: 300 }
    state.player.facing = 'right'

    runtime.requestAttack()
    runtime.step(110)

    // Should be clamped exactly to the boundary
    expect(state.player.position.x).toBeCloseTo(rightEdge - radius, 0.1)
  })
})
