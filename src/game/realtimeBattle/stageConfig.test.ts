import { describe, expect, it } from 'vitest'
import { REALTIME_STAGES, getOrderedStages, getRealtimeStage, isStageUnlocked } from './stageConfig'
import { createRealtimeBattle } from './createRealtimeBattle'
import { createDefaultSkillLevels } from './SkillProgressionSystem'
import type { Player } from '../../types/player'

/**
 * เทสต์ตาม Done-criteria ของ docs/agent-blueprint/16-stage-adventure-system.md
 * ทุก assertion ผูกกับ criterion ในเอกสารนั้นตรง ๆ (ดูคอมเมนต์แต่ละ describe)
 */

describe('REALTIME_STAGES มีแชปเตอร์ครบ N ด่าน + บอส (Done-criteria #1)', () => {
  it('ทุกด่านมี chapterId และ order', () => {
    for (const stage of Object.values(REALTIME_STAGES)) {
      expect(stage.chapterId).toBeTruthy()
      expect(typeof stage.order).toBe('number')
    }
  })

  it('อย่างน้อยหนึ่งแชปเตอร์มีด่านปกติตามด้วยด่านที่ติดป้ายบอส', () => {
    const chapterIds = [...new Set(Object.values(REALTIME_STAGES).map((s) => s.chapterId))]
    const fullChapter = chapterIds.some((chapterId) => {
      const stages = getOrderedStages(chapterId)
      return stages.length >= 2 && stages.some((s) => s.isBoss === true)
    })
    expect(fullChapter).toBe(true)
  })

  it('getOrderedStages เรียงตาม order ไม่ใช่ตามลำดับ object', () => {
    // ไม่ผูกกับจำนวนด่านทั้งหมดของแชปเตอร์ตายตัว (เติมด่านใหม่ได้เรื่อย ๆ แบบ data-table
    // entry ตาม Done-criteria #5) เช็คแค่ว่าเรียงตาม order จริง และ trial-01 มาก่อน trial-02
    const ordered = getOrderedStages('chapter-1')
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i].order).toBeGreaterThanOrEqual(ordered[i - 1].order)
    }
    const trial01Index = ordered.findIndex((s) => s.id === 'trial-01')
    const trial02Index = ordered.findIndex((s) => s.id === 'trial-02')
    expect(trial01Index).toBeGreaterThanOrEqual(0)
    expect(trial02Index).toBeGreaterThan(trial01Index)
  })
})

describe('isStageUnlocked เป็น pure predicate เหนือ Player.progress.flags (Done-criteria #3)', () => {
  it('ด่านแรกของแชปเตอร์ปลดล็อกเสมอ แม้ flags ว่างเปล่า', () => {
    expect(isStageUnlocked('trial-01', {})).toBe(true)
  })

  it('ด่านถัดไปล็อกอยู่ถ้ายังไม่มี clear-flag ของด่านก่อนหน้า', () => {
    expect(isStageUnlocked('trial-02', {})).toBe(false)
  })

  it('ด่านถัดไปปลดล็อกเมื่อ flags มี clear-flag ของด่านก่อนหน้าเป็น true', () => {
    expect(isStageUnlocked('trial-02', { trial_cleared_trial_01: true })).toBe(false) // ชื่อ flag ผิด รูปแบบ (กันพลาด key)
    expect(isStageUnlocked('trial-02', { 'trial_cleared_trial-01': true })).toBe(true)
  })

  it('flag เป็น false (เช่น เคยแพ้) ไม่ถือว่าปลดล็อก', () => {
    expect(isStageUnlocked('trial-02', { 'trial_cleared_trial-01': false })).toBe(false)
  })

  it('stageId ที่ไม่มีจริงคืน false เสมอ ไม่ว่า flags จะเป็นอะไร', () => {
    expect(isStageUnlocked('ด่านที่ไม่มีจริง', {})).toBe(false)
    expect(isStageUnlocked('ด่านที่ไม่มีจริง', { anything: true })).toBe(false)
  })

  it('เป็น pure function — เรียกซ้ำด้วย input เดิมได้ผลเดิมเสมอ ไม่แตะ REALTIME_STAGES', () => {
    const before = JSON.stringify(REALTIME_STAGES)
    isStageUnlocked('trial-02', { 'trial_cleared_trial-01': true })
    isStageUnlocked('trial-02', {})
    expect(JSON.stringify(REALTIME_STAGES)).toBe(before)
  })
})

describe('getRealtimeStage ไม่มีรีเกรสจากการเพิ่ม field (สัญญาเดิมของระบบอื่น)', () => {
  it('ยังคืน stage ตัวเดิมของ trial-01/trial-02 ครบ field เดิม', () => {
    expect(getRealtimeStage('trial-01')?.waves).toHaveLength(1)
    expect(getRealtimeStage('trial-02')?.waves).toHaveLength(2)
  })
})

// ─── Known Scars (Honkai Impact 3rd historical incidents) ───────────────────

describe('Scar 1: ด่านที่ไม่มีใน catalog → null เสมอ ไม่ใช่ error หรือ wrong stage (Story Ch.12-14 bug)', () => {
  it('stageId ที่ stage-select แสดงว่า unlocked แต่ไม่มีจริงใน REALTIME_STAGES → getRealtimeStage คืน null', () => {
    // จำลองสถานการณ์: UI แสดง stageId จาก flags แต่ REALTIME_STAGES ไม่รู้จัก (เช่น ข้อมูลเก่าหรือ typo)
    const allKnownIds = Object.keys(REALTIME_STAGES)
    const fakeId = 'chapter-99-stage-01'
    expect(allKnownIds).not.toContain(fakeId) // ยืนยันว่าเราจงใจใช้ id ที่ไม่มีจริง

    const result = getRealtimeStage(fakeId)
    expect(result).toBeNull() // ต้องคืน null อย่างเงียบ ๆ ไม่ throw และไม่คืน stage อื่นแทน
  })

  it('ทุก stageId จาก stage-select (unlocked path) resolve ได้จริงใน REALTIME_STAGES — ไม่มีตัวใด resolve เป็น null', () => {
    // สมมติว่า stage-select ใช้ getOrderedStages + isStageUnlocked เพื่อแสดงผล
    // ยืนยันว่าทุก stageId ที่ผู้เล่นอาจเห็นในหน้า select สามารถ resolve ได้ใน catalog
    const allStageIds = Object.keys(REALTIME_STAGES)
    for (const id of allStageIds) {
      expect(getRealtimeStage(id)).not.toBeNull()
    }
  })
})

describe('Scar 2: stage clear flag ต้องถูก key อย่างถูกต้อง — ชื่อ flag ผิดทำให้ด่านต่อไปไม่เปิด (Ch.12-14 permanent lock)', () => {
  it('clear flag key ต้องเป็น trial_cleared_<stageId> ตรงตัว — underscore แทน hyphen ทำ unlock ไม่ผ่าน', () => {
    // สะท้อน scar ของ Honkai ที่ completion event ไม่ถูก record ถูกต้อง
    // ทำให้ stage ถัดไปถูก lock ตลอดไป
    const correctFlag = 'trial_cleared_trial-01'
    const wrongFlag = 'trial_cleared_trial_01' // underscore แทน hyphen ใน stageId

    expect(isStageUnlocked('trial-02', { [correctFlag]: true })).toBe(true)
    expect(isStageUnlocked('trial-02', { [wrongFlag]: true })).toBe(false)
  })
})

describe('Scar 3: createRealtimeBattle ล้มเหลวอย่างชัดเจน ไม่ launch เงียบ ๆ เมื่อ team state ไม่สมบูรณ์ (Data Storm silent fail)', () => {
  const basePlayer: Player = {
    id: 'test-player',
    uid: '0000000001',
    name: 'Test',
    title: 'ผู้ทดสอบ',
    level: 1,
    exp: 0,
    expToNext: 100,
    currency: { gold: 0, gem: 0 },
    inventory: [],
    friends: [],
    frameId: 'arcane',
    teamSlots: ['monkey-king', null, null, null],
    ownedCharacters: [
      {
        characterId: 'monkey-king',
        level: 1,
        exp: 0,
        expToNext: 500,
        obtainedAt: '2026-01-01T00:00:00.000Z',
        skillLevels: createDefaultSkillLevels(),
      },
    ],
    progress: { flags: {}, defeatedNpcIds: [], battleHistory: [] },
  }

  it('stageId ที่ไม่มีจริง → createRealtimeBattle คืน null ไม่ throw (ล้มเหลวอย่าง explicit)', () => {
    const result = createRealtimeBattle('ด่านที่ไม่มีจริง', basePlayer)
    expect(result).toBeNull()
  })

  it('player ที่ teamSlots ว่างเปล่าทั้งหมด → createRealtimeBattle คืน null ไม่ launch เงียบ ๆ', () => {
    const emptyTeamPlayer: Player = {
      ...basePlayer,
      teamSlots: [null, null, null, null],
    }
    const result = createRealtimeBattle('trial-01', emptyTeamPlayer)
    expect(result).toBeNull()
  })
})
