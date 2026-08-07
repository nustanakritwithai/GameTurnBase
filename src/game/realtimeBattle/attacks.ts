import { BASELINE_HITSTUN_MS, MOB_TELEGRAPH_MS } from './combatBaselines'

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

export type MovePhase = 'cast' | 'startup' | 'active' | 'recovery'

export type MoveEffectKind = 'damage' | 'heal' | 'buff' | 'debuff' | 'cc' | 'summon'

export interface MoveEffect {
  kind: MoveEffectKind
  target:
    'self' | 'singleEnemy' | 'nearestEnemy' | 'allEnemies' | 'singleAlly' | 'allAllies' | 'aoe'
  amount?: number
  buffId?: string
  durationMs?: number
  ccType?: 'stun' | 'slow' | 'root' | 'silence'
  summonEntityId?: string
  summonMaxActive?: number
  summonDurationMs?: number
}

export interface PhaseOverride {
  interruptible?: boolean
  movementDuringCast?: 'none' | 'reduced' | 'full'
}

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

  /** Blueprint §3.6.7 — per-move default; phaseOverrides when phases differ */
  interruptible?: boolean
  phaseOverrides?: Partial<Record<MovePhase, PhaseOverride>>
  hitstunMs?: number
  knockdown?: boolean
  /** Required on moves with knockdown=true — duration not globally locked (P4 framework) */
  knockdownMs?: number
  /** Enemy/boss wind-up before startup (§3.6.8) */
  telegraphMs?: number
  /** Optional non-damage outcomes (#47 architecture — runtime deferred until needed) */
  effects?: MoveEffect[]
}

export function resolveHitstunMs(attack: AttackDefinition): number {
  return attack.hitstunMs ?? BASELINE_HITSTUN_MS
}

export function resolveTelegraphMs(attack: AttackDefinition): number {
  return attack.telegraphMs ?? MOB_TELEGRAPH_MS
}

export function isMoveInterruptible(attack: AttackDefinition, phase: MovePhase): boolean {
  const override = attack.phaseOverrides?.[phase]?.interruptible
  if (override !== undefined) return override
  return attack.interruptible ?? true
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
    hitstunMs: BASELINE_HITSTUN_MS,
    interruptible: true,
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
    hitstunMs: BASELINE_HITSTUN_MS,
    interruptible: true,
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
    hitstunMs: BASELINE_HITSTUN_MS,
    interruptible: true,
    knockdown: false,
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
  interruptible: true,
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
  interruptible: true,
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
  interruptible: true,
}

/** อัลติเมท — กระบวนทองคำรุนแรง (placeholder content, P3 framework) */
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
  interruptible: false,
  phaseOverrides: {
    cast: { interruptible: false },
    startup: { interruptible: false },
    active: { interruptible: true },
    recovery: { interruptible: true },
  },
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

/** ท่าโจมตีของศัตรู — จังหวะเดียวกับที่ EnemyAISystem ใช้ตัดสินใจ */
export const ENEMY_ATTACK: AttackDefinition = {
  id: 'enemy-melee',
  animationId: 'attack-1',
  startupMs: 320,
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
  telegraphMs: MOB_TELEGRAPH_MS,
  hitstunMs: BASELINE_HITSTUN_MS,
  interruptible: true,
  knockdown: false,
}

export function totalDurationMs(attack: AttackDefinition): number {
  return attack.startupMs + attack.activeMs + attack.recoveryMs
}

/** อยู่ในช่วงที่ hitbox มีผลจริงหรือยัง */
export function isActiveWindow(attack: AttackDefinition, sinceStartMs: number): boolean {
  return sinceStartMs >= attack.startupMs && sinceStartMs < attack.startupMs + attack.activeMs
}
