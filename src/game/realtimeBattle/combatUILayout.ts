/**
 * Centralized mobile combat control layout — Blueprint v3 §3.3.
 *
 * Skills use one horizontal row above the bottom-right Attack button. Geometry
 * and rendered CSS sizes share this module so a 44px CSS minimum can never
 * silently disagree with collision/layout tests again.
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
  clusterGapRatio: number
  /** Joystick center as % of viewport width/height. */
  joystickAnchorXPercent: number
  joystickAnchorYPercent: number
  /** Touch hit area multiplier vs visual stick size. */
  joystickTouchAreaScale: number
  /** Top HUD compact scale (player/enemy vitals). */
  hudVitalsScale: number
  /** Center stage info compact scale. */
  hudStageScale: number
}

/** Default layout tuned for mobile landscape thumb reach. */
export const DEFAULT_COMBAT_UI_LAYOUT: CombatUILayout = {
  deadZone: 0.12,
  joystickScale: 1,
  attackScale: 1,
  skillScale: 0.86,
  ultimateScale: 0.85,
  leftInset: 0,
  rightInset: 12,
  bottomInset: 12,
  clusterGapRatio: 0.15,
  joystickAnchorXPercent: 14,
  joystickAnchorYPercent: 76,
  joystickTouchAreaScale: 1.35,
  hudVitalsScale: 0.75,
  hudStageScale: 0.65,
}

/** Base visual diameters (CSS px) before scale. */
export const COMBAT_BUTTON_SIZES = {
  attack: 92,
  skill: 56,
  ultimate: 66,
  minTouchTarget: 48,
} as const

/** Minimum edge-to-edge gap between combat buttons (CSS px). */
export const MIN_BUTTON_GAP_PX = 14

export interface CombatClusterMetrics {
  attackSize: number
  skillSize: number
  ultimateSize: number
  gap: number
  width: number
  height: number
}

export function resolveCombatClusterMetrics(
  layout: CombatUILayout = DEFAULT_COMBAT_UI_LAYOUT,
): CombatClusterMetrics {
  const attackSize = Math.max(
    COMBAT_BUTTON_SIZES.minTouchTarget,
    COMBAT_BUTTON_SIZES.attack * layout.attackScale,
  )
  const skillSize = Math.max(
    COMBAT_BUTTON_SIZES.minTouchTarget,
    COMBAT_BUTTON_SIZES.skill * layout.skillScale,
  )
  const ultimateSize = Math.max(
    COMBAT_BUTTON_SIZES.minTouchTarget,
    COMBAT_BUTTON_SIZES.ultimate * layout.ultimateScale,
  )
  const gap = Math.max(MIN_BUTTON_GAP_PX, attackSize * layout.clusterGapRatio)
  const width = skillSize * 3 + ultimateSize + gap * 3
  const height = Math.max(skillSize, ultimateSize) + gap + attackSize

  return { attackSize, skillSize, ultimateSize, gap, width, height }
}

export function layoutCssVars(
  layout: CombatUILayout = DEFAULT_COMBAT_UI_LAYOUT,
): Record<string, string> {
  const joystickSize = 120 * layout.joystickScale
  const metrics = resolveCombatClusterMetrics(layout)

  return {
    '--combat-dead-zone': String(layout.deadZone),
    '--combat-joystick-x': `${layout.joystickAnchorXPercent}%`,
    '--combat-joystick-y': `${layout.joystickAnchorYPercent}%`,
    '--combat-joystick-size': `${joystickSize}px`,
    '--combat-joystick-touch-scale': String(layout.joystickTouchAreaScale),
    '--combat-attack-size': `${metrics.attackSize}px`,
    '--combat-skill-size': `${metrics.skillSize}px`,
    '--combat-ultimate-size': `${metrics.ultimateSize}px`,
    '--combat-cluster-gap': `${metrics.gap}px`,
    '--combat-cluster-width': `${metrics.width}px`,
    '--combat-cluster-height': `${metrics.height}px`,
    '--combat-inset-left': `${layout.leftInset}px`,
    '--combat-inset-right': `${layout.rightInset}px`,
    '--combat-inset-bottom': `${layout.bottomInset}px`,
    '--combat-hud-vitals-scale': String(layout.hudVitalsScale),
    '--combat-hud-stage-scale': String(layout.hudStageScale),
  }
}
