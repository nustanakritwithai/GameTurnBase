import { describe, expect, it } from 'vitest'
import {
  applyCombatFacingFromMovement,
  combatFacingFromDirection,
  combatFacingFromVector,
  faceTargetHorizontally,
  horizontalKnockbackVector,
} from './combatFacing'

describe('combatFacing (P2 L/R attack)', () => {
  it('maps horizontal directions to L/R', () => {
    expect(combatFacingFromDirection('left')).toBe('left')
    expect(combatFacingFromDirection('right')).toBe('right')
    expect(combatFacingFromDirection('up-left')).toBe('left')
    expect(combatFacingFromDirection('down-right')).toBe('right')
  })

  it('reads combat facing from move vector with fallback', () => {
    expect(combatFacingFromVector({ x: -1, y: 0 }, 'right')).toBe('left')
    expect(combatFacingFromVector({ x: 1, y: 0 }, 'left')).toBe('right')
    expect(combatFacingFromVector({ x: 0, y: -1 }, 'left')).toBe('left')
    expect(combatFacingFromVector({ x: 0, y: -1 }, 'right')).toBe('right')
    expect(combatFacingFromVector({ x: 0, y: 1 }, 'left')).toBe('left')
    expect(combatFacingFromVector({ x: 0, y: 1 }, 'right')).toBe('right')
    expect(combatFacingFromVector({ x: 0.1, y: 0.5 }, 'left')).toBe('left')
    expect(combatFacingFromVector({ x: -0.1, y: -0.5 }, 'right')).toBe('right')
  })

  it('faces target on horizontal axis', () => {
    const unit = {
      position: { x: 100, y: 200 },
      combatFacing: 'left' as const,
      facing: 'left' as const,
    }
    faceTargetHorizontally(unit, { x: 150, y: 210 })
    expect(unit.combatFacing).toBe('right')
    expect(unit.facing).toBe('right')
  })

  it('updates combat facing when moving horizontally', () => {
    const unit = { combatFacing: 'right' as const }
    applyCombatFacingFromMovement(unit, { x: -1, y: 0.2 })
    expect(unit.combatFacing).toBe('left')
  })

  it('knockback is horizontal only', () => {
    expect(horizontalKnockbackVector('right')).toEqual({ x: 1, y: 0 })
    expect(horizontalKnockbackVector('left')).toEqual({ x: -1, y: 0 })
  })
})
