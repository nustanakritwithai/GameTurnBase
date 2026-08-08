import type { FailureRewardPolicy, RewardDefinition } from './rewardSchema'

/**
 * NON-PRODUCTION BALANCE — placeholder numerics until Ring 0 locks P8/P9 economy.
 * All values here are data-driven and labeled nonProductionBalance: true.
 */

export const DEFAULT_FAILURE_REWARD_POLICY: FailureRewardPolicy = 'none'

/** Per-dungeon reward definitions keyed by dungeonId */
export const DUNGEON_REWARD_DEFINITIONS: Record<string, RewardDefinition> = {
  'p5-test-dungeon': {
    sourceId: 'p5-test-dungeon-clear',
    nonProductionBalance: true,
    guaranteed: [
      { type: 'currency', currencyId: 'gold', amount: 75 },
      { type: 'heroExp', amount: 45 },
      { type: 'accountExp', amount: 30 },
    ],
    conditional: [
      {
        condition: { kind: 'firstClear' },
        entries: [
          { type: 'currency', currencyId: 'gold', amount: 50 },
          { type: 'item', itemId: 'iron-essence', quantity: 2 },
        ],
      },
      {
        condition: { kind: 'bossDefeated' },
        entries: [{ type: 'item', itemId: 'spirit-incense', quantity: 1 }],
      },
    ],
    randomPools: [
      {
        poolId: 'p5-placeholder-pool',
        rolls: 1,
      },
    ],
  },
}

/** Placeholder random pool — seedable, NON-PRODUCTION */
export const REWARD_POOLS: Record<
  string,
  { entries: RewardDefinition['guaranteed']; weights: number[] }
> = {
  'p5-placeholder-pool': {
    entries: [
      { type: 'item', itemId: 'healing-peach', quantity: 1 },
      { type: 'item', itemId: 'iron-essence', quantity: 1 },
      { type: 'currency', currencyId: 'gold', amount: 15 },
    ],
    weights: [50, 35, 15],
  },
}

export const FAILURE_REWARD_POLICIES: Record<string, FailureRewardPolicy> = {
  /** Ring 0: partial — heroExp by stage/wave progress only; no first-clear or boss rewards. */
  'p5-test-dungeon': 'partial',
}

export function getDungeonRewardDefinition(dungeonId: string): RewardDefinition | null {
  return DUNGEON_REWARD_DEFINITIONS[dungeonId] ?? null
}

export function getFailureRewardPolicy(dungeonId: string): FailureRewardPolicy {
  return FAILURE_REWARD_POLICIES[dungeonId] ?? DEFAULT_FAILURE_REWARD_POLICY
}
