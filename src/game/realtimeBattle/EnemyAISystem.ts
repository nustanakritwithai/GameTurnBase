import { resolveTelegraphMs, totalDurationMs, type AttackDefinition } from './attacks'
import { faceTargetHorizontally } from './combatFacing'
import { getEnemyPrimaryAttack, getEnemyTemplate, type RealtimeEnemyTemplate } from './stageConfig'
import type { RealtimeBattleEntity, Vec2 } from './types'

/**
 * สมองของศัตรู — ตัดสินใจอย่างเดียว ไม่ขยับตัวเอง
 *
 * วงจร Blueprint §3.6.8:
 *   Idle → Chase → Telegraph → AttackActive → Recovery → Chase
 *   Hit → (Knockdown → GetUp → Chase) when rules allow
 */

export type EnemyAIState =
  'idle' | 'chase' | 'telegraph' | 'attack' | 'recover' | 'hit' | 'knockdown' | 'getUp' | 'dead'

export interface EnemyAttackTiming {
  telegraphMs: number
  startupMs: number
  activeMs: number
  recoveryMs: number
}

/** จังหวะท่าโจมตีศัตรู — จาก primaryAttack ของแม่แบบ (หรือ ENEMY_ATTACK) */
export function resolveEnemyAttackTiming(attack: AttackDefinition): EnemyAttackTiming {
  return {
    telegraphMs: resolveTelegraphMs(attack),
    startupMs: attack.startupMs,
    activeMs: attack.activeMs,
    recoveryMs: attack.recoveryMs,
  }
}

/**
 * export คงไว้เพื่อความเข้ากันได้ — ค่าเริ่มต้นจาก ENEMY_ATTACK
 * เทสต์/runtime ที่รู้แม่แบบควรเรียก resolveEnemyAttackTiming(getEnemyPrimaryAttack(...))
 */
export const ENEMY_ATTACK_TIMING = resolveEnemyAttackTiming(
  getEnemyPrimaryAttack(getEnemyTemplate('shadow-soldier')),
)

/** สถานะเฉพาะของศัตรูที่ไม่ได้อยู่ใน RealtimeBattleEntity */
export interface EnemyBrain {
  state: EnemyAIState
  stateElapsedMs: number
  /** ท่าที่กำลังร่าย — ผูกกับแม่แบบตอนเข้า telegraph */
  currentAttack: AttackDefinition
  hitTargets: Set<string>
}

export function createEnemyBrain(): EnemyBrain {
  return {
    state: 'idle',
    stateElapsedMs: 0,
    currentAttack: getEnemyPrimaryAttack(null),
    hitTargets: new Set(),
  }
}

export interface EnemyDecision {
  move: Vec2
}

function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function toState(brain: EnemyBrain, next: EnemyAIState): void {
  if (brain.state === next) return
  brain.state = next
  brain.stateElapsedMs = 0
}

function attackPhaseMs(attack: AttackDefinition): number {
  return totalDurationMs(attack)
}

export function stepEnemyAI(
  enemy: RealtimeBattleEntity,
  brain: EnemyBrain,
  player: RealtimeBattleEntity,
  deltaMs: number,
): EnemyDecision {
  brain.stateElapsedMs += deltaMs

  if (enemy.hp <= 0 || enemy.state === 'dead') {
    toState(brain, 'dead')
    enemy.state = 'dead'
    return { move: { x: 0, y: 0 } }
  }

  if (enemy.knockdownRemainingMs > 0) {
    toState(brain, 'knockdown')
    enemy.state = 'knockdown'
    return { move: { x: 0, y: 0 } }
  }

  if (enemy.getUpRemainingMs > 0) {
    toState(brain, 'getUp')
    enemy.state = 'getUp'
    return { move: { x: 0, y: 0 } }
  }

  if (enemy.hitStunRemainingMs > 0) {
    toState(brain, 'hit')
    enemy.state = 'hit'
    brain.hitTargets.clear()
    return { move: { x: 0, y: 0 } }
  }

  const template = enemy.enemyId ? getEnemyTemplate(enemy.enemyId) : null
  const ranges = resolveRanges(template)
  const distance = distanceBetween(enemy.position, player.position)
  const playerAlive = player.hp > 0
  const attack = brain.currentAttack
  const timing = resolveEnemyAttackTiming(attack)
  const attackMs = attackPhaseMs(attack)

  switch (brain.state) {
    case 'telegraph': {
      enemy.state = 'telegraph'
      if (brain.stateElapsedMs >= timing.telegraphMs) {
        brain.stateElapsedMs -= timing.telegraphMs
        brain.state = 'attack'
        enemy.state = 'attack'
      }
      return { move: { x: 0, y: 0 } }
    }

    case 'attack': {
      enemy.state = 'attack'
      if (brain.stateElapsedMs >= attackMs) {
        brain.stateElapsedMs -= attackMs
        brain.state = 'recover'
        brain.hitTargets.clear()
        enemy.state = 'idle'
      }
      return { move: { x: 0, y: 0 } }
    }

    case 'recover': {
      enemy.state = 'idle'
      if (brain.stateElapsedMs >= RECOVER_MS) {
        brain.stateElapsedMs -= RECOVER_MS
        toState(brain, playerAlive && distance <= ranges.detect ? 'chase' : 'idle')
      }
      return { move: { x: 0, y: 0 } }
    }

    case 'hit': {
      toState(brain, playerAlive && distance <= ranges.detect ? 'chase' : 'idle')
      enemy.state = 'idle'
      return { move: { x: 0, y: 0 } }
    }

    case 'knockdown':
    case 'getUp': {
      return { move: { x: 0, y: 0 } }
    }

    case 'chase': {
      if (!playerAlive || distance > ranges.detect) {
        toState(brain, 'idle')
        enemy.state = 'idle'
        return { move: { x: 0, y: 0 } }
      }

      if (distance <= ranges.attack && enemy.attackCooldownRemainingMs <= 0) {
        faceTargetHorizontally(enemy, player.position)
        brain.currentAttack = getEnemyPrimaryAttack(template)
        toState(brain, 'telegraph')
        enemy.state = 'telegraph'
        enemy.attackCooldownRemainingMs = ranges.attackCooldownMs
        return { move: { x: 0, y: 0 } }
      }

      if (distance <= ranges.attack) {
        enemy.state = 'idle'
        return { move: { x: 0, y: 0 } }
      }

      enemy.state = 'walk'
      return { move: directionTowards(enemy.position, player.position) }
    }

    case 'idle':
    case 'dead':
    default: {
      enemy.state = 'idle'
      if (playerAlive && distance <= ranges.detect) toState(brain, 'chase')
      return { move: { x: 0, y: 0 } }
    }
  }
}

const RECOVER_MS = 260

const FALLBACK_RANGES = { detect: 500, attack: 80, attackCooldownMs: 1500 }

function resolveRanges(template: RealtimeEnemyTemplate | null) {
  if (!template) return FALLBACK_RANGES
  return {
    detect: template.detectRange,
    attack: template.attackRange,
    attackCooldownMs: template.attackCooldownMs,
  }
}

function directionTowards(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return { x: 0, y: 0 }
  return { x: dx / length, y: dy / length }
}
