import { describe, expect, it } from 'vitest'
import { assert, float, integer, property } from 'fast-check'
import { calcDamage } from './DamageSystem'
import { PLAYER_ATTACK_CHAIN } from './attacks'
import { MINIMUM_DAMAGE } from '../battle/formulas'
import type { RealtimeBattleEntity } from './types'

/*
  ทดสอบด้วยค่าสุ่มจำนวนมาก แทนตัวเลขตายตัวไม่กี่ชุด

  DamageSystem.test.ts (ไฟล์พี่น้อง) ตรวจตัวเลขเจาะจง เช่น "atk 100 def 50 = ดาเมจ 79"
  ไฟล์นี้ตรวจ**คุณสมบัติ**ที่ต้องเป็นจริงไม่ว่า atk/def จะเป็นเท่าไหร่ — เช่น "ดาเมจต้องไม่ติดลบ
  เสมอ" ซึ่งเป็นคลาสบั๊กที่ตัวอย่างตายตัวไม่กี่ชุดจับไม่เจอ (overflow, ค่าติดลบ, NaN จาก def
  ที่สูงกว่า atk มาก ๆ) — ปิด gap "Fuzzing" ที่ audit ชี้ไว้ (OpenSSF Scorecard's Fuzzing check
  ระบุ fast-check ไว้ตรง ๆ ว่าเป็นเครื่องมือมาตรฐานฝั่ง JS/TS)
*/

const PLAYER_ATTACK = PLAYER_ATTACK_CHAIN[0]

function entity(overrides: Partial<RealtimeBattleEntity> = {}): RealtimeBattleEntity {
  return {
    id: 'unit',
    entityType: 'enemy',
    name: 'เป้าหมาย',
    position: { x: 500, y: 500 },
    velocity: { x: 0, y: 0 },
    facing: 'down',
    combatFacing: 'right',
    state: 'idle',
    hp: 200,
    maxHp: 200,
    atk: 100,
    def: 50,
    speed: 120,
    collisionRadius: 30,
    hurtboxRadius: 36,
    attackCooldownRemainingMs: 0,
    skillCooldownsMs: { skill1: 0, skill2: 0, skill3: 0 },
    ultimateGauge: 0,
    invulnerableUntilMs: 0,
    hitStunRemainingMs: 0,
    knockdownRemainingMs: 0,
    getUpRemainingMs: 0,
    ...overrides,
  }
}

// atk/def ในเกมจริงมาจาก level (calcMaxHp ใช้ def สูงสุดหลักพันต้น ๆ ที่ level เยอะมาก)
// กว้างพอให้ครอบคลุมค่าที่เป็นไปได้จริง รวมถึงกรณีขอบ (0, ค่าติดลบที่ไม่ควรเกิดแต่กันไว้)
const statArb = integer({ min: -1000, max: 100_000 })
const unitArb = float({ min: Math.fround(0), max: Math.fround(1), noNaN: true })

describe('calcDamage — คุณสมบัติที่ต้องเป็นจริงเสมอ', () => {
  it('ดาเมจไม่ต่ำกว่าพื้นขั้นต่ำ ไม่ว่า atk/def จะเป็นเท่าไหร่', () => {
    assert(
      property(statArb, statArb, unitArb, unitArb, (atk, def, varianceRoll, critRoll) => {
        const outcome = calcDamage({
          attacker: entity({ atk }),
          target: entity({ def }),
          attack: PLAYER_ATTACK,
          elapsedMs: 0,
          random: (() => {
            let calls = 0
            return () => (calls++ === 0 ? varianceRoll : critRoll)
          })(),
        })

        expect(outcome.amount).toBeGreaterThanOrEqual(MINIMUM_DAMAGE)
        expect(Number.isFinite(outcome.amount)).toBe(true)
        expect(Number.isInteger(outcome.amount)).toBe(true)
      }),
    )
  })

  it('def สูงกว่า atk มาก ๆ ก็ยังไม่ทำให้ดาเมจติดลบหรือ NaN', () => {
    assert(
      property(
        integer({ min: 0, max: 100 }),
        integer({ min: 10_000, max: 1_000_000 }),
        (atk, def) => {
          const outcome = calcDamage({
            attacker: entity({ atk }),
            target: entity({ def }),
            attack: PLAYER_ATTACK,
            elapsedMs: 0,
            random: () => 0.5,
          })
          expect(outcome.amount).toBe(MINIMUM_DAMAGE)
        },
      ),
    )
  })

  it('critical ทำให้ดาเมจไม่น้อยกว่าดาเมจปกติจากค่าเดียวกันเสมอ', () => {
    assert(
      property(statArb, statArb, unitArb, (atk, def, varianceRoll) => {
        const target = () => entity({ def })
        const attacker = entity({ atk })

        let seq: number[] = [varianceRoll, 0.99] // 0.99 > CRITICAL_CHANCE (0.12) = ไม่คริ
        let i = 0
        const normal = calcDamage({
          attacker,
          target: target(),
          attack: PLAYER_ATTACK,
          elapsedMs: 0,
          random: () => seq[i++],
        })

        seq = [varianceRoll, 0] // 0 < CRITICAL_CHANCE เสมอ = คริแน่นอน
        i = 0
        const critical = calcDamage({
          attacker,
          target: target(),
          attack: PLAYER_ATTACK,
          elapsedMs: 0,
          random: () => seq[i++],
        })

        expect(critical.amount).toBeGreaterThanOrEqual(normal.amount)
      }),
    )
  })

  it('defeated เป็นจริงก็ต่อเมื่อดาเมจครั้งนี้ลด HP เหลือ 0 หรือต่ำกว่าเท่านั้น', () => {
    assert(
      property(
        statArb,
        statArb,
        integer({ min: 0, max: 100_000 }),
        unitArb,
        unitArb,
        (atk, def, hp, varianceRoll, critRoll) => {
          const outcome = calcDamage({
            attacker: entity({ atk }),
            target: entity({ def, hp, maxHp: Math.max(hp, 1) }),
            attack: PLAYER_ATTACK,
            elapsedMs: 0,
            random: (() => {
              let calls = 0
              return () => (calls++ === 0 ? varianceRoll : critRoll)
            })(),
          })

          expect(outcome.defeated).toBe(hp - outcome.amount <= 0)
        },
      ),
    )
  })
})
