import type { ResolvedReward, RewardEntry, RewardResolveContext, RewardTrace } from './rewardSchema'
import type { RewardDefinition } from './rewardSchema'
import { REWARD_POOLS } from './rewardConfig'
import { validateRewardDefinition } from './rewardValidator'

function getGuaranteedHeroExp(definition: RewardDefinition): number {
  const entry = definition.guaranteed?.find((e) => e.type === 'heroExp')
  return entry && 'amount' in entry ? entry.amount : 0
}

function resolvePartialFailureRewards(
  definition: RewardDefinition,
  context: RewardResolveContext,
): RewardEntry[] {
  const fullHeroExp = getGuaranteedHeroExp(definition)
  if (fullHeroExp <= 0) return []

  const ratio = context.dungeonProgressRatio ?? 0
  if (ratio <= 0) return []

  const amount = Math.max(1, Math.round(fullHeroExp * ratio))
  return [{ type: 'heroExp', amount }]
}

function mergeEntries(entries: RewardEntry[]): RewardEntry[] {
  const map = new Map<string, RewardEntry>()
  for (const entry of entries) {
    const key = JSON.stringify(entry)
    const existing = map.get(key)
    if (!existing) {
      map.set(key, { ...entry })
      continue
    }
    if ('amount' in entry && 'amount' in existing) {
      ;(existing as { amount: number }).amount += entry.amount
    } else if ('quantity' in entry && 'quantity' in existing) {
      ;(existing as { quantity: number }).quantity += entry.quantity
    }
  }
  return [...map.values()]
}

function rollPool(poolId: string, rng: () => number, trace: RewardTrace): RewardEntry[] {
  const pool = REWARD_POOLS[poolId]
  if (!pool?.entries?.length) return []
  const entries = pool.entries
  const total = pool.weights.reduce((a, b) => a + b, 0)
  let roll = rng() * total
  trace.poolsRolled = [...(trace.poolsRolled ?? []), poolId]
  trace.rolls = [...(trace.rolls ?? []), roll]
  for (let i = 0; i < entries.length; i++) {
    roll -= pool.weights[i]
    if (roll <= 0) {
      const picked = entries[i]
      return picked ? [{ ...picked }] : []
    }
  }
  const fallback = entries[entries.length - 1]
  return fallback ? [{ ...fallback }] : []
}

function evaluateCondition(
  condition: RewardResolveContext & { isFirstClear: boolean },
  condKind: string,
  combatSummary?: RewardResolveContext['combatSummary'],
): boolean {
  switch (condKind) {
    case 'always':
      return true
    case 'firstClear':
      return condition.isFirstClear
    case 'dungeonClear':
      return condition.success
    case 'bossDefeated':
      return (combatSummary?.bossesDefeated ?? 0) > 0
    default:
      return false
  }
}

/**
 * Pure reward resolution — deterministic when rng is seeded/fixed.
 */
export function resolveRewards(
  definition: RewardDefinition,
  context: RewardResolveContext,
): ResolvedReward {
  const configErrors = validateRewardDefinition(definition)
  if (configErrors.length > 0) {
    throw new Error(`Invalid reward config: ${configErrors.join('; ')}`)
  }

  const transactionId = `${context.runId}:final`
  const trace: RewardTrace = { conditionsMatched: [] }
  const entries: RewardEntry[] = []

  if (!context.success) {
    if (context.failureRewardPolicy === 'none') {
      return { entries: [], transactionId, trace }
    }
    if (context.failureRewardPolicy === 'partial') {
      return {
        entries: resolvePartialFailureRewards(definition, context),
        transactionId,
        trace,
      }
    }
    return { entries: [], transactionId, trace }
  }

  entries.push(...(definition.guaranteed ?? []))

  for (const cond of definition.conditional ?? []) {
    const kind = cond.condition.kind
    if (evaluateCondition(context, kind, context.combatSummary)) {
      trace.conditionsMatched?.push(kind)
      entries.push(...cond.entries)
    }
  }

  const rng = context.rng ?? (() => 0.5)
  const seed = context.rng ? undefined : 0
  if (seed !== undefined) trace.seed = seed

  for (const poolRef of definition.randomPools ?? []) {
    for (let i = 0; i < poolRef.rolls; i++) {
      entries.push(...rollPool(poolRef.poolId, rng, trace))
    }
  }

  return {
    entries: mergeEntries(entries),
    trace,
    transactionId,
  }
}
