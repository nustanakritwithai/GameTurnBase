/**
 * นิยามท่าโจมตีทั้งหมด — แหล่งความจริงจุดเดียว (§13)
 *
 * ค่าจังหวะทุกตัวอยู่ในไฟล์นี้ไฟล์เดียว ห้ามกระจายไปเขียนใน component หรือใน system
 * เพราะการปรับสมดุลการต่อสู้คือการแก้ตัวเลขพวกนี้ ถ้ามันกระจายอยู่ห้าที่ จะปรับไม่ได้จริง
 *
 * ── ทำไม damage ต้องเกิดที่ active frame ─────────────────────
 * สเปกข้อ 13 ห้ามให้ดาเมจเกิดทันทีที่กดปุ่ม ท่าหนึ่งจึงมีสามช่วง:
 *   startup  = เงื้อ (ยังไม่โดน) → ผู้เล่นฝ่ายตรงข้ามมีเวลาหลบ
 *   active   = ช่วงที่ hitbox มีอยู่จริง (โดนได้เฉพาะช่วงนี้)
 *   recovery = ชักท่ากลับ (ยังสั่งท่าใหม่ไม่ได้)
 * ────────────────────────────────────────────────────────────
 */

import type { EffectDefinition } from './EffectsSystem'
import type { MovePhaseOverrides } from './combatMoveSchema'

export interface AttackDefinition {
  id: string
  /** ชุดเฟรมที่จะเล่น (ดู src/game/battleSpriteSequences.ts) */
  animationId: 'attack-1' | 'attack-2' | 'attack-3' | 'skill-1'

  startupMs: number
  activeMs: number
  recoveryMs: number

  /** ช่วงเวลาที่รับอินพุตท่าถัดไปได้ นับจากเริ่มท่า */
  comboWindowStartMs: number
  comboWindowEndMs: number

  damageMultiplier: number
  /** ระยะจากกึ่งกลางตัวผู้โจมตีถึงขอบนอกของ hitbox */
  range: number
  /**
   * รูปทรง hitbox
   * - horizontal: โจมตีซ้าย/ขวา + depth tolerance (P2 basic attack)
   * - radial: กรวย/รอบตัว (สกิล — ยังใช้ arcDegrees)
   */
  hitShape: 'horizontal' | 'radial'
  /** ความกว้างของกรวยโจมตี (องศา) — ใช้เมื่อ hitShape = radial */
  arcDegrees: number
  /** ระยะ depth ที่ยังโดนได้ (runtime y) — ใช้เมื่อ hitShape = horizontal */
  depthTolerance: number
  knockback: number
  /**
   * ล็อกเป้าหมายที่ใกล้สุดตอนเริ่มร่าย แล้วคงเป้านั้นไว้ตลอดช่วง active window เดียว
   * (ระบบ #8 Skill-Targeting) — ไม่ใส่ = พฤติกรรมเดิม (กวาด hitShape ตามปกติ)
   */
  targetLock?: 'nearest'
  /**
   * เอฟเฟกต์ที่ไม่ใช่ดาเมจ (heal/buff/cc/summon) — ระบบ #7 Effects System
   * ไม่ใส่ = ท่าดาเมจล้วน พฤติกรรมเดิมทุกประการ (ดู EffectsSystem.ts)
   */
  effects?: EffectDefinition[]
  /**
   * ท่านี้ทำ Knockdown ได้ (§3.6.12: elite/boss + heavy move/combo finisher) — DamageSystem
   * เป็นคนเช็คว่าเป้าหมาย eligible ไหม (tier elite/entityType boss) ไม่ใช่ท่านี้เอง
   * ไม่ใส่ = ท่าปกติ ไม่ทำ knockdown (พฤติกรรมเดิม)
   */
  knockdown?: boolean

  /** Wind-up before startup — enemy telegraph (ms). Default 0 for player attacks. */
  telegraphMs?: number
  /** Stun applied to target — default 200ms baseline. */
  hitstunMs?: number
  /** Knockdown / getUp durations (ms) — defaults from COMBAT_DEFAULTS. */
  knockdownMs?: number
  getUpMs?: number
  /** Default true — false for ultimate setup etc. */
  interruptible?: boolean
  phaseOverrides?: MovePhaseOverrides
  /** Multi-hit active window slices (ultimate). */
  strikeCount?: number
}

/**
 * คอมโบสามไม้ของผู้เล่น (§14)
 *
 * ไม้ที่สามแรงและกระเด็นไกลกว่าสองไม้แรกชัดเจน เพื่อให้การต่อคอมโบจนจบมีรางวัลจริง
 * ไม่ใช่แค่ตีเร็วขึ้น และ recovery ของไม้สามยาวกว่าเพื่อไม่ให้วนคอมโบไม่รู้จบ
 */
export const PLAYER_ATTACK_CHAIN: AttackDefinition[] = [
  {
    id: 'monkey-attack-1',
    animationId: 'attack-1',
    startupMs: 110,
    activeMs: 90,
    recoveryMs: 180,
    comboWindowStartMs: 110,
    comboWindowEndMs: 700,
    damageMultiplier: 1,
    range: 120,
    hitShape: 'horizontal',
    arcDegrees: 0,
    depthTolerance: 95,
    knockback: 60,
    hitstunMs: 200,
  },
  {
    id: 'monkey-attack-2',
    animationId: 'attack-2',
    startupMs: 100,
    activeMs: 90,
    recoveryMs: 190,
    comboWindowStartMs: 100,
    comboWindowEndMs: 700,
    damageMultiplier: 1.15,
    range: 128,
    hitShape: 'horizontal',
    arcDegrees: 0,
    depthTolerance: 100,
    knockback: 80,
  },
  {
    id: 'monkey-attack-3',
    animationId: 'attack-3',
    startupMs: 150,
    activeMs: 120,
    recoveryMs: 320,
    // ไม้สุดท้ายไม่มีหน้าต่างต่อคอมโบ — จบคอมโบแล้วต้องเริ่มใหม่
    comboWindowStartMs: 0,
    comboWindowEndMs: 0,
    damageMultiplier: 1.55,
    range: 150,
    hitShape: 'horizontal',
    arcDegrees: 0,
    depthTolerance: 105,
    knockback: 210,
    // ไม้จบคอมโบ = combo finisher ตาม §3.6.12 (knockdown เฉพาะเป้าหมาย elite/boss เท่านั้น)
    knockdown: true,
    hitstunMs: 200,
  },
]

/**
 * ค่าจังหวะของระบบคอมโบ — อยู่ที่เดียว ห้าม hard-code กระจายหลายไฟล์ (§14)
 *
 * comboResetMs  : ปล่อยนานเกินนี้หลังจบท่า คอมโบรีเซ็ตกลับไม้แรก (สเปกแนะนำ 650–800)
 * inputBufferMs : กดก่อนท่าปัจจุบันจบได้เท่านี้ แล้วระบบจะจำไว้ยิงต่อให้ (แนะนำ 120–180)
 * hitStopMs     : หยุดเวลาแวบหนึ่งตอนโดน ให้รู้สึกว่าหมัดมีน้ำหนัก (แนะนำ 40–70)
 */
export const COMBO_CONFIG = {
  comboResetMs: 700,
  inputBufferMs: 160,
  hitStopMs: 55,
} as const

/**
 * สกิลหมุนกระบวนทองคำของหงอคง — Skill 1 (Blueprint v3 P3)
 *
 * โจมตีรอบตัว 360° ช่วง active ยาวกว่าคอมโบไม้เดียว — ศัตรูแต่ละตัวโดนได้ครั้งเดียวต่อการร่าย
 * damageMultiplier สูงกว่าไม้สามของคอมโบเล็กน้อย เพื่อให้คูลดาวน์ 8 วินาทีคุ้มค่า
 */
export const MONKEY_SPINNING_STAFF: AttackDefinition = {
  id: 'monkey-spinning-staff',
  animationId: 'skill-1',
  startupMs: 180,
  activeMs: 420,
  recoveryMs: 520,
  comboWindowStartMs: 0,
  comboWindowEndMs: 0,
  damageMultiplier: 1.65,
  range: 158,
  hitShape: 'radial',
  arcDegrees: 360,
  depthTolerance: 0,
  knockback: 140,
}

/** สกิล 2 — พุ่งไม้เท้าแนวนอน (placeholder content, P3 framework) */
export const MONKEY_STAFF_THRUST: AttackDefinition = {
  id: 'monkey-staff-thrust',
  animationId: 'attack-2',
  startupMs: 140,
  activeMs: 100,
  recoveryMs: 360,
  comboWindowStartMs: 0,
  comboWindowEndMs: 0,
  damageMultiplier: 1.35,
  range: 145,
  hitShape: 'horizontal',
  arcDegrees: 0,
  depthTolerance: 92,
  knockback: 120,
}

/** สกิล 3 — กวาดไม้กว้าง (placeholder content, P3 framework) */
export const MONKEY_STAFF_SWEEP: AttackDefinition = {
  id: 'monkey-staff-sweep',
  animationId: 'attack-3',
  startupMs: 160,
  activeMs: 130,
  recoveryMs: 400,
  comboWindowStartMs: 0,
  comboWindowEndMs: 0,
  damageMultiplier: 1.5,
  range: 138,
  hitShape: 'horizontal',
  arcDegrees: 0,
  depthTolerance: 110,
  knockback: 160,
}

/**
 * อัลติเมท — กระบวนทองคำรุนแรง (placeholder content, P3 framework)
 *
 * targetLock: 'nearest' — ล็อกศัตรูที่ใกล้สุดตอนเริ่มร่าย คงเป้านั้นไว้ตลอด active window
 * เดียวที่มีตอนนี้ (ระบบ #8, ดู docs/agent-blueprint/08-skill-targeting-system.md)
 */
export const MONKEY_GOLDEN_FURY: AttackDefinition = {
  id: 'monkey-golden-fury',
  animationId: 'skill-1',
  startupMs: 220,
  activeMs: 520,
  recoveryMs: 620,
  comboWindowStartMs: 0,
  comboWindowEndMs: 0,
  damageMultiplier: 2.4,
  range: 175,
  hitShape: 'radial',
  arcDegrees: 360,
  depthTolerance: 0,
  knockback: 200,
  targetLock: 'nearest',
  interruptible: false,
  phaseOverrides: {
    telegraph: { interruptible: false },
    startup: { interruptible: false },
    active: { interruptible: false },
    recovery: { interruptible: true },
  },
  strikeCount: 4,
}

/** ค่าจังหวะของสกิล (Blueprint v3 P3) — อยู่ที่เดียว ห้าม hard-code กระจายหลายไฟล์ */
export const SKILL_CONFIG = {
  skill1CooldownMs: 8000,
  skill2CooldownMs: 6000,
  skill3CooldownMs: 10000,
  /** i-frame ช่วงเปิดท่า — สั้นกว่าเวลาร่ายทั้งหมด ไม่ให้รอดฟรีตลอดท่า */
  invulnerableMs: 280,
  ultimateInvulnerableMs: 420,
} as const

/** ท่าโจมตีม็อบ — telegraph ก่อน startup/active/recovery */
export const ENEMY_ATTACK_MELEE: AttackDefinition = {
  id: 'enemy-melee',
  animationId: 'attack-1',
  telegraphMs: 280,
  startupMs: 120,
  activeMs: 140,
  recoveryMs: 420,
  comboWindowStartMs: 0,
  comboWindowEndMs: 0,
  damageMultiplier: 1,
  range: 110,
  hitShape: 'horizontal',
  arcDegrees: 0,
  depthTolerance: 88,
  knockback: 90,
  hitstunMs: 200,
}

/** ท่า elite — ช้ากว่าเล็กน้อย ล้มได้ */
export const ENEMY_ATTACK_ELITE: AttackDefinition = {
  id: 'enemy-elite-slam',
  animationId: 'attack-1',
  telegraphMs: 340,
  startupMs: 160,
  activeMs: 160,
  recoveryMs: 480,
  comboWindowStartMs: 0,
  comboWindowEndMs: 0,
  damageMultiplier: 1.25,
  range: 118,
  hitShape: 'horizontal',
  arcDegrees: 0,
  depthTolerance: 92,
  knockback: 120,
  hitstunMs: 240,
  knockdown: true,
}

/** @deprecated Use ENEMY_ATTACK_MELEE — kept for imports */
export const ENEMY_ATTACK = ENEMY_ATTACK_MELEE

/** Boss attack rows — telegraphMs 800–1200ms baseline (§3.6.12) */
export const SPIRIT_GUARDIAN_BOSS_PHASE_1_ATTACKS: AttackDefinition[] = [
  {
    ...ENEMY_ATTACK_MELEE,
    id: 'sgb-phase1-strike',
    telegraphMs: 900,
    damageMultiplier: 1.1,
    range: 118,
  },
  {
    ...ENEMY_ATTACK_MELEE,
    id: 'sgb-phase1-sweep',
    telegraphMs: 1000,
    damageMultiplier: 1.05,
    range: 130,
    hitShape: 'radial',
    arcDegrees: 120,
  },
]

export const SPIRIT_GUARDIAN_BOSS_PHASE_2_ATTACKS: AttackDefinition[] = [
  {
    ...ENEMY_ATTACK_ELITE,
    id: 'sgb-phase2-slam',
    telegraphMs: 850,
    damageMultiplier: 1.35,
    range: 128,
    knockdown: true,
  },
  {
    ...ENEMY_ATTACK_ELITE,
    id: 'sgb-phase2-burst',
    telegraphMs: 1100,
    damageMultiplier: 1.2,
    range: 140,
    hitShape: 'radial',
    arcDegrees: 180,
  },
]

export const ENEMY_ATTACKS: Record<string, AttackDefinition> = {
  'enemy-melee': ENEMY_ATTACK_MELEE,
  'enemy-elite-slam': ENEMY_ATTACK_ELITE,
}

export function getEnemyAttackById(attackId: string): AttackDefinition {
  return ENEMY_ATTACKS[attackId] ?? ENEMY_ATTACK_MELEE
}

import { attackTotalDurationMs, isFullMoveActiveWindow } from './combatMoveSchema'

export function totalDurationMs(attack: AttackDefinition): number {
  return attackTotalDurationMs(attack)
}

/** อยู่ในช่วงที่ hitbox มีผลจริงหรือยัง */
export function isActiveWindow(attack: AttackDefinition, sinceStartMs: number): boolean {
  return isFullMoveActiveWindow(attack, sinceStartMs)
}
