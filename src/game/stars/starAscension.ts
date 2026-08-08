import { getCharacter, type CharacterStats } from '../characters'
import type { OwnedCharacter } from '../../types/player'
import {
  MAX_STAR,
  SHARDS_PER_DUPLICATE,
  SHARDS_TO_ASCEND,
  STAR_MULTIPLIERS,
  totalStatPoints,
} from './starAscensionConfig'

export function normalizeStar(star: number | undefined): number {
  if (typeof star !== 'number' || Number.isNaN(star)) return 1
  return Math.min(MAX_STAR, Math.max(1, Math.floor(star)))
}

export function normalizeDuplicateShards(shards: number | undefined): number {
  if (typeof shards !== 'number' || Number.isNaN(shards)) return 0
  return Math.max(0, Math.floor(shards))
}

/** สเตตัสฐาน (level 1) คูณตัวคูณดาว — pure */
export function statsAtStar(baseStats: CharacterStats, star: number): CharacterStats {
  const multiplier = STAR_MULTIPLIERS[normalizeStar(star)] ?? 1
  return {
    hp: Math.round(baseStats.hp * multiplier),
    atk: Math.round(baseStats.atk * multiplier),
    def: Math.round(baseStats.def * multiplier),
    spd: Math.round(baseStats.spd * multiplier),
  }
}

export function shardsRequiredForNextStar(currentStar: number): number {
  const star = normalizeStar(currentStar)
  if (star >= MAX_STAR) return 0
  return SHARDS_TO_ASCEND[star] ?? 0
}

export function canAscendStar(owned: OwnedCharacter): boolean {
  const star = normalizeStar(owned.star)
  if (star >= MAX_STAR) return false
  return normalizeDuplicateShards(owned.duplicateShards) >= shardsRequiredForNextStar(star)
}

export function ascendStar(owned: OwnedCharacter): OwnedCharacter {
  const star = normalizeStar(owned.star)
  if (!canAscendStar(owned)) return owned
  const cost = shardsRequiredForNextStar(star)
  return {
    ...owned,
    star: star + 1,
    duplicateShards: normalizeDuplicateShards(owned.duplicateShards) - cost,
  }
}

/** ซ้ำจาก gacha — เพิ่ม shard แล้ว ascension อัตโนมัติถ้าครบ threshold */
export function applyDuplicatePull(owned: OwnedCharacter): OwnedCharacter {
  let next: OwnedCharacter = {
    ...owned,
    duplicateShards: normalizeDuplicateShards(owned.duplicateShards) + SHARDS_PER_DUPLICATE,
  }
  while (canAscendStar(next)) {
    next = ascendStar(next)
  }
  return next
}

/** §4.3 bound check helper — ใช้ในเทสต์ roster ทั้งหมด */
export function assertStarPowerBound(baseStats: CharacterStats): boolean {
  const atOne = statsAtStar(baseStats, 1)
  const atMax = statsAtStar(baseStats, MAX_STAR)
  return totalStatPoints(atMax) / totalStatPoints(atOne) <= 1.3 + 1e-9
}

export function ownedCharacterWithStarDefaults(owned: OwnedCharacter): OwnedCharacter {
  return {
    ...owned,
    star: normalizeStar(owned.star),
    duplicateShards: normalizeDuplicateShards(owned.duplicateShards),
  }
}

export function resolveOwnedStarStats(owned: OwnedCharacter): CharacterStats | null {
  const character = getCharacter(owned.characterId)
  if (!character) return null
  return statsAtStar(character.stats, normalizeStar(owned.star))
}
