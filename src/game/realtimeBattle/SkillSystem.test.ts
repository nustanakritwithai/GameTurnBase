import { describe, expect, it } from 'vitest'
import {
  MONKEY_GOLDEN_FURY,
  MONKEY_SPINNING_STAFF,
  MONKEY_STAFF_SWEEP,
  MONKEY_STAFF_THRUST,
  SKILL_CONFIG,
  totalDurationMs,
} from './attacks'
import { getRealtimeSkillKit, getSkillFromKit } from './skills'
import {
  canStartSkill,
  createSkillState,
  isCastingSkill,
  startSkill,
  stepSkill,
} from './SkillSystem'
import { ULTIMATE_GAUGE_CONFIG } from './ultimateGauge'
import type { RealtimeBattleEntity } from './types'

function player(overrides: Partial<RealtimeBattleEntity> = {}): RealtimeBattleEntity {
  return {
    id: 'player',
    entityType: 'player',
    name: 'หงอคง',
    position: { x: 900, y: 550 },
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

describe('skills registry', () => {
  it('หงอคงมี kit 3 สกิล + อัลติเมท', () => {
    const kit = getRealtimeSkillKit('monkey-king')
    expect(kit?.skill1.id).toBe('spinning-golden-staff')
    expect(kit?.skill1.attack).toBe(MONKEY_SPINNING_STAFF)
    expect(kit?.skill2.attack).toBe(MONKEY_STAFF_THRUST)
    expect(kit?.skill3.attack).toBe(MONKEY_STAFF_SWEEP)
    expect(kit?.ultimate.attack).toBe(MONKEY_GOLDEN_FURY)
    expect(kit?.skill1.cooldownMs).toBe(SKILL_CONFIG.skill1CooldownMs)
  })

  it('ตัวละครที่ไม่มี kit คืน undefined', () => {
    expect(getRealtimeSkillKit('pig-warrior')).toBeUndefined()
    expect(getRealtimeSkillKit(undefined)).toBeUndefined()
  })
})

describe('SkillSystem', () => {
  it('เริ่มร่ายสกิล 1 ได้เมื่อพร้อม และตั้งคูลดาวน์ช่องนั้น + i-frame', () => {
    const unit = player()
    const skill = createSkillState()
    const kit = getRealtimeSkillKit('monkey-king')
    if (!kit) throw new Error('ไม่พบ kit หงอคง')
    const definition = getSkillFromKit(kit, 'skill1')

    expect(startSkill(unit, skill, definition, 1000)).toBe(true)
    expect(isCastingSkill(skill)).toBe(true)
    expect(unit.state).toBe('skill')
    expect(unit.skillCooldownsMs.skill1).toBe(SKILL_CONFIG.skill1CooldownMs)
    expect(unit.invulnerableUntilMs).toBe(1000 + definition.invulnerableMs)
  })

  it('ร่ายซ้ำช่องเดียวไม่ได้ระหว่างคูลดาวน์หรือกำลังร่ายอยู่', () => {
    const unit = player({ skillCooldownsMs: { skill1: 500, skill2: 0, skill3: 0 } })
    const skill = createSkillState()
    const kit = getRealtimeSkillKit('monkey-king')
    if (!kit) throw new Error('ไม่พบ kit หงอคง')
    const definition = getSkillFromKit(kit, 'skill1')

    expect(canStartSkill(unit, skill, definition, false)).toBe(false)

    unit.skillCooldownsMs.skill1 = 0
    startSkill(unit, skill, definition, 0)
    expect(canStartSkill(unit, skill, definition, false)).toBe(false)
  })

  it('อัลติเมทใช้ได้เมื่อ gauge เต็ม และรีเซ็ต gauge หลังร่าย', () => {
    const unit = player({ ultimateGauge: ULTIMATE_GAUGE_CONFIG.max })
    const skill = createSkillState()
    const kit = getRealtimeSkillKit('monkey-king')
    if (!kit) throw new Error('ไม่พบ kit หงอคง')
    const ultimate = getSkillFromKit(kit, 'ultimate')

    expect(canStartSkill(unit, skill, ultimate, false)).toBe(true)
    startSkill(unit, skill, ultimate, 0)
    expect(unit.ultimateGauge).toBe(0)
  })

  it('อัลติเมทใช้ไม่ได้เมื่อ gauge ยังไม่เต็ม', () => {
    const unit = player({ ultimateGauge: 50 })
    const skill = createSkillState()
    const kit = getRealtimeSkillKit('monkey-king')
    if (!kit) throw new Error('ไม่พบ kit หงอคง')
    const ultimate = getSkillFromKit(kit, 'ultimate')

    expect(canStartSkill(unit, skill, ultimate, false)).toBe(false)
  })

  it('hitbox เปิดเฉพาะช่วง active ของท่า', () => {
    const unit = player()
    const skill = createSkillState()
    const kit = getRealtimeSkillKit('monkey-king')
    if (!kit) throw new Error('ไม่พบ kit หงอคง')
    const definition = getSkillFromKit(kit, 'skill1')

    startSkill(unit, skill, definition, 0)

    const startup = definition.attack.startupMs - 1
    expect(stepSkill(unit, skill, startup).hitboxActive).toBe(false)

    const active = definition.attack.activeMs
    expect(stepSkill(unit, skill, active).hitboxActive).toBe(true)
  })

  it('จบท่าแล้วกลับ idle และเคลียร์สถานะสกิล', () => {
    const unit = player()
    const skill = createSkillState()
    const kit = getRealtimeSkillKit('monkey-king')
    if (!kit) throw new Error('ไม่พบ kit หงอคง')
    const definition = getSkillFromKit(kit, 'skill1')

    startSkill(unit, skill, definition, 0)
    stepSkill(unit, skill, totalDurationMs(definition.attack) + 1)

    expect(isCastingSkill(skill)).toBe(false)
    expect(unit.state).toBe('idle')
  })

  it('โดนตีจนสตันระหว่างร่าย = ยกเลิกสกิล', () => {
    const unit = player()
    const skill = createSkillState()
    const kit = getRealtimeSkillKit('monkey-king')
    if (!kit) throw new Error('ไม่พบ kit หงอคง')
    const definition = getSkillFromKit(kit, 'skill1')

    startSkill(unit, skill, definition, 0)
    unit.hitStunRemainingMs = 120
    stepSkill(unit, skill, 16)

    expect(isCastingSkill(skill)).toBe(false)
  })
})
