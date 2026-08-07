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
