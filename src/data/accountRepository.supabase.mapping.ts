import { createDefaultSkillLevels } from '../game/realtimeBattle/SkillProgressionSystem'
import { normalizeDuplicateShards, normalizeStar } from '../game/stars/starAscension'
import type { OwnedCharacter } from '../types/player'

export interface OwnedCharacterRow {
  character_id: string
  level: number
  exp: number
  exp_to_next: number
  obtained_at: string
  /** แถวเก่าก่อน migration 0005 ยังไม่มีคอลัมน์นี้ — เติม default เหมือน normalizePlayer ฝั่ง localStorage */
  skill_levels?: OwnedCharacter['skillLevels'] | null
  talent_state?: OwnedCharacter['talentState'] | null
  awakening_state?: OwnedCharacter['awakeningState'] | null
  star?: number | null
  duplicate_shards?: number | null
}

/**
 * แปลงแถว owned_characters ดิบเป็น OwnedCharacter — pure mapping ไม่ import supabaseClient
 * (ให้เทสต์/CI รันได้โดยไม่ต้องมี VITE_SUPABASE_* ตอน module evaluate)
 */
export function mapOwnedCharacterRow(row: OwnedCharacterRow): OwnedCharacter {
  return {
    characterId: row.character_id,
    level: row.level,
    exp: row.exp,
    expToNext: row.exp_to_next,
    obtainedAt: row.obtained_at,
    skillLevels: row.skill_levels ?? createDefaultSkillLevels(),
    talentState: row.talent_state ?? { unlockedNodes: [] },
    awakeningState: row.awakening_state ?? { tier: 0, unlockedEffects: [] },
    star: normalizeStar(row.star ?? undefined),
    duplicateShards: normalizeDuplicateShards(row.duplicate_shards ?? undefined),
  }
}
