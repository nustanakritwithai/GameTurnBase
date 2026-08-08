import { getCharacter, type Rarity } from '../characters'
import type { GachaBannerConfig } from './gachaConfig'

export interface GachaPityState {
  pullsSinceLastPityRarity: number
}

export interface GachaRollResult {
  characterId: string
  rarity: Rarity
  wasHardPity: boolean
  pity: GachaPityState
}

/** Mulberry32 — deterministic จาก seed (Done-criterion #1: ไม่ใช้ Math.random ในเทสต์) */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createDefaultPityState(): GachaPityState {
  return { pullsSinceLastPityRarity: 0 }
}

function pickFromPool(
  banner: GachaBannerConfig,
  random: () => number,
  forceRarity?: Rarity,
): string {
  const eligible = forceRarity
    ? banner.pool.filter((entry) => getCharacter(entry.characterId)?.rarity === forceRarity)
    : banner.pool

  const pool = eligible.length > 0 ? eligible : banner.pool
  const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0)
  let roll = random() * totalWeight

  for (const entry of pool) {
    roll -= entry.weight
    if (roll <= 0) return entry.characterId
  }

  return pool[pool.length - 1].characterId
}

export function rollGachaOnce(
  banner: GachaBannerConfig,
  pity: GachaPityState,
  random: () => number,
): GachaRollResult {
  const pulls = pity.pullsSinceLastPityRarity + 1
  const atHardPity = pulls >= banner.hardPity

  const characterId = pickFromPool(banner, random, atHardPity ? banner.pityRarity : undefined)
  const rarity = getCharacter(characterId)?.rarity ?? 'common'

  const hitPityRarity = rarity === banner.pityRarity || atHardPity

  return {
    characterId,
    rarity,
    wasHardPity: atHardPity,
    pity: {
      pullsSinceLastPityRarity: hitPityRarity ? 0 : pulls,
    },
  }
}

export function rollGachaMulti(
  banner: GachaBannerConfig,
  pity: GachaPityState,
  count: number,
  random: () => number,
): GachaRollResult[] {
  const results: GachaRollResult[] = []
  let currentPity = pity
  for (let i = 0; i < count; i += 1) {
    const result = rollGachaOnce(banner, currentPity, random)
    results.push(result)
    currentPity = result.pity
  }
  return results
}
