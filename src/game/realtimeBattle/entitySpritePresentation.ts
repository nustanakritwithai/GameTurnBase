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
  /*
     เอ้อหลางเสินยังไม่ได้จูนด้วยตาบนเครื่องจริง จึงประกาศค่า default ไว้ตรง ๆ ให้รู้ว่า
     "ดูแล้วและยังไม่ได้ขยับ" ไม่ใช่ "ลืมลงทะเบียน" — ค่านี้ถูกหักล้างที่ container อยู่แล้ว
     (resolveTemporaryEntityContainerLiftY) ตำแหน่งที่เห็นจริงจึงยังไม่เปลี่ยนไม่ว่าใส่เท่าไหร่
     ระยะเท้าจริงต่อชีตอยู่ที่ bottomInsetPx ใน SPRITE_SHEET_CALIBRATIONS ด้านล่างแทน
  */
  'spear-warrior': DEFAULT_SPRITE_GROUND_OFFSET_Y,
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
export interface SpriteSheetCalibration {
  pathFragment: string
  canvasWidth: number
  canvasHeight: number
  /** Family-specific source pixels that equal one canonical world-space height. */
  pixelsPerCanonicalHeight: number
  /** Average transparent rows below the feet for this animation family. */
  bottomInsetPx: number
}

const CANONICAL_CANVAS_HEIGHT = 376

/**
 * Exported for `src/game/spriteContract.test.ts`, which checks every row's declared canvas
 * against the shipped files and gates that no consumer draws an unregistered family.
 * Read it, never mutate it — this is the source of truth for `E3` in the design lock.
 */
export const SPRITE_SHEET_CALIBRATIONS: readonly SpriteSheetCalibration[] = [
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
  /*
     Turnaround sets — 8 single-frame directions, drawn from the same reference as each
     character's idle sheet. Registered 2026-08-11 because two consumers outside the battle
     scene draw them (`AdventureScene/WukongAdventure.tsx` for standing-and-facing,
     `LobbyScene` via `spriteSequences.turnUrls`), and without a row they fell to the
     396x376 default — which is silently 15% wrong for erlang's 640x512 sheet.

     Each `pixelsPerCanonicalHeight` is `alpha-scan mean visible height x 376 / that
     character's own idle mean visible height`, the same rule the walk rows above use:
       monkey-turn               320.75 x 376/320 = 377
       pigsy-turn                322.38 x 376/330 = 367
       tripitaka-turn            335.75 x 376/311 = 406
       spear-warrior-stop-turn   252.00 x 376/320 = 296   (erlang normalises to 320 like
                                                           his other rows, so he stays the
                                                           tall god he is drawn as)
  */
  {
    pathFragment: '/characters/turnaround/monkey-turn-',
    canvasWidth: 396,
    canvasHeight: 376,
    pixelsPerCanonicalHeight: 377,
    bottomInsetPx: 23,
  },
  {
    pathFragment: '/characters/turnaround/pigsy-turn-',
    canvasWidth: 396,
    canvasHeight: 376,
    pixelsPerCanonicalHeight: 367,
    bottomInsetPx: 19,
  },
  {
    pathFragment: '/characters/turnaround/tripitaka-turn-',
    canvasWidth: 396,
    canvasHeight: 376,
    pixelsPerCanonicalHeight: 406,
    bottomInsetPx: 25,
  },
  {
    // Covers `spear-warrior-stop-turn-key-*` too — the key poses are frames of this set and
    // alpha-scan identically (visible height 252, inset 37 on every frame of both).
    pathFragment: '/characters/turnaround/spear-warrior-stop-turn-',
    canvasWidth: 640,
    canvasHeight: 512,
    pixelsPerCanonicalHeight: 296,
    bottomInsetPx: 37,
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
  /*
     เอ้อหลางเสิน — ทุกค่าด้านล่างวัดจากไฟล์ WebP ที่ชิปจริงด้วย alpha scan (sharp)
     ไม่ได้เดา: pixelsPerCanonicalHeight = ความสูงที่มองเห็นเฉลี่ย x 376/320 ซึ่งเป็นสัดส่วน
     เดียวกับที่ monkey-v2-idle (ชีตอ้างอิง 396x376) และ monkey-v2- ใช้อยู่ ทุกท่าจึงสูงเท่ากัน
     ไม่ให้ตัวโป่ง/ยุบตอนสลับท่า ถ้าไม่ลงทะเบียนตรงนี้จะตกไปใช้ default 396x376
     แล้วเรนเดอร์ผิดสเกลทันที เพราะชีตของเขาเป็น 640x512 (Skill 2 เป็น 800x640)
  */
  {
    pathFragment: '/characters/erlang-shen-v6-idle-',
    canvasWidth: 640,
    canvasHeight: 512,
    // Alpha scan: 370.0px visible height (คงที่ทั้ง 25 เฟรม)
    pixelsPerCanonicalHeight: 435,
    bottomInsetPx: 31,
  },
  {
    pathFragment: '/characters/erlang-shen-attack-v1-',
    canvasWidth: 640,
    canvasHeight: 512,
    // Alpha scan: 370.0px visible height (คงที่ทั้ง 18 เฟรม)
    pixelsPerCanonicalHeight: 435,
    bottomInsetPx: 31,
  },
  {
    pathFragment: '/characters/erlang-shen-normal-attack-v2-',
    canvasWidth: 640,
    canvasHeight: 512,
    // Alpha scan: 344.4px average visible height
    pixelsPerCanonicalHeight: 405,
    bottomInsetPx: 31,
  },
  {
    pathFragment: '/characters/erlang-shen-normal-attack-v3-final-',
    canvasWidth: 640,
    canvasHeight: 512,
    // Alpha scan: 354.6px average visible height
    pixelsPerCanonicalHeight: 417,
    bottomInsetPx: 28,
  },
  {
    pathFragment: '/characters/erlang-shen-skill-1-',
    canvasWidth: 640,
    canvasHeight: 512,
    // Alpha scan: 354.9px average visible height
    pixelsPerCanonicalHeight: 417,
    bottomInsetPx: 25,
  },
  {
    // ชีตร่าย Skill 2 ใหญ่กว่าท่าอื่น (800x640) — ต้องมีรายการของตัวเอง ไม่งั้นตัวจะโป่งตอนร่าย
    pathFragment: '/characters/erlang-shen-skill-2-cast-',
    canvasWidth: 800,
    canvasHeight: 640,
    // Alpha scan: 447.7px visible height (คงที่ทั้ง 6 เฟรม)
    pixelsPerCanonicalHeight: 526,
    bottomInsetPx: 119,
  },
  {
    /*
       Tripitaka's halo (`LobbyScene/CharacterModel.tsx`) — not a character body, so its
       "canonical height" is a placement choice rather than an alpha measurement: the halo is
       declared to span exactly one canonical character height, which is what it did before
       this row existed. What the row FIXES is the aspect: 1194x1317 is portrait, and the
       hand-typed 4.018 x 3.213 plane it used to render on is 1.2505 landscape — the art was
       stretched 37.9% wide. `bottomInsetPx` is its alpha-scanned 50.
    */
    pathFragment: '/characters/tripitaka-buddha-aura',
    canvasWidth: 1194,
    canvasHeight: 1317,
    pixelsPerCanonicalHeight: 1317,
    bottomInsetPx: 50,
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

/**
 * Temporary presentation-only lift applied to the visual container.
 *
 * The currently shipped sprite families were calibrated with a negative foot
 * target, which visibly sinks the art below the battle plane. Keep that legacy
 * sheet calibration untouched while new assets are pending, and cancel it at
 * the container boundary instead. The shadow and gameplay entity remain at
 * world Y=0.
 */
export function resolveTemporaryEntityContainerLiftY(kind: CharacterModelKind): number {
  return -resolveSpriteGroundOffsetY(kind)
}

function resolveSheetCalibration(frameUrl: string): SpriteSheetCalibration {
  return (
    SPRITE_SHEET_CALIBRATIONS.find((calibration) => frameUrl.includes(calibration.pathFragment)) ??
    DEFAULT_SHEET_CALIBRATION
  )
}

/** Rendered rect for one frame, in whatever unit the caller's `canonicalHeight` is in. */
export interface DerivedSpriteSize {
  width: number
  height: number
  /** Bottom edge of the rect up to the family's foot line — `E1`'s anchor, same units. */
  footInset: number
}

/**
 * `E3` of `docs/SPRITE-DESIGN-LOCK.md` — world size DERIVED from texture pixels.
 *
 * `canonicalHeight` is the caller's own px-to-unit conversion (Unity's `pixelsPerUnit`,
 * Godot's `pixel_size`) and belongs to the scene, not to the art: the battle plane passes
 * `ENTITY_SPRITE_HEIGHT`, the lobby passes world units, the adventure scene passes CSS px.
 * Everything else — aspect, size relative to the other families, and where the feet sit —
 * comes out of the calibration row, so a family drawn on a different canvas lands at the
 * same size on the same ground without anyone re-typing a number.
 *
 * A frame with no registered row falls back to the 396x376 default and silently renders at
 * the wrong scale; `spriteContract.test.ts` is what stops that reaching a player.
 */
export function deriveSpriteSize(frameUrl: string, canonicalHeight: number): DerivedSpriteSize {
  const sheet = resolveSheetCalibration(frameUrl)
  const height = (canonicalHeight * sheet.canvasHeight) / sheet.pixelsPerCanonicalHeight
  return {
    width: (height * sheet.canvasWidth) / sheet.canvasHeight,
    height,
    footInset: (height * sheet.bottomInsetPx) / sheet.canvasHeight,
  }
}

/**
 * Cache keyed by the exact (kind, frameUrl) pair this is a pure function of.
 *
 * Every sprite resolves its presentation once per rendered frame, and the
 * lookup above is a linear scan doing a substring test per calibration entry.
 * The set of frame URLs a battle can show is fixed by the shipped sprite
 * sheets, so the cache is bounded by the art, not by battle length.
 */
const presentationCache = new Map<string, SpriteMeshPresentation>()

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
  const cacheKey = `${kind}|${frameUrl}`
  const cached = presentationCache.get(cacheKey)
  if (cached) return cached

  const sheet = resolveSheetCalibration(frameUrl)
  const scaleY = sheet.canvasHeight / sheet.pixelsPerCanonicalHeight
  const sourceAspect = sheet.canvasWidth / sheet.canvasHeight
  const scaleX = scaleY * (sourceAspect / ENTITY_SPRITE_ASPECT)
  const bottomInsetRatio = sheet.bottomInsetPx / sheet.canvasHeight
  const visibleBottomLocalY = ENTITY_SPRITE_HEIGHT * (bottomInsetRatio - 0.5)
  const centerY =
    resolveSpriteGroundOffsetY(kind) -
    visibleBottomLocalY * scaleY * Math.cos(Math.abs(ENTITY_SPRITE_PITCH_RAD))

  const presentation: SpriteMeshPresentation = { scaleX, scaleY, centerY }
  presentationCache.set(cacheKey, presentation)
  return presentation
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
