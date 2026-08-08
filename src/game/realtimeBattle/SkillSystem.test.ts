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
    combatTier: 'mob',
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

  it('Done-criterion 1: canStartSkill returns false when player is dead, stunned, already casting, or basic attacking', () => {
    const kit = getRealtimeSkillKit('monkey-king')
    if (!kit) throw new Error('ไม่พบ kit หงอคง')
    const skill1Def = getSkillFromKit(kit, 'skill1')

    // 1. Player is dead
    const deadPlayer = player({ state: 'dead' })
    let skillState = createSkillState()
    expect(canStartSkill(deadPlayer, skillState, skill1Def, false)).toBe(false)

    // 2. Player is stunned (control locked)
    const stunnedPlayer = player({ hitStunRemainingMs: 150 })
    skillState = createSkillState()
    expect(canStartSkill(stunnedPlayer, skillState, skill1Def, false)).toBe(false)

    // 3. Player is basic attacking
    const normalPlayer = player()
    skillState = createSkillState()
    expect(canStartSkill(normalPlayer, skillState, skill1Def, true)).toBe(false) // isAttacking = true

    // 4. Isolated already casting check
    skillState = createSkillState()
    startSkill(normalPlayer, skillState, skill1Def, 0)
    // We try to start a DIFFERENT skill or same skill while skillState.definition is not null
    expect(canStartSkill(normalPlayer, skillState, skill1Def, false)).toBe(false)
  })

  it('Done-criterion 4: interruptible: false skill survives hitstun during startup/active phases but gets interrupted in recovery phase if overridden', () => {
    const kit = getRealtimeSkillKit('monkey-king')
    if (!kit) throw new Error('ไม่พบ kit หงอคง')
    const ultimate = getSkillFromKit(kit, 'ultimate') // MONKEY_GOLDEN_FURY has startup/active interruptible: false, recovery interruptible: true

    const unit = player({ ultimateGauge: ULTIMATE_GAUGE_CONFIG.max })
    const skill = createSkillState()

    startSkill(unit, skill, ultimate, 0)
    expect(isCastingSkill(skill)).toBe(true)

    // 1. During startup phase (at 100ms, startupMs is 220)
    stepSkill(unit, skill, 100) // elapsed = 100ms
    unit.hitStunRemainingMs = 120
    stepSkill(unit, skill, 0) // run step with hitstun
    // Should NOT cancel because startup phase is non-interruptible
    expect(isCastingSkill(skill)).toBe(true)

    // Clear hitstun for step progression
    unit.hitStunRemainingMs = 0

    // 2. During active phase (advance by 200ms -> total elapsed = 300ms, which is > 220 and < 220+520)
    stepSkill(unit, skill, 200)
    unit.hitStunRemainingMs = 120
    stepSkill(unit, skill, 0)
    // Should NOT cancel because active phase is non-interruptible
    expect(isCastingSkill(skill)).toBe(true)

    // Clear hitstun
    unit.hitStunRemainingMs = 0

    // 3. During recovery phase (advance by 500ms -> total elapsed = 800ms, which is > 220+520)
    stepSkill(unit, skill, 500)
    unit.hitStunRemainingMs = 120
    stepSkill(unit, skill, 0)
    // Should cancel because recovery phase override has interruptible: true
    expect(isCastingSkill(skill)).toBe(false)
  })

  it('Done-criterion 5: can start and step a skill from a dynamically registered custom hero kit without modifying SkillSystem.ts', () => {
    const customAttack = {
      id: 'custom-attack',
      animationId: 'attack-1' as const,
      startupMs: 100,
      activeMs: 100,
      recoveryMs: 100,
      comboWindowStartMs: 0,
      comboWindowEndMs: 0,
      damageMultiplier: 1.0,
      range: 100,
      hitShape: 'horizontal' as const,
      arcDegrees: 0,
      depthTolerance: 10,
      knockback: 10,
    }
    const customKit = {
      skill1: {
        id: 'custom-skill-1',
        name: 'สกิลพิเศษ',
        slot: 'skill1' as const,
        characterId: 'custom-hero',
        attack: customAttack,
        cooldownMs: 1000,
        invulnerableMs: 50,
      },
      skill2: {
        id: 'custom-skill-2',
        name: 'สกิลพิเศษ 2',
        slot: 'skill2' as const,
        characterId: 'custom-hero',
        attack: customAttack,
        cooldownMs: 2000,
        invulnerableMs: 50,
      },
      skill3: {
        id: 'custom-skill-3',
        name: 'สกิลพิเศษ 3',
        slot: 'skill3' as const,
        characterId: 'custom-hero',
        attack: customAttack,
        cooldownMs: 3000,
        invulnerableMs: 50,
      },
      ultimate: {
        id: 'custom-ultimate',
        name: 'อัลติพิเศษ',
        slot: 'ultimate' as const,
        characterId: 'custom-hero',
        attack: customAttack,
        cooldownMs: 0,
        invulnerableMs: 200,
      },
    }

    const unit = player()
    const skillState = createSkillState()
    expect(canStartSkill(unit, skillState, customKit.skill1, false)).toBe(true)
    startSkill(unit, skillState, customKit.skill1, 0)
    expect(skillState.definition?.id).toBe('custom-skill-1')
  })

  it('Scar: casting a skill on player A does not mutate player B or its skill/cooldown state', () => {
    const kit = getRealtimeSkillKit('monkey-king')
    if (!kit) throw new Error('ไม่พบ kit หงอคง')
    const skill1Def = getSkillFromKit(kit, 'skill1')

    const playerA = player({ id: 'player-a' })
    const playerB = player({ id: 'player-b' })
    const skillStateA = createSkillState()
    const skillStateB = createSkillState()

    startSkill(playerA, skillStateA, skill1Def, 0)

    expect(playerA.state).toBe('skill')
    expect(playerA.skillCooldownsMs.skill1).toBe(SKILL_CONFIG.skill1CooldownMs)

    // Player B must remain unaffected
    expect(playerB.state).toBe('idle')
    expect(playerB.skillCooldownsMs.skill1).toBe(0)
    expect(isCastingSkill(skillStateB)).toBe(false)
  })
})

describe('targetLock: nearest (ระบบ #8 Skill-Targeting System)', () => {
  // นับตั้งแต่ reconcile กับ P4 combat core (PR #29): การ "หาศัตรูที่ใกล้สุด" ย้ายออกจาก
  // SkillSystem.ts ไปอยู่ softTarget.ts (findNearestLivingEnemy — เทสต์แล้วใน softTarget.test.ts,
  // "picks nearest living enemy" / "switches target when nearest dies") — ผู้เรียกจริง
  // (RealtimeBattleRuntime.tryStartPlayerSkill) resolve เป้าเอง แล้วส่ง id ตรง ๆ เข้า startSkill
  // ชุดเทสต์นี้จึงเหลือแค่ยืนยันว่า startSkill "เก็บค่าที่ได้รับมาตรง ๆ" ไม่ resolve เอง
  const kit = getRealtimeSkillKit('monkey-king')
  if (!kit) throw new Error('ไม่พบ kit หงอคง')
  const ultimate = getSkillFromKit(kit, 'ultimate') // attack.targetLock === 'nearest'

  function readyUltimate(): RealtimeBattleEntity {
    return player({ ultimateGauge: ULTIMATE_GAUGE_CONFIG.max })
  }

  it('เก็บ lockedTargetId ที่ผู้เรียกส่งมาตอนเริ่มร่าย (done-criterion #2)', () => {
    const unit = readyUltimate()
    const skill = createSkillState()

    startSkill(unit, skill, ultimate, 0, 'near')

    expect(skill.lockedTargetId).toBe('near')
  })

  it('ไม่ส่ง lockedTargetId มา = ไม่ล็อกเป้า ไม่ crash (done-criterion #1)', () => {
    const unit = readyUltimate()
    const skill = createSkillState()

    expect(() => startSkill(unit, skill, ultimate, 0, null)).not.toThrow()
    expect(skill.lockedTargetId).toBeNull()
    expect(isCastingSkill(skill)).toBe(true)
  })

  it('เป้าที่ล็อกไว้ยังคงเดิมตลอด stepSkill — resolve ครั้งเดียวตอน startSkill เท่านั้น (done-criterion #2)', () => {
    const unit = readyUltimate()
    const skill = createSkillState()

    startSkill(unit, skill, ultimate, 0, 'original')
    expect(skill.lockedTargetId).toBe('original')

    stepSkill(unit, skill, 16)
    expect(skill.lockedTargetId).toBe('original')
  })

  it('จบท่าแล้วเคลียร์ lockedTargetId เหมือน hitTargets', () => {
    const unit = readyUltimate()
    const skill = createSkillState()

    startSkill(unit, skill, ultimate, 0, 'near')
    stepSkill(unit, skill, totalDurationMs(ultimate.attack) + 1)

    expect(skill.lockedTargetId).toBeNull()
  })
})
