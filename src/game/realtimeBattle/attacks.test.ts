import { describe, expect, it } from 'vitest'
import {
  ENEMY_ATTACK,
  MONKEY_GOLDEN_FURY,
  MONKEY_SPINNING_STAFF,
  MONKEY_STAFF_SWEEP,
  MONKEY_STAFF_THRUST,
  PLAYER_ATTACK_CHAIN,
  type AttackDefinition,
} from './attacks'

/**
 * เทสต์ชุดนี้ pin ไว้ตาม Done-criteria ของ
 * docs/agent-blueprint/05-per-move-property-schema.md — งานนี้เป็น compile-time
 * data contract ไม่ใช่ runtime system จึงเทสต์ "รูปทรงของสัญญา" ไม่ใช่ behavior
 *
 * ใช้ `import.meta.glob` ของ Vite อ่านซอร์สเป็นข้อความ ไม่ใช้ `node:fs` เพราะ
 * tsconfig.app.json ตั้งใจไม่ให้ชนิดข้อมูลของ Node เข้ามาในโค้ดฝั่งแอป
 * (แพทเทิร์นเดียวกับ battleAssets.test.ts)
 */

// ไฟล์ .ts อื่นทั้งหมดใน realtimeBattle/ (ไม่รวม attacks.ts เอง และไม่รวมเทสต์)
const OTHER_REALTIME_BATTLE_SOURCES = import.meta.glob('./*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

// ไฟล์ .ts/.tsx ทั้ง repo (ไม่รวมเทสต์) — สโคปกว้างกว่าเพื่อเช็ค done-criterion #5
const ALL_SRC_SOURCES = import.meta.glob('../../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function nonTestNonAttacksFiles(sources: Record<string, string>): [string, string][] {
  return Object.entries(sources).filter(
    ([path]) =>
      !path.endsWith('.test.ts') && !path.endsWith('.test.tsx') && !path.endsWith('/attacks.ts'),
  )
}

// Done-criterion #2 anchor: ฟิลด์ที่ "shipped" วันนี้ (required เสมอ + optional ที่มี
// consumer จริงแล้ว — เช่น targetLock ของระบบ #8 Skill-Targeting, ดู HitboxSystem.ts/
// SkillSystem.ts / HitboxSystem.ts). ฟิลด์ใหม่จาก §3.6.7 ที่ยังไม่มี consumer (interruptible,
// lungeDistance, hitstunMs, knockdown, effects[]) ต้องมากับ PR ของ consumer ที่อ่านมัน —
// castDelayMs / movementDuringCast / multiTarget shipped with SkillSystem + HitboxSystem consumers (PR #61 follow-up).
const REQUIRED_FIELDS = [
  'id',
  'animationId',
  'startupMs',
  'activeMs',
  'recoveryMs',
  'comboWindowStartMs',
  'comboWindowEndMs',
  'damageMultiplier',
  'range',
  'hitShape',
  'arcDegrees',
  'depthTolerance',
  'knockback',
] as const

// 'effects' added by system #7 (Effects System) — real consumer is EffectsSystem.ts,
// per this file's own note above requiring a consumer before a new optional field lands here.
// 'knockdown' added by system #10 (Elite/Mini-boss Tier System) — real consumer is
// DamageSystem.ts's applyDamage (knockdown gate) + EnemyAISystem.ts (knockdown/getup states).
const OPTIONAL_FIELDS = [
  'targetLock',
  'effects',
  'knockdown',
  'lungeDistance',
  // P4 combat core (upstream PR #29, reconciled into this repo's Tier-1 systems merge)
  'telegraphMs',
  'hitstunMs',
  'knockdownMs',
  'getUpMs',
  'interruptible',
  'phaseOverrides',
  'strikeCount',
  // Hero Kit + Skill/Cast + Hitbox consumers (§3.6.12 baseline, PR #61 follow-up)
  'castDelayMs',
  'movementDuringCast',
  'multiTarget',
] as const
const KNOWN_FIELDS: readonly string[] = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]

const ALL_SHIPPED_ATTACKS: AttackDefinition[] = [
  ...PLAYER_ATTACK_CHAIN,
  MONKEY_SPINNING_STAFF,
  MONKEY_STAFF_THRUST,
  MONKEY_STAFF_SWEEP,
  MONKEY_GOLDEN_FURY,
  ENEMY_ATTACK,
]

describe('AttackDefinition — schema shape (done-criteria #1, #2)', () => {
  it('ทุกท่าที่ shipped มีฟิลด์ required ครบ และไม่มีฟิลด์ที่ไม่รู้จัก (ไม่ใช่ required หรือ optional ที่ประกาศไว้)', () => {
    for (const attack of ALL_SHIPPED_ATTACKS) {
      const keys = Object.keys(attack)
      for (const required of REQUIRED_FIELDS) {
        expect(keys).toContain(required)
      }
      const unknown = keys.filter((key) => !KNOWN_FIELDS.includes(key))
      expect(unknown).toEqual([])
    }
  })

  it('ไม่มี interface/type ขนานที่นิยามฟิลด์จังหวะเดียวกันซ้ำในไฟล์อื่นของ realtimeBattle/', () => {
    // AttackDefinition ต้องเป็นแหล่งความจริงจุดเดียว — ไฟล์อื่นห้าม declare
    // interface/type ที่มีทั้ง startupMs และ damageMultiplier (ลายเซ็นเฉพาะของ move data)
    const offenders: string[] = []
    for (const [path, text] of nonTestNonAttacksFiles(OTHER_REALTIME_BATTLE_SOURCES)) {
      const declarations =
        text.match(
          /(?:interface|type)\s+\w+[\s\S]*?(?=\n(?:export\s+)?(?:interface|type|function|const)\s|\n\})/g,
        ) ?? []
      for (const decl of declarations) {
        if (/startupMs/.test(decl) && /damageMultiplier/.test(decl)) {
          offenders.push(path)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('AttackDefinition — hitShape union stays additive (done-criterion #4)', () => {
  it('ทุกท่าที่ shipped ใช้ hitShape ที่เป็นสมาชิกของ union ปัจจุบันเท่านั้น', () => {
    const knownShapes = new Set(['horizontal', 'radial'])
    for (const attack of ALL_SHIPPED_ATTACKS) {
      expect(knownShapes.has(attack.hitShape)).toBe(true)
    }
  })

  it('มีทั้งท่า horizontal และ radial อยู่จริง — ยืนยันว่า union ทั้งสองสมาชิกยังถูกใช้งาน', () => {
    const shapes = new Set(ALL_SHIPPED_ATTACKS.map((a) => a.hitShape))
    expect(shapes.has('horizontal')).toBe(true)
    expect(shapes.has('radial')).toBe(true)
  })
})

describe('Move data lives only in attacks.ts (done-criterion #5)', () => {
  it('ไม่มี timing/damage literal ของท่าโจมตีนอกไฟล์ attacks.ts ทั้ง repo', () => {
    // ตาม docstring ของไฟล์ attacks.ts เอง (บรรทัด 4-5): ค่าจังหวะทุกตัวต้องอยู่ไฟล์เดียว
    // pattern anchor ด้วยตัวเลขจริง ไม่ใช่แค่ bare key — ผ่าน re-export ที่ถูกกฎแบบ
    // EnemyAISystem.ts's `startupMs: ENEMY_ATTACK.startupMs` (อ่านจากแหล่งเดียว ไม่ hard-code)
    const dataFieldPattern =
      /\b(startupMs|activeMs|recoveryMs|comboWindowStartMs|comboWindowEndMs|damageMultiplier|knockback|arcDegrees|depthTolerance)\s*:\s*\d/

    const offenders = nonTestNonAttacksFiles(ALL_SRC_SOURCES)
      .filter(([, text]) => dataFieldPattern.test(text))
      .map(([path]) => path)

    expect(offenders).toEqual([])
  })
})

import { findHitTargets } from './HitboxSystem'
import { resolveEffect } from './EffectsSystem'
import { getMovePhase } from './combatMoveSchema'
import type { RealtimeBattleEntity } from './types'

function makeMockEntity(overrides: Partial<RealtimeBattleEntity> = {}): RealtimeBattleEntity {
  return {
    id: 'entity-1',
    entityType: 'enemy',
    name: 'Mock Unit',
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    facing: 'right',
    combatFacing: 'right',
    state: 'idle',
    hp: 100,
    maxHp: 100,
    atk: 50,
    def: 20,
    speed: 100,
    collisionRadius: 34,
    hurtboxRadius: 40,
    attackCooldownRemainingMs: 0,
    skillCooldownsMs: { skill1: 0, skill2: 0, skill3: 0 },
    ultimateGauge: 0,
    invulnerableUntilMs: 0,
    hitStunRemainingMs: 0,
    knockdownRemainingMs: 0,
    getUpRemainingMs: 0,
    combatTier: 'mob',
    ...overrides,
  }
}

describe('Per-Move Property Schema — Known Scars checks', () => {
  it('Scar 1: ยืนยันว่า HitboxSystem ตรวจจับและใช้ฟิลด์ range/geometry ของ AttackDefinition ต่างๆ อย่างเข้มงวดเมื่อเคลื่อนไหวหรือโจมตีกลางอากาศ (Jump-attack)', () => {
    const attacker = makeMockEntity({
      id: 'attacker',
      combatFacing: 'right',
      position: { x: 0, y: 0 },
    })
    const target = makeMockEntity({ id: 'target', position: { x: 100, y: 0 }, hurtboxRadius: 20 })

    // ท่าบนพื้นปกติ (normal ground strike): ระยะโจมตี 120 (สามารถโจมตีโดน target ระยะ x=100 ได้เพราะ distance (100 - 20 = 80) <= 120)
    const groundStrike: AttackDefinition = {
      id: 'ground-strike',
      animationId: 'attack-1',
      startupMs: 100,
      activeMs: 100,
      recoveryMs: 100,
      comboWindowStartMs: 0,
      comboWindowEndMs: 0,
      damageMultiplier: 1.0,
      range: 120,
      hitShape: 'horizontal',
      arcDegrees: 0,
      depthTolerance: 100,
      knockback: 50,
    }

    // ท่ากลางอากาศ/ขณะพุ่ง (jump-strike variant): ระยะโจมตีสั้นลงเหลือ 60 (ระยะเอื้อม 80 > 60 ทำให้โจมตีไม่โดน)
    const jumpStrike: AttackDefinition = {
      ...groundStrike,
      id: 'jump-strike',
      range: 60,
    }

    // ground strike ต้องตีโดน
    const groundHits = findHitTargets([target], {
      attacker,
      attack: groundStrike,
      alreadyHit: new Set(),
      elapsedMs: 150,
    })
    expect(groundHits).toContainEqual(target)

    // jump strike ต้องตีไม่โดน (พิสูจน์ว่า HitboxSystem ไม่ละเลยความแตกต่างของฟิลด์ range)
    const jumpHits = findHitTargets([target], {
      attacker,
      attack: jumpStrike,
      alreadyHit: new Set(),
      elapsedMs: 150,
    })
    expect(jumpHits).not.toContainEqual(target)
  })

  it('Scar 2: ยืนยันว่า EffectsSystem สามารถประมวลผลเอฟเฟกต์ที่มีอยู่บน AttackDefinition ได้อย่างถูกต้องกับทุกคู่ร่าย/เป้าหมายที่กำหนด (ไม่เกิด hard-code เจาะจงเฉพาะคู่แรกที่เทสต์)', () => {
    const ownerA = makeMockEntity({ id: 'ownerA', entityType: 'player', hp: 50, maxHp: 100 })
    const allyA = makeMockEntity({ id: 'allyA', entityType: 'player', hp: 80, maxHp: 100 })

    const ownerB = makeMockEntity({ id: 'ownerB', entityType: 'player', hp: 30, maxHp: 100 })
    const allyB = makeMockEntity({ id: 'allyB', entityType: 'player', hp: 40, maxHp: 100 })

    // เอฟเฟกต์ฮีลให้กับตัวผู้ใช้
    const selfHealEffect: AttackDefinition = {
      id: 'self-heal-move',
      animationId: 'skill-1',
      startupMs: 100,
      activeMs: 100,
      recoveryMs: 100,
      comboWindowStartMs: 0,
      comboWindowEndMs: 0,
      damageMultiplier: 0,
      range: 100,
      hitShape: 'radial',
      arcDegrees: 360,
      depthTolerance: 0,
      knockback: 0,
      effects: [{ kind: 'heal', target: 'self', healAmount: 20 }],
    }

    // คู่ A: รันเอฟเฟกต์กับคู่ A
    const contextA = { owner: ownerA, allies: [allyA], enemies: [] }
    selfHealEffect.effects?.forEach((eff) => {
      resolveEffect(eff, contextA)
    })
    expect(ownerA.hp).toBe(70) // 50 + 20

    // คู่ B: รันเอฟเฟกต์กับคู่ B ด้วยโค้ดชุดเดียวกัน ต้องทำงานถูกต้อง ไม่ใช่ทำงานได้แค่คู่ A
    const contextB = { owner: ownerB, allies: [allyB], enemies: [] }
    selfHealEffect.effects?.forEach((eff) => {
      resolveEffect(eff, contextB)
    })
    expect(ownerB.hp).toBe(50) // 30 + 20
  })

  it('Scar 3: ยืนยันความสอดคล้องระหว่างช่วงเฟรมโจมตีของแอนิเมชันกับจังหวะคำนวณของ HitboxSystem (ช่วง Active Window) ต้องตรงกันทุกช่วงเวลา', () => {
    const attack: AttackDefinition = {
      id: 'test-timing-move',
      animationId: 'attack-1',
      telegraphMs: 200,
      startupMs: 150,
      activeMs: 250,
      recoveryMs: 300,
      comboWindowStartMs: 0,
      comboWindowEndMs: 0,
      damageMultiplier: 1.0,
      range: 100,
      hitShape: 'horizontal',
      arcDegrees: 0,
      depthTolerance: 100,
      knockback: 10,
    }

    // telegraph window: 0 - 200ms
    expect(getMovePhase(attack, 100)).toBe('telegraph')
    expect(getMovePhase(attack, 200)).toBe('startup')

    // startup window: 200 - 350ms
    expect(getMovePhase(attack, 300)).toBe('startup')

    // active window: 350 - 600ms
    expect(getMovePhase(attack, 400)).toBe('active')
    expect(getMovePhase(attack, 500)).toBe('active')

    // recovery window: 600 - 900ms
    expect(getMovePhase(attack, 700)).toBe('recovery')

    // complete: > 900ms
    expect(getMovePhase(attack, 950)).toBe('complete')
  })
})
