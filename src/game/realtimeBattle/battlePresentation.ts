/**
 * Battlefield presentation baseline — spawn composition only (not combat balance).
 *
 * Normalized coordinates: x/depth in 0…1 over stage width/height.
 * Runtime y = depth (0 = back/far, 1 = front/near camera).
 */

export interface BattlePresentationConfig {
  /** Player horizontal start (left zone ~0.18–0.25). */
  playerStartXNorm: number
  /** Player depth baseline (mid-lower field, clear of bottom UI). */
  playerDepthNorm: number
  /** Enemy group anchor X (right zone ~0.72–0.80). */
  enemyGroupCenterXNorm: number
  /** Default enemy depth baseline. */
  centerDepthNorm: number
  /** Depth offset between formation slots (fraction of stage height). */
  enemyDepthSpacingNorm: number
  /** Horizontal offset between formation slots (fraction of stage width). */
  enemyHorizontalSpacingNorm: number
  /** Minimum center-to-center separation as multiple of combined collision radii. */
  minSpawnSeparationMul: number
  /** Visual breathing room while enemies crowd one target; does not enlarge hit/hurt boxes. */
  enemyCrowdSeparationMul: number
  /** Arena edge margin (fraction of width/height). */
  arenaMarginXNorm: number
  arenaMarginDepthNorm: number
}

/** Action-fighting arena composition — presentation starting values only. */
export const DEFAULT_BATTLE_PRESENTATION: BattlePresentationConfig = {
  playerStartXNorm: 0.22,
  playerDepthNorm: 0.58,
  enemyGroupCenterXNorm: 0.76,
  centerDepthNorm: 0.55,
  enemyDepthSpacingNorm: 0.09,
  enemyHorizontalSpacingNorm: 0.045,
  minSpawnSeparationMul: 1.25,
  enemyCrowdSeparationMul: 1.55,
  arenaMarginXNorm: 0.05,
  arenaMarginDepthNorm: 0.08,
}
