import { describe, expect, it } from 'vitest'
import { PLAYER_ATTACK_CHAIN } from './attacks'

/** ไม้แรกของคอมโบ — ใช้เป็นท่าอ้างอิงในเทสต์ชุดนี้ */
const PLAYER_ATTACK = PLAYER_ATTACK_CHAIN[0]
import { applyDamage, calcDamage } from './DamageSystem'
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
    combatTier: 'mob',
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
    expect(target.hitStunRemainingMs).toBeGreaterThan(0)
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

  it('Done-criterion 2: HP > 0 sets state="hit", hitStunRemainingMs, and invulnerableUntilMs correctly', () => {
    const attacker = entity({ id: 'player' })
    const target = entity({ hp: 100 })
    applyDamage({
      attacker,
      target,
      attack: PLAYER_ATTACK,
      elapsedMs: 500,
      random: fakeRandom(0.5, 0.99),
    })
    expect(target.state).toBe('hit')
    expect(target.hitStunRemainingMs).toBe(200) // resolveHitstunMs default is 200
    expect(target.invulnerableUntilMs).toBe(500 + 120)
  })

  it('Done-criterion 3: knockback displacement direction is deterministic for horizontal vs radial/other shapes', () => {
    const attacker = entity({ id: 'player', combatFacing: 'left', facing: 'up' })

    // Test horizontal hitShape - should use combatFacing (left)
    const targetHoriz = entity({ position: { x: 500, y: 500 } })
    const horizontalAttack = { ...PLAYER_ATTACK, hitShape: 'horizontal' as const, knockback: 50 }
    applyDamage({
      attacker,
      target: targetHoriz,
      attack: horizontalAttack,
      elapsedMs: 0,
      random: fakeRandom(0.5, 0.99),
    })
    // combatFacing = 'left' -> horizontal vector is { x: -1, y: 0 }. push-out is -50px in x
    expect(targetHoriz.position.x).toBe(500 - 50)
    expect(targetHoriz.position.y).toBe(500)

    // Test radial hitShape - should use facing (up)
    const targetRadial = entity({ position: { x: 500, y: 500 } })
    const radialAttack = { ...PLAYER_ATTACK, hitShape: 'radial' as const, knockback: 50 }
    applyDamage({
      attacker,
      target: targetRadial,
      attack: radialAttack,
      elapsedMs: 0,
      random: fakeRandom(0.5, 0.99),
    })
    // facing = 'up' -> directionVector('up') is { x: 0, y: -1 }. push-out is -50px in y
    expect(targetRadial.position.x).toBe(500)
    expect(targetRadial.position.y).toBe(500 - 50)
  })

  it('Done-criterion 5: knockdown flag is inert against normal mobs but active on elite/boss', () => {
    const attacker = entity({ id: 'player' })
    const normalTarget = entity({ hp: 100, combatTier: 'mob', entityType: 'enemy' })
    const eliteTarget = entity({ hp: 100, combatTier: 'elite', entityType: 'enemy' })
    const knockdownAttack = { ...PLAYER_ATTACK, knockdown: true }

    // Mob target - should NOT knockdown, should just do normal hitstun
    applyDamage({
      attacker,
      target: normalTarget,
      attack: knockdownAttack,
      elapsedMs: 0,
      random: fakeRandom(0.5, 0.99),
    })
    expect(normalTarget.state).toBe('hit')
    expect(normalTarget.knockdownRemainingMs).toBe(0)

    // Elite target - should knockdown
    applyDamage({
      attacker,
      target: eliteTarget,
      attack: knockdownAttack,
      elapsedMs: 0,
      random: fakeRandom(0.5, 0.99),
    })
    expect(eliteTarget.state).toBe('knockdown')
    expect(eliteTarget.knockdownRemainingMs).toBe(700) // resolveKnockdownMs default is 700
  })

  it('Scar 2: flat global hitstun allows continuous lock if hit rate is high enough (150ms cadence)', () => {
    const attacker = entity({ id: 'player' })
    const target = entity({ hp: 1000 })

    // First hit at 0ms
    applyDamage({
      attacker,
      target,
      attack: PLAYER_ATTACK,
      elapsedMs: 0,
      random: fakeRandom(0.5, 0.99),
    })
    expect(target.hitStunRemainingMs).toBe(200)

    // Advance 150ms
    target.hitStunRemainingMs -= 150
    expect(target.hitStunRemainingMs).toBe(50)

    // Second hit at 150ms (outside 120ms invulnerability window)
    applyDamage({
      attacker,
      target,
      attack: PLAYER_ATTACK,
      elapsedMs: 150,
      random: fakeRandom(0.5, 0.99),
    })
    expect(target.hitStunRemainingMs).toBe(200) // reset to 200
  })
})
