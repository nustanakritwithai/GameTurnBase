import { createInitialOwnedCharacterProgress } from '../progression/progressionMigration'
import { applyDuplicatePull, ownedCharacterWithStarDefaults } from '../stars/starAscension'
import type { Player } from '../../types/player'
import type { GachaBannerConfig } from './gachaConfig'
import type { GachaPityState, GachaRollResult } from './gachaRoll'

export interface GachaPullOutcome {
  characterId: string
  isNew: boolean
  star: number
  duplicateShards: number
  wasHardPity: boolean
}

export interface GachaPullSummary {
  player: Player
  pity: GachaPityState
  results: GachaPullOutcome[]
  gemCost: number
  transactionRefId: string
}

function getPityMap(player: Player): Record<string, GachaPityState> {
  const pity = player.progress.gacha?.pity
  return pity ? { ...pity } : {}
}

function setPity(player: Player, bannerId: string, pity: GachaPityState): Player {
  return {
    ...player,
    progress: {
      ...player.progress,
      gacha: {
        ...player.progress.gacha,
        pity: { ...getPityMap(player), [bannerId]: pity },
      },
    },
  }
}

function applyRoll(
  player: Player,
  roll: GachaRollResult,
): { player: Player; outcome: GachaPullOutcome } {
  const ownedIndex = player.ownedCharacters.findIndex(
    (entry) => entry.characterId === roll.characterId,
  )

  if (ownedIndex < 0) {
    const nextOwned = ownedCharacterWithStarDefaults(
      createInitialOwnedCharacterProgress(roll.characterId, new Date().toISOString()),
    )
    return {
      player: {
        ...player,
        ownedCharacters: [...player.ownedCharacters, nextOwned],
      },
      outcome: {
        characterId: roll.characterId,
        isNew: true,
        star: nextOwned.star ?? 1,
        duplicateShards: 0,
        wasHardPity: roll.wasHardPity,
      },
    }
  }

  const updated = applyDuplicatePull(
    ownedCharacterWithStarDefaults(player.ownedCharacters[ownedIndex]),
  )
  const ownedCharacters = player.ownedCharacters.map((entry, index) =>
    index === ownedIndex ? updated : entry,
  )

  return {
    player: { ...player, ownedCharacters },
    outcome: {
      characterId: roll.characterId,
      isNew: false,
      star: updated.star ?? 1,
      duplicateShards: updated.duplicateShards ?? 0,
      wasHardPity: roll.wasHardPity,
    },
  }
}

export function computeGemCost(banner: GachaBannerConfig, pullCount: 1 | 10): number {
  return pullCount === 10 ? banner.costTenPull : banner.costPerPull
}

export function canAffordGachaPull(
  player: Player,
  banner: GachaBannerConfig,
  pullCount: 1 | 10,
): boolean {
  return player.currency.gem >= computeGemCost(banner, pullCount)
}

/** Pure — mutate player จากผล roll ที่ resolve แล้ว (หลังหัก gem ที่ repository) */
export function applyGachaRolls(
  player: Player,
  banner: GachaBannerConfig,
  rolls: GachaRollResult[],
  transactionRefId: string,
): GachaPullSummary {
  let nextPlayer = player
  const outcomes: GachaPullOutcome[] = []
  let pity =
    rolls.length > 0
      ? rolls[rolls.length - 1].pity
      : (getPityMap(player)[banner.id] ?? { pullsSinceLastPityRarity: 0 })

  for (const roll of rolls) {
    const applied = applyRoll(nextPlayer, roll)
    nextPlayer = applied.player
    outcomes.push(applied.outcome)
    pity = roll.pity
  }

  nextPlayer = setPity(nextPlayer, banner.id, pity)

  return {
    player: nextPlayer,
    pity,
    results: outcomes,
    gemCost: computeGemCost(banner, rolls.length === 10 ? 10 : 1),
    transactionRefId,
  }
}
