/**
 * Result / Reward pipeline contracts — NON-PRODUCTION balance values live in rewardConfig only.
 */

import type {
  CombatSummary,
  DungeonFailureReason,
  DungeonResult,
  ResultLifecycle,
  StageResult,
  StageType,
} from '../dungeon/dungeonSchema'

export type { CombatSummary, DungeonFailureReason, DungeonResult, ResultLifecycle, StageResult }

export type FailureRewardPolicy = 'none' | 'partial' | 'custom'

export type RewardEntry =
  | { type: 'currency'; currencyId: string; amount: number }
  | { type: 'item'; itemId: string; quantity: number }
  | { type: 'heroExp'; amount: number }
  | { type: 'accountExp'; amount: number }
  | { type: 'resource'; resourceId: string; amount: number }

export type RewardCondition =
  | { kind: 'always' }
  | { kind: 'firstClear' }
  | { kind: 'dungeonClear' }
  | { kind: 'bossDefeated' }
  | { kind: 'custom'; rulesetId: string }

export interface ConditionalReward {
  condition: RewardCondition
  entries: RewardEntry[]
}

export interface RewardPoolRef {
  poolId: string
  rolls: number
}

export interface RewardDefinition {
  sourceId: string
  guaranteed?: RewardEntry[]
  conditional?: ConditionalReward[]
  randomPools?: RewardPoolRef[]
  nonProductionBalance?: boolean
}

export interface RewardTrace {
  seed?: number
  poolsRolled?: string[]
  rolls?: number[]
  conditionsMatched?: string[]
}

export interface ResolvedReward {
  entries: RewardEntry[]
  trace?: RewardTrace
  transactionId: string
}

export interface RewardGrantResult {
  success: boolean
  granted: RewardEntry[]
  rejected?: RewardEntry[]
  playerUpdated: boolean
  transactionId: string
  alreadyGranted?: boolean
}

export interface RewardDisplayEntry {
  label: string
  amount: string
  kind: RewardEntry['type']
}

export interface ResultStageRow {
  stageId: string
  stageName: string
  success: boolean
  clearTimeLabel: string
}

export interface ResultViewModel {
  status: 'clear' | 'failed'
  dungeonName: string
  clearTimeLabel: string
  stagesCleared: number
  stagesTotal: number
  stageSummary: ResultStageRow[]
  rewards: RewardDisplayEntry[]
  failureLabel?: string
  canContinue: boolean
  nonProductionBalance: boolean
}

export interface RewardResolveContext {
  dungeonId: string
  runId: string
  success: boolean
  stageResults: StageResult[]
  combatSummary?: CombatSummary
  isFirstClear: boolean
  failureRewardPolicy: FailureRewardPolicy
  /** 0–1 dungeon progress for partial failure heroExp (computed upstream). */
  dungeonProgressRatio?: number
  rng?: () => number
}

export type RewardGrantCallbacks = {
  earnGold: (amount: number, refId: string) => Promise<{ ok: boolean }>
  grantItem: (itemId: string, quantity: number) => Promise<{ ok: boolean }>
  applyHeroExp: (amount: number) => void
  applyAccountExp: (amount: number) => void
  savePlayer: () => Promise<boolean>
  markTransaction: (transactionId: string) => void
}

export type { StageType }
