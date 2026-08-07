/**
 * Centralized mobile combat control layout — Naruto-mobile-inspired ergonomics.
 *
 * Positions use viewport-relative percentages (not fixed pixels) so controls
 * anchor correctly across 16:9 … 20:9 landscape and tablets.
 *
 * Future settings (size/opacity/position) can read overrides from here.
 */

export interface CombatUILayout {
  /** Joystick normalized dead zone (0–1 of stick travel). */
  deadZone: number
  joystickScale: number
  attackScale: number
  skillScale: number
  ultimateScale: number
  leftInset: number
  rightInset: number
  bottomInset: number
  skillSpacing: number
  /** Joystick center as % of viewport (width, height from bottom-left origin). */
  joystickAnchorXPercent: number
  joystickAnchorYPercent: number
  /** Attack button center as % of viewport. */
  attackAnchorXPercent: number
  attackAnchorYPercent: number
  /** Touch hit area multiplier vs visual stick size. */
  joystickTouchAreaScale: number
}

/** Default layout tuned for mobile landscape thumb reach. */
export const DEFAULT_COMBAT_UI_LAYOUT: CombatUILayout = {
  deadZone: 0.12,
  joystickScale: 1,
  attackScale: 1,
  skillScale: 0.72,
  ultimateScale: 0.78,
  leftInset: 0,
  rightInset: 0,
  bottomInset: 0,
  skillSpacing: 10,
  joystickAnchorXPercent: 15,
  joystickAnchorYPercent: 79,
  attackAnchorXPercent: 88.5,
  attackAnchorYPercent: 81,
  joystickTouchAreaScale: 1.35,
}

/** Base visual diameters (CSS px) before scale — attack is primary. */
export const COMBAT_BUTTON_SIZES = {
  attack: 84,
  skill: 60,
  ultimate: 64,
  minTouchTarget: 44,
} as const

export function layoutCssVars(
  layout: CombatUILayout = DEFAULT_COMBAT_UI_LAYOUT,
): Record<string, string> {
  const attackSize = COMBAT_BUTTON_SIZES.attack * layout.attackScale
  const skillSize = COMBAT_BUTTON_SIZES.skill * layout.skillScale
  const ultimateSize = COMBAT_BUTTON_SIZES.ultimate * layout.ultimateScale
  const joystickSize = 128 * layout.joystickScale

  return {
    '--combat-dead-zone': String(layout.deadZone),
    '--combat-joystick-x': `${layout.joystickAnchorXPercent}%`,
    '--combat-joystick-y': `${layout.joystickAnchorYPercent}%`,
    '--combat-attack-x': `${layout.attackAnchorXPercent}%`,
    '--combat-attack-y': `${layout.attackAnchorYPercent}%`,
    '--combat-joystick-size': `${joystickSize}px`,
    '--combat-joystick-touch-scale': String(layout.joystickTouchAreaScale),
    '--combat-attack-size': `${attackSize}px`,
    '--combat-skill-size': `${skillSize}px`,
    '--combat-ultimate-size': `${ultimateSize}px`,
    '--combat-skill-gap': `${layout.skillSpacing}px`,
    '--combat-inset-left': `${layout.leftInset}px`,
    '--combat-inset-right': `${layout.rightInset}px`,
    '--combat-inset-bottom': `${layout.bottomInset}px`,
  }
}
