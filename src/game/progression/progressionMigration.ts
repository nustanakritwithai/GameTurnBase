import type { OwnedCharacter, SkillLevels } from '../../types/player'
import {
  createDefaultSkillLevels,
  type SkillSlotId,
} from '../realtimeBattle/SkillProgressionSystem'
import type { SkillSlotId as ProgressionSkillSlotId } from './progressionSchema'
import { getExpToNextForLevel, progressionConfig } from './progressionConfig'
import {
  normalizeDuplicateShards,
  normalizeStar,
  ownedCharacterWithStarDefaults,
} from '../stars/starAscension'

export const SKILL_SLOTS: ProgressionSkillSlotId[] = ['skill1', 'skill2', 'skill3', 'ultimate']

function sanitizeSkillProgress(progress: OwnedCharacter['skillLevels'][SkillSlotId]) {
  return {
    level: Math.max(1, Math.floor(progress.level) || 1),
    exp: Math.max(0, Math.floor(progress.exp) || 0),
    expToNext: Math.max(1, Math.floor(progress.expToNext) || 1),
  }
}

function sanitizeSkillLevels(levels: SkillLevels): SkillLevels {
  const defaults = createDefaultSkillLevels()
  return {
    skill1: sanitizeSkillProgress(levels.skill1 ?? defaults.skill1),
    skill2: sanitizeSkillProgress(levels.skill2 ?? defaults.skill2),
    skill3: sanitizeSkillProgress(levels.skill3 ?? defaults.skill3),
    ultimate: sanitizeSkillProgress(levels.ultimate ?? defaults.ultimate),
  }
}

export function createInitialOwnedCharacterProgress(
  characterId: string,
  obtainedAt: string,
): OwnedCharacter {
  return {
    characterId,
    level: 1,
    exp: 0,
    expToNext: getExpToNextForLevel(1),
    obtainedAt,
    skillLevels: createDefaultSkillLevels(),
    talentState: { unlockedNodes: [] },
    awakeningState: { tier: 0, unlockedEffects: [] },
    progressionVersion: 1,
    star: 1,
    duplicateShards: 0,
  }
}

export function sanitizeOwnedCharacter(owned: OwnedCharacter): OwnedCharacter {
  const level = Math.max(1, Math.min(progressionConfig.maxHeroLevel, Math.floor(owned.level) || 1))
  const exp = Math.max(0, Math.floor(owned.exp) || 0)
  const expToNext = level >= progressionConfig.maxHeroLevel ? 0 : getExpToNextForLevel(level)

  return {
    ...owned,
    level,
    exp: level >= progressionConfig.maxHeroLevel ? 0 : Math.min(exp, Math.max(0, expToNext - 1)),
    expToNext,
    skillLevels: sanitizeSkillLevels(owned.skillLevels ?? createDefaultSkillLevels()),
    talentState: {
      unlockedNodes: [...(owned.talentState?.unlockedNodes ?? [])],
    },
    awakeningState: {
      tier: Math.max(0, Math.floor(owned.awakeningState?.tier ?? 0)),
      unlockedEffects: [...(owned.awakeningState?.unlockedEffects ?? [])],
    },
    progressionVersion: owned.progressionVersion ?? 1,
    star: normalizeStar(owned.star),
    duplicateShards: normalizeDuplicateShards(owned.duplicateShards),
  }
}

export function migrateOwnedCharacters(ownedCharacters: OwnedCharacter[]): OwnedCharacter[] {
  return ownedCharacters.map((owned) =>
    ownedCharacterWithStarDefaults(
      sanitizeOwnedCharacter({
        ...owned,
        skillLevels: owned.skillLevels ?? createDefaultSkillLevels(),
        talentState: owned.talentState ?? { unlockedNodes: [] },
        awakeningState: owned.awakeningState ?? { tier: 0, unlockedEffects: [] },
        progressionVersion: owned.progressionVersion ?? 1,
      }),
    ),
  )
}

export function getSkillSlotLevel(owned: OwnedCharacter, slot: SkillSlotId): number {
  return owned.skillLevels[slot]?.level ?? 1
}

export function ownedCharacterToHeroProgress(owned: OwnedCharacter) {
  const sanitized = sanitizeOwnedCharacter(owned)
  return {
    heroId: sanitized.characterId,
    level: sanitized.level,
    currentExp: sanitized.exp,
    expToNext: sanitized.expToNext,
    skillLevels: {
      skill1: sanitized.skillLevels.skill1.level,
      skill2: sanitized.skillLevels.skill2.level,
      skill3: sanitized.skillLevels.skill3.level,
      ultimate: sanitized.skillLevels.ultimate.level,
    },
    talentState: sanitized.talentState ?? { unlockedNodes: [] },
    awakeningState: sanitized.awakeningState ?? { tier: 0, unlockedEffects: [] },
    version: sanitized.progressionVersion ?? 1,
  }
}
