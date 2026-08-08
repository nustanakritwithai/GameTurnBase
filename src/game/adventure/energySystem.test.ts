import { describe, expect, it } from 'vitest'
import {
  ENERGY_CONFIG,
  canAffordStageEnergy,
  consumeStageEnergy,
  createDefaultEnergy,
  getStageEnergyCost,
  normalizeEnergy,
  tickEnergyRegen,
} from './energySystem'
import { getRealtimeStage } from '../realtimeBattle/stageConfig'

describe('energySystem — §5.1 skeleton', () => {
  it('normalizeEnergy backfills legacy saves with full pool', () => {
    expect(normalizeEnergy(undefined).current).toBe(ENERGY_CONFIG.max)
  })

  it('tickEnergyRegen restores energy over elapsed real time', () => {
    const start = new Date('2026-08-08T00:00:00.000Z')
    const later = new Date('2026-08-08T02:00:00.000Z')
    const energy = createDefaultEnergy(start)
    energy.current = 0
    energy.lastRegenAt = start.toISOString()

    const ticked = tickEnergyRegen(energy, later)
    expect(ticked.current).toBe(ENERGY_CONFIG.regenPerHour * 2)
  })

  it('boss stages cost more than normal stages', () => {
    const normal = getRealtimeStage('trial-01')
    const boss = getRealtimeStage('trial-05')
    if (!normal || !boss) throw new Error('fixture missing')

    expect(getStageEnergyCost(boss)).toBeGreaterThan(getStageEnergyCost(normal))
  })

  it('consumeStageEnergy deducts cost after regen tick', () => {
    const stage = getRealtimeStage('trial-01')
    if (!stage) throw new Error('fixture missing')

    const before = createDefaultEnergy()
    const after = consumeStageEnergy(before, stage)
    expect(after.current).toBe(before.current - getStageEnergyCost(stage))
  })

  it('canAffordStageEnergy is false when pool is empty', () => {
    const stage = getRealtimeStage('trial-01')
    if (!stage) throw new Error('fixture missing')

    const empty = { ...createDefaultEnergy(), current: 0 }
    expect(canAffordStageEnergy(empty, stage)).toBe(false)
  })
})
