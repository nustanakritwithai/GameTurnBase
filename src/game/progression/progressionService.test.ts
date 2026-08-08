import { describe, expect, it } from 'vitest'
import type { Player } from '../../types/player'
import { EMPTY_PROGRESS } from '../../types/player'
import { progressionConfig } from './progressionConfig'
import { applyHeroExpToProgress } from './heroExpService'
import {
  createInitialOwnedCharacterProgress,
  migrateOwnedCharacters,
  sanitizeOwnedCharacter,
} from './progressionMigration'
import { createDefaultSkillLevels } from '../realtimeBattle/SkillProgressionSystem'
import { advanceAwakening, applyHeroExp, unlockTalent, upgradeSkill } from './progressionService'
import { validateProgressionConfig } from './progressionValidator'
import { grantDungeonRewards } from '../reward/rewardGrantService'
import { resolveRewards } from '../reward/rewardResolver'
import { getDungeonRewardDefinition } from '../reward/rewardConfig'
import { createPlayerEntity } from '../realtimeBattle/createRealtimeBattle'
import type { GoldSource } from '../../data/accountRepository'

function stubPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'acc-1',
    uid: '1234567890',
    name: 'Tester',
    title: 'Novice',
    level: 1,
    exp: 0,
    expToNext: 100,
    currency: { gold: 500, gem: 0 },
    ownedCharacters: [
      createInitialOwnedCharacterProgress('monkey-king', '2026-01-01T00:00:00.000Z'),
      createInitialOwnedCharacterProgress('pig-warrior', '2026-01-02T00:00:00.000Z'),
    ],
    inventory: [],
    friends: [],
    teamSlots: ['monkey-king', 'pig-warrior', null, null],
    frameId: 'default',
    progress: { ...EMPTY_PROGRESS },
    ...overrides,
  }
}

describe('applyHeroExpToProgress', () => {
  it('gains EXP below threshold without leveling', () => {
    const result = applyHeroExpToProgress({
      heroId: 'monkey-king',
      level: 1,
      currentExp: 40,
      amount: 30,
    })
    expect(result.newLevel).toBe(1)
    expect(result.newExp).toBe(70)
    expect(result.levelsGained).toBe(0)
  })

  it('levels up when EXP exactly hits threshold', () => {
    const result = applyHeroExpToProgress({
      heroId: 'monkey-king',
      level: 1,
      currentExp: 50,
      amount: 50,
    })
    expect(result.newLevel).toBe(2)
    expect(result.newExp).toBe(0)
    expect(result.levelsGained).toBe(1)
  })

  it('levels up multiple times and retains overflow EXP', () => {
    const result = applyHeroExpToProgress({
      heroId: 'monkey-king',
      level: 4,
      currentExp: 0,
      amount: 1000,
    })
    expect(result.levelsGained).toBeGreaterThan(1)
    expect(result.newLevel).toBeGreaterThan(4)
    expect(result.newExp).toBeGreaterThanOrEqual(0)
  })

  it('cannot exceed max hero level', () => {
    const result = applyHeroExpToProgress({
      heroId: 'monkey-king',
      level: progressionConfig.maxHeroLevel,
      currentExp: 0,
      amount: 99999,
    })
    expect(result.newLevel).toBe(progressionConfig.maxHeroLevel)
    expect(result.atMaxLevel).toBe(true)
    expect(result.newExp).toBe(0)
  })

  it('rejects invalid EXP amounts', () => {
    expect(() =>
      applyHeroExpToProgress({
        heroId: 'monkey-king',
        level: 1,
        currentExp: 0,
        amount: -5,
      }),
    ).toThrow()
  })

  it('overflow EXP หลัง max level ถูก clamp เป็น 0 (maxLevelExpBehavior)', () => {
    const atMax = progressionConfig.maxHeroLevel
    const result = applyHeroExpToProgress({
      heroId: 'monkey-king',
      level: atMax,
      currentExp: 999,
      amount: 5000,
    })
    expect(result.newExp).toBe(0)
    expect(result.atMaxLevel).toBe(true)
  })
})

describe('applyHeroExp service', () => {
  it('isolates EXP between heroes', () => {
    const player = stubPlayer()
    const { player: next, result } = applyHeroExp(player, 'monkey-king', 150)
    expect(result.levelsGained).toBe(1)
    const pig = next.ownedCharacters.find((c) => c.characterId === 'pig-warrior')
    expect(pig?.level).toBe(1)
    expect(pig?.exp).toBe(0)
  })
})

describe('upgradeSkill', () => {
  it('upgrades a valid skill slot', () => {
    const player = stubPlayer()
    const { player: next, result } = upgradeSkill(player, 'monkey-king', 'skill1')
    expect(result.success).toBe(true)
    expect(result.newLevel).toBe(2)
    const owned = next.ownedCharacters.find((c) => c.characterId === 'monkey-king')
    expect(owned?.skillLevels.skill1.level).toBe(2)
  })

  it('changes only the target hero skill slot', () => {
    const player = stubPlayer()
    const { player: next } = upgradeSkill(player, 'pig-warrior', 'skill1')
    const pig = next.ownedCharacters.find((c) => c.characterId === 'pig-warrior')
    const monkey = next.ownedCharacters.find((c) => c.characterId === 'monkey-king')
    expect(pig?.skillLevels.skill1.level).toBe(2)
    expect(monkey?.skillLevels.skill1.level).toBe(1)
  })

  it('rejects upgrade when at max level', () => {
    let player = stubPlayer()
    for (let i = 0; i < 4; i++) {
      player = upgradeSkill(player, 'monkey-king', 'skill1').player
    }
    const { result } = upgradeSkill(player, 'monkey-king', 'skill1')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Skill at max level')
  })

  it('rejects insufficient resources without deducting gold', () => {
    const player = stubPlayer({ currency: { gold: 0, gem: 0 } })
    const { player: next, result } = upgradeSkill(player, 'monkey-king', 'skill1')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Insufficient resources')
    expect(next.currency.gold).toBe(0)
    expect(next.ownedCharacters[0]?.skillLevels.skill1.level).toBe(1)
  })

  it('deducts cost exactly once on success', () => {
    const player = stubPlayer({ currency: { gold: 100, gem: 0 } })
    const { player: next } = upgradeSkill(player, 'monkey-king', 'skill1')
    expect(next.currency.gold).toBe(50)
  })
})

describe('unlockTalent', () => {
  it('unlocks a valid node with cost', () => {
    const player = stubPlayer()
    const { player: next, result } = unlockTalent(player, 'monkey-king', 'mk-talent-1')
    expect(result.success).toBe(true)
    const owned = next.ownedCharacters.find((c) => c.characterId === 'monkey-king')
    expect(owned?.talentState?.unlockedNodes).toContain('mk-talent-1')
    expect(next.currency.gold).toBe(470)
  })

  it('requires prerequisites', () => {
    const player = stubPlayer()
    const { result } = unlockTalent(player, 'monkey-king', 'mk-talent-2')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Prerequisites not met')
  })

  it('blocks duplicate unlock', () => {
    let player = stubPlayer()
    player = unlockTalent(player, 'monkey-king', 'mk-talent-1').player
    const { result } = unlockTalent(player, 'monkey-king', 'mk-talent-1')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Already unlocked')
  })
})

describe('advanceAwakening', () => {
  it('starts from valid initial state', () => {
    const owned = createInitialOwnedCharacterProgress('monkey-king', 't')
    expect(owned.awakeningState?.tier).toBe(0)
  })

  it('advances tier with fixture cost', () => {
    const player = stubPlayer()
    const { player: next, result } = advanceAwakening(player, 'monkey-king')
    expect(result.success).toBe(true)
    expect(result.newTier).toBe(1)
    const owned = next.ownedCharacters.find((c) => c.characterId === 'monkey-king')
    expect(owned?.awakeningState?.tier).toBe(1)
  })

  it('rejects invalid tier beyond max', () => {
    let player = stubPlayer({ currency: { gold: 9999, gem: 0 } })
    for (let i = 0; i < progressionConfig.maxAwakeningTier; i++) {
      player = advanceAwakening(player, 'monkey-king').player
    }
    const { result } = advanceAwakening(player, 'monkey-king')
    expect(result.success).toBe(false)
  })
})

describe('migration and sanitization', () => {
  it('migrates legacy owned character without skill levels', () => {
    const migrated = migrateOwnedCharacters([
      {
        characterId: 'monkey-king',
        level: 3,
        exp: 10,
        expToNext: 500,
        obtainedAt: 't',
      } as import('../../types/player').OwnedCharacter,
    ])
    expect(migrated[0]?.skillLevels).toEqual(createDefaultSkillLevels())
    expect(migrated[0]?.progressionVersion).toBe(1)
  })

  it('sanitizes invalid level and negative EXP', () => {
    const sanitized = sanitizeOwnedCharacter({
      characterId: 'monkey-king',
      level: -2,
      exp: -10,
      expToNext: 0,
      obtainedAt: 't',
      skillLevels: createDefaultSkillLevels(),
    })
    expect(sanitized.level).toBe(1)
    expect(sanitized.exp).toBe(0)
  })

  it('does not cross-contaminate heroes on migration', () => {
    const defaults = createDefaultSkillLevels()
    const migrated = migrateOwnedCharacters([
      {
        characterId: 'monkey-king',
        level: 5,
        exp: 20,
        expToNext: 100,
        obtainedAt: 't',
        skillLevels: {
          ...defaults,
          skill1: { ...defaults.skill1, level: 3 },
        },
      },
      {
        characterId: 'pig-warrior',
        level: 1,
        exp: 0,
        expToNext: 100,
        obtainedAt: 't',
        skillLevels: defaults,
      },
    ])
    expect(migrated[0]?.skillLevels.skill1.level).toBe(3)
    expect(migrated[1]?.skillLevels.skill1.level).toBe(1)
  })
})

describe('validateProgressionConfig', () => {
  it('returns no errors for fixture config', () => {
    expect(validateProgressionConfig()).toEqual([])
  })
})

describe('reward → progression integration', () => {
  it('applies hero EXP via progression service and preserves on reload shape', async () => {
    const player = stubPlayer()
    const definition = getDungeonRewardDefinition('p5-test-dungeon')!
    const resolved = resolveRewards(definition, {
      dungeonId: 'p5-test-dungeon',
      runId: 'run-progression-1',
      success: true,
      stageResults: [],
      isFirstClear: false,
      failureRewardPolicy: 'none',
      combatSummary: {
        enemiesDefeated: 1,
        elitesDefeated: 0,
        bossesDefeated: 0,
        damageDealt: 0,
        damageTaken: 0,
      },
      rng: () => 0.99,
    })
    const deps = {
      onEarnGold: async (_s: GoldSource, amount: number) => ({
        ok: true as const,
        player,
        amount,
      }),
      onGrantItem: async () => ({ ok: true as const, player }),
    }
    const granted = await grantDungeonRewards(resolved, player, deps)
    const monkey = granted.player.ownedCharacters.find((c) => c.characterId === 'monkey-king')
    expect(monkey?.exp).toBeGreaterThan(0)

    const reloaded = migrateOwnedCharacters(granted.player.ownedCharacters)
    const monkeyReloaded = reloaded.find((c) => c.characterId === 'monkey-king')
    expect(monkeyReloaded?.exp).toBe(monkey?.exp)
    expect(monkeyReloaded?.level).toBe(monkey?.level)
  })
})

describe('combat integration', () => {
  it('resolves higher stats for leveled hero snapshot', () => {
    const low = createPlayerEntity(stubPlayer())
    const high = createPlayerEntity(
      stubPlayer({
        ownedCharacters: [
          {
            ...createInitialOwnedCharacterProgress('monkey-king', 't'),
            level: 10,
            exp: 0,
            expToNext: 100,
          },
        ],
      }),
    )
    expect(low).not.toBeNull()
    expect(high).not.toBeNull()
    expect(high!.atk).toBeGreaterThan(low!.atk)
    expect(high!.maxHp).toBeGreaterThan(low!.maxHp)
  })

  it('uses upgraded skill levels without breaking entity creation', () => {
    let player = stubPlayer()
    player = upgradeSkill(player, 'monkey-king', 'skill1').player
    const entity = createPlayerEntity(player)
    expect(entity).not.toBeNull()
    expect(entity!.characterId).toBe('monkey-king')
  })
})
