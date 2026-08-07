import type { AttackDefinition } from './attacks'
import { resolveHitstunMs } from './attacks'
import { horizontalKnockbackVector } from './combatFacing'
import { GET_UP_INVULNERABLE_MS } from './combatBaselines'
import { directionVector } from './HitboxSystem'
import { getEnemyTemplate } from './stageConfig'
import type { EnemyTier, RealtimeBattleEntity } from './types'
import { ARMOR_MITIGATION, DAMAGE_VARIANCE, MINIMUM_DAMAGE } from '../battle/formulas'

export type RandomFn = () => number

const CRITICAL_CHANCE = 0.12
const CRITICAL_MULTIPLIER = 1.6

const HIT_INVULNERABLE_MS = 120

export interface DamageOutcome {
  amount: number
  critical: boolean
  defeated: boolean
  knockedDown: boolean
}

export interface DamageContext {
  attacker: RealtimeBattleEntity
  target: RealtimeBattleEntity
  attack: AttackDefinition
  elapsedMs: number
  random: RandomFn
}

function resolveEntityTier(entity: RealtimeBattleEntity): EnemyTier | null {
  if (entity.entityType === 'boss') return 'boss'
  if (!entity.enemyId) return null
  return getEnemyTemplate(entity.enemyId)?.tier ?? null
}

/** §3.6.5 — normal mobs use hitstun only; elite/boss + player can receive knockdown */
export function canReceiveKnockdown(target: RealtimeBattleEntity): boolean {
  if (target.entityType === 'player') return true
  const tier = resolveEntityTier(target)
  return tier === 'elite' || tier === 'boss'
}

export function shouldApplyKnockdown(
  attack: AttackDefinition,
  target: RealtimeBattleEntity,
): boolean {
  if (!attack.knockdown) return false
  if (!attack.knockdownMs || attack.knockdownMs <= 0) return false
  return canReceiveKnockdown(target)
}

export function calcDamage({ attacker, target, attack, random }: DamageContext): DamageOutcome {
  const variance = 1 - DAMAGE_VARIANCE + random() * (DAMAGE_VARIANCE * 2)
  const critical = random() < CRITICAL_CHANCE

  const base = attacker.atk * attack.damageMultiplier * variance
  const mitigated = base - target.def * ARMOR_MITIGATION
  const withCritical = critical ? mitigated * CRITICAL_MULTIPLIER : mitigated

  const amount = Math.max(MINIMUM_DAMAGE, Math.floor(withCritical))

  return {
    amount,
    critical,
    defeated: target.hp - amount <= 0,
    knockedDown: false,
  }
}

export function applyDamage(context: DamageContext): DamageOutcome {
  const { attacker, target, attack, elapsedMs } = context
  const outcome = calcDamage(context)

  target.hp = Math.max(0, target.hp - outcome.amount)

  if (target.hp <= 0) {
    target.state = 'dead'
    target.velocity = { x: 0, y: 0 }
    target.knockdownRemainingMs = 0
    target.getUpRemainingMs = 0
    return { ...outcome, defeated: true }
  }

  const push =
    attack.hitShape === 'horizontal'
      ? horizontalKnockbackVector(attacker.combatFacing)
      : directionVector(attacker.facing)
  target.position = {
    x: target.position.x + push.x * attack.knockback,
    y: target.position.y + push.y * attack.knockback,
  }

  if (shouldApplyKnockdown(attack, target)) {
    target.state = 'knockdown'
    target.knockdownRemainingMs = attack.knockdownMs!
    target.hitStunRemainingMs = 0
    target.invulnerableUntilMs = elapsedMs + GET_UP_INVULNERABLE_MS
    return { ...outcome, knockedDown: true }
  }

  target.state = 'hit'
  target.hitStunRemainingMs = resolveHitstunMs(attack)
  target.invulnerableUntilMs = elapsedMs + HIT_INVULNERABLE_MS

  return { ...outcome, knockedDown: false }
}
