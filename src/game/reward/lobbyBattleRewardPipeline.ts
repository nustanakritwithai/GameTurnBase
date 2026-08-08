import type { CurrencyResult, GoldSource, ItemResult } from '../../data/accountRepository.shared'
import { appendBattleHistory } from '../dialogue/actions'
import { applyBattleExp } from '../realtimeBattle/RewardSystem'
import { toLegacyBattleResult } from '../realtimeBattle/BattleResultAdapter'
import type { RealtimeBattleResult } from '../realtimeBattle/types'
import type { Player } from '../../types/player'
import { hasRewardTransaction, rewardTransactionFlagKey } from './resultFinalizer'

export interface LobbyBattleRewardDeps {
  onPlayerChange: (next: Player) => Promise<boolean>
  onEarnGold: (source: GoldSource, amount: number, refId?: string) => Promise<CurrencyResult>
  onGrantItem: (
    itemId: string,
    quantity: number,
    source: GoldSource,
    refId?: string,
  ) => Promise<ItemResult>
  /** Atomic profile flags + hero EXP + battle history — required for Supabase backend. */
  onCommitProgression: (payload: LobbyBattleProgressionCommit) => Promise<ProgressionCommitResult>
  /** Durable battle snapshot for reload resume — optional in unit tests. */
  onRecordPending?: (result: RealtimeBattleResult, transactionId: string) => Promise<boolean>
  onClearPending?: (transactionId: string) => Promise<void>
}

export interface LobbyBattleProgressionCommit {
  transactionId: string
  player: Player
  leadCharacterId: string
  battle: {
    externalId: string
    opponent: string
    result: 'win' | 'lose'
    durationMs: number
    finishedAt: string
  }
}

export type ProgressionCommitResult = { ok: true; player: Player } | { ok: false; error?: string }

export type LobbyBattleRewardFailure = 'progression_save' | 'gold_grant' | 'item_grant'

export interface LobbyBattleRewardResult {
  ok: boolean
  player: Player
  failure?: LobbyBattleRewardFailure
  /** All steps were already committed for this battle result — no duplicate grants. */
  alreadyComplete?: boolean
}

/**
 * Ordered partial commit with per-step backend ledger guards — NOT one atomic EXP+gold+item RPC.
 *
 * Steps (each may persist independently; gold/item/progression RPCs are idempotent on refId):
 *   1. progression (heroExp, history, clear flags) via onCommitProgression (single DB txn)
 *   2. earnGold RPC (currency_transactions refId)
 *   3. grantItem RPC per drop (item_grant_ledger refId per txId+itemId)
 *
 * Client flags checkpoint completed steps for same-session retry. After reload, pending_lobby_rewards
 * plus backend ledgers allow resume without double-granting.
 */
export const LOBBY_BATTLE_REWARD_POLICY = 'ordered-partial-commit' as const

/** Stable id for one battle outcome — ties idempotency flags and earnGold refId. */
export function lobbyBattleTransactionId(result: RealtimeBattleResult): string {
  return `lobby:${result.stageId}:${result.finishedAt}`
}

export function lobbyBattleProgressionFlagKey(transactionId: string): string {
  return `${rewardTransactionFlagKey(transactionId)}_prog`
}

export function lobbyBattleGoldFlagKey(transactionId: string): string {
  return `${rewardTransactionFlagKey(transactionId)}_gold`
}

export function lobbyBattleItemFlagKey(transactionId: string, itemId: string): string {
  return `${rewardTransactionFlagKey(transactionId)}_item_${itemId}`
}

/** Per-item grant refId — one ledger row per battle drop. */
export function lobbyBattleItemRefId(transactionId: string, itemId: string): string {
  return `${transactionId}_item_${itemId}`
}

function withFlags(player: Player, flags: Record<string, boolean>): Player {
  return {
    ...player,
    progress: { ...player.progress, flags: { ...player.progress.flags, ...flags } },
  }
}

export async function finalizeLobbyBattleRewards(
  result: RealtimeBattleResult,
  player: Player,
  deps: LobbyBattleRewardDeps,
): Promise<LobbyBattleRewardResult> {
  const txId = lobbyBattleTransactionId(result)

  if (hasRewardTransaction(player.progress.flags, txId)) {
    return { ok: true, player, alreadyComplete: true }
  }

  if (deps.onRecordPending) {
    const recorded = await deps.onRecordPending(result, txId)
    if (!recorded) {
      return { ok: false, player, failure: 'progression_save' }
    }
  }

  let next = player
  let flags = { ...player.progress.flags }

  if (!flags[lobbyBattleProgressionFlagKey(txId)]) {
    next = applyBattleExp(player, result.earnedExp)

    const legacy = toLegacyBattleResult(result)
    const won = legacy.outcome === 'victory'

    let progress = appendBattleHistory(next.progress, {
      id: `battle-${txId}`,
      opponent: legacy.stageName,
      result: won ? 'win' : 'lose',
      finishedAt: legacy.finishedAt,
      durationMs: legacy.durationMs,
    })

    if (won) {
      progress = {
        ...progress,
        flags: { ...progress.flags, [`trial_cleared_${legacy.stageId}`]: true },
      }
    }

    flags = { ...progress.flags, [lobbyBattleProgressionFlagKey(txId)]: true }
    next = { ...next, progress: { ...next.progress, flags } }

    const leadCharacterId =
      player.teamSlots.find((id): id is string => id !== null) ??
      next.ownedCharacters[0]?.characterId ??
      'monkey-king'

    const committed = await deps.onCommitProgression({
      transactionId: txId,
      player: next,
      leadCharacterId,
      battle: {
        externalId: `battle-${txId}`,
        opponent: legacy.stageName,
        result: won ? 'win' : 'lose',
        durationMs: legacy.durationMs ?? result.elapsedMs,
        finishedAt: legacy.finishedAt,
      },
    })

    if (!committed.ok) {
      return { ok: false, player, failure: 'progression_save' }
    }
    next = committed.player
    flags = { ...next.progress.flags }
  }

  if (result.earnedGold > 0 && !flags[lobbyBattleGoldFlagKey(txId)]) {
    const gold = await deps.onEarnGold('drop', result.earnedGold, txId)
    if (!gold.ok) {
      return { ok: false, player: next, failure: 'gold_grant' }
    }
    next = gold.player
    flags = { ...next.progress.flags, [lobbyBattleGoldFlagKey(txId)]: true }
    next = withFlags(next, { [lobbyBattleGoldFlagKey(txId)]: true })

    const saved = await deps.onPlayerChange(next)
    if (!saved) {
      return { ok: false, player: next, failure: 'progression_save' }
    }
  }

  for (const drop of result.droppedItems) {
    const itemKey = lobbyBattleItemFlagKey(txId, drop.itemId)
    if (flags[itemKey]) continue

    const itemRefId = lobbyBattleItemRefId(txId, drop.itemId)
    const granted = await deps.onGrantItem(drop.itemId, drop.quantity, 'drop', itemRefId)
    if (!granted.ok) {
      return { ok: false, player: next, failure: 'item_grant' }
    }
    next = granted.player
    flags = { ...next.progress.flags, [itemKey]: true }
    next = withFlags(next, { [itemKey]: true })

    const saved = await deps.onPlayerChange(next)
    if (!saved) {
      return { ok: false, player: next, failure: 'progression_save' }
    }
  }

  if (!hasRewardTransaction(flags, txId)) {
    flags = { ...flags, [rewardTransactionFlagKey(txId)]: true }
    next = withFlags(next, { [rewardTransactionFlagKey(txId)]: true })
    const saved = await deps.onPlayerChange(next)
    if (!saved) {
      return { ok: false, player: next, failure: 'progression_save' }
    }
  }

  if (deps.onClearPending) {
    await deps.onClearPending(txId)
  }

  return { ok: true, player: next }
}

/** Reconstruct RealtimeBattleResult from a durable pending row (reload resume). */
export function pendingLobbyRewardToResult(pending: {
  stageId: string
  stageName: string
  outcome: 'victory' | 'defeat'
  earnedExp: number
  earnedGold: number
  droppedItems: Array<{ itemId: string; quantity: number }>
  finishedAt: string
  durationMs?: number | null
}): RealtimeBattleResult {
  return {
    outcome: pending.outcome,
    stageId: pending.stageId,
    stageName: pending.stageName,
    elapsedMs: pending.durationMs ?? 0,
    defeatedEnemyIds: [],
    damageDealt: 0,
    damageTaken: 0,
    earnedExp: pending.earnedExp,
    earnedGold: pending.earnedGold,
    droppedItems: pending.droppedItems,
    finishedAt: pending.finishedAt,
  }
}
