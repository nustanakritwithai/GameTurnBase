import { describe, expect, it } from 'vitest'
import { applyJoystickDeadZone, clampStickVector } from './joystickMath'

describe('joystickMath', () => {
  it('returns zero inside dead zone', () => {
    expect(applyJoystickDeadZone(0.05, 0.05, 0.12)).toEqual({ x: 0, y: 0 })
  })

  it('scales output to full deflection at edge', () => {
    const edge = applyJoystickDeadZone(1, 0, 0.12)
    expect(edge.x).toBeCloseTo(1, 5)
    expect(edge.y).toBe(0)
  })

  it('preserves direction outside dead zone', () => {
    const v = applyJoystickDeadZone(0.6, 0.8, 0.12)
    const angle = Math.atan2(v.y, v.x)
    expect(angle).toBeCloseTo(Math.atan2(0.8, 0.6), 5)
  })

  it('clampStickVector caps at unit length', () => {
    expect(clampStickVector(200, 0, 100)).toEqual({ x: 1, y: 0 })
    expect(clampStickVector(30, 40, 100)).toEqual({ x: 0.3, y: 0.4 })
  })
})
