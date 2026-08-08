import type { DungeonDefinition, StageDefinition } from './dungeonSchema'

/** Vertical slice dungeon — data-driven, no hardcoded stage index logic */
export const P5_TEST_DUNGEON: DungeonDefinition = {
  id: 'p5-test-dungeon',
  estimatedDurationMs: 180_000,
  metadata: {
    name: 'ดันเจี้ยนทดสอบ P5',
    difficulty: 'normal',
  },
  stages: [
    {
      id: 'p5-stage-1-survival',
      name: 'ด่าน 1 — เอาชีวิตรอด',
      stageType: 'survival',
      arenaId: 'p5-survival-arena',
      winCondition: { kind: 'all_enemies_defeated' },
      loseCondition: { kind: 'player_alive' },
      timer: { mode: 'countup' },
      params: {
        totalWaves: 2,
        waveIntervalMs: 2500,
        /** Tutorial-easy: ~30% less enemy HP on stage 1 only (Ring 0). */
        enemyHpScale: 0.7,
      },
      nextStageId: 'p5-stage-2-hazard',
    },
    {
      id: 'p5-stage-2-hazard',
      name: 'ด่าน 2 — พื้นที่อันตราย',
      stageType: 'hazard',
      arenaId: 'p5-hazard-arena',
      winCondition: { kind: 'all_enemies_defeated' },
      loseCondition: { kind: 'player_alive' },
      timer: { mode: 'countup' },
      params: {
        hazardDamagePerSec: 12,
        safeZoneCenterY: 550,
        safeZoneRadius: 200,
      },
      nextStageId: 'p5-stage-3-elite',
    },
    {
      id: 'p5-stage-3-elite',
      name: 'ด่าน 3 — มินิบอส',
      stageType: 'mini-boss',
      arenaId: 'p5-elite-arena',
      winCondition: { kind: 'all_enemies_defeated' },
      loseCondition: { kind: 'player_alive' },
      timer: { mode: 'countdown', durationMs: 120_000 },
      params: {
        bossTemplateId: 'demon-captain',
      },
      nextStageId: 'p5-stage-4-boss',
    },
    {
      id: 'p5-stage-4-boss',
      name: 'ด่าน 4 — บอสสุดท้าย',
      stageType: 'mini-boss',
      arenaId: 'p5-boss-arena',
      winCondition: { kind: 'all_enemies_defeated' },
      loseCondition: { kind: 'player_alive' },
      timer: { mode: 'countup' },
      params: {
        bossTemplateId: 'spirit-guardian-boss',
      },
    },
  ],
}

/** Test fixtures — one per stage type for runtime validation */
export const P5_STAGE_TYPE_FIXTURES: Record<StageDefinition['stageType'], StageDefinition> = {
  survival: {
    id: 'fixture-survival',
    name: 'Fixture Survival',
    stageType: 'survival',
    arenaId: 'p5-survival-arena',
    winCondition: { kind: 'all_enemies_defeated' },
    loseCondition: { kind: 'player_alive' },
    params: { totalWaves: 2, waveIntervalMs: 100 },
  },
  defend: {
    id: 'fixture-defend',
    name: 'Fixture Defend',
    stageType: 'defend',
    arenaId: 'trial-01',
    winCondition: { kind: 'objective_alive' },
    loseCondition: { kind: 'custom' },
    timer: { mode: 'countdown', durationMs: 5000 },
    params: { objectiveHP: 50, timeLimitMs: 5000 },
  },
  chase: {
    id: 'fixture-chase',
    name: 'Fixture Chase',
    stageType: 'chase',
    arenaId: 'trial-01',
    winCondition: { kind: 'all_enemies_defeated' },
    loseCondition: { kind: 'player_alive' },
    params: { targetTemplateId: 'shadow-soldier', escapeThresholdX: 300 },
  },
  hazard: {
    id: 'fixture-hazard',
    name: 'Fixture Hazard',
    stageType: 'hazard',
    arenaId: 'p5-hazard-arena',
    winCondition: { kind: 'all_enemies_defeated' },
    loseCondition: { kind: 'player_alive' },
    params: { hazardDamagePerSec: 20, safeZoneCenterY: 550, safeZoneRadius: 100 },
  },
  'mini-boss': {
    id: 'fixture-mini-boss',
    name: 'Fixture Mini-boss',
    stageType: 'mini-boss',
    arenaId: 'p5-elite-arena',
    winCondition: { kind: 'all_enemies_defeated' },
    loseCondition: { kind: 'player_alive' },
    params: { bossTemplateId: 'demon-captain' },
  },
  'time-attack': {
    id: 'fixture-time-attack',
    name: 'Fixture Time Attack',
    stageType: 'time-attack',
    arenaId: 'trial-01',
    winCondition: { kind: 'all_enemies_defeated' },
    loseCondition: { kind: 'player_alive' },
    timer: { mode: 'countdown', durationMs: 30_000 },
    params: { targetGoal: 'defeat_all', timeLimitMs: 30_000 },
  },
  custom: {
    id: 'fixture-custom',
    name: 'Fixture Custom',
    stageType: 'custom',
    arenaId: 'trial-01',
    winCondition: { kind: 'custom' },
    loseCondition: { kind: 'custom' },
    params: { rulesetId: 'instant-win' },
  },
}

export const DUNGEON_REGISTRY: Record<string, DungeonDefinition> = {
  [P5_TEST_DUNGEON.id]: P5_TEST_DUNGEON,
}

export function getDungeon(id: string): DungeonDefinition | null {
  return DUNGEON_REGISTRY[id] ?? null
}

/** Data-driven proof stage — add via config only */
export const P5_DATA_PROOF_STAGE: StageDefinition = {
  id: 'p5-data-proof-stage',
  name: 'Data Proof Stage',
  stageType: 'custom',
  arenaId: 'trial-01',
  winCondition: { kind: 'custom' },
  loseCondition: { kind: 'custom' },
  params: { rulesetId: 'defeat-all' },
}
