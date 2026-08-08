import { ROSTER, type Rarity } from '../characters'

/** แหล่งความจริงจุดเดียวของ rate/pity/cost — §7.1 (ตัวเลข NON-PRODUCTION stub) */
export interface GachaPoolEntry {
  characterId: string
  weight: number
}

export interface GachaBannerConfig {
  id: string
  name: string
  costPerPull: number
  costTenPull: number
  /** รับประกัน rarity สูงสุดภายใน N ครั้ง (hard pity) */
  hardPity: number
  /** rarity ที่ pity รับประกัน */
  pityRarity: Rarity
  pool: GachaPoolEntry[]
}

export const GACHA_BANNERS: Record<string, GachaBannerConfig> = {
  standard: {
    id: 'standard',
    name: 'อัญเชิญมาตรฐาน',
    costPerPull: 160,
    costTenPull: 1600,
    hardPity: 90,
    pityRarity: 'legendary',
    pool: [
      { characterId: 'pig-warrior', weight: 35 },
      { characterId: 'pilgrim-monk', weight: 35 },
      { characterId: 'monkey-king', weight: 30 },
    ],
  },
}

export function getGachaBanner(id: string): GachaBannerConfig | null {
  return GACHA_BANNERS[id] ?? null
}

/** ทุก banner ต้องอ้าง character ที่มีใน ROSTER และ weight รวม > 0 */
export function validateGachaConfig(): string[] {
  const errors: string[] = []
  const rosterIds = new Set(ROSTER.map((hero) => hero.id))

  for (const banner of Object.values(GACHA_BANNERS)) {
    if (banner.pool.length === 0) {
      errors.push(`${banner.id}: pool ว่าง`)
      continue
    }
    let weightSum = 0
    for (const entry of banner.pool) {
      weightSum += entry.weight
      if (!rosterIds.has(entry.characterId)) {
        errors.push(`${banner.id}: ไม่มีตัวละคร ${entry.characterId} ใน ROSTER`)
      }
      if (entry.weight <= 0) {
        errors.push(`${banner.id}: weight ของ ${entry.characterId} ต้อง > 0`)
      }
    }
    if (weightSum <= 0) {
      errors.push(`${banner.id}: weight รวมต้อง > 0`)
    }
  }

  return errors
}
