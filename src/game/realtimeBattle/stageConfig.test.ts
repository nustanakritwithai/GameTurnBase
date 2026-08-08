import { describe, expect, it } from 'vitest'
import {
  REALTIME_STAGES,
  getAdventureChapters,
  getBossTemplate,
  getOrderedStages,
  getRealtimeStage,
  isStageUnlocked,
} from './stageConfig'

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
    const ordered = getOrderedStages('chapter-1')
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i].order).toBeGreaterThanOrEqual(ordered[i - 1].order)
    }
    const trial01Index = ordered.findIndex((s) => s.id === 'trial-01')
    const trial05Index = ordered.findIndex((s) => s.id === 'trial-05')
    expect(trial01Index).toBeGreaterThanOrEqual(0)
    expect(trial05Index).toBeGreaterThan(trial01Index)
    expect(ordered[trial05Index].isBoss).toBe(true)
  })

  it('getAdventureChapters ซ่อนสนามทดสอบ dungeon-p5-test', () => {
    const chapters = getAdventureChapters()
    expect(chapters.some((chapter) => chapter.chapterId === 'dungeon-p5-test')).toBe(false)
    expect(chapters.some((chapter) => chapter.chapterId === 'chapter-1')).toBe(true)
  })

  it('getBossTemplate คืนข้อมูลบอสจริง spirit-guardian-boss', () => {
    expect(getBossTemplate('spirit-guardian-boss')?.phases).toHaveLength(2)
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
    expect(isStageUnlocked('trial-02', { trial_cleared_trial_01: true })).toBe(false)
    expect(isStageUnlocked('trial-02', { 'trial_cleared_trial-01': true })).toBe(true)
  })

  it('trial-05 ปลดล็อกเมื่อเคลียร์ trial-04', () => {
    expect(isStageUnlocked('trial-05', { 'trial_cleared_trial-04': true })).toBe(true)
    expect(isStageUnlocked('trial-05', { 'trial_cleared_trial-03': true })).toBe(false)
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
