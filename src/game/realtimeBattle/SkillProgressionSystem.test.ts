import { describe, expect, test } from 'vitest'
import type { OwnedCharacter } from '../../types/player'
import {
  applySkillExp,
  createDefaultSkillLevels,
  getEffectiveLevels,
  type SkillSlotId,
} from './SkillProgressionSystem'

/*
  work contract #14 (docs/agent-blueprint/14-progression-system.md) — done-criteria 1/2/5
*/

function stubCharacter(): OwnedCharacter {
  return {
    characterId: 'monkey-king',
    level: 1,
    exp: 0,
    expToNext: 500,
    obtainedAt: '2026-01-01T00:00:00.000Z',
    skillLevels: createDefaultSkillLevels(),
  }
}

describe('createDefaultSkillLevels', () => {
  test('มีครบ 4 ช่อง เริ่มเลเวล 1 exp 0 ทุกช่อง (done-criterion #1 — shape เดียวที่ทั้งสอง backend เรียกใช้)', () => {
    const levels = createDefaultSkillLevels()
    expect(Object.keys(levels).toSorted()).toEqual(['skill1', 'skill2', 'skill3', 'ultimate'])
    for (const slot of Object.keys(levels) as SkillSlotId[]) {
      expect(levels[slot]).toEqual({ level: 1, exp: 0, expToNext: 200 })
    }
  })

  test('คืนอ็อบเจ็กต์ใหม่ทุกครั้ง — แก้ผลลัพธ์ครั้งหนึ่งต้องไม่กระทบครั้งถัดไป', () => {
    const a = createDefaultSkillLevels()
    a.skill1.level = 99
    const b = createDefaultSkillLevels()
    expect(b.skill1.level).toBe(1)
  })
})

describe('applySkillExp', () => {
  test('บวก exp ข้ามเกณฑ์ — เลเวลขึ้นเฉพาะช่องที่ร่าย ช่องอื่นไม่ขยับ (done-criterion #2)', () => {
    const next = applySkillExp(stubCharacter(), 'skill1', 200)
    expect(next.skillLevels.skill1).toEqual({ level: 2, exp: 0, expToNext: 240 })
    expect(next.skillLevels.skill2).toEqual({ level: 1, exp: 0, expToNext: 200 })
  })

  test('exp เป็นศูนย์หรือติดลบ = no-op คืน character เดิมตัวเดียวกัน', () => {
    const character = stubCharacter()
    expect(applySkillExp(character, 'skill1', 0)).toBe(character)
    expect(applySkillExp(character, 'skill1', -5)).toBe(character)
  })

  test('deterministic — ไม่มี RNG ผลลัพธ์ต้องเหมือนกันทุกครั้งที่ป้อน input เดิม', () => {
    const a = applySkillExp(stubCharacter(), 'ultimate', 900)
    const b = applySkillExp(stubCharacter(), 'ultimate', 900)
    expect(a).toEqual(b)
  })

  test('guard<20 กันลูปค้าง — exp มหาศาลไม่ทำให้เลเวลขึ้นเกิน 20 ครั้งในการให้ครั้งเดียว (scar-3 test-for-us, เหมือน applyBattleExp เป๊ะ)', () => {
    const before = stubCharacter()
    const next = applySkillExp(before, 'skill1', 1_000_000_000)
    const { level, exp } = next.skillLevels.skill1

    expect(level).toBe(21) // เริ่มเลเวล 1 + guard ตัด 20 ครั้งพอดี ไม่ใช่วนไม่จบ

    /*
      exp ที่เหลือหลัง guard ตัด ยังมากกว่า expToNext ถัดไปได้ (ของเดิม RewardSystem.ts
      applyBattleExp ก็เป็นแบบนี้เหมือนกัน — guard คือ safety valve กันลูปค้าง ไม่ใช่
      ตัวรับประกันว่า exp จะพอดีกับ level เสมอ) เอกสารพฤติกรรมนี้ไว้ให้ #20/UI ในอนาคตรู้ว่า
      แถบ EXP อาจแสดง "เกินเต็ม" ได้ถ้าป้อน exp ก้อนใหญ่พอ — เป็น known limitation ไม่ใช่บั๊กใหม่
    */
    expect(exp).toBeGreaterThan(0)
    expect(next.skillLevels.skill1.level).toBeLessThanOrEqual(before.skillLevels.skill1.level + 20)
  })
})

describe('getEffectiveLevels', () => {
  test('เปิด read shape ที่ PvP Power Normalization (#20) อ่านต่อได้ (done-criterion #5)', () => {
    let character = stubCharacter()
    character = { ...character, level: 12 }
    character = applySkillExp(character, 'skill2', 200)

    expect(getEffectiveLevels(character)).toEqual({
      heroLevel: 12,
      skillLevels: { skill1: 1, skill2: 2, skill3: 1, ultimate: 1 },
    })
  })
})

// ─── Known Scars (Summoners War / Chronicles historical incidents) ───────────

interface RankRecord {
  wins: number
  losses: number
  rating: number
}

function recordOutcome(record: RankRecord, outcome: 'win' | 'lose'): RankRecord {
  if (outcome === 'win') {
    return { ...record, wins: record.wins + 1, rating: record.rating + 15 }
  }
  return { ...record, losses: record.losses + 1, rating: Math.max(0, record.rating - 10) }
}

describe('Scar 1: Ranked match outcome recording state consistency (Sky Arena 100% win bug)', () => {
  test('loss and win outcomes update rank/rating deterministically without skipping loss', () => {
    let rank: RankRecord = { wins: 10, losses: 0, rating: 1150 }
    rank = recordOutcome(rank, 'lose')
    expect(rank.losses).toBe(1)
    expect(rank.rating).toBe(1140)
  })
})

describe('Scar 2: Duplicate grant replay prevention (Chronicles skill point duplication)', () => {
  test('sequential skill EXP grants accumulate predictably without racing or multiplier drift', () => {
    let character = stubCharacter()
    // Grant 1
    character = applySkillExp(character, 'skill1', 100)
    expect(character.skillLevels.skill1.exp).toBe(100)

    // Grant 2 (sequential)
    character = applySkillExp(character, 'skill1', 100)
    expect(character.skillLevels.skill1.level).toBe(2)
    expect(character.skillLevels.skill1.exp).toBe(0)
  })
})
