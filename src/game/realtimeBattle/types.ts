/**
 * ชนิดข้อมูลของห้องต่อสู้แบบ Real-time (2.5D side-down — Blueprint v3)
 *
 * ── ระบบพิกัด (ดู battleCoordinates.ts) ─────────────────
 * Runtime: x = ซ้าย–ขวา, y = depth หน้า–หลัง
 * World:   XZ plane — y runtime → world Z (depth)
 * ───────────────────────────────────────────────────────────
 */

import type { SkillSlot } from './skills'

export type BattleStatus = 'loading' | 'intro' | 'running' | 'victory' | 'defeat' | 'exiting'

export interface Vec2 {
  x: number
  y: number
}

export type Direction8 =
  'up' | 'up-right' | 'right' | 'down-right' | 'down' | 'down-left' | 'left' | 'up-left'

/** ทิศโจมตีพื้นฐาน — ซ้าย/ขวาเท่านั้น (Blueprint v3 P2) */
export type CombatFacing = 'left' | 'right'

export type EntityState = 'idle' | 'walk' | 'attack' | 'skill' | 'hit' | 'dead'

/** ช่องสกิล 1–3 (ultimate ใช้ gauge แยก — ดู ultimateGauge.ts) */
export type SkillCooldownSlot = 'skill1' | 'skill2' | 'skill3'

/** ฝ่ายของหน่วย — ใช้ตรวจว่า hitbox ทำอันตรายใครได้บ้าง */
export type EntityType = 'player' | 'enemy' | 'boss'

export interface RealtimeBattleEntity {
  id: string
  entityType: EntityType
  name: string
  position: Vec2
  velocity: Vec2
  facing: Direction8
  /** ทิศโจมตีซ้าย/ขวา — แยกจาก facing สำหรับสไปรต์เดิน (P2) */
  combatFacing: CombatFacing
  state: EntityState

  hp: number
  maxHp: number
  atk: number
  def: number
  /** หน่วยต่อวินาที (พิกัด runtime) */
  speed: number

  /** รัศมีกันชนกับตัวอื่นและกับขอบห้อง */
  collisionRadius: number
  /** รัศมีที่ถูกโจมตีโดน — แยกจาก collisionRadius และห้ามอิงขนาดภาพ PNG (§15) */
  hurtboxRadius: number

  attackCooldownRemainingMs: number
  skillCooldownsMs: Record<SkillCooldownSlot, number>
  /** 0–100 — เต็มแล้วใช้อัลติเมทได้ (Blueprint v3 P3) */
  ultimateGauge: number

  /** เวลา (elapsedMs ของ runtime) ที่ยังอยู่ยงคงกระพันจนถึง */
  invulnerableUntilMs: number
  hitStunRemainingMs: number

  /** id ตัวละครผู้เล่น (ดู src/game/characters.ts) — มีเฉพาะฝ่ายผู้เล่น */
  characterId?: string
  /** id แม่แบบศัตรู (ดู stageConfig.ts) — มีเฉพาะฝ่ายศัตรู */
  enemyId?: string
}

export interface DamageEvent {
  id: string
  targetId: string
  amount: number
  critical: boolean
  position: Vec2
  createdAtMs: number
}

export type BattleEffectKind = 'hit-spark' | 'skill-spin' | 'death' | 'spawn'

export interface BattleEffectEvent {
  id: string
  kind: BattleEffectKind
  position: Vec2
  createdAtMs: number
  durationMs: number
}

/**
 * ภาพนิ่งของสถานะห้องต่อสู้ที่ React อ่านได้
 *
 * ตัวนี้ถูกสร้างใหม่เฉพาะตอน publish (ไม่ใช่ทุกเฟรมจำลอง) — React ใช้แค่ค่าที่ HUD ต้องรู้
 * ส่วนตำแหน่งตัวละครที่ต้องลื่นทุกเฟรม อ่านตรงจาก runtime ผ่าน ref (ดู §8 ของสเปก)
 */
export interface RealtimeBattleSnapshot {
  stageId: string
  stageName: string
  status: BattleStatus
  elapsedMs: number

  player: RealtimeBattleEntity
  enemies: RealtimeBattleEntity[]

  currentWave: number
  totalWaves: number

  /** ช่องสกิลที่กำลังร่าย — null เมื่อไม่ได้ร่าย (สำหรับ UI state) */
  castingSkillSlot: SkillSlot | null

  damageEvents: DamageEvent[]
  effectEvents: BattleEffectEvent[]
}

/** ผลการต่อสู้ของระบบ real-time — แปลงเป็น contract เดิมด้วย BattleResultAdapter */
export interface RealtimeBattleResult {
  outcome: 'victory' | 'defeat'
  stageId: string
  stageName: string
  elapsedMs: number
  defeatedEnemyIds: string[]
  damageDealt: number
  damageTaken: number
  earnedExp: number
  earnedGold: number
  droppedItems: Array<{ itemId: string; quantity: number }>
  finishedAt: string
}
