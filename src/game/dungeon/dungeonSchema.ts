/**
 * P5 — Dungeon / Stage data contracts (orchestration layer above P4 combat core).
 *
 * Stage ordering comes from data — never `if (stage === 1)` in runtime code.
 */

import type { BattleWaveDefinition } from '../realtimeBattle/stageConfig'

export type StageType =
  'survival' | 'defend' | 'chase' | 'hazard' | 'mini-boss' | 'time-attack' | 'custom'

export type StageLifecycle =
  | 'not_started'
  | 'entering'
  | 'active'
  | 'resolving'
  | 'cleared'
  | 'failed'
  | 'exiting'
  | 'complete'

export type TimerMode = 'none' | 'countdown' | 'countup'

export interface StageTimerConfig {
  mode: TimerMode
  /** Countdown limit (ms) or countup cap for display — optional */
  durationMs?: number
}

export type StageConditionKind =
  'player_alive' | 'all_enemies_defeated' | 'objective_alive' | 'custom'

export interface StageCondition {
  kind: StageConditionKind
}

export interface SpawnWaveConfig {
  id: string
  enemies: BattleWaveDefinition['enemies']
  /** Delay before this wave spawns (ms from stage start or previous wave clear) */
  delayMs?: number
}

export interface SpawnConfig {
  waves: SpawnWaveConfig[]
  waveIntervalMs?: number
}

/** Params per stage type — all optional fields have runtime defaults */
export interface SurvivalParams {
  totalWaves?: number
  waveIntervalMs?: number
  timeLimitMs?: number
  /** Multiplier on enemy maxHp for this stage only (1 = default). */
  enemyHpScale?: number
  spawn?: SpawnConfig
}

export interface DefendParams {
  objectiveHP?: number
  timeLimitMs?: number
  enemySpawnRateMs?: number
  reinforcementWaves?: SpawnWaveConfig[]
  spawn?: SpawnConfig
}

export interface ChaseParams {
  targetTemplateId?: string
  targetHP?: number
  escapeThresholdX?: number
  timeLimitMs?: number
  spawnBlockers?: SpawnWaveConfig[]
}

export interface HazardParams {
  hazardDamagePerSec?: number
  safeZoneCenterY?: number
  safeZoneRadius?: number
  timeLimitMs?: number
  spawn?: SpawnConfig
}

export interface MiniBossParams {
  bossTemplateId?: string
  bossHP?: number
  timeLimitMs?: number
  minionWaves?: SpawnWaveConfig[]
}

export interface TimeAttackParams {
  targetGoal?: 'defeat_all' | 'defeat_boss'
  timeLimitMs?: number
  spawn?: SpawnConfig
}

export interface CustomParams {
  rulesetId: string
  customParams?: Record<string, unknown>
}

export type StageParams =
  | SurvivalParams
  | DefendParams
  | ChaseParams
  | HazardParams
  | MiniBossParams
  | TimeAttackParams
  | CustomParams

export interface StageDefinition {
  id: string
  name: string
  stageType: StageType
  /** Arena geometry + default waves — combat arena id in stageConfig */
  arenaId: string
  winCondition: StageCondition
  loseCondition: StageCondition
  timer?: StageTimerConfig
  params: StageParams
  nextStageId?: string
}

export interface DungeonDefinition {
  id: string
  stages: StageDefinition[]
  estimatedDurationMs?: number
  metadata?: {
    name?: string
    difficulty?: string
  }
}

export interface ObjectiveProgress {
  label: string
  current: number
  target: number
  detail?: string
}

export type StageResolution = 'continue' | 'win' | 'lose'

export type DungeonFailureReason =
  'playerDefeated' | 'objectiveFailed' | 'timeout' | 'targetEscaped' | 'aborted' | 'invalidState'

export type ResultLifecycle =
  'running' | 'resolving' | 'finalized' | 'rewarded' | 'presented' | 'exited'

export interface CombatSummary {
  enemiesDefeated: number
  elitesDefeated: number
  bossesDefeated: number
  damageDealt: number
  damageTaken: number
}

export interface StageResult {
  stageId: string
  stageType: StageType
  success: boolean
  clearTimeMs: number
  objectiveProgress?: number
  enemiesDefeated?: number
  score?: number
  failureReason?: string
}

export interface DungeonResult {
  dungeonId: string
  runId: string
  success: boolean
  clearTimeMs: number
  stageResults: StageResult[]
  combatSummary?: CombatSummary
  failureReason?: DungeonFailureReason
  completedAt: number
  lifecycle: ResultLifecycle
}

export interface DungeonRunState {
  dungeonId: string
  currentStageIndex: number
  status: 'active' | 'cleared' | 'failed'
  stageResults: StageResult[]
  startedAtMs: number
}
