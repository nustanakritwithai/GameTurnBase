import type { Player } from '../../types/player'
import { getGachaBanner } from './gachaConfig'
import { applyGachaRolls, canAffordGachaPull, computeGemCost } from './gachaPipeline'
import { createDefaultPityState, rollGachaMulti } from './gachaRoll'

export type GachaPullCount = 1 | 10

export function createGachaPullRefId(bannerId: string, pullCount: GachaPullCount): string {
  return `gacha:${bannerId}:${pullCount}:${crypto.randomUUID()}`
}

export function createGachaRollSeed(): number {
  const seedArray = new Uint32Array(1)
  crypto.getRandomValues(seedArray)
  return seedArray[0] ?? 0
}

/** Pure roll + apply — caller handles ledger debit and persistence */
export function executeGachaPull(
  player: Player,
  bannerId: string,
  pullCount: GachaPullCount,
  refId: string,
  random: () => number,
): { ok: true; summary: ReturnType<typeof applyGachaRolls> } | { ok: false; error: string } {
  const banner = getGachaBanner(bannerId)
  if (!banner) return { ok: false, error: 'ไม่พบแบนเนอร์นี้' }
  if (pullCount !== 1 && pullCount !== 10) return { ok: false, error: 'จำนวนครั้งไม่ถูกต้อง' }
  if (!canAffordGachaPull(player, banner, pullCount)) return { ok: false, error: 'หยกไม่พอ' }

  const pityState = player.progress.gacha?.pity?.[bannerId] ?? createDefaultPityState()
  const rolls = rollGachaMulti(banner, pityState, pullCount, random)
  const summary = applyGachaRolls(player, banner, rolls, refId)

  if (summary.gemCost !== computeGemCost(banner, pullCount)) {
    return { ok: false, error: 'ค่าใช้จ่ายไม่ตรงกับแบนเนอร์' }
  }

  return { ok: true, summary }
}
