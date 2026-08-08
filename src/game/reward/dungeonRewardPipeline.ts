import type { CurrencyResult, GoldSource, ItemResult } from '../../data/accountRepository'
import type { DungeonDefinition } from '../dungeon/dungeonSchema'
import type { DungeonResult } from '../dungeon/dungeonSchema'
import type { Player } from '../../types/player'
import { getDungeonRewardDefinition, getFailureRewardPolicy } from './rewardConfig'
import {
  grantDungeonRewards,
  markDungeonCleared,
  type GrantDungeonRewardDeps,
} from './rewardGrantService'
import { resolveRewards } from './rewardResolver'
import { buildResultViewModel } from './resultViewModel'
import { isFirstClear } from './resultFinalizer'
import { computeDungeonProgressRatio } from './rewardProgress'
import type { ResolvedReward, ResultViewModel, RewardGrantResult } from './rewardSchema'

export interface DungeonRewardPipelineInput {
  result: DungeonResult
  dungeon: DungeonDefinition
  player: Player
  deps: GrantDungeonRewardDeps
  rng?: () => number
}

export interface DungeonRewardPresentation {
  resolved: ResolvedReward
  viewModel: ResultViewModel
}

export interface DungeonRewardPipelineOutput extends DungeonRewardPresentation {
  grant: RewardGrantResult
  player: Player
}

export function resolveDungeonRewards(
  result: DungeonResult,
  dungeon: DungeonDefinition,
  progressFlags: Record<string, boolean>,
  rng?: () => number,
): DungeonRewardPresentation {
  const definition = getDungeonRewardDefinition(result.dungeonId)
  if (!definition) {
    throw new Error(`No reward config for dungeon ${result.dungeonId}`)
  }

  const progressRatio = result.success
    ? 1
    : computeDungeonProgressRatio(result.stageResults, dungeon.stages)

  const resolved = resolveRewards(definition, {
    dungeonId: result.dungeonId,
    runId: result.runId,
    success: result.success,
    stageResults: result.stageResults,
    combatSummary: result.combatSummary,
    isFirstClear: result.success && isFirstClear(progressFlags, result.dungeonId),
    failureRewardPolicy: getFailureRewardPolicy(result.dungeonId),
    dungeonProgressRatio: progressRatio,
    rng,
  })

  const viewModel = buildResultViewModel(
    result,
    dungeon,
    resolved,
    false,
    definition.nonProductionBalance ?? false,
  )

  return { resolved, viewModel }
}

export async function grantAndFinalizeDungeonRewards(
  input: DungeonRewardPipelineInput,
): Promise<DungeonRewardPipelineOutput> {
  const presentation = resolveDungeonRewards(
    input.result,
    input.dungeon,
    input.player.progress.flags,
    input.rng,
  )

  const { grant, player } = await grantDungeonRewards(
    presentation.resolved,
    input.player,
    input.deps,
  )

  let nextPlayer = player
  if (grant.success && grant.playerUpdated && input.result.success) {
    nextPlayer = markDungeonCleared(nextPlayer, input.result.dungeonId)
  }

  const viewModel = buildResultViewModel(
    input.result,
    input.dungeon,
    presentation.resolved,
    grant.success && (grant.playerUpdated || grant.alreadyGranted === true),
    getDungeonRewardDefinition(input.result.dungeonId)?.nonProductionBalance ?? false,
  )

  return {
    resolved: presentation.resolved,
    viewModel,
    grant,
    player: nextPlayer,
  }
}

export type { CurrencyResult, GoldSource, ItemResult }
