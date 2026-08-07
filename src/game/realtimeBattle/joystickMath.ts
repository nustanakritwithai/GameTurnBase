import type { Vec2 } from './types'

/**
 * Convert raw stick offset (already divided by radius, length 0–1+) into
 * gameplay movement with dead zone and normalized output.
 */
export function applyJoystickDeadZone(rawX: number, rawY: number, deadZone: number): Vec2 {
  const length = Math.hypot(rawX, rawY)
  if (length <= deadZone) return { x: 0, y: 0 }

  const scaled = Math.min(1, (length - deadZone) / (1 - deadZone))
  return {
    x: (rawX / length) * scaled,
    y: (rawY / length) * scaled,
  }
}

/** Clamp drag delta to unit circle before dead-zone processing. */
export function clampStickVector(dx: number, dy: number, radius: number): Vec2 {
  const x = dx / radius
  const y = dy / radius
  const length = Math.hypot(x, y)
  if (length <= 1) return { x, y }
  return { x: x / length, y: y / length }
}
