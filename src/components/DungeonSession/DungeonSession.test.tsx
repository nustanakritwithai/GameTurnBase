import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DungeonSession } from './DungeonSession'
import { P5_TEST_DUNGEON } from '../../game/dungeon/dungeonConfig'
import type { DungeonResult } from '../../game/dungeon/dungeonSchema'
import type { ResultViewModel } from '../../game/reward/rewardSchema'
import type { Player } from '../../types/player'
import { EMPTY_PROGRESS } from '../../types/player'
import { createDefaultSkillLevels } from '../../game/realtimeBattle/SkillProgressionSystem'

const clearedResult: DungeonResult = {
  dungeonId: P5_TEST_DUNGEON.id,
  runId: 'test-run',
  success: true,
  completedAt: Date.now(),
  clearTimeMs: 60_000,
  lifecycle: 'finalized',
  stageResults: P5_TEST_DUNGEON.stages.map((stage) => ({
    stageId: stage.id,
    stageType: stage.stageType,
    success: true,
    clearTimeMs: 15_000,
  })),
  combatSummary: {
    enemiesDefeated: 5,
    elitesDefeated: 1,
    bossesDefeated: 1,
    damageDealt: 0,
    damageTaken: 0,
  },
}

const resultViewModel: ResultViewModel = {
  status: 'clear',
  dungeonName: P5_TEST_DUNGEON.metadata?.name ?? P5_TEST_DUNGEON.id,
  clearTimeLabel: '1:00',
  stagesCleared: 4,
  stagesTotal: 4,
  stageSummary: [],
  rewards: [],
  canContinue: true,
  nonProductionBalance: true,
}

function stubPlayer(): Player {
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
  }
}

const { completeDungeonOnce } = vi.hoisted(() => {
  let fired = false
  return {
    completeDungeonOnce: (onComplete: (result: DungeonResult) => void) => {
      if (fired) return false
      fired = true
      queueMicrotask(() => onComplete(clearedResult))
      return true
    },
  }
})

vi.mock('../../hooks/useDungeonStageBattle', () => ({
  useDungeonStageBattle: ({
    onDungeonComplete,
  }: {
    onDungeonComplete: (result: DungeonResult) => void
  }) => {
    const justCompleted = completeDungeonOnce(onDungeonComplete)
    return {
      phase: justCompleted ? ('loading' as const) : ('complete' as const),
      errorMessage: null,
      runtime: null,
      snapshot: null,
      stageSnapshot: null,
      requestExit: vi.fn(),
      setJoystick: vi.fn(),
      pressAttack: vi.fn(),
      pressSkill: vi.fn(),
    }
  },
}))

vi.mock('../../game/reward/dungeonRewardPipeline', () => ({
  resolveDungeonRewards: () => ({
    resolved: { transactionId: 'tx', entries: [] },
    viewModel: resultViewModel,
  }),
  grantAndFinalizeDungeonRewards: vi.fn(),
}))

describe('DungeonSession', () => {
  it('shows the result panel after the final stage clears (not the loading screen)', async () => {
    render(
      <DungeonSession
        player={stubPlayer()}
        onPlayerChange={vi.fn(async () => true)}
        onEarnGold={vi.fn()}
        onGrantItem={vi.fn()}
        onExit={vi.fn()}
      />,
    )

    expect(await screen.findByRole('dialog', { name: /เคลียร์ดันเจี้ยน/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /กลับล็อบบี้/i })).toBeEnabled()
    expect(screen.queryByText(/กำลังเข้าดันเจี้ยน/i)).not.toBeInTheDocument()
  })
})
