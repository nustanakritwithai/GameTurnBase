import { describe, expect, it, beforeEach } from 'vitest'
import { P5_TEST_DUNGEON } from '../dungeon/dungeonConfig'
import type { DungeonResult, StageResult } from '../dungeon/dungeonSchema'
import {
  finalizeDungeonResult,
  resetFinalizeGuard,
  createRunId,
  hasRewardTransaction,
} from './resultFinalizer'
import { resolveRewards } from './rewardResolver'
import { getDungeonRewardDefinition } from './rewardConfig'
import { grantDungeonRewards } from './rewardGrantService'
import { resolveDungeonRewards, grantAndFinalizeDungeonRewards } from './dungeonRewardPipeline'
import { buildResultViewModel } from './resultViewModel'
import { buildHeroProgressionViewModel } from '../progression/progressionViewModel'
import type { GoldSource } from '../../data/accountRepository'
import type { Player } from '../../types/player'
import { EMPTY_PROGRESS } from '../../types/player'
import { createDefaultSkillLevels } from '../realtimeBattle/SkillProgressionSystem'

function stubPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'acc-1',
    uid: '1234567890',
    name: 'Tester',
    title: 'Novice',
    level: 1,
    exp: 0,
    expToNext: 100,
    currency: { gold: 0, gem: 0 },
    ownedCharacters: [
      {
        characterId: 'monkey-king',
        level: 1,
        exp: 0,
        expToNext: 100,
        obtainedAt: new Date().toISOString(),
        skillLevels: createDefaultSkillLevels(),
      },
    ],
    inventory: [],
    friends: [],
    teamSlots: ['monkey-king', null, null, null],
    frameId: 'default',
    progress: { ...EMPTY_PROGRESS },
    ...overrides,
  }
}

function clearedStage(id: string): StageResult {
  return {
    stageId: id,
    stageType: 'custom',
    success: true,
    clearTimeMs: 1000,
  }
}

function dungeonResult(overrides: Partial<DungeonResult> = {}): DungeonResult {
  return {
    dungeonId: 'p5-test-dungeon',
    runId: 'p5-test-dungeon-1000',
    success: true,
    clearTimeMs: 4000,
    stageResults: P5_TEST_DUNGEON.stages.map((s) => clearedStage(s.id)),
    combatSummary: {
      enemiesDefeated: 5,
      elitesDefeated: 1,
      bossesDefeated: 1,
      damageDealt: 0,
      damageTaken: 0,
    },
    completedAt: Date.now(),
    lifecycle: 'finalized',
    ...overrides,
  }
}

describe('finalizeDungeonResult', () => {
  beforeEach(() => resetFinalizeGuard())

  it('finalizes clear result once per runId', () => {
    const run = {
      dungeonId: 'p5-test-dungeon',
      currentStageIndex: 4,
      status: 'cleared' as const,
      stageResults: [clearedStage('s1')],
      startedAtMs: 1000,
    }
    const result = finalizeDungeonResult({
      dungeon: P5_TEST_DUNGEON,
      run,
      clearTimeMs: 5000,
      combatAccumulator: {
        enemiesDefeated: 2,
        elitesDefeated: 0,
        bossesDefeated: 1,
        damageDealt: 100,
        damageTaken: 20,
      },
    })
    expect(result.success).toBe(true)
    expect(result.runId).toBe(createRunId('p5-test-dungeon', 1000))
    expect(result.combatSummary?.bossesDefeated).toBe(1)
    expect(() =>
      finalizeDungeonResult({
        dungeon: P5_TEST_DUNGEON,
        run,
        clearTimeMs: 5000,
        combatAccumulator: {
          enemiesDefeated: 0,
          elitesDefeated: 0,
          bossesDefeated: 0,
          damageDealt: 0,
          damageTaken: 0,
        },
      }),
    ).toThrow(/already finalized/)
  })

  it('finalizes failed result with failure reason', () => {
    resetFinalizeGuard()
    const run = {
      dungeonId: 'p5-test-dungeon',
      currentStageIndex: 1,
      status: 'failed' as const,
      stageResults: [
        {
          stageId: 's1',
          stageType: 'survival' as const,
          success: false,
          clearTimeMs: 800,
          failureReason: 'playerDefeated',
        },
      ],
      startedAtMs: 2000,
    }
    const result = finalizeDungeonResult({
      dungeon: P5_TEST_DUNGEON,
      run,
      clearTimeMs: 800,
      combatAccumulator: {
        enemiesDefeated: 0,
        elitesDefeated: 0,
        bossesDefeated: 0,
        damageDealt: 0,
        damageTaken: 50,
      },
    })
    expect(result.success).toBe(false)
    expect(result.failureReason).toBe('playerDefeated')
  })
})

describe('resolveRewards', () => {
  const definition = getDungeonRewardDefinition('p5-test-dungeon')!

  it('is deterministic without rng override', () => {
    const context = {
      dungeonId: 'p5-test-dungeon',
      runId: 'run-1',
      success: true,
      stageResults: [],
      isFirstClear: true,
      failureRewardPolicy: 'none' as const,
      combatSummary: {
        enemiesDefeated: 3,
        elitesDefeated: 0,
        bossesDefeated: 1,
        damageDealt: 0,
        damageTaken: 0,
      },
    }
    const a = resolveRewards(definition, context)
    const b = resolveRewards(definition, context)
    expect(a.entries).toEqual(b.entries)
    expect(a.transactionId).toBe('run-1:final')
  })

  it('grants guaranteed and first-clear conditional rewards', () => {
    const resolved = resolveRewards(definition, {
      dungeonId: 'p5-test-dungeon',
      runId: 'run-2',
      success: true,
      stageResults: [],
      isFirstClear: true,
      failureRewardPolicy: 'none',
      combatSummary: {
        enemiesDefeated: 1,
        elitesDefeated: 0,
        bossesDefeated: 1,
        damageDealt: 0,
        damageTaken: 0,
      },
    })
    expect(resolved.entries.some((e) => e.type === 'currency' && e.amount === 75)).toBe(true)
    expect(resolved.entries.some((e) => e.type === 'item' && e.itemId === 'iron-essence')).toBe(
      true,
    )
    expect(resolved.entries.some((e) => e.type === 'item' && e.itemId === 'spirit-incense')).toBe(
      true,
    )
  })

  it('returns empty rewards on failure with none policy', () => {
    const resolved = resolveRewards(definition, {
      dungeonId: 'p5-test-dungeon',
      runId: 'run-fail',
      success: false,
      stageResults: [],
      isFirstClear: false,
      failureRewardPolicy: 'none',
    })
    expect(resolved.entries).toEqual([])
  })

  it('same seed yields same random pool reward', () => {
    const context = {
      dungeonId: 'p5-test-dungeon',
      runId: 'run-seed',
      success: true,
      stageResults: [],
      isFirstClear: false,
      failureRewardPolicy: 'none' as const,
      rng: () => 0.1,
    }
    const a = resolveRewards(definition, context)
    const b = resolveRewards(definition, context)
    expect(a.entries).toEqual(b.entries)
  })
})

describe('grantDungeonRewards', () => {
  it('applies currency, item, and exp then blocks duplicate transaction', async () => {
    const resolved = resolveRewards(getDungeonRewardDefinition('p5-test-dungeon')!, {
      dungeonId: 'p5-test-dungeon',
      runId: 'grant-run',
      success: true,
      stageResults: [],
      isFirstClear: false,
      failureRewardPolicy: 'none',
      combatSummary: {
        enemiesDefeated: 1,
        elitesDefeated: 0,
        bossesDefeated: 1,
        damageDealt: 0,
        damageTaken: 0,
      },
      rng: () => 0.99,
    })

    let gold = 0
    const items: Array<{ itemId: string; quantity: number }> = []
    const deps = {
      onEarnGold: async (_source: GoldSource, amount: number) => {
        gold += amount
        return { ok: true as const, player: stubPlayer(), amount }
      },
      onGrantItem: async (itemId: string, quantity: number) => {
        items.push({ itemId, quantity })
        return { ok: true as const, player: stubPlayer() }
      },
    }

    const first = await grantDungeonRewards(resolved, stubPlayer(), deps)
    expect(first.grant.success).toBe(true)
    expect(first.grant.playerUpdated).toBe(true)
    expect(gold).toBeGreaterThan(0)
    expect(items.length).toBeGreaterThan(0)
    expect(first.player.progress.flags[`reward_tx_${resolved.transactionId}`]).toBe(true)

    const second = await grantDungeonRewards(resolved, first.player, deps)
    expect(second.grant.alreadyGranted).toBe(true)
    expect(second.grant.playerUpdated).toBe(false)
  })

  it('rejects invalid reward entries', async () => {
    const resolved = {
      transactionId: 'bad-run:final',
      entries: [{ type: 'item' as const, itemId: 'nonexistent-item', quantity: 1 }],
    }
    const result = await grantDungeonRewards(resolved, stubPlayer(), {
      onEarnGold: async () => ({ ok: true, player: stubPlayer(), amount: 1 }),
      onGrantItem: async () => ({ ok: true, player: stubPlayer() }),
    })
    expect(result.grant.success).toBe(false)
  })
})

describe('resolveDungeonRewards presentation', () => {
  it('builds view model matching resolved rewards', () => {
    const result = dungeonResult()
    const { resolved, viewModel } = resolveDungeonRewards(result, P5_TEST_DUNGEON, {}, () => 0.1)
    const direct = buildResultViewModel(result, P5_TEST_DUNGEON, resolved, false, true)
    expect(viewModel.rewards).toEqual(direct.rewards)
    expect(viewModel.status).toBe('clear')
    expect(viewModel.nonProductionBalance).toBe(true)
  })
})

describe('retry runId', () => {
  it('generates unique transaction ids per run', () => {
    const runA = createRunId('p5-test-dungeon', 100)
    const runB = createRunId('p5-test-dungeon', 200)
    expect(`${runA}:final`).not.toBe(`${runB}:final`)
    expect(hasRewardTransaction({ [`reward_tx_${runA}:final`]: true }, `${runA}:final`)).toBe(true)
  })
})

/**
 * E2E ของ flow จริงหลังดันเจี้ยนจบ (ข้าม combat) — จำลองสิ่งที่ DungeonSession.handleContinue ทำ:
 * resolve rewards → grant + heroExp → buildHeroProgressionViewModel สำหรับแท็บ พัฒนา
 */
function makeGrantDeps(initial: Player) {
  let current = initial
  return {
    onEarnGold: async (_source: GoldSource, amount: number) => {
      current = {
        ...current,
        currency: { ...current.currency, gold: current.currency.gold + amount },
      }
      return { ok: true as const, player: current, amount }
    },
    onGrantItem: async (itemId: string, quantity: number) => {
      const existing = current.inventory.find((e) => e.itemId === itemId)
      const inventory = existing
        ? current.inventory.map((e) =>
            e.itemId === itemId ? { ...e, quantity: e.quantity + quantity } : e,
          )
        : [
            ...current.inventory,
            {
              itemId,
              quantity,
              obtainedAt: new Date().toISOString(),
              obtainedFrom: 'drop',
            },
          ]
      current = { ...current, inventory }
      return { ok: true as const, player: current }
    },
  }
}

describe('dungeon clear → heroExp → พัฒนา view model (E2E pipeline)', () => {
  it('result screen แสดง Hero EXP +45 แล้ว lead hero ได้ EXP ตรงใน view model', async () => {
    const player = stubPlayer()
    const beforeVm = buildHeroProgressionViewModel(player, 'monkey-king')
    expect(beforeVm).not.toBeNull()
    expect(beforeVm!.currentExp).toBe(0)
    expect(beforeVm!.expToNext).toBe(100)
    expect(beforeVm!.level).toBe(1)

    const result = dungeonResult({ runId: 'e2e-hero-exp-run' })
    const presentation = resolveDungeonRewards(
      result,
      P5_TEST_DUNGEON,
      player.progress.flags,
      () => 0.99,
    )
    const heroExpLine = presentation.viewModel.rewards.find((r) => r.label === 'Hero EXP')
    expect(heroExpLine).toEqual({ kind: 'heroExp', label: 'Hero EXP', amount: '+45' })

    const pipeline = await grantAndFinalizeDungeonRewards({
      result,
      dungeon: P5_TEST_DUNGEON,
      player,
      deps: makeGrantDeps(player),
      rng: () => 0.99,
    })
    expect(pipeline.grant.success).toBe(true)
    expect(pipeline.grant.playerUpdated).toBe(true)

    const afterVm = buildHeroProgressionViewModel(pipeline.player, 'monkey-king')
    expect(afterVm).not.toBeNull()
    expect(afterVm!.currentExp).toBe(45)
    expect(afterVm!.level).toBe(1)
    expect(afterVm!.expToNext).toBe(100)
    expect(afterVm!.currentExp - beforeVm!.currentExp).toBe(45)
  })

  it('heroExp ไปที่ lead hero (teamSlots[0]) ไม่ใช่ตัวอื่นใน roster', async () => {
    const player = stubPlayer({
      ownedCharacters: [
        {
          characterId: 'pig-warrior',
          level: 1,
          exp: 0,
          expToNext: 100,
          obtainedAt: new Date().toISOString(),
          skillLevels: createDefaultSkillLevels(),
        },
        {
          characterId: 'monkey-king',
          level: 1,
          exp: 0,
          expToNext: 100,
          obtainedAt: new Date().toISOString(),
          skillLevels: createDefaultSkillLevels(),
        },
      ],
      teamSlots: ['pig-warrior', 'monkey-king', null, null],
    })
    const result = dungeonResult({ runId: 'e2e-lead-pig-run' })
    const pipeline = await grantAndFinalizeDungeonRewards({
      result,
      dungeon: P5_TEST_DUNGEON,
      player,
      deps: makeGrantDeps(player),
      rng: () => 0.99,
    })

    const pig = pipeline.player.ownedCharacters.find((c) => c.characterId === 'pig-warrior')
    const monkey = pipeline.player.ownedCharacters.find((c) => c.characterId === 'monkey-king')
    expect(pig?.exp).toBe(45)
    expect(monkey?.exp).toBe(0)
  })
})
