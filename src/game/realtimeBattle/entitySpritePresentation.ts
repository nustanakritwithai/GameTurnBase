/**
 * Battle sprite presentation constants — presentation only, not gameplay.
 * Camera tuning must never change these values.
 *
 * Visual stack: battlePosition → worldPosition → spriteVisualOffset → renderedSprite
 * Gameplay coordinates and hitboxes stay on battle ground; only the mesh shifts.
 */

import type { CharacterModelKind } from '../characters'

export const ENTITY_SPRITE_HEIGHT = 1.6
export const ENTITY_SPRITE_ASPECT = 1.2508
/** Fixed pitch lean toward elevated side-down camera (~18° framing baseline). */
export const ENTITY_SPRITE_PITCH_RAD = -0.38

/** Default visual offset (world Y) from battle ground to sprite foot anchor. Negative = pull mesh down. */
export const DEFAULT_SPRITE_GROUND_OFFSET_Y = -0.26

/**
 * Per-sheet foot calibration — tune from sprite sheet foot baseline, not battle Y.
 * Keeps feet aligned with shadow at y≈0 without moving gameplay position.
 */
export const SPRITE_GROUND_OFFSET_BY_KIND: Partial<Record<CharacterModelKind, number>> = {
  'monkey-king': -0.28,
  'pig-warrior': -0.25,
  'pilgrim-monk': -0.24,
}

/** Shadow disc radius at battle ground (not sprite center). */
export const ENTITY_SPRITE_SHADOW_RADIUS = 0.34

/**
 * Source-sheet calibration measured from the shipped WebP alpha bounds.
 *
 * The battle plane used to stay the same size for every texture. That makes a
 * 640×512 walk sheet render much smaller than a 396×376 idle sheet even when
 * the character occupies roughly the same number of source pixels. Keep one
 * world-space pixel density per asset family instead, and account for the
 * transparent pixels below the feet separately.
 */
interface SpriteSheetCalibration {
  pathFragment: string
  canvasWidth: number
  canvasHeight: number
  /** Family-specific source pixels that equal one canonical world-space height. */
  pixelsPerCanonicalHeight: number
  /** Average transparent rows below the feet for this animation family. */
  bottomInsetPx: number
}

const CANONICAL_CANVAS_HEIGHT = 376

const SPRITE_SHEET_CALIBRATIONS: readonly SpriteSheetCalibration[] = [
  {
    pathFragment: '/characters/walk/monkey-walk-',
    canvasWidth: 640,
    canvasHeight: 512,
    // Alpha scan: 299.55px average visible height vs idle's fixed 324px.
    pixelsPerCanonicalHeight: 348,
    bottomInsetPx: 62,
  },
  {
    pathFragment: '/characters/walk/pigsy-walk-',
    canvasWidth: 640,
    canvasHeight: 512,
    // Alpha scan: 326.34px average visible height vs idle's ~330px.
    pixelsPerCanonicalHeight: 372,
    bottomInsetPx: 39,
  },
  {
    pathFragment: '/characters/monkey-v2-idle-',
    canvasWidth: 396,
    canvasHeight: 376,
    pixelsPerCanonicalHeight: CANONICAL_CANVAS_HEIGHT,
    bottomInsetPx: 11,
  },
  {
    pathFragment: '/characters/pigsy-idle-',
    canvasWidth: 396,
    canvasHeight: 376,
    pixelsPerCanonicalHeight: CANONICAL_CANVAS_HEIGHT,
    bottomInsetPx: 15,
  },
  {
    pathFragment: '/characters/tripitaka-idle-',
    canvasWidth: 396,
    canvasHeight: 376,
    pixelsPerCanonicalHeight: CANONICAL_CANVAS_HEIGHT,
    bottomInsetPx: 11,
  },
  {
    pathFragment: '/characters/monkey-attack-new-',
    canvasWidth: 1200,
    canvasHeight: 960,
    // Alpha scan normalizes the family average while preserving pose-to-pose variation.
    pixelsPerCanonicalHeight: 663,
    bottomInsetPx: 171,
  },
  {
    pathFragment: '/characters/monkey-v2-',
    canvasWidth: 640,
    canvasHeight: 512,
    pixelsPerCanonicalHeight: 401,
    bottomInsetPx: 34,
  },
  {
    pathFragment: '/characters/pigsy-team-',
    canvasWidth: 640,
    canvasHeight: 512,
    pixelsPerCanonicalHeight: 389,
    bottomInsetPx: 37,
  },
  {
    pathFragment: '/characters/monkey-pose-',
    canvasWidth: 627,
    canvasHeight: 627,
    pixelsPerCanonicalHeight: 548,
    bottomInsetPx: 87,
  },
] as const

const DEFAULT_SHEET_CALIBRATION: SpriteSheetCalibration = {
  pathFragment: '',
  canvasWidth: 396,
  canvasHeight: 376,
  pixelsPerCanonicalHeight: CANONICAL_CANVAS_HEIGHT,
  bottomInsetPx: 0,
}

export interface SpriteMeshPresentation {
  scaleX: number
  scaleY: number
  centerY: number
}

export function resolveSpriteGroundOffsetY(kind: CharacterModelKind): number {
  return SPRITE_GROUND_OFFSET_BY_KIND[kind] ?? DEFAULT_SPRITE_GROUND_OFFSET_Y
}

function resolveSheetCalibration(frameUrl: string): SpriteSheetCalibration {
  return (
    SPRITE_SHEET_CALIBRATIONS.find((calibration) => frameUrl.includes(calibration.pathFragment)) ??
    DEFAULT_SHEET_CALIBRATION
  )
}

/**
 * Resolve per-frame mesh scale and center without touching battle coordinates.
 * Family calibration prevents Idle→Walk size jumps while retaining natural
 * pose-to-pose variation; aspect correction prevents 396×376 idle art being
 * stretched to 640×512.
 */
export function resolveSpriteMeshPresentation(
  kind: CharacterModelKind,
  frameUrl: string,
): SpriteMeshPresentation {
  const sheet = resolveSheetCalibration(frameUrl)
  const scaleY = sheet.canvasHeight / sheet.pixelsPerCanonicalHeight
  const sourceAspect = sheet.canvasWidth / sheet.canvasHeight
  const scaleX = scaleY * (sourceAspect / ENTITY_SPRITE_ASPECT)
  const bottomInsetRatio = sheet.bottomInsetPx / sheet.canvasHeight
  const visibleBottomLocalY = ENTITY_SPRITE_HEIGHT * (bottomInsetRatio - 0.5)
  const centerY =
    resolveSpriteGroundOffsetY(kind) -
    visibleBottomLocalY * scaleY * Math.cos(Math.abs(ENTITY_SPRITE_PITCH_RAD))

  return { scaleX, scaleY, centerY }
}

/**
 * Mesh center Y so the foot anchor sits on battle ground after pitch rotation.
 * Pitch tilts the plane backward; compensate so feet stay on shadow/ground.
 */
export function resolveSpriteMeshCenterY(kind: CharacterModelKind): number {
  const groundOffsetY = resolveSpriteGroundOffsetY(kind)
  const pitchCompensation =
    (ENTITY_SPRITE_HEIGHT / 2) * (1 - Math.cos(Math.abs(ENTITY_SPRITE_PITCH_RAD)))
  return ENTITY_SPRITE_HEIGHT / 2 + groundOffsetY - pitchCompensation
}
