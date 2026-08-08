import { describe, expect, it } from 'vitest'
import { PLAYER_ATTACK_CHAIN } from './attacks'

/** ไม้แรกของคอมโบ — ใช้เป็นท่าอ้างอิงในเทสต์ชุดนี้ */
const PLAYER_ATTACK = PLAYER_ATTACK_CHAIN[0]
import { findHitTargets } from './HitboxSystem'
import type { RealtimeBattleEntity } from './types'

function entity(overrides: Partial<RealtimeBattleEntity> = {}): RealtimeBattleEntity {
  return {
    id: 'unit',
    entityType: 'enemy',
    name: 'เป้าหมาย',
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    facing: 'right',
    combatFacing: 'right',
    state: 'idle',
    hp: 100,
    maxHp: 100,
    atk: 50,
    def: 20,
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

const attacker = () =>
  entity({
    id: 'player',
    entityType: 'player',
    combatFacing: 'right',
    facing: 'right',
    position: { x: 0, y: 0 },
  })

function query(overrides: Partial<Parameters<typeof findHitTargets>[1]> = {}) {
  return {
    attacker: attacker(),
    attack: PLAYER_ATTACK,
    alreadyHit: new Set<string>(),
    elapsedMs: 1000,
    ...overrides,
  }
}

describe('findHitTargets (P2 horizontal + depth)', () => {
  it('โดนเป้าหมายด้านหน้าในระยะและแนว depth ใกล้พอ', () => {
    const target = entity({ id: 'e1', position: { x: 100, y: 0 } })
    expect(findHitTargets([target], query()).map((t) => t.id)).toEqual(['e1'])
  })

  it('ไม่โดนเป้าหมายที่อยู่ด้านหลัง แม้จะใกล้มาก', () => {
    const behind = entity({ id: 'e1', position: { x: -60, y: 0 } })
    expect(findHitTargets([behind], query())).toHaveLength(0)
  })

  it('ไม่โดนเป้าหมายที่อยู่ไกลเกินระยะแนวนอน', () => {
    const far = entity({ id: 'e1', position: { x: PLAYER_ATTACK.range + 200, y: 0 } })
    expect(findHitTargets([far], query())).toHaveLength(0)
  })

  it('โดนเป้าหมายที่ offset depth ภายใน tolerance', () => {
    const aligned = entity({ id: 'e1', position: { x: 90, y: 80 } })
    expect(findHitTargets([aligned], query())).toHaveLength(1)
  })

  it('ไม่โดนเป้าหมายที่ depth ห่างเกิน tolerance', () => {
    const misaligned = entity({ id: 'e1', position: { x: 90, y: 200 } })
    expect(findHitTargets([misaligned], query())).toHaveLength(0)
  })

  it('เผื่อรัศมีตัวเป้าหมาย — ขอบตัวเข้ามาในระยะก็ถือว่าโดน', () => {
    const edge = entity({
      id: 'e1',
      position: { x: PLAYER_ATTACK.range + 20, y: 0 },
      hurtboxRadius: 36,
    })
    expect(findHitTargets([edge], query())).toHaveLength(1)
  })

  it('โจมตีซ้ายโดนเป้าหมายทางซ้ายเท่านั้น', () => {
    const leftSide = entity({ id: 'e1', position: { x: -80, y: 0 } })
    const rightSide = entity({ id: 'e2', position: { x: 80, y: 0 } })
    const leftAttacker = entity({
      id: 'player',
      entityType: 'player',
      combatFacing: 'left',
      facing: 'left',
      position: { x: 0, y: 0 },
    })
    const hits = findHitTargets([leftSide, rightSide], {
      ...query(),
      attacker: leftAttacker,
    })
    expect(hits.map((t) => t.id)).toEqual(['e1'])
  })

  it('ไม่โดนซ้ำถ้าอยู่ใน alreadyHit แล้ว', () => {
    const target = entity({ id: 'e1', position: { x: 100, y: 0 } })
    const hit = findHitTargets([target], query({ alreadyHit: new Set(['e1']) }))
    expect(hit).toHaveLength(0)
  })

  it('ไม่โดนเป้าหมายที่กำลังอยู่ยงคงกระพัน', () => {
    const target = entity({ id: 'e1', position: { x: 100, y: 0 }, invulnerableUntilMs: 2000 })
    expect(findHitTargets([target], query({ elapsedMs: 1000 }))).toHaveLength(0)
  })

  it('ไม่โดนศพ', () => {
    const dead = entity({ id: 'e1', position: { x: 100, y: 0 }, hp: 0, state: 'dead' })
    expect(findHitTargets([dead], query())).toHaveLength(0)
  })

  it('ไม่ตีตัวเอง', () => {
    const self = attacker()
    expect(findHitTargets([self], query({ attacker: self }))).toHaveLength(0)
  })

  it('ท่า radial (360°) ยังโดนรอบตัวได้', () => {
    const around = { ...PLAYER_ATTACK, hitShape: 'radial' as const, arcDegrees: 360 }
    const behind = entity({ id: 'e1', position: { x: -80, y: 0 } })
    const above = entity({ id: 'e2', position: { x: 0, y: -80 } })

    const hits = findHitTargets([behind, above], query({ attack: around }))
    expect(hits.map((t) => t.id).toSorted()).toEqual(['e1', 'e2'])
  })

  it('โดนหลายตัวพร้อมกันได้ถ้าอยู่ในระยะและ depth ใกล้พอ', () => {
    const a = entity({ id: 'e1', position: { x: 90, y: 20 } })
    const b = entity({ id: 'e2', position: { x: 90, y: -20 } })
    expect(findHitTargets([a, b], query())).toHaveLength(2)
  })
})

describe('findHitTargets — targetLock: nearest (ระบบ #8 Skill-Targeting System)', () => {
  const LOCKED_ATTACK = { ...PLAYER_ATTACK, targetLock: 'nearest' as const }

  it('ไม่มี lockedTargetId (0 ศัตรูตอนเริ่มร่าย) = ไม่โดนใคร ไม่ crash (done-criterion #1)', () => {
    const target = entity({ id: 'e1', position: { x: 100, y: 0 } })
    expect(
      findHitTargets([target], query({ attack: LOCKED_ATTACK, lockedTargetId: undefined })),
    ).toEqual([])
    expect(findHitTargets([], query({ attack: LOCKED_ATTACK, lockedTargetId: undefined }))).toEqual(
      [],
    )
  })

  it('โดนเฉพาะเป้าที่ล็อกไว้ ข้าม hitShape/range ปกติไปเลย', () => {
    // อยู่นอกระยะโจมตีปกติของ PLAYER_ATTACK มาก — ถ้าไม่ bypass hitShape จะไม่โดน
    const locked = entity({ id: 'locked', position: { x: PLAYER_ATTACK.range + 500, y: 0 } })
    const hits = findHitTargets(
      [locked],
      query({ attack: LOCKED_ATTACK, lockedTargetId: 'locked' }),
    )
    expect(hits.map((t) => t.id)).toEqual(['locked'])
  })

  it('คงเป้าที่ล็อกไว้แม้มีเป้าที่ใกล้กว่าอยู่ในลิสต์ (done-criterion #2)', () => {
    const lockedFar = entity({ id: 'locked-far', position: { x: 900, y: 0 } })
    const closer = entity({ id: 'closer', position: { x: 30, y: 0 } })
    const hits = findHitTargets(
      [closer, lockedFar],
      query({ attack: LOCKED_ATTACK, lockedTargetId: 'locked-far' }),
    )
    expect(hits.map((t) => t.id)).toEqual(['locked-far'])
  })

  it('เป้าที่ล็อกไว้หลุดออกจากลิสต์ศัตรู (ตาย/ถูกลบ) ก่อนหน้าต่าง active ปิด = ไม่โดนใคร ไม่ crash (done-criterion #3)', () => {
    const other = entity({ id: 'still-here', position: { x: 50, y: 0 } })
    const hits = findHitTargets([other], query({ attack: LOCKED_ATTACK, lockedTargetId: 'gone' }))
    expect(hits).toEqual([])
  })

  it('เป้าที่ล็อกไว้ตายในลิสต์แล้ว = ไม่โดน ไม่ใช่ silent hit ที่ไม่มีดาเมจ (done-criterion #3, Argenti scar)', () => {
    const deadLocked = entity({
      id: 'locked',
      position: { x: 100, y: 0 },
      hp: 0,
      state: 'dead',
    })
    const hits = findHitTargets(
      [deadLocked],
      query({ attack: LOCKED_ATTACK, lockedTargetId: 'locked' }),
    )
    expect(hits).toEqual([])
  })

  it('ยังเคารพ alreadyHit เดิม (dedup ไม่ถูกแตะต้องโดยการล็อกเป้า)', () => {
    const locked = entity({ id: 'locked', position: { x: 100, y: 0 } })
    const hits = findHitTargets(
      [locked],
      query({
        attack: LOCKED_ATTACK,
        lockedTargetId: 'locked',
        alreadyHit: new Set(['locked']),
      }),
    )
    expect(hits).toEqual([])
  })

  it('Scar 1: target invulnerability window prevents subsequent hits during elapsedMs', () => {
    const target = entity({ id: 'target', position: { x: 50, y: 0 } })
    const testAttacker = entity({
      id: 'player',
      entityType: 'player',
      combatFacing: 'right',
      position: { x: 0, y: 0 },
    })

    // Initial hit at 1000ms sets target's invulnerability until 1120ms
    target.invulnerableUntilMs = 1120

    // Query hitbox at 1100ms -> should filter target out
    let hits = findHitTargets([target], query({ attacker: testAttacker, elapsedMs: 1100 }))
    expect(hits).toHaveLength(0)

    // Query hitbox at 1121ms -> should hit the target
    hits = findHitTargets([target], query({ attacker: testAttacker, elapsedMs: 1121 }))
    expect(hits.map((t) => t.id)).toEqual(['target'])
  })

  it('Scar 2: uses current combatFacing at resolution time (mid-animation crossing)', () => {
    const target = entity({ id: 'target', position: { x: 100, y: 0 } })
    const testAttacker = entity({
      id: 'player',
      entityType: 'player',
      combatFacing: 'right',
      facing: 'right',
      position: { x: 0, y: 0 },
    })

    // At attack start, target is in front (x: 100, combatFacing: right) -> hits
    let hits = findHitTargets([target], query({ attacker: testAttacker }))
    expect(hits.map((t) => t.id)).toEqual(['target'])

    // Target crosses behind attacker mid-animation (x: -100, combatFacing remains right) -> misses
    target.position.x = -100
    hits = findHitTargets([target], query({ attacker: testAttacker }))
    expect(hits).toHaveLength(0)

    // Attacker combatFacing updates/flips to left mid-animation -> hits again
    testAttacker.combatFacing = 'left'
    hits = findHitTargets([target], query({ attacker: testAttacker }))
    expect(hits.map((t) => t.id)).toEqual(['target'])
  })

  it('Scar 3: depth Y-axis check is symmetric for positive and negative offsets', () => {
    const testAttacker = entity({
      id: 'player',
      entityType: 'player',
      combatFacing: 'right',
      position: { x: 0, y: 0 },
    })

    const targetPositive = entity({ id: 'target-pos', position: { x: 50, y: 30 } })
    const targetNegative = entity({ id: 'target-neg', position: { x: 50, y: -30 } })

    const testAttack = {
      ...PLAYER_ATTACK,
      range: 100,
      depthTolerance: 40,
    }

    // Depth gap is 30 - 36 (hurtboxRadius) = -6 (<= 40), so both should hit
    let hits = findHitTargets(
      [targetPositive, targetNegative],
      query({ attacker: testAttacker, attack: testAttack }),
    )
    expect(hits.map((t) => t.id)).toContain('target-pos')
    expect(hits.map((t) => t.id)).toContain('target-neg')

    // If depth tolerance is smaller than depth gap:
    const strictAttack = {
      ...PLAYER_ATTACK,
      range: 100,
      depthTolerance: 10,
    }
    // target.hurtboxRadius is 36. dy is 60. depthGap = 60 - 36 = 24.
    // 24 > 10, so both should miss symmetrically.
    targetPositive.position.y = 60
    targetNegative.position.y = -60

    hits = findHitTargets(
      [targetPositive, targetNegative],
      query({ attacker: testAttacker, attack: strictAttack }),
    )
    expect(hits).toHaveLength(0)
  })
})

describe('findHitTargets — multiTarget (Hero Kit §3.6.7)', () => {
  it('multiTarget: true โจมตีทุกเป้าใน geometry', () => {
    const near = entity({ id: 'near', position: { x: 80, y: 0 } })
    const far = entity({ id: 'far', position: { x: 100, y: 0 } })
    const sweep = { ...PLAYER_ATTACK, multiTarget: true }
    const hits = findHitTargets([near, far], query({ attack: sweep }))
    expect(hits.map((t) => t.id).toSorted()).toEqual(['far', 'near'])
  })

  it('multiTarget: false โจมตีเป้าใกล้สุดตัวเดียว', () => {
    const near = entity({ id: 'near', position: { x: 80, y: 0 } })
    const far = entity({ id: 'far', position: { x: 100, y: 0 } })
    const single = { ...PLAYER_ATTACK, multiTarget: false }
    const hits = findHitTargets([near, far], query({ attack: single }))
    expect(hits.map((t) => t.id)).toEqual(['near'])
  })

  it('multiTarget: undefined รักษา sweep เดิม (backward compatible)', () => {
    const near = entity({ id: 'near', position: { x: 80, y: 0 } })
    const far = entity({ id: 'far', position: { x: 100, y: 0 } })
    const legacy = { ...PLAYER_ATTACK, multiTarget: undefined }
    const hits = findHitTargets([near, far], query({ attack: legacy }))
    expect(hits).toHaveLength(2)
  })

  it('MONKEY_GOLDEN_FURY multiTarget: false + targetLock = เป้าเดียว', () => {
    const locked = entity({ id: 'locked', position: { x: 100, y: 0 } })
    const closer = entity({ id: 'closer', position: { x: 40, y: 0 } })
    const hits = findHitTargets([locked, closer], {
      attacker: attacker(),
      attack: { ...PLAYER_ATTACK, targetLock: 'nearest', multiTarget: false },
      alreadyHit: new Set(),
      elapsedMs: 1000,
      lockedTargetId: 'locked',
    })
    expect(hits.map((t) => t.id)).toEqual(['locked'])
  })
})
