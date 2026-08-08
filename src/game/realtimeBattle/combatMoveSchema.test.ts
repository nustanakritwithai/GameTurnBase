import { describe, expect, it } from 'vitest'
import { ENEMY_ATTACK_MELEE, PLAYER_ATTACK_CHAIN } from './attacks'
import {
  attackTotalDurationMs,
  COMBAT_DEFAULTS,
  getMovePhase,
  getStrikeIndex,
  isExecuteActiveWindow,
  isFullMoveActiveWindow,
  resolveHitstunMs,
  resolveInterruptible,
  resolveTelegraphMs,
  allowsMovementDuringCast,
} from './combatMoveSchema'

describe('combatMoveSchema', () => {
  it('enemy telegraph defaults to data on attack', () => {
    expect(resolveTelegraphMs(ENEMY_ATTACK_MELEE)).toBe(280)
    expect(resolveTelegraphMs(PLAYER_ATTACK_CHAIN[0])).toBe(0)
  })

  it('hitstun baseline is 200ms', () => {
    expect(resolveHitstunMs(PLAYER_ATTACK_CHAIN[0])).toBe(COMBAT_DEFAULTS.hitstunMs)
    expect(COMBAT_DEFAULTS.hitstunMs).toBe(200)
  })

  it('active window sits after telegraph + startup', () => {
    const attack = ENEMY_ATTACK_MELEE
    const telegraph = resolveTelegraphMs(attack)
    expect(getMovePhase(attack, telegraph - 1)).toBe('telegraph')
    expect(isFullMoveActiveWindow(attack, telegraph + attack.startupMs + 10)).toBe(true)
    expect(isExecuteActiveWindow(attack, attack.startupMs + 10)).toBe(true)
  })

  it('ultimate has 4 strike indices during active', () => {
    const ult = PLAYER_ATTACK_CHAIN[2]
    const strikes = new Set<number>()
    for (let t = ult.startupMs; t < ult.startupMs + ult.activeMs; t += 20) {
      const idx = getStrikeIndex({ ...ult, strikeCount: 4 }, t)
      if (idx >= 0) strikes.add(idx)
    }
    expect(strikes.size).toBeGreaterThan(1)
  })

  it('phaseOverrides can make startup uninterruptible', () => {
    const attack = {
      ...PLAYER_ATTACK_CHAIN[0],
      interruptible: true,
      phaseOverrides: { startup: { interruptible: false } },
    }
    expect(resolveInterruptible(attack, 'startup')).toBe(false)
    expect(resolveInterruptible(attack, 'recovery')).toBe(true)
  })

  it('total duration includes telegraph', () => {
    expect(attackTotalDurationMs(ENEMY_ATTACK_MELEE)).toBe(280 + 120 + 140 + 420)
  })

  it('castDelayMs adds wind-up phase before startup (§3.6.12)', () => {
    const attack = {
      ...PLAYER_ATTACK_CHAIN[0],
      castDelayMs: 250,
      startupMs: 100,
      activeMs: 50,
      recoveryMs: 50,
    }
    expect(getMovePhase(attack, 249)).toBe('castDelay')
    expect(getMovePhase(attack, 250)).toBe('startup')
    expect(getMovePhase(attack, 349)).toBe('startup')
    expect(getMovePhase(attack, 350)).toBe('active')
    expect(attackTotalDurationMs(attack)).toBe(250 + 100 + 50 + 50)
  })

  it('movementDuringCast defaults to locked (§3.6.12 none)', () => {
    expect(allowsMovementDuringCast(PLAYER_ATTACK_CHAIN[0])).toBe(false)
    expect(allowsMovementDuringCast({ ...PLAYER_ATTACK_CHAIN[0], movementDuringCast: true })).toBe(
      true,
    )
  })
})
