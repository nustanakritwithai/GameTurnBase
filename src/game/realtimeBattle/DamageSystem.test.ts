import { describe, expect, it } from 'vitest'
import { PLAYER_ATTACK_CHAIN } from './attacks'
import { BASELINE_HITSTUN_MS } from './combatBaselines'

/** ไม้แรกของคอมโบ — ใช้เป็นท่าอ้างอิงในเทสต์ชุดนี้ */
const PLAYER_ATTACK = PLAYER_ATTACK_CHAIN[0]
import { applyDamage, calcDamage, canReceiveKnockdown } from './DamageSystem'
import type { RealtimeBattleEntity } from './types'

/**
 * เทสต์ดาเมจแบบ deterministic
 *
 * ทำได้เพราะระบบใหม่รับฟังก์ชันสุ่มเข้ามา ต่างจาก formulas.ts ของระบบเทิร์นที่ฝัง
 * Math.random() ไว้กลางสูตรจนเขียนเทสต์ตัวเลขไม่ได้เลย
 */

/** ตัวสุ่มปลอมที่คืนค่าตามลำดับที่กำหนด — ค่าแรกคือ variance ค่าที่สองคือคริติคอล */
function fakeRandom(...values: number[]): () => number {
  let index = 0
  return () => values[Math.min(index++, values.length - 1)]
}

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

describe('calcDamage', () => {
  it('คำนวณจาก atk ตัวคูณท่า และเกราะของเป้าหมาย แบบตรวจตัวเลขได้', () => {
    const attacker = entity({ id: 'player', atk: 100 })
    const target = entity({ def: 50 })

    // variance 0.5 = กลางพอดี (ตัวคูณ 1.0), คริติคอล 0.99 = ไม่คริ
    const outcome = calcDamage({
      attacker,
      target,
      attack: PLAYER_ATTACK,
      elapsedMs: 0,
      random: fakeRandom(0.5, 0.99),
    })

    // 100 * 1 * 1.0 - 50 * 0.42 = 79
    expect(outcome.amount).toBe(79)
    expect(outcome.critical).toBe(false)
  })

  it('คริติคอลคูณดาเมจเพิ่มจริง', () => {
    const attacker = entity({ id: 'player', atk: 100 })
    const target = entity({ def: 50 })

    const normal = calcDamage({
      attacker,
      target,
      attack: PLAYER_ATTACK,
      elapsedMs: 0,
      random: fakeRandom(0.5, 0.99),
    })
    const critical = calcDamage({
      attacker,
      target,
      attack: PLAYER_ATTACK,
      elapsedMs: 0,
      random: fakeRandom(0.5, 0.01),
    })

    expect(critical.critical).toBe(true)
    expect(critical.amount).toBeGreaterThan(normal.amount)
  })

  it('เกราะหนากว่าพลังโจมตีมาก ก็ยังเข้าอย่างน้อย 1', () => {
    const attacker = entity({ id: 'player', atk: 1 })
    const target = entity({ def: 9999 })

    const outcome = calcDamage({
      attacker,
      target,
      attack: PLAYER_ATTACK,
      elapsedMs: 0,
      random: fakeRandom(0.5, 0.99),
    })

    expect(outcome.amount).toBe(1)
  })

  it('ตัวคูณของท่าที่แรงกว่า ทำดาเมจมากกว่า', () => {
    const attacker = entity({ id: 'player', atk: 100 })
    const target = entity({ def: 50 })
    const heavy = { ...PLAYER_ATTACK, damageMultiplier: 2 }

    const light = calcDamage({
      attacker,
      target,
      attack: PLAYER_ATTACK,
      elapsedMs: 0,
      random: fakeRandom(0.5, 0.99),
    })
    const strong = calcDamage({
      attacker,
      target,
      attack: heavy,
      elapsedMs: 0,
      random: fakeRandom(0.5, 0.99),
    })

    expect(strong.amount).toBeGreaterThan(light.amount)
  })
})

describe('applyDamage', () => {
  it('ลดเลือด ทำให้เซ ให้อยู่ยงชั่วครู่ และกระเด็นไปตามทิศที่ผู้โจมตีหัน', () => {
    const attacker = entity({
      id: 'player',
      atk: 100,
      facing: 'right',
      position: { x: 400, y: 500 },
    })
    const target = entity({ def: 50, position: { x: 500, y: 500 } })

    const outcome = applyDamage({
      attacker,
      target,
      attack: PLAYER_ATTACK,
      elapsedMs: 1000,
      random: fakeRandom(0.5, 0.99),
    })

    expect(target.hp).toBe(200 - outcome.amount)
    expect(target.state).toBe('hit')
    expect(target.hitStunRemainingMs).toBe(BASELINE_HITSTUN_MS)
    expect(target.invulnerableUntilMs).toBeGreaterThan(1000)
    expect(target.position.x).toBe(500 + PLAYER_ATTACK.knockback)
    expect(target.position.y).toBe(500)
  })

  it('เลือดหมดแล้วเปลี่ยนเป็นตาย และไม่ถูกกระเด็นต่อ', () => {
    const attacker = entity({ id: 'player', atk: 100, facing: 'right' })
    const target = entity({ hp: 5, def: 0, position: { x: 500, y: 500 } })

    const outcome = applyDamage({
      attacker,
      target,
      attack: PLAYER_ATTACK,
      elapsedMs: 0,
      random: fakeRandom(0.5, 0.99),
    })

    expect(outcome.defeated).toBe(true)
    expect(target.hp).toBe(0)
    expect(target.state).toBe('dead')
    expect(target.position).toEqual({ x: 500, y: 500 })
  })
})

describe('knockdown framework', () => {
  it('normal mob ไม่รับ knockdown', () => {
    const target = entity({ enemyId: 'shadow-soldier' })
    expect(canReceiveKnockdown(target)).toBe(false)
  })

  it('elite รับ knockdown เมื่อท่าระบุ knockdown + knockdownMs', () => {
    const attacker = entity({ id: 'player', atk: 40, facing: 'right' })
    const target = entity({
      enemyId: 'demon-captain',
      hp: 200,
      def: 0,
      position: { x: 500, y: 500 },
    })
    const heavy = {
      ...PLAYER_ATTACK,
      knockdown: true,
      knockdownMs: 480,
      damageMultiplier: 0.5,
    }

    const outcome = applyDamage({
      attacker,
      target,
      attack: heavy,
      elapsedMs: 1000,
      random: fakeRandom(0.5, 0.99),
    })

    expect(canReceiveKnockdown(target)).toBe(true)
    expect(outcome.knockedDown).toBe(true)
    expect(target.state).toBe('knockdown')
    expect(target.knockdownRemainingMs).toBe(480)
    expect(target.hitStunRemainingMs).toBe(0)
  })

  it('knockdown=true แต่ไม่มี knockdownMs = ใช้ hitstun แทน', () => {
    const attacker = entity({ id: 'player', atk: 40, facing: 'right' })
    const target = entity({
      enemyId: 'demon-captain',
      hp: 200,
      def: 0,
      position: { x: 500, y: 500 },
    })
    const incomplete = { ...PLAYER_ATTACK, knockdown: true }

    applyDamage({
      attacker,
      target,
      attack: incomplete,
      elapsedMs: 0,
      random: fakeRandom(0.5, 0.99),
    })

    expect(target.state).toBe('hit')
    expect(target.hitStunRemainingMs).toBe(BASELINE_HITSTUN_MS)
  })
})
