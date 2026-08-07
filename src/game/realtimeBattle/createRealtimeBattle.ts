import { getCharacter } from '../characters'
import { reportError } from '../../lib/errors/reportError'
import type { Player } from '../../types/player'
import { getEnemyTemplate, getRealtimeStage, type RealtimeBattleStage } from './stageConfig'
import type { RealtimeBattleEntity } from './types'
import { calcMaxHp } from '../battle/formulas'

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
}

/** ความเร็วเดินของผู้เล่นในห้องต่อสู้ (หน่วย runtime ต่อวินาที) */
const PLAYER_BASE_SPEED = 275

export function createPlayerEntity(player: Player): RealtimeBattleEntity | null {
  const leadId = player.teamSlots.find((id): id is string => id !== null) ?? null
  const character = getCharacter(leadId)
  if (!character) return null

  const owned = player.ownedCharacters.find((entry) => entry.characterId === character.id)
  const level = owned?.level ?? character.level
  const maxHp = calcMaxHp(level, character.stats.def)

  return {
    id: 'player',
    entityType: 'player',
    name: character.name,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    facing: 'up',
    combatFacing: 'right',
    state: 'idle',
    hp: maxHp,
    maxHp,
    atk: character.stats.atk,
    def: character.stats.def,
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
    characterId: character.id,
  }
}

/** สร้างศัตรูของคลื่นที่ระบุ — id ไม่ซ้ำกันข้ามคลื่นเพราะมี waveIndex อยู่ในชื่อ */
export function createWaveEnemies(
  stage: RealtimeBattleStage,
  waveIndex: number,
): RealtimeBattleEntity[] {
  const wave = stage.waves[waveIndex]
  if (!wave) return []

  return wave.enemies.flatMap((entry, index) => {
    const template = getEnemyTemplate(entry.templateId)
    if (!template) {
      reportError('BATTLE_ENEMY_TEMPLATE_MISSING', 'silent', undefined, {
        templateId: entry.templateId,
        stageId: stage.id,
      })
      return []
    }

    const spawn = stage.enemySpawns[entry.spawnIndex] ?? stage.enemySpawns[0]
    if (!spawn) {
      reportError('BATTLE_STAGE_NO_SPAWN', 'silent', undefined, { stageId: stage.id })
      return []
    }

    const enemy: RealtimeBattleEntity = {
      id: `enemy-${waveIndex}-${index}`,
      entityType: 'enemy',
      name: template.name,
      position: { x: spawn.x, y: spawn.y },
      velocity: { x: 0, y: 0 },
      facing: 'down',
      combatFacing: 'left',
      state: 'idle',
      hp: template.maxHp,
      maxHp: template.maxHp,
      atk: template.atk,
      def: template.def,
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
      enemyId: template.id,
    }
    return [enemy]
  })
}

export function createRealtimeBattle(stageId: string, player: Player): RealtimeBattleState | null {
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

  playerEntity.position = { x: stage.playerSpawn.x, y: stage.playerSpawn.y }

  return {
    stage,
    status: 'intro',
    elapsedMs: 0,
    player: playerEntity,
    enemies: createWaveEnemies(stage, 0),
    currentWaveIndex: 0,
    defeatedEnemyIds: [],
    damageDealt: 0,
    damageTaken: 0,
  }
}
