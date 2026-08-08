import type { RealtimeBattleStage } from '../realtimeBattle/stageConfig'
import type { PlayerEnergy } from '../../types/player'

/**
 * Energy/stamina skeleton — §5.1 locked architecture (HetCreep 2026-08-08).
 * Numbers are NON-PRODUCTION stubs; tune at P11 without changing call sites.
 */
export const ENERGY_CONFIG = {
  max: 120,
  /** Energy restored per hour of real time */
  regenPerHour: 60,
  /** Base cost per normal stage attempt */
  costPerStage: 10,
  /** Boss-tagged stages multiply base cost by this factor */
  bossCostMultiplier: 2,
} as const

export function createDefaultEnergy(now = new Date()): PlayerEnergy {
  return {
    current: ENERGY_CONFIG.max,
    max: ENERGY_CONFIG.max,
    lastRegenAt: now.toISOString(),
  }
}

/** Backfill accounts created before the energy field existed */
export function normalizeEnergy(energy: PlayerEnergy | undefined, now = new Date()): PlayerEnergy {
  if (!energy || typeof energy.current !== 'number' || typeof energy.max !== 'number') {
    return createDefaultEnergy(now)
  }
  return {
    current: Math.min(energy.max, Math.max(0, energy.current)),
    max: energy.max > 0 ? energy.max : ENERGY_CONFIG.max,
    lastRegenAt: energy.lastRegenAt ?? now.toISOString(),
  }
}

/** Apply passive regen since lastRegenAt — pure, deterministic given `now` */
export function tickEnergyRegen(energy: PlayerEnergy, now = new Date()): PlayerEnergy {
  const normalized = normalizeEnergy(energy, now)
  const lastMs = Date.parse(normalized.lastRegenAt)
  if (Number.isNaN(lastMs)) {
    return { ...normalized, lastRegenAt: now.toISOString() }
  }

  const elapsedMs = Math.max(0, now.getTime() - lastMs)
  const regenAmount = (ENERGY_CONFIG.regenPerHour * elapsedMs) / 3_600_000
  if (regenAmount <= 0) return normalized

  return {
    ...normalized,
    current: Math.min(normalized.max, normalized.current + regenAmount),
    lastRegenAt: now.toISOString(),
  }
}

export function getStageEnergyCost(stage: RealtimeBattleStage): number {
  const base = stage.energyCost ?? ENERGY_CONFIG.costPerStage
  return stage.isBoss ? base * ENERGY_CONFIG.bossCostMultiplier : base
}

export function canAffordStageEnergy(energy: PlayerEnergy, stage: RealtimeBattleStage): boolean {
  const ticked = tickEnergyRegen(energy)
  return ticked.current >= getStageEnergyCost(stage)
}

export function consumeStageEnergy(energy: PlayerEnergy, stage: RealtimeBattleStage): PlayerEnergy {
  const ticked = tickEnergyRegen(energy)
  const cost = getStageEnergyCost(stage)
  return {
    ...ticked,
    current: Math.max(0, ticked.current - cost),
  }
}
