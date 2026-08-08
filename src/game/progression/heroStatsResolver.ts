import { getCharacter, type CharacterStats } from '../characters'
import type { HeroCombatStats } from './progressionSchema'
import { PLACEHOLDER_LEVEL_STAT_GROWTH } from './progressionConfig'
import { statsAtStar } from '../stars/starAscension'

/** Base stats at level 1 + placeholder linear growth — NON-PRODUCTION. */
export function resolveHeroLevelStats(
  heroId: string,
  level: number,
  star = 1,
): HeroCombatStats | null {
  const character = getCharacter(heroId)
  if (!character) return null

  const safeLevel = Math.max(1, level)
  const growthSteps = safeLevel - 1
  const base = statsAtStar(character.stats, star)

  return {
    hp: Math.round(base.hp + PLACEHOLDER_LEVEL_STAT_GROWTH.hp * growthSteps),
    atk: Math.round(base.atk + PLACEHOLDER_LEVEL_STAT_GROWTH.atk * growthSteps),
    def: Math.round(base.def + PLACEHOLDER_LEVEL_STAT_GROWTH.def * growthSteps),
    spd: Math.round(base.spd + PLACEHOLDER_LEVEL_STAT_GROWTH.spd * growthSteps),
  }
}

export function resolveFinalCombatStats(input: {
  heroId: string
  level: number
  star?: number
  equipmentModifiers?: Partial<CharacterStats>
}): HeroCombatStats | null {
  const levelStats = resolveHeroLevelStats(input.heroId, input.level, input.star ?? 1)
  if (!levelStats) return null
  const mods = input.equipmentModifiers ?? {}
  return {
    hp: levelStats.hp + (mods.hp ?? 0),
    atk: levelStats.atk + (mods.atk ?? 0),
    def: levelStats.def + (mods.def ?? 0),
    spd: levelStats.spd + (mods.spd ?? 0),
  }
}
