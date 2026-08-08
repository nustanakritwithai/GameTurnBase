import { describe, expect, it } from 'vitest'
import { P5_TEST_DUNGEON } from '../dungeon/dungeonConfig'
import { computeDungeonProgressRatio, countExpectedEnemiesForStage } from './rewardProgress'

describe('rewardProgress', () => {
  it('counts survival stage enemies capped by totalWaves', () => {
    const stage1 = P5_TEST_DUNGEON.stages[0]
    expect(countExpectedEnemiesForStage(stage1)).toBe(5)
  })

  it('computes partial progress from enemies defeated on failed stage 1', () => {
    const ratio = computeDungeonProgressRatio(
      [
        {
          stageId: 'p5-stage-1-survival',
          stageType: 'survival',
          success: false,
          clearTimeMs: 12_000,
          enemiesDefeated: 2,
        },
      ],
      P5_TEST_DUNGEON.stages,
    )
    // 2 / 5 enemies on stage 1, 4 stages total → 0.1
    expect(ratio).toBeCloseTo(0.1, 5)
  })

  it('returns 1 when all stages cleared', () => {
    const ratio = computeDungeonProgressRatio(
      P5_TEST_DUNGEON.stages.map((s) => ({
        stageId: s.id,
        stageType: s.stageType,
        success: true,
        clearTimeMs: 1000,
      })),
      P5_TEST_DUNGEON.stages,
    )
    expect(ratio).toBe(1)
  })
})
