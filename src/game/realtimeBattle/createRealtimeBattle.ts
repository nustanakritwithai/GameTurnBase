import { getCharacter } from '../characters'
import { reportError } from '../../lib/errors/reportError'
import type { Player } from '../../types/player'
import {
  ELITE_STAT_MULTIPLIER,
  getBossTemplate,
  getEnemyTemplate,
  getRealtimeStage,
  type BossTemplate,
  type RealtimeBattleStage,
  type RealtimeEnemyTemplate,
} from './stageConfig'
import { resolveEnemyFormation, resolvePlayerSpawn } from './spawnFormation'
import type { RealtimeBattleEntity } from './types'
import { resolveFinalCombatStats } from '../progression/heroStatsResolver'

/**
 * สร้างสถานะตั้งต้นของห้องต่อสู้ real-time จากข้อมูลผู้เล่นจริง
 *
 * ฟังก์ชันนี้เป็น pure — ไม่แตะ DOM, ไม่แตะ localStorage, ไม่มีผลข้างเคียง
 * ทำให้เขียนเทสต์ตรง ๆ ได้ และเป็นเหตุผลที่ RealtimeBattleRuntime แยกจากตัวสร้างสถานะ
 */

/** สถานะภายในที่ runtime แก้ไขได้ (mutable) — ไม่ใช่ snapshot ที่ React อ่าน */
export interface RealtimeBattleState {
  stage: RealtimeBattleStage
  status: 'loading' | 'intro' | 'running' | 'victory' | 'defeat' | 'exiting'
  elapsedMs: number
  player: RealtimeBattleEntity
  enemies: RealtimeBattleEntity[]
  currentWaveIndex: number
  defeatedEnemyIds: string[]
  damageDealt: number
  damageTaken: number
  /** เลือดเป้าหมายที่ต้องป้องกัน (stageType: 'defend' เท่านั้น) — null สำหรับด่านชนิดอื่น */
  objectiveHp: number | null
  /** เลือดกลไกอันตรายที่ไหลลงเรื่อย ๆ (stageType: 'hazard' เท่านั้น) — null สำหรับด่านชนิดอื่น */
  hazardHp: number | null
  /** Stage modifier from dungeon orchestrator (e.g. tutorial-easy HP reduction). */
  enemyHpScale: number
}

/** ความเร็วเดินของผู้เล่นในห้องต่อสู้ (หน่วย runtime ต่อวินาที) */
const PLAYER_BASE_SPEED = 275

/**
 * สเตตัสจริงของศัตรูตัวหนึ่ง — สเตตัสฐานจาก template คูณ ELITE_STAT_MULTIPLIER ถ้า tier เป็น elite
 * (§3.8.4) จุดเดียวที่คูณตัวเลขนี้ — ห้ามมี branch ตัวคูณซ้ำใน EnemyAISystem/DamageSystem
 */
function resolveTierStats(template: RealtimeEnemyTemplate) {
  if (template.tier !== 'elite') {
    return { maxHp: template.maxHp, atk: template.atk, def: template.def }
  }
  return {
    maxHp: Math.round(template.maxHp * ELITE_STAT_MULTIPLIER.maxHp),
    atk: Math.round(template.atk * ELITE_STAT_MULTIPLIER.atk),
    def: Math.round(template.def * ELITE_STAT_MULTIPLIER.def),
  }
}

type SpawnTemplate =
  { kind: 'enemy'; template: RealtimeEnemyTemplate } | { kind: 'boss'; template: BossTemplate }

function resolveSpawnTemplate(templateId: string): SpawnTemplate | null {
  const enemy = getEnemyTemplate(templateId)
  if (enemy) return { kind: 'enemy', template: enemy }
  const boss = getBossTemplate(templateId)
  if (boss) return { kind: 'boss', template: boss }
  return null
}

function scaleStats(
  stats: { maxHp: number; atk: number; def: number },
  multiplier: number,
): { maxHp: number; atk: number; def: number } {
  if (multiplier === 1) return stats
  return {
    maxHp: Math.max(1, Math.round(stats.maxHp * multiplier)),
    atk: Math.max(1, Math.round(stats.atk * multiplier)),
    def: Math.max(0, Math.round(stats.def * multiplier)),
  }
}

export function createPlayerEntity(player: Player): RealtimeBattleEntity | null {
  const leadId = player.teamSlots.find((id): id is string => id !== null) ?? null
  const character = getCharacter(leadId)
  if (!character) return null

  const owned = player.ownedCharacters.find((entry) => entry.characterId === character.id)
  const level = owned?.level ?? character.level
  const combatStats = resolveFinalCombatStats({ heroId: character.id, level }) ?? character.stats
  /** Authoritative battle max HP — same source as progression/profile, not a parallel formula. */
  const maxHp = Math.max(1, combatStats.hp)

  return {
    id: 'player',
    entityType: 'player',
    name: character.name,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    facing: 'right',
    combatFacing: 'right',
    state: 'idle',
    hp: maxHp,
    maxHp,
    atk: combatStats.atk,
    def: combatStats.def,
    speed: PLAYER_BASE_SPEED,
    collisionRadius: 34,
    hurtboxRadius: 42,
    attackCooldownRemainingMs: 0,
    skillCooldownsMs: { skill1: 0, skill2: 0, skill3: 0 },
    ultimateGauge: 0,
    invulnerableUntilMs: 0,
    hitStunRemainingMs: 0,
    knockdownRemainingMs: 0,
    getUpRemainingMs: 0,
    combatTier: 'mob',
    characterId: character.id,
  }
}

/** สร้างศัตรูของคลื่นที่ระบุ — id ไม่ซ้ำกันข้ามคลื่นเพราะมี waveIndex อยู่ในชื่อ */
export function createWaveEnemies(
  stage: RealtimeBattleStage,
  waveIndex: number,
  enemyHpScale = 1,
): RealtimeBattleEntity[] {
  const wave = stage.waves[waveIndex]
  if (!wave) return []

  const difficultyMultiplier = stage.difficultyMultiplier ?? 1

  const resolved = wave.enemies.map((entry) => ({
    entry,
    spawn: resolveSpawnTemplate(entry.templateId),
  }))

  const valid = resolved.filter(
    (
      item,
    ): item is {
      entry: (typeof wave.enemies)[number]
      spawn: NonNullable<ReturnType<typeof resolveSpawnTemplate>>
    } => item.spawn !== null,
  )

  for (const item of resolved) {
    if (!item.spawn) {
      reportError('BATTLE_ENEMY_TEMPLATE_MISSING', 'silent', undefined, {
        templateId: item.entry.templateId,
        stageId: stage.id,
      })
    }
  }

  const formationPositions = resolveEnemyFormation(
    stage,
    valid.map((item) => ({
      collisionRadius:
        item.spawn.kind === 'boss'
          ? item.spawn.template.collisionRadius
          : item.spawn.template.collisionRadius,
    })),
  )

  return valid.flatMap((item, index) => {
    const spawn = formationPositions[index]
    if (!spawn) {
      reportError('BATTLE_STAGE_NO_SPAWN', 'silent', undefined, { stageId: stage.id })
      return []
    }

    if (item.spawn.kind === 'boss') {
      const { template } = item.spawn
      const stats = scaleStats(
        { maxHp: template.maxHp, atk: template.atk, def: template.def },
        difficultyMultiplier,
      )
      const scaledMaxHp = Math.max(1, Math.round(stats.maxHp * enemyHpScale))
      const enemy: RealtimeBattleEntity = {
        id: `enemy-${waveIndex}-${index}`,
        entityType: 'boss',
        name: template.name,
        position: { x: spawn.x, y: spawn.y },
        velocity: { x: 0, y: 0 },
        facing: 'left',
        combatFacing: 'left',
        state: 'idle',
        hp: scaledMaxHp,
        maxHp: scaledMaxHp,
        atk: stats.atk,
        def: stats.def,
        speed: template.speed,
        collisionRadius: template.collisionRadius,
        hurtboxRadius: template.hurtboxRadius,
        attackCooldownRemainingMs: 0,
        skillCooldownsMs: { skill1: 0, skill2: 0, skill3: 0 },
        ultimateGauge: 0,
        invulnerableUntilMs: 0,
        hitStunRemainingMs: 0,
        knockdownRemainingMs: 0,
        getUpRemainingMs: 0,
        combatTier: 'boss',
        enemyId: template.id,
      }
      return [enemy]
    }

    const { template } = item.spawn
    const stats = scaleStats(resolveTierStats(template), difficultyMultiplier)
    const scaledMaxHp = Math.max(1, Math.round(stats.maxHp * enemyHpScale))
    const enemy: RealtimeBattleEntity = {
      id: `enemy-${waveIndex}-${index}`,
      entityType: template.combatTier === 'boss' ? 'boss' : 'enemy',
      name: template.name,
      position: { x: spawn.x, y: spawn.y },
      velocity: { x: 0, y: 0 },
      facing: 'left',
      combatFacing: 'left',
      state: 'idle',
      hp: scaledMaxHp,
      maxHp: scaledMaxHp,
      atk: stats.atk,
      def: stats.def,
      speed: template.speed,
      collisionRadius: template.collisionRadius,
      hurtboxRadius: template.hurtboxRadius,
      attackCooldownRemainingMs: 0,
      skillCooldownsMs: { skill1: 0, skill2: 0, skill3: 0 },
      ultimateGauge: 0,
      invulnerableUntilMs: 0,
      hitStunRemainingMs: 0,
      knockdownRemainingMs: 0,
      getUpRemainingMs: 0,
      combatTier: template.combatTier,
      enemyId: template.id,
      tier: template.tier,
    }
    return [enemy]
  })
}

export function createRealtimeBattle(
  stageId: string,
  player: Player,
  options?: { skipInitialWave?: boolean; enemyHpScale?: number },
): RealtimeBattleState | null {
  const stage = getRealtimeStage(stageId)
  if (!stage) {
    reportError('BATTLE_STAGE_NOT_FOUND', 'visible', undefined, { stageId })
    return null
  }

  const playerEntity = createPlayerEntity(player)
  if (!playerEntity) {
    reportError('BATTLE_NO_TEAM_CHARACTER', 'visible')
    return null
  }

  playerEntity.position = resolvePlayerSpawn(stage)

  const enemyHpScale = options?.enemyHpScale ?? 1

  return {
    stage,
    status: 'intro',
    elapsedMs: 0,
    player: playerEntity,
    enemies: options?.skipInitialWave ? [] : createWaveEnemies(stage, 0, enemyHpScale),
    currentWaveIndex: options?.skipInitialWave ? -1 : 0,
    defeatedEnemyIds: [],
    damageDealt: 0,
    damageTaken: 0,
    objectiveHp: stage.stageType === 'defend' ? (stage.defend?.objectiveHp ?? null) : null,
    hazardHp: stage.stageType === 'hazard' ? (stage.hazard?.hazardHp ?? null) : null,
    enemyHpScale,
  }
}
