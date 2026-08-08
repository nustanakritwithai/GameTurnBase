import type { CharacterStats } from '../characters'

/**
 * ดาว / duplicate → ascension — §4.2–4.3 (NON-PRODUCTION stub numbers, tune at P11)
 *
 * ตารางคูณสเตตัสต่อดาว — ไม่ใช่สูตรในโค้ด (§5.1 pattern)
 * ★6 total ≤ 130% ★1 ที่ level/skill เท่ากัน (rounded per-stat; ★6 multiplier stub 1.29)
 */
export const MAX_STAR = 6

export const STAR_MULTIPLIERS: Record<number, number> = {
  1: 1,
  2: 1.05,
  3: 1.1,
  4: 1.15,
  5: 1.22,
  /** 1.29 keeps rounded per-stat totals ≤130% for entire ROSTER (§4.3); tune at P11 */
  6: 1.29,
}

/** จำนวน shard ที่ต้องใช้เพื่อขึ้นจากดาว N → N+1 */
export const SHARDS_TO_ASCEND: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 2,
  5: 3,
}

/** shard ที่ได้เมื่อสุ่มซ้ำตัวละครที่มีแล้ว */
export const SHARDS_PER_DUPLICATE = 1

export function totalStatPoints(stats: CharacterStats): number {
  return stats.hp + stats.atk + stats.def + stats.spd
}
