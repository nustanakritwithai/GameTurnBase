import { describe, expect, it } from 'vitest'
import { getAttackButtonState, getSkillButtonState } from './combatButtonState'
import type { RealtimeBattleEntity } from './types'
import { ULTIMATE_GAUGE_CONFIG } from './ultimateGauge'

function player(overrides: Partial<RealtimeBattleEntity> = {}): RealtimeBattleEntity {
  return {
    id: 'p1',
    entityType: 'player',
    name: 'ทดสอบ',
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    facing: 'down',
    combatFacing: 'right',
    state: 'idle',
    hp: 100,
    maxHp: 100,
    atk: 50,
    def: 10,
    speed: 130,
    collisionRadius: 34,
    hurtboxRadius: 40,
    attackCooldownRemainingMs: 0,
    skillCooldownsMs: { skill1: 0, skill2: 0, skill3: 0 },
    ultimateGauge: 0,
    invulnerableUntilMs: 0,
    hitStunRemainingMs: 0,
    ...overrides,
  }
}

describe('combatButtonState', () => {
  it('attack is casting while player.state is attack', () => {
    const metrics = getAttackButtonState(player({ state: 'attack' }), false)
    expect(metrics.state).toBe('casting')
  })

  it('skill shows cooldown with numeric seconds', () => {
    const metrics = getSkillButtonState(
      'skill1',
      player({ skillCooldownsMs: { skill1: 3800, skill2: 0, skill3: 0 } }),
      null,
      8000,
      false,
    )
    expect(metrics.state).toBe('cooldown')
    expect(metrics.cooldownSeconds).toBe(4)
    expect(metrics.cooldownRatio).toBeGreaterThan(0)
  })

  it('ultimate is ready when gauge is full', () => {
    const metrics = getSkillButtonState(
      'ultimate',
      player({ ultimateGauge: ULTIMATE_GAUGE_CONFIG.max }),
      null,
      0,
      false,
    )
    expect(metrics.state).toBe('ready')
    expect(metrics.ultimateFill).toBe(1)
  })

  it('hitstun disables attack', () => {
    const metrics = getAttackButtonState(player({ hitStunRemainingMs: 200 }), false)
    expect(metrics.state).toBe('disabled')
  })
})
