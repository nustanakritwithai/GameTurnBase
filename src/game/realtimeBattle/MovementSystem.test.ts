import { describe, expect, it } from 'vitest'
import {
  clampToArena,
  directionFromVector,
  normalizeVector,
  resolveCircleOverlap,
  stepMovement,
} from './MovementSystem'
import { getRealtimeStage, type RealtimeBattleStage } from './stageConfig'
import type { RealtimeBattleEntity } from './types'

function stage(): RealtimeBattleStage {
  const found = getRealtimeStage('trial-01')
  if (!found) throw new Error('ไม่พบด่าน trial-01')
  return found
}

function entity(overrides: Partial<RealtimeBattleEntity> = {}): RealtimeBattleEntity {
  return {
    id: 'test',
    entityType: 'player',
    name: 'ทดสอบ',
    position: { x: 500, y: 500 },
    velocity: { x: 0, y: 0 },
    facing: 'up',
    combatFacing: 'right',
    state: 'idle',
    hp: 100,
    maxHp: 100,
    atk: 10,
    def: 5,
    speed: 200,
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

describe('normalizeVector', () => {
  it('เดินเฉียงไม่เร็วกว่าเดินตรง', () => {
    const diagonal = normalizeVector({ x: 1, y: 1 })
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1)
  })

  it('เก็บความแรงของจอยที่ดันไม่สุดไว้ (เดินช้าได้)', () => {
    const half = normalizeVector({ x: 0.5, y: 0 })
    expect(half).toEqual({ x: 0.5, y: 0 })
  })

  it('ตัดค่าที่เล็กกว่า deadzone ทิ้ง กัน drift จากจอยที่ไม่กลับศูนย์', () => {
    expect(normalizeVector({ x: 0.05, y: -0.03 })).toEqual({ x: 0, y: 0 })
  })
})

describe('directionFromVector', () => {
  it.each([
    [{ x: 1, y: 0 }, 'right'],
    [{ x: -1, y: 0 }, 'left'],
    [{ x: 0, y: -1 }, 'up'],
    [{ x: 0, y: 1 }, 'down'],
    [{ x: 1, y: -1 }, 'up-right'],
    [{ x: -1, y: -1 }, 'up-left'],
    [{ x: 1, y: 1 }, 'down-right'],
    [{ x: -1, y: 1 }, 'down-left'],
  ])('%o → %s', (vector, expected) => {
    expect(directionFromVector(vector)).toBe(expected)
  })

  it('ไม่ได้เดิน = ไม่เปลี่ยนทิศ', () => {
    expect(directionFromVector({ x: 0, y: 0 })).toBeNull()
  })
})

describe('clampToArena', () => {
  it('ดันกลับเข้าห้องพร้อมเผื่อรัศมีตัวละคร', () => {
    const s = stage()
    expect(clampToArena({ x: -50, y: -50 }, 30, s)).toEqual({ x: 30, y: 30 })
    expect(clampToArena({ x: s.width + 999, y: s.height + 999 }, 30, s)).toEqual({
      x: s.width - 30,
      y: s.height - 30,
    })
  })

  it('อยู่ในห้องอยู่แล้วไม่ถูกขยับ', () => {
    const position = { x: 900, y: 500 }
    expect(clampToArena(position, 30, stage())).toEqual(position)
  })
})

describe('resolveCircleOverlap', () => {
  it('ดันออกจนพอดีระยะรัศมีรวม', () => {
    const pushed = resolveCircleOverlap({ x: 110, y: 100 }, 30, { x: 100, y: 100 }, 30)
    expect(Math.hypot(pushed.x - 100, pushed.y - 100)).toBeCloseTo(60)
  })

  it('ไม่ทับกันก็ไม่ขยับ', () => {
    const free = { x: 300, y: 300 }
    expect(resolveCircleOverlap(free, 30, { x: 100, y: 100 }, 30)).toEqual(free)
  })

  it('ซ้อนกันสนิทก็ยังต้องแยกออกได้ (ไม่หารด้วยศูนย์)', () => {
    const pushed = resolveCircleOverlap({ x: 100, y: 100 }, 30, { x: 100, y: 100 }, 30)
    expect(Number.isFinite(pushed.x)).toBe(true)
    expect(Number.isFinite(pushed.y)).toBe(true)
    expect(Math.hypot(pushed.x - 100, pushed.y - 100)).toBeCloseTo(60)
  })
})

describe('stepMovement', () => {
  const context = () => ({ stage: stage(), blockers: [] })

  it('เดินตามความเร็วและเวลาที่ผ่านไป', () => {
    const player = entity()
    const moved = stepMovement(player, { x: 1, y: 0 }, 1000, context())

    expect(moved).toBe(true)
    expect(player.position.x).toBeCloseTo(700) // 500 + speed 200 * 1 วินาที
    expect(player.facing).toBe('right')
  })

  it('ไม่มีอินพุต = ไม่ขยับ และความเร็วเป็นศูนย์', () => {
    const player = entity({ velocity: { x: 50, y: 0 } })
    const moved = stepMovement(player, { x: 0, y: 0 }, 100, context())

    expect(moved).toBe(false)
    expect(player.position).toEqual({ x: 500, y: 500 })
    expect(player.velocity).toEqual({ x: 0, y: 0 })
  })

  it('เดินออกนอกห้องไม่ได้', () => {
    const s = stage()
    const player = entity({ position: { x: s.width - 40, y: 500 } })
    stepMovement(player, { x: 1, y: 0 }, 1000, context())

    expect(player.position.x).toBe(s.width - player.collisionRadius)
  })

  it('ห้ามเคลื่อนที่ระหว่างโดนตีจนเซ', () => {
    const player = entity({ hitStunRemainingMs: 200 })
    const moved = stepMovement(player, { x: 1, y: 0 }, 100, context())

    expect(moved).toBe(false)
    expect(player.position).toEqual({ x: 500, y: 500 })
  })

  it('ตายแล้วขยับไม่ได้', () => {
    const player = entity({ state: 'dead' })
    expect(stepMovement(player, { x: 1, y: 1 }, 100, context())).toBe(false)
  })

  it('เดินทะลุตัวอื่นไม่ได้', () => {
    const player = entity({ position: { x: 500, y: 500 } })
    const blocker = entity({ id: 'blocker', position: { x: 560, y: 500 }, collisionRadius: 30 })

    stepMovement(player, { x: 1, y: 0 }, 500, { stage: stage(), blockers: [blocker] })

    const gap = Math.hypot(
      player.position.x - blocker.position.x,
      player.position.y - blocker.position.y,
    )
    expect(gap).toBeGreaterThanOrEqual(59.9)
  })

  it('เดินเฉียงได้ระยะเท่ากับเดินตรง', () => {
    const straight = entity()
    const diagonal = entity()

    stepMovement(straight, { x: 1, y: 0 }, 500, context())
    stepMovement(diagonal, { x: 1, y: 1 }, 500, context())

    const straightDistance = Math.hypot(straight.position.x - 500, straight.position.y - 500)
    const diagonalDistance = Math.hypot(diagonal.position.x - 500, diagonal.position.y - 500)
    expect(diagonalDistance).toBeCloseTo(straightDistance)
  })
})
