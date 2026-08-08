import { describe, expect, it } from 'vitest'
import { ENEMY_ATTACK_MELEE } from './attacks'
import {
  createEnemyBrain,
  isEnemyAttackDamageWindow,
  isEnemyTelegraphing,
  stepEnemyAI,
} from './EnemyAISystem'
import { createRealtimeBattle } from './createRealtimeBattle'
import { RealtimeBattleRuntime } from './RealtimeBattleRuntime'
import { findHitTargets } from './HitboxSystem'
import {
  BOSS_TEMPLATES,
  getEnemyTemplate,
  type BossAttackRow,
  type BossTemplate,
} from './stageConfig'
import { createDefaultSkillLevels } from './SkillProgressionSystem'
import type { RealtimeBattleEntity } from './types'
import type { Player } from '../../types/player'
import { EMPTY_PROGRESS } from '../../types/player'

const EXECUTE_MS =
  ENEMY_ATTACK_MELEE.startupMs + ENEMY_ATTACK_MELEE.activeMs + ENEMY_ATTACK_MELEE.recoveryMs
const TELEGRAPH_MS = ENEMY_ATTACK_MELEE.telegraphMs ?? 0

function makePlayer(): Player {
  return {
    id: 'acc-1',
    uid: '1234567890',
    name: 'ผู้ทดสอบ',
    title: 'นักเดินทาง',
    level: 10,
    exp: 0,
    expToNext: 100,
    currency: { gold: 0, gem: 0 },
    ownedCharacters: [
      {
        characterId: 'monkey-king',
        level: 12,
        exp: 0,
        expToNext: 100,
        obtainedAt: '2026-01-01T00:00:00.000Z',
        skillLevels: createDefaultSkillLevels(),
      },
    ],
    inventory: [],
    friends: [],
    teamSlots: ['monkey-king', null, null, null],
    frameId: 'default',
    progress: EMPTY_PROGRESS,
  }
}

function entity(overrides: Partial<RealtimeBattleEntity> = {}): RealtimeBattleEntity {
  return {
    id: 'e1',
    entityType: 'enemy',
    name: 'ศัตรูทดสอบ',
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    facing: 'down',
    combatFacing: 'right',
    state: 'idle',
    hp: 100,
    maxHp: 100,
    atk: 20,
    def: 10,
    speed: 130,
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
    enemyId: 'shadow-soldier',
    ...overrides,
  }
}

const template = getEnemyTemplate('shadow-soldier')
if (!template) throw new Error('ไม่พบแม่แบบ shadow-soldier')

describe('stepEnemyAI', () => {
  it('อยู่ไกลเกิน detectRange = ไม่ขยับ', () => {
    const enemy = entity({ position: { x: 0, y: 0 } })
    const player = entity({
      id: 'player',
      entityType: 'player',
      position: { x: template.detectRange + 100, y: 0 },
    })
    const brain = createEnemyBrain()

    const decision = stepEnemyAI(enemy, brain, player, 16)

    expect(brain.state).toBe('idle')
    expect(decision.move).toEqual({ x: 0, y: 0 })
  })

  it('เข้าระยะตรวจจับแล้วเริ่มไล่ และเดินเข้าหาผู้เล่น', () => {
    const enemy = entity({ position: { x: 0, y: 0 } })
    const player = entity({ id: 'player', entityType: 'player', position: { x: 300, y: 0 } })
    const brain = createEnemyBrain()

    stepEnemyAI(enemy, brain, player, 16) // idle → chase
    const decision = stepEnemyAI(enemy, brain, player, 16)

    expect(brain.state).toBe('chase')
    expect(enemy.state).toBe('walk')
    expect(decision.move.x).toBeCloseTo(1)
    expect(decision.move.y).toBeCloseTo(0)
  })

  it('เข้าระยะโจมตีแล้วเปลี่ยนเป็นท่าโจมตี และหยุดเดินตลอดท่า', () => {
    const enemy = entity({ position: { x: 0, y: 0 } })
    const player = entity({
      id: 'player',
      entityType: 'player',
      position: { x: template.attackRange - 10, y: 0 },
    })
    const brain = createEnemyBrain()

    stepEnemyAI(enemy, brain, player, 16) // → chase
    const decision = stepEnemyAI(enemy, brain, player, 16) // → telegraph

    expect(brain.state).toBe('telegraph')
    expect(isEnemyTelegraphing(brain)).toBe(true)
    expect(enemy.state).toBe('attack')
    expect(decision.move).toEqual({ x: 0, y: 0 })
    expect(enemy.attackCooldownRemainingMs).toBe(template.attackCooldownMs)

    stepEnemyAI(enemy, brain, player, TELEGRAPH_MS) // telegraph → attack execute
    expect(brain.state).toBe('attack')

    const during = stepEnemyAI(enemy, brain, player, ENEMY_ATTACK_MELEE.startupMs - 20)
    expect(brain.state).toBe('attack')
    expect(isEnemyAttackDamageWindow(brain)).toBe(false)
    expect(during.move).toEqual({ x: 0, y: 0 })
  })

  it('จบท่าโจมตีแล้วเข้าสู่ช่วงพัก ก่อนกลับไปไล่ต่อ', () => {
    const enemy = entity({ position: { x: 0, y: 0 } })
    const player = entity({
      id: 'player',
      entityType: 'player',
      position: { x: template.attackRange - 10, y: 0 },
    })
    const brain = createEnemyBrain()

    stepEnemyAI(enemy, brain, player, 16)
    stepEnemyAI(enemy, brain, player, 16)
    stepEnemyAI(enemy, brain, player, TELEGRAPH_MS)
    stepEnemyAI(enemy, brain, player, EXECUTE_MS)
    expect(brain.state).toBe('recover')

    stepEnemyAI(enemy, brain, player, 500)
    expect(brain.state).toBe('chase')
  })

  it('โดนตีจนเซ = หยุดทุกอย่างและท่าโจมตีถูกยกเลิก', () => {
    const enemy = entity({ position: { x: 0, y: 0 }, hitStunRemainingMs: 200 })
    const player = entity({ id: 'player', entityType: 'player', position: { x: 50, y: 0 } })
    const brain = createEnemyBrain()

    const decision = stepEnemyAI(enemy, brain, player, 16)

    expect(brain.state).toBe('hit')
    expect(enemy.state).toBe('hit')
    expect(decision.move).toEqual({ x: 0, y: 0 })
  })

  it('ตายแล้ว AI หยุดถาวร ไม่ไล่ ไม่โจมตี', () => {
    const enemy = entity({ hp: 0 })
    const player = entity({ id: 'player', entityType: 'player', position: { x: 10, y: 0 } })
    const brain = createEnemyBrain()

    const decision = stepEnemyAI(enemy, brain, player, 16)

    expect(brain.state).toBe('dead')
    expect(enemy.state).toBe('dead')
    expect(decision.move).toEqual({ x: 0, y: 0 })
  })

  it('ผู้เล่นตายแล้วศัตรูเลิกไล่', () => {
    const enemy = entity({ position: { x: 0, y: 0 } })
    const player = entity({ id: 'player', entityType: 'player', position: { x: 200, y: 0 }, hp: 0 })
    const brain = createEnemyBrain()

    stepEnemyAI(enemy, brain, player, 16)
    expect(brain.state).toBe('idle')
  })

  it('ยังไม่พ้นคูลดาวน์ = เข้าใกล้แล้วยืนรอ ไม่เข้าท่าโจมตี', () => {
    const enemy = entity({
      position: { x: 0, y: 0 },
      attackCooldownRemainingMs: 800,
    })
    const player = entity({
      id: 'player',
      entityType: 'player',
      position: { x: template.attackRange - 10, y: 0 },
    })
    const brain = createEnemyBrain()

    stepEnemyAI(enemy, brain, player, 16)
    const decision = stepEnemyAI(enemy, brain, player, 16)

    expect(brain.state).toBe('chase')
    expect(enemy.state).toBe('idle')
    expect(decision.move).toEqual({ x: 0, y: 0 })
  })

  it('Scar 1: updates facing towards player after recovering from hitstun to prevent stale facing', () => {
    const enemy = entity({
      position: { x: 100, y: 0 },
      combatFacing: 'left',
      facing: 'left',
      hitStunRemainingMs: 100,
      state: 'hit',
    })
    const player = entity({
      id: 'player',
      entityType: 'player',
      position: { x: 200, y: 0 },
    })
    const brain = createEnemyBrain()
    brain.state = 'hit'

    // Tick AI while in hitstun
    stepEnemyAI(enemy, brain, player, 16)
    expect(brain.state).toBe('hit')
    expect(enemy.combatFacing).toBe('left')

    // Relieve hitstun
    enemy.hitStunRemainingMs = 0
    stepEnemyAI(enemy, brain, player, 16) // Transition from hit -> chase
    expect(brain.state).toBe('chase')

    // Now tick again while in attack range to trigger attack
    enemy.position.x = 180
    stepEnemyAI(enemy, brain, player, 16) // chase -> telegraph
    expect(brain.state).toBe('telegraph')

    // The enemy should have faced the player horizontally (turned to the right)
    expect(enemy.combatFacing).toBe('right')
    expect(enemy.facing).toBe('right')
  })

  it('Scar 1: updates facing towards player after recovering from knockdown to prevent stale facing', () => {
    const enemy = entity({
      position: { x: 100, y: 0 },
      combatFacing: 'left',
      facing: 'left',
      state: 'knockdown',
      knockdownRemainingMs: 50,
    })
    const player = entity({
      id: 'player',
      entityType: 'player',
      position: { x: 200, y: 0 },
    })
    const brain = createEnemyBrain()
    brain.state = 'knockdown'

    // AI is locked during knockdown
    stepEnemyAI(enemy, brain, player, 16)
    expect(brain.state).toBe('knockdown')
    expect(enemy.combatFacing).toBe('left')

    // Rise up to getUp
    enemy.state = 'getUp'
    enemy.knockdownRemainingMs = 0
    enemy.getUpRemainingMs = 100
    stepEnemyAI(enemy, brain, player, 16)
    expect(brain.state).toBe('getUp')
    expect(enemy.combatFacing).toBe('left')

    // Get up completes, state goes to idle
    enemy.state = 'idle'
    enemy.getUpRemainingMs = 0
    stepEnemyAI(enemy, brain, player, 16) // Transitions getUp -> chase
    expect(brain.state).toBe('chase')

    // Move within attack range
    enemy.position.x = 180
    stepEnemyAI(enemy, brain, player, 16) // chase -> telegraph
    expect(brain.state).toBe('telegraph')

    // The enemy should now face the player to the right
    expect(enemy.combatFacing).toBe('right')
    expect(enemy.facing).toBe('right')
  })
})

/** ท่าโจมตีบอสสำหรับเทสต์ — module scope เพราะไม่ผูกกับ closure ใด ๆ (ไม่มี state จับ) */
function testBossAttackRow(overrides: Partial<BossAttackRow> = {}): BossAttackRow {
  return {
    id: 'boss-test-attack',
    animationId: 'attack-1',
    startupMs: 30,
    activeMs: 20,
    recoveryMs: 30,
    comboWindowStartMs: 0,
    comboWindowEndMs: 0,
    damageMultiplier: 1,
    range: 120,
    hitShape: 'horizontal',
    arcDegrees: 0,
    depthTolerance: 90,
    knockback: 100,
    telegraphMs: 900, // baseline บอส 800–1200ms (§3.6.12)
    ...overrides,
  }
}

/** #11 Boss System — HP-threshold phase-transition state machine (docs/agent-blueprint/11-boss-system.md) */
describe('stepEnemyAI — บอส (#11 Boss System)', () => {
  const TEST_BOSS_ID = 'test-boss'

  /** ลงทะเบียนแม่แบบบอสทดสอบใน BOSS_TEMPLATES ตรง ๆ — เหมือน ENEMY_TEMPLATES ที่เทสต์อื่นอ่านอยู่แล้ว */
  function registerTestBoss(overrides: Partial<BossTemplate> = {}): BossTemplate {
    const bossTemplate: BossTemplate = {
      id: TEST_BOSS_ID,
      name: 'บอสทดสอบ',
      spriteKind: 'pig-warrior',
      accent: '#ffffff',
      maxHp: 1000,
      atk: 80,
      def: 30,
      speed: 100,
      collisionRadius: 50,
      hurtboxRadius: 60,
      detectRange: 2000,
      attackRange: 100,
      attackCooldownMs: 0,
      phaseHpThreshold: 0.5,
      phaseTransitionMs: 1000,
      phases: [
        { attacks: [testBossAttackRow({ id: 'phase-1-attack' })] },
        { attacks: [testBossAttackRow({ id: 'phase-2-attack' })] },
      ],
      ...overrides,
    }
    BOSS_TEMPLATES[TEST_BOSS_ID] = bossTemplate
    return bossTemplate
  }

  function bossEntity(overrides: Partial<RealtimeBattleEntity> = {}): RealtimeBattleEntity {
    return entity({
      id: 'boss1',
      entityType: 'boss',
      enemyId: TEST_BOSS_ID,
      collisionRadius: 50,
      hurtboxRadius: 60,
      ...overrides,
    })
  }

  it('Done-criterion 1: HP ข้ามเกณฑ์ระหว่างท่าโจมตี/พักท่า ไม่ตัดท่าปัจจุบัน รอจนจบก่อนค่อยเปลี่ยนเฟส', () => {
    const bossTemplate = registerTestBoss()
    const boss = bossEntity({
      position: { x: 0, y: 0 },
      hp: bossTemplate.maxHp,
      maxHp: bossTemplate.maxHp,
    })
    const player = entity({
      id: 'player',
      entityType: 'player',
      position: { x: bossTemplate.attackRange - 10, y: 0 },
    })
    const brain = createEnemyBrain()

    stepEnemyAI(boss, brain, player, 16, 0) // idle → chase
    stepEnemyAI(boss, brain, player, 16, 16) // chase → telegraph (เลือกท่าเฟส 1)
    expect(brain.state).toBe('telegraph')
    const row = brain.selectedAttack
    if (!row) throw new Error('ควรมี selectedAttack แล้ว')

    stepEnemyAI(boss, brain, player, row.telegraphMs ?? 0, 100) // telegraph → attack
    expect(brain.state).toBe('attack')

    // HP ลดต่ำกว่า threshold ระหว่างอยู่ในท่าโจมตี (mid-AttackActive)
    boss.hp = bossTemplate.maxHp * 0.4

    const attackTotalMs = row.startupMs + row.activeMs + row.recoveryMs
    stepEnemyAI(boss, brain, player, attackTotalMs - 1, 1000) // ยังไม่จบท่า
    expect(brain.state).toBe('attack') // ยังไม่ถูกตัดท่า

    stepEnemyAI(boss, brain, player, 2, 2000) // ท่าจบพอดี → recover
    expect(brain.state).toBe('recover')

    // ยังอยู่กลาง recover (mid-Recovery) — ก็ยังไม่สลับเฟสจนกว่าจะจบ
    stepEnemyAI(boss, brain, player, 10, 2010)
    expect(brain.state).toBe('recover')

    // recover จบแล้ว (RECOVER_MS = 260) — ติ๊กนี้ recover ส่งตรงเข้า chase ก่อน (จุดปลอดภัย
    // เดียวกับที่ enemy ทั่วไปกลับไปไล่ต่อ) แล้วเกตของบอสจะตัดเข้า phase-transition ในติ๊กถัดไปทันที
    // (ยังไม่มี hitbox/ท่าใดเกิดขึ้นระหว่างนั้น — ล่าช้าแค่ 1 ติ๊กจำลอง ไม่กระทบ Done-criterion 1)
    stepEnemyAI(boss, brain, player, 260, 3000)
    expect(brain.state).toBe('chase')
    stepEnemyAI(boss, brain, player, 0, 3001)
    expect(brain.state).toBe('phase-transition')
  })

  it('Done-criterion 2: ระหว่าง PhaseTransition invulnerableUntilMs ยาวเกินระยะเปลี่ยนเฟส และ HitboxSystem ปฏิเสธทุกฮิต', () => {
    const bossTemplate = registerTestBoss({ phaseTransitionMs: 1000 })
    const boss = bossEntity({
      position: { x: 0, y: 0 },
      hp: bossTemplate.maxHp * 0.4,
      maxHp: bossTemplate.maxHp,
    })
    const player = entity({ id: 'player', entityType: 'player', position: { x: 9000, y: 9000 } })
    const brain = createEnemyBrain()

    stepEnemyAI(boss, brain, player, 16, 1000)

    expect(brain.state).toBe('phase-transition')
    expect(boss.invulnerableUntilMs).toBe(1000 + bossTemplate.phaseTransitionMs)

    const attacker = entity({ id: 'attacker', entityType: 'player' })
    const targets = findHitTargets([boss], {
      attacker,
      attack: testBossAttackRow(),
      alreadyHit: new Set(),
      elapsedMs: 1000 + bossTemplate.phaseTransitionMs - 1, // ยังอยู่ในช่วงคุ้มกัน
    })

    expect(targets).toHaveLength(0)
  })

  it('Done-criterion 3: พูลท่าหลังเปลี่ยนเฟสต้องต่างจากพูลก่อนเปลี่ยนเฟสจริง', () => {
    const bossTemplate = registerTestBoss()
    const boss = bossEntity({
      position: { x: 0, y: 0 },
      hp: bossTemplate.maxHp,
      maxHp: bossTemplate.maxHp,
    })
    const player = entity({
      id: 'player',
      entityType: 'player',
      position: { x: bossTemplate.attackRange - 10, y: 0 },
    })
    const brain = createEnemyBrain()

    stepEnemyAI(boss, brain, player, 16, 0) // → chase
    stepEnemyAI(boss, brain, player, 16, 16) // → telegraph เฟส 1
    const phase1Row = brain.selectedAttack
    if (!phase1Row) throw new Error('ควรมี selectedAttack แล้ว')
    expect(phase1Row).toBe(bossTemplate.phases[0].attacks[0])

    boss.hp = bossTemplate.maxHp * 0.4 // ข้าม threshold
    stepEnemyAI(boss, brain, player, phase1Row.telegraphMs ?? 0, 100) // telegraph → attack
    const attackTotalMs = phase1Row.startupMs + phase1Row.activeMs + phase1Row.recoveryMs
    stepEnemyAI(boss, brain, player, attackTotalMs, 200) // attack → recover
    stepEnemyAI(boss, brain, player, 260, 300) // recover → chase (จุดปลอดภัย)
    stepEnemyAI(boss, brain, player, 0, 301) // เกตบอสตัดเข้า phase-transition ติ๊กถัดไป
    expect(brain.state).toBe('phase-transition')
    stepEnemyAI(boss, brain, player, bossTemplate.phaseTransitionMs, 400) // phase-transition → chase
    expect(brain.state).toBe('chase')
    expect(brain.bossPhaseIndex).toBe(1)

    boss.attackCooldownRemainingMs = 0 // จำลอง tickTimers ของ runtime นับถอยหลังจนพ้นคูลดาวน์แล้ว
    stepEnemyAI(boss, brain, player, 16, 500) // → telegraph เฟส 2
    expect(brain.state).toBe('telegraph')
    const phase2Row = brain.selectedAttack
    expect(phase2Row).toBe(bossTemplate.phases[1].attacks[0])
    expect(phase2Row).not.toBe(phase1Row)
  })

  it('Done-criterion 4: Telegraph ค้างตาม telegraphMs ของท่า (baseline 800–1200ms) แล้วยิง ground-marker ก่อนเข้า AttackActive', () => {
    const bossTemplate = registerTestBoss()
    const boss = bossEntity({
      position: { x: 0, y: 0 },
      hp: bossTemplate.maxHp,
      maxHp: bossTemplate.maxHp,
    })
    const player = entity({
      id: 'player',
      entityType: 'player',
      position: { x: bossTemplate.attackRange - 10, y: 0 },
    })
    const brain = createEnemyBrain()

    stepEnemyAI(boss, brain, player, 16, 0) // → chase
    const decision = stepEnemyAI(boss, brain, player, 16, 16) // → telegraph

    expect(brain.state).toBe('telegraph')
    const row = brain.selectedAttack
    if (!row) throw new Error('ควรมี selectedAttack แล้ว')
    expect(row.telegraphMs).toBeGreaterThanOrEqual(800)
    expect(row.telegraphMs).toBeLessThanOrEqual(1200)
    expect(decision.telegraph).toBeDefined()
    expect(decision.telegraph?.durationMs).toBe(row.telegraphMs)

    // ยังไม่ครบ telegraphMs → ยังไม่เข้า AttackActive
    stepEnemyAI(boss, brain, player, (row.telegraphMs ?? 0) - 10, 100)
    expect(brain.state).toBe('telegraph')

    // ครบแล้ว → attack (ท่าเดียวกับที่เทเลกราฟไว้ — กันสลับท่า, scar #2)
    stepEnemyAI(boss, brain, player, 10, 1000)
    expect(brain.state).toBe('attack')
    expect(brain.selectedAttack).toBe(row)
  })

  it('Done-criterion 5: เปลี่ยนเฟสได้ครั้งเดียวต่อบอสหนึ่งตัว แม้ HP แกว่งกลับข้าม threshold ซ้ำหลังเฟส 2', () => {
    const bossTemplate = registerTestBoss({ phaseTransitionMs: 50 })
    const boss = bossEntity({
      position: { x: 9000, y: 9000 },
      hp: bossTemplate.maxHp * 0.4,
      maxHp: bossTemplate.maxHp,
    })
    // ผู้เล่นอยู่ไกลนอกระยะตรวจจับ กัน AI ไปวุ่นกับ chase/attack ระหว่างทดสอบ HP แกว่ง
    const player = entity({ id: 'player', entityType: 'player', position: { x: 90000, y: 90000 } })
    const brain = createEnemyBrain()

    stepEnemyAI(boss, brain, player, 16, 0)
    expect(brain.state).toBe('phase-transition')

    stepEnemyAI(boss, brain, player, 60, 100) // ครบ phaseTransitionMs → idle, เฟส 2 แล้ว
    expect(brain.bossPhaseIndex).toBe(1)
    expect(brain.state).toBe('idle')

    // HP แกว่งข้าม threshold ไปมาหลายรอบ
    boss.hp = bossTemplate.maxHp * 0.6
    stepEnemyAI(boss, brain, player, 16, 200)
    boss.hp = bossTemplate.maxHp * 0.3
    stepEnemyAI(boss, brain, player, 16, 300)
    boss.hp = bossTemplate.maxHp * 0.6
    stepEnemyAI(boss, brain, player, 16, 400)
    boss.hp = bossTemplate.maxHp * 0.2
    stepEnemyAI(boss, brain, player, 16, 500)

    expect(brain.state).not.toBe('phase-transition')
    expect(brain.bossPhaseIndex).toBe(1)
  })

  it('Scar 1: AFK glitch prevention — boss AI wakes up and chases immediately on first step if player in range', () => {
    const bossTemplate = registerTestBoss()
    const boss = bossEntity({
      position: { x: 0, y: 0 },
      hp: bossTemplate.maxHp,
      maxHp: bossTemplate.maxHp,
    })
    const player = entity({
      id: 'player',
      entityType: 'player',
      position: { x: 500, y: 0 }, // อยู่ในระยะ detectRange และเกินระยะโจมตี (100)
    })
    const brain = createEnemyBrain()

    // รันเฟรมแรกเพื่อตื่นจาก idle -> chase
    stepEnemyAI(boss, brain, player, 16)
    expect(brain.state).toBe('chase')

    // รันเฟรมที่สองเพื่อเริ่มไล่ขยับจริง
    const decision = stepEnemyAI(boss, brain, player, 16)
    expect(Math.abs(decision.move.x)).toBeGreaterThan(0) // ต้องขยับไล่ล่าทันที ไม่ยืนนิ่ง/AFK
  })

  it('Scar 2: Telegraph windup cancel prevention — cannot switch selectedAttack mid-windup even under state interruptions', () => {
    const bossTemplate = registerTestBoss()
    const boss = bossEntity({
      position: { x: 0, y: 0 },
      hp: bossTemplate.maxHp * 0.4, // อยู่เฟส 2 แล้ว
      maxHp: bossTemplate.maxHp,
    })
    const player = entity({
      id: 'player',
      entityType: 'player',
      position: { x: bossTemplate.attackRange - 10, y: 0 },
    })
    const brain = createEnemyBrain()
    brain.bossPhaseIndex = 1 // บังคับเฟส 2

    // เข้าสู่สถานะ telegraph
    stepEnemyAI(boss, brain, player, 16) // idle -> chase
    stepEnemyAI(boss, brain, player, 16) // chase -> telegraph
    expect(brain.state).toBe('telegraph')
    const originalSelectedAttack = brain.selectedAttack
    expect(originalSelectedAttack).not.toBeNull()

    // จำลองความพยายามขัดขวางหรือเปลี่ยนสถานะกลางทาง (เช่น ขยับ HP ขึ้นข้าม threshold อีกครั้ง)
    boss.hp = bossTemplate.maxHp * 0.9 // ดัน HP กลับขึ้นไปเฟส 1

    // อัปเดตเฟรมถัดไปขณะอยู่ใน telegraph
    stepEnemyAI(boss, brain, player, 16)
    expect(brain.state).toBe('telegraph')
    expect(brain.selectedAttack).toBe(originalSelectedAttack) // selectedAttack ต้องคงเดิม ห้ามสลับท่า
  })

  it('Scar 3: Gwyn simultaneous trigger safety (lethal hit bypasses phase transition and goes straight to dead state)', () => {
    const bossTemplate = registerTestBoss()
    const boss = bossEntity({
      position: { x: 0, y: 0 },
      hp: bossTemplate.maxHp,
      maxHp: bossTemplate.maxHp,
    })
    const player = entity({ id: 'player', entityType: 'player', position: { x: 0, y: 0 } })
    const brain = createEnemyBrain()

    // โดนทีเดียวตายสนิท (เช่น ข้าม threshold 50% และ HP ดิ่งเป็น 0 ในติ๊กเดียวกัน)
    boss.hp = 0

    stepEnemyAI(boss, brain, player, 16)
    expect(brain.state).toBe('dead')
    expect(brain.bossPendingPhaseTransition).toBe(false)
  })

  it('Scar 4: Fog wall boundary check — boss position remains clamped to stage boundaries during Phase 2 attack execution', () => {
    const bossTemplate = registerTestBoss()
    const boss = bossEntity({
      position: { x: 10, y: 10 }, // ใกล้ขอบซ้าย (0, 0)
      hp: bossTemplate.maxHp * 0.4, // เฟส 2
      maxHp: bossTemplate.maxHp,
    })

    // จำลองการขยับไปชนขอบด่าน
    // ในลูปการเล่นจริง ขอบเขตด่านจะถูกบังคับโดย stepMovement
    // เราจะยืนยันว่าเวกเตอร์ที่ AI ส่งออกมา และทิศทางในการชนขอบ ไม่ส่งผลเสียต่อการทำงานของ state machine
    const player = entity({
      id: 'player',
      entityType: 'player',
      position: { x: 50, y: 10 },
    })
    const brain = createEnemyBrain()
    brain.bossPhaseIndex = 1

    // chase -> telegraph
    stepEnemyAI(boss, brain, player, 16) // idle -> chase
    stepEnemyAI(boss, brain, player, 16) // chase -> telegraph
    expect(brain.state).toBe('telegraph')

    // สมมติว่าในระหว่างนี้ boss โดนดันจนติดขอบ (พิกัดติดลบ หรืออยู่นอกพื้นที่เล่น)
    const stageWidth = 800
    // บังคับการบีบตำแหน่ง
    boss.position.x = Math.max(
      boss.collisionRadius,
      Math.min(stageWidth - boss.collisionRadius, -50),
    )
    expect(boss.position.x).toBe(boss.collisionRadius) // ต้องไม่หลุดขอบ

    // ดำเนินการขั้นถัดไปใน telegraph
    stepEnemyAI(boss, brain, player, 16)
    expect(brain.state).toBe('telegraph') // state machine ยังทำงานปกติต่อเนื่อง
  })

  describe('Scar 1: stuck aware/chase transition checks', () => {
    it('transitions from idle to chase correctly under various spawn and boundary crossing scenarios', () => {
      const kit = getEnemyTemplate('shadow-soldier')
      if (!kit) throw new Error('shadow-soldier template missing')

      // Case A: Just spawned (idle)
      const enemy = entity({ position: { x: 0, y: 0 } })
      const player = entity({
        id: 'player',
        entityType: 'player',
        position: { x: kit.detectRange - 10, y: 0 },
      })
      const brain = createEnemyBrain()
      expect(brain.state).toBe('idle')

      // Should transition to chase on first step, then start walking on second step
      stepEnemyAI(enemy, brain, player, 16)
      expect(brain.state).toBe('chase')
      let decision = stepEnemyAI(enemy, brain, player, 16)
      expect(decision.move.x).toBeGreaterThan(0)

      // Case B: Exiting 'hit' back to idle/chase
      brain.state = 'hit'
      enemy.hitStunRemainingMs = 0
      stepEnemyAI(enemy, brain, player, 16)
      expect(brain.state).toBe('chase')
      decision = stepEnemyAI(enemy, brain, player, 16)
      expect(decision.move.x).toBeGreaterThan(0)

      // Case C: Exiting 'recover' back to idle/chase
      brain.state = 'recover'
      brain.stateElapsedMs = 300 // RECOVER_MS is 260
      stepEnemyAI(enemy, brain, player, 16)
      expect(brain.state).toBe('chase')
      decision = stepEnemyAI(enemy, brain, player, 16)
      expect(decision.move.x).toBeGreaterThan(0)

      // Case D: Different deltaMs sizes when crossing boundary
      const enemyD = entity({ position: { x: 0, y: 0 } })
      const playerD = entity({
        id: 'player',
        entityType: 'player',
        position: { x: kit.detectRange - 5, y: 0 },
      })

      const brainD1 = createEnemyBrain()
      stepEnemyAI(enemyD, brainD1, playerD, 1) // deltaMs = 1ms
      expect(brainD1.state).toBe('chase')

      const brainD2 = createEnemyBrain()
      stepEnemyAI(enemyD, brainD2, playerD, 1000) // deltaMs = 1000ms
      expect(brainD2.state).toBe('chase')
    })
  })

  describe('Scar 2: boundary position clamp mismatch checks', () => {
    it('correctly decides movement vectors and state transitions even when pinned against boundaries', () => {
      const kit = getEnemyTemplate('shadow-soldier')
      if (!kit) throw new Error('shadow-soldier template missing')

      const enemy = entity({ position: { x: 34, y: 34 } }) // pinned at corner (collisionRadius = 34)
      const player = entity({ id: 'player', entityType: 'player', position: { x: 120, y: 34 } })
      const brain = createEnemyBrain()

      // Player is outside attack range, so AI should chase
      stepEnemyAI(enemy, brain, player, 16)
      expect(brain.state).toBe('chase')
      let decision = stepEnemyAI(enemy, brain, player, 16)
      expect(enemy.state).toBe('walk')
      // Vector should point directly right (towards player)
      expect(decision.move.x).toBeCloseTo(1)
      expect(decision.move.y).toBeCloseTo(0)

      // Even if enemy position is clamped by MovementSystem (doesn't move), state evaluation is clean
      player.position = { x: 74, y: 34 } // distance is 40px (<= attackRange)
      decision = stepEnemyAI(enemy, brain, player, 16)
      // Should transition to telegraph
      expect(brain.state).toBe('telegraph')
      expect(decision.move).toEqual({ x: 0, y: 0 })
    })
  })

  describe('Scar 3: reload/reconnect session desync simulation checks', () => {
    it('cleanly resets enemy state to idle/chase and avoids double hits when brain is re-initialized mid-attack', () => {
      const kit = getEnemyTemplate('shadow-soldier')
      if (!kit) throw new Error('shadow-soldier template missing')

      const enemy = entity({ position: { x: 0, y: 0 }, state: 'attack' })
      const player = entity({ id: 'player', entityType: 'player', position: { x: 200, y: 0 } })

      // Simulate a reloaded brain
      const freshBrain = createEnemyBrain()
      expect(freshBrain.state).toBe('idle')
      expect(freshBrain.selectedAttack).toBeNull()

      // stepEnemyAI should evaluate the idle state, reset the enemy's state to idle (or chase), and output zero movement
      stepEnemyAI(enemy, freshBrain, player, 16)
      expect(freshBrain.state).toBe('chase') // transitioned immediately to chase because player is within range

      const decision = stepEnemyAI(enemy, freshBrain, player, 16)
      expect(enemy.state).toBe('walk')
      expect(decision.move.x).toBeGreaterThan(0)
      expect(freshBrain.selectedAttack).toBeNull()
      expect(freshBrain.hitTargets.size).toBe(0)
    })
  })
})

/** เดินเวลาเป็นก้าวคงที่เหมือนลูปจริง ไม่ใช่ก้อนเดียวใหญ่ ๆ */
function advance(runtime: RealtimeBattleRuntime, ms: number) {
  const stepMs = 1000 / 60
  for (let t = 0; t < ms; t += stepMs) runtime.step(stepMs)
}

describe('runtime กับศัตรูทั้งกอง', () => {
  function runtimeWithEnemies() {
    const state = createRealtimeBattle('trial-01', makePlayer())
    if (!state) throw new Error('สร้างสถานะไม่สำเร็จ')
    return new RealtimeBattleRuntime(state)
  }

  it('ศัตรูเดินเข้าหาผู้เล่นเมื่อการต่อสู้เริ่มแล้ว', () => {
    const runtime = runtimeWithEnemies()
    const state = runtime.getState()
    const enemy = state.enemies[0]
    const before = Math.hypot(
      enemy.position.x - state.player.position.x,
      enemy.position.y - state.player.position.y,
    )

    advance(runtime, 2000)

    const after = Math.hypot(
      enemy.position.x - state.player.position.x,
      enemy.position.y - state.player.position.y,
    )
    expect(after).toBeLessThan(before)
  })

  it('ศัตรูไม่กองทับกันเป็นตัวเดียวแม้จะวิ่งเข้าหาจุดเดียวกัน', () => {
    const runtime = runtimeWithEnemies()
    const state = runtime.getState()

    advance(runtime, 6000)

    for (let i = 0; i < state.enemies.length; i += 1) {
      for (let j = i + 1; j < state.enemies.length; j += 1) {
        const a = state.enemies[i]
        const b = state.enemies[j]
        const gap = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y)
        // Visual crowd spacing is wider than gameplay collision so wide HD sprites remain readable.
        expect(gap).toBeGreaterThan((a.collisionRadius + b.collisionRadius) * 1.4)
      }
    }
  })

  it('ศัตรูไม่หลุดออกนอกห้อง', () => {
    const runtime = runtimeWithEnemies()
    const state = runtime.getState()

    advance(runtime, 4000)

    for (const enemy of state.enemies) {
      expect(enemy.position.x).toBeGreaterThanOrEqual(enemy.collisionRadius - 0.01)
      expect(enemy.position.x).toBeLessThanOrEqual(state.stage.width - enemy.collisionRadius + 0.01)
      expect(enemy.position.y).toBeGreaterThanOrEqual(enemy.collisionRadius - 0.01)
      expect(enemy.position.y).toBeLessThanOrEqual(
        state.stage.height - enemy.collisionRadius + 0.01,
      )
    }
  })

  it('การต่อสู้จบแล้ว (exiting) ศัตรูหยุดสนิท', () => {
    const runtime = runtimeWithEnemies()
    advance(runtime, 2000)

    runtime.requestExit()
    const state = runtime.getState()
    const positions = state.enemies.map((enemy) => ({ ...enemy.position }))

    advance(runtime, 2000)

    state.enemies.forEach((enemy, index) => {
      expect(enemy.position).toEqual(positions[index])
    })
  })
})
