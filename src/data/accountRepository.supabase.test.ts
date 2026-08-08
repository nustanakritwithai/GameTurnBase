import { describe, expect, test } from 'vitest'
import { createDefaultSkillLevels } from '../game/realtimeBattle/SkillProgressionSystem'
import { mapOwnedCharacterRow } from './accountRepository.supabase.mapping'

/*
  work contract #14 (docs/agent-blueprint/14-progression-system.md) done-criterion #1:
  shape parity ระหว่าง accountRepository.ts (localStorage) กับ accountRepository.supabase.ts
  — เทสต์นี้ล็อกฝั่ง Supabase (pure mapping ล้วน ไม่ต้องมี Supabase จริงรัน)
*/

describe('mapOwnedCharacterRow', () => {
  test('แถวเก่าก่อน migration 0005 ไม่มี skill_levels — เติม default เดียวกับ createDefaultSkillLevels()', () => {
    const owned = mapOwnedCharacterRow({
      character_id: 'monkey-king',
      level: 5,
      exp: 0,
      exp_to_next: 100,
      obtained_at: '2026-01-01T00:00:00.000Z',
    })

    expect(owned.skillLevels).toEqual(createDefaultSkillLevels())
  })

  test('แถวที่มี skill_levels อยู่แล้ว — ใช้ค่าจริงจาก DB ไม่ทับด้วย default', () => {
    const stored = {
      skill1: { level: 5, exp: 10, expToNext: 400 },
      skill2: { level: 1, exp: 0, expToNext: 200 },
      skill3: { level: 1, exp: 0, expToNext: 200 },
      ultimate: { level: 2, exp: 0, expToNext: 240 },
    }
    const owned = mapOwnedCharacterRow({
      character_id: 'monkey-king',
      level: 5,
      exp: 0,
      exp_to_next: 100,
      obtained_at: '2026-01-01T00:00:00.000Z',
      skill_levels: stored,
    })

    expect(owned.skillLevels).toEqual(stored)
  })

  test('แถวที่มี talent_state / awakening_state — map ตรง shape OwnedCharacter', () => {
    const owned = mapOwnedCharacterRow({
      character_id: 'monkey-king',
      level: 2,
      exp: 10,
      exp_to_next: 90,
      obtained_at: '2026-01-01T00:00:00.000Z',
      talent_state: { unlockedNodes: ['mk-talent-1'] },
      awakening_state: { tier: 1, unlockedEffects: [] },
    })

    expect(owned.talentState).toEqual({ unlockedNodes: ['mk-talent-1'] })
    expect(owned.awakeningState).toEqual({ tier: 1, unlockedEffects: [] })
  })

  test('แถวเก่าก่อน migration 0008 — default talent/awakening ว่าง', () => {
    const owned = mapOwnedCharacterRow({
      character_id: 'pig-warrior',
      level: 3,
      exp: 12,
      exp_to_next: 90,
      obtained_at: '2026-01-02T00:00:00.000Z',
    })

    expect(owned.talentState).toEqual({ unlockedNodes: [] })
    expect(owned.awakeningState).toEqual({ tier: 0, unlockedEffects: [] })
  })

  test('field mapping ตรงกับ shape ของ OwnedCharacter ฝั่ง localStorage (accountRepository.ts) เป๊ะ', () => {
    const owned = mapOwnedCharacterRow({
      character_id: 'pig-warrior',
      level: 3,
      exp: 12,
      exp_to_next: 90,
      obtained_at: '2026-01-02T00:00:00.000Z',
    })

    expect(owned).toEqual({
      characterId: 'pig-warrior',
      level: 3,
      exp: 12,
      expToNext: 90,
      obtainedAt: '2026-01-02T00:00:00.000Z',
      skillLevels: createDefaultSkillLevels(),
      talentState: { unlockedNodes: [] },
      awakeningState: { tier: 0, unlockedEffects: [] },
      star: 1,
      duplicateShards: 0,
    })
  })
})
