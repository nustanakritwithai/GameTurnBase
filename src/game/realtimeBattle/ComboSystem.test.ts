import { describe, expect, it } from 'vitest'
import { COMBO_CONFIG, PLAYER_ATTACK_CHAIN, totalDurationMs } from './attacks'
import {
  applyHitStop,
  createComboState,
  currentComboStep,
  isAttacking,
  pressAttack,
  stepCombo,
} from './ComboSystem'
import type { RealtimeBattleEntity } from './types'

function player(overrides: Partial<RealtimeBattleEntity> = {}): RealtimeBattleEntity {
  return {
    id: 'player',
    entityType: 'player',
    name: 'ผู้เล่น',
    position: { x: 500, y: 500 },
    velocity: { x: 0, y: 0 },
    facing: 'right',
    combatFacing: 'right',
    state: 'idle',
    hp: 300,
    maxHp: 300,
    atk: 90,
    def: 60,
    speed: 275,
    collisionRadius: 34,
    hurtboxRadius: 42,
    attackCooldownRemainingMs: 0,
    skillCooldownsMs: { skill1: 0, skill2: 0, skill3: 0 },
    ultimateGauge: 0,
    invulnerableUntilMs: 0,
    hitStunRemainingMs: 0,
    knockdownRemainingMs: 0,
    getUpRemainingMs: 0,
    characterId: 'monkey-king',
    ...overrides,
  }
}

/** เดินท่าปัจจุบันจนจบพอดี */
function finishCurrentAttack(
  unit: RealtimeBattleEntity,
  combo: ReturnType<typeof createComboState>,
) {
  const attack = combo.attack
  if (!attack) return
  stepCombo(unit, combo, totalDurationMs(attack) + 1)
}

describe('ComboSystem', () => {
  it('กดครั้งแรกเริ่มไม้ที่หนึ่ง', () => {
    const unit = player()
    const combo = createComboState()

    pressAttack(unit, combo)

    expect(isAttacking(combo)).toBe(true)
    expect(combo.attack?.id).toBe(PLAYER_ATTACK_CHAIN[0].id)
    expect(currentComboStep(combo)).toBe(1)
  })

  it('กดต่อภายในหน้าต่างคอมโบ ได้ไม้ที่สองและสาม', () => {
    const unit = player()
    const combo = createComboState()

    pressAttack(unit, combo)
    finishCurrentAttack(unit, combo)
    pressAttack(unit, combo)
    expect(combo.attack?.id).toBe(PLAYER_ATTACK_CHAIN[1].id)

    finishCurrentAttack(unit, combo)
    pressAttack(unit, combo)
    expect(combo.attack?.id).toBe(PLAYER_ATTACK_CHAIN[2].id)
  })

  it('ปล่อยนานเกินหน้าต่างคอมโบ กลับไปเริ่มไม้แรกใหม่', () => {
    const unit = player()
    const combo = createComboState()

    pressAttack(unit, combo)
    finishCurrentAttack(unit, combo)

    // รอจนคอมโบหมดอายุ
    stepCombo(unit, combo, COMBO_CONFIG.comboResetMs + 50)

    pressAttack(unit, combo)
    expect(combo.attack?.id).toBe(PLAYER_ATTACK_CHAIN[0].id)
  })

  it('จบไม้ที่สามแล้ววนกลับไม้แรก', () => {
    const unit = player()
    const combo = createComboState()

    for (let i = 0; i < 3; i += 1) {
      pressAttack(unit, combo)
      finishCurrentAttack(unit, combo)
    }

    pressAttack(unit, combo)
    expect(combo.attack?.id).toBe(PLAYER_ATTACK_CHAIN[0].id)
  })

  it('กดล่วงหน้าก่อนท่าจบ (input buffer) แล้วระบบยิงต่อให้เมื่อท่าปัจจุบันจบ', () => {
    const unit = player()
    const combo = createComboState()

    pressAttack(unit, combo)
    const first = combo.attack
    if (!first) throw new Error('ต้องมีท่าแรก')

    // เดินไปเกือบจบท่า แล้วกดล่วงหน้า
    stepCombo(unit, combo, totalDurationMs(first) - 60)
    pressAttack(unit, combo)
    expect(combo.attack?.id).toBe(first.id) // ยังไม่เปลี่ยนท่าทันที

    // พอท่าจบ ระบบต้องต่อไม้สองให้เอง
    stepCombo(unit, combo, 80)
    expect(combo.attack?.id).toBe(PLAYER_ATTACK_CHAIN[1].id)
  })

  it('กดรัวไม่ข้าม recovery — ท่าถัดไปเริ่มหลังท่าปัจจุบันจบเท่านั้น', () => {
    const unit = player()
    const combo = createComboState()

    pressAttack(unit, combo)
    const first = combo.attack
    if (!first) throw new Error('ต้องมีท่าแรก')

    // กดรัว 5 ครั้งระหว่างท่าแรกยังไม่จบ
    for (let i = 0; i < 5; i += 1) {
      pressAttack(unit, combo)
      stepCombo(unit, combo, 10)
    }

    expect(combo.attack?.id).toBe(first.id)
    expect(combo.sinceStartMs).toBeLessThan(totalDurationMs(first))
  })

  it('อินพุตที่ค้างเกินเวลา buffer ถูกทิ้ง ไม่กลายเป็นโจมตีลอย ๆ ทีหลัง', () => {
    const unit = player()
    const combo = createComboState()

    pressAttack(unit, combo)
    const first = combo.attack
    if (!first) throw new Error('ต้องมีท่าแรก')

    // กดล่วงหน้าเร็วเกินไปมาก (ต้นท่า) แล้วปล่อยให้เลย buffer ไป
    pressAttack(unit, combo)
    stepCombo(unit, combo, COMBO_CONFIG.inputBufferMs + 40)
    expect(combo.bufferedInputAgeMs).toBeNull()

    stepCombo(unit, combo, totalDurationMs(first))
    expect(isAttacking(combo)).toBe(false)
  })

  it('ไม้ที่สามกระเด็นแรงกว่าสองไม้แรก', () => {
    expect(PLAYER_ATTACK_CHAIN[2].knockback).toBeGreaterThan(PLAYER_ATTACK_CHAIN[0].knockback)
    expect(PLAYER_ATTACK_CHAIN[2].knockback).toBeGreaterThan(PLAYER_ATTACK_CHAIN[1].knockback)
    expect(PLAYER_ATTACK_CHAIN[2].damageMultiplier).toBeGreaterThan(
      PLAYER_ATTACK_CHAIN[1].damageMultiplier,
    )
  })

  it('โดนตีจนเซระหว่างคอมโบ = ท่าถูกยกเลิกและคอมโบขาด', () => {
    const unit = player()
    const combo = createComboState()

    pressAttack(unit, combo)
    finishCurrentAttack(unit, combo)
    pressAttack(unit, combo)
    expect(combo.attack?.id).toBe(PLAYER_ATTACK_CHAIN[1].id)

    unit.hitStunRemainingMs = 200
    stepCombo(unit, combo, 16)
    expect(isAttacking(combo)).toBe(false)

    unit.hitStunRemainingMs = 0
    pressAttack(unit, combo)
    expect(combo.attack?.id).toBe(PLAYER_ATTACK_CHAIN[0].id)
  })

  it('hit stop หยุดท่าไว้ชั่วขณะ แล้วเดินต่อได้ตามปกติ', () => {
    const unit = player()
    const combo = createComboState()

    pressAttack(unit, combo)
    const before = combo.sinceStartMs
    applyHitStop(combo)

    stepCombo(unit, combo, COMBO_CONFIG.hitStopMs / 2)
    expect(combo.sinceStartMs).toBe(before)

    stepCombo(unit, combo, COMBO_CONFIG.hitStopMs)
    stepCombo(unit, combo, 16)
    expect(combo.sinceStartMs).toBeGreaterThan(before)
  })

  it('ตายแล้วกดโจมตีไม่ติด', () => {
    const unit = player({ state: 'dead' })
    const combo = createComboState()

    pressAttack(unit, combo)
    expect(isAttacking(combo)).toBe(false)
  })
})
