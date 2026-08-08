import { applyCombatFacingFromMovement } from './combatFacing'
import { isControlLocked } from './combatReaction'
import type { RealtimeBattleStage } from './stageConfig'
import type { Direction8, RealtimeBattleEntity, Vec2 } from './types'

/**
 * ระบบเดินของห้องต่อสู้ — pure ทั้งไฟล์ ไม่มีอะไรผูกกับ React หรือ DOM
 *
 * ลำดับตามสเปกข้อ 11:
 *   Input Vector → Normalize → Apply Speed → Resolve Collision → Clamp Arena Bounds
 *   → Update Facing → Idle / Walk Animation
 */

/** ค่าต่ำสุดที่ถือว่าผู้เล่น "ตั้งใจเดิน" — กัน drift จากจอยสติกที่ไม่กลับศูนย์เป๊ะ */
const INPUT_DEADZONE = 0.12

export function normalizeVector(vector: Vec2): Vec2 {
  const length = Math.hypot(vector.x, vector.y)
  if (length < INPUT_DEADZONE) return { x: 0, y: 0 }
  // เดินเฉียงต้องไม่เร็วกว่าเดินตรง — ตัดที่ความยาว 1 เสมอ
  if (length <= 1) return { x: vector.x, y: vector.y }
  return { x: vector.x / length, y: vector.y / length }
}

/** แปลงเวกเตอร์เป็นทิศ 8 ทาง — คืน null เมื่อไม่ได้เดิน (คงทิศเดิมไว้) */
export function directionFromVector(vector: Vec2): Direction8 | null {
  if (Math.hypot(vector.x, vector.y) < INPUT_DEADZONE) return null

  // y ของ runtime ชี้ลงล่างของจอ จึงกลับเครื่องหมายก่อนคิดมุมแบบคณิตศาสตร์ปกติ
  const angle = Math.atan2(-vector.y, vector.x)
  const octant = Math.round((angle * 4) / Math.PI)
  const table: Record<number, Direction8> = {
    0: 'right',
    1: 'up-right',
    2: 'up',
    3: 'up-left',
    4: 'left',
    [-1]: 'down-right',
    [-2]: 'down',
    [-3]: 'down-left',
    [-4]: 'left',
  }
  return table[octant] ?? 'down'
}

/** ดันตำแหน่งให้อยู่ในห้องเสมอ โดยเผื่อรัศมีตัวละครไว้ด้วย */
export function clampToArena(position: Vec2, radius: number, stage: RealtimeBattleStage): Vec2 {
  return {
    x: Math.min(Math.max(position.x, radius), stage.width - radius),
    y: Math.min(Math.max(position.y, radius), stage.height - radius),
  }
}

/**
 * ดันสองวงกลมที่ทับกันให้แยกออกจากกัน
 *
 * ใช้กับ "ผู้เล่นชนศัตรู" และ "ศัตรูชนกันเอง" (§21) — ตัวที่ถูกดันคือ `mover`
 * เท่านั้น ตัวตั้งอยู่กับที่ ทำให้ผลลัพธ์ไม่ขึ้นกับลำดับการเรียกภายในหนึ่ง tick
 */
export function resolveCircleOverlap(
  mover: Vec2,
  moverRadius: number,
  other: Vec2,
  otherRadius: number,
): Vec2 {
  const dx = mover.x - other.x
  const dy = mover.y - other.y
  const minDistance = moverRadius + otherRadius
  const distance = Math.hypot(dx, dy)

  if (distance >= minDistance) return mover

  // ซ้อนกันสนิทพอดี (distance = 0) ไม่มีทิศให้ดัน — ดันขึ้นบนไว้ก่อนแบบคงที่
  if (distance === 0) return { x: mover.x, y: mover.y - minDistance }

  const push = (minDistance - distance) / distance
  return { x: mover.x + dx * push, y: mover.y + dy * push }
}

export interface MovementContext {
  stage: RealtimeBattleStage
  /** หน่วยอื่นที่กันทางอยู่ (ยังไม่ตาย) */
  blockers: RealtimeBattleEntity[]
}

/**
 * เดินหนึ่ง tick — แก้ค่าใน entity โดยตรง (mutable ตามสถาปัตยกรรมของ runtime)
 *
 * คืน true เมื่อมีการขยับจริง เพื่อให้ผู้เรียกตัดสินใจเรื่องสถานะ walk/idle ได้
 */
export function stepMovement(
  entity: RealtimeBattleEntity,
  inputVector: Vec2,
  deltaMs: number,
  { stage, blockers }: MovementContext,
): boolean {
  if (isControlLocked(entity)) {
    entity.velocity = { x: 0, y: 0 }
    return false
  }

  const direction = normalizeVector(inputVector)
  if (direction.x === 0 && direction.y === 0) {
    entity.velocity = { x: 0, y: 0 }
    return false
  }

  const maxStepMs = 50
  let remainingMs = deltaMs
  let currentPos = { ...entity.position }

  entity.velocity = { x: direction.x * entity.speed, y: direction.y * entity.speed }

  while (remainingMs > 0) {
    const stepMs = Math.min(remainingMs, maxStepMs)
    remainingMs -= stepMs

    const deltaSeconds = stepMs / 1000
    let next: Vec2 = {
      x: currentPos.x + entity.velocity.x * deltaSeconds,
      y: currentPos.y + entity.velocity.y * deltaSeconds,
    }

    for (const blocker of blockers) {
      if (blocker.id === entity.id || blocker.state === 'dead') continue
      next = resolveCircleOverlap(
        next,
        entity.collisionRadius,
        blocker.position,
        blocker.collisionRadius,
      )
    }

    currentPos = clampToArena(next, entity.collisionRadius, stage)
  }

  entity.position = currentPos

  const facing = directionFromVector(direction)
  if (facing) entity.facing = facing

  applyCombatFacingFromMovement(entity, direction)

  return true
}
