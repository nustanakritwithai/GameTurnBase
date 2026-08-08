import type { StageDefinition, StageResult, SurvivalParams } from '../dungeon/dungeonSchema'
import { getRealtimeStage } from '../realtimeBattle/stageConfig'

/**
 * Count expected enemies for a dungeon stage (used for partial failure hero EXP).
 * Survival stages respect totalWaves cap; other types use all arena waves.
 */
export function countExpectedEnemiesForStage(stage: StageDefinition): number {
  const arena = getRealtimeStage(stage.arenaId)
  if (!arena?.waves.length) return 1

  if (stage.stageType === 'survival') {
    const params = stage.params as SurvivalParams
    const totalWaves = params.totalWaves ?? arena.waves.length
    return arena.waves.slice(0, totalWaves).reduce((sum, wave) => sum + wave.enemies.length, 0)
  }

  return arena.waves.reduce((sum, wave) => sum + wave.enemies.length, 0)
}

/**
 * Dungeon progress 0–1 for partial failure rewards — cleared stages count fully;
 * failed stage credits enemiesDefeated / expected enemies for that stage only.
 */
export function computeDungeonProgressRatio(
  stageResults: StageResult[],
  stages: StageDefinition[],
): number {
  const totalStages = stages.length
  if (totalStages <= 0) return 0

  let earned = 0
  for (let i = 0; i < stageResults.length; i++) {
    const result = stageResults[i]
    if (result.success) {
      earned += 1
      continue
    }

    const stageDef = stages[i]
    const enemyTotal = stageDef ? countExpectedEnemiesForStage(stageDef) : 1
    const defeated = result.enemiesDefeated ?? 0
    earned += enemyTotal > 0 ? Math.min(1, defeated / enemyTotal) : 0
    break
  }

  return earned / totalStages
}
