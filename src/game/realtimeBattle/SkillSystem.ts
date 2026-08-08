import { isActiveWindow, totalDurationMs, type AttackDefinition } from './attacks'
import { getMovePhase, getStrikeIndex, resolveInterruptible } from './combatMoveSchema'
import { getPlayerSkillPhase, interruptPlayerSkill, shouldInterruptMove } from './combatInterrupt'
import type { RealtimeSkillDefinition } from './skills'
import { isControlLocked } from './combatReaction'
import type { RealtimeBattleEntity } from './types'
import { isUltimateReady } from './ultimateGauge'

/**
 * ระบบสกิลของผู้เล่น (Blueprint v3 P3 + P4 interrupt/target lock)
 */

export interface SkillState {
  definition: RealtimeSkillDefinition | null
  sinceStartMs: number
  hitTargets: Set<string>
  /** Per-strike hit tracking for multi-hit ultimates */
  strikeHits: Set<string>
  lockedTargetId: string | null
}

export function createSkillState(): SkillState {
  return {
    definition: null,
    sinceStartMs: 0,
    hitTargets: new Set(),
    strikeHits: new Set(),
    lockedTargetId: null,
  }
}

export function isCastingSkill(skill: SkillState): boolean {
  return skill.definition !== null
}

export function canStartSkill(
  player: RealtimeBattleEntity,
  skill: SkillState,
  definition: RealtimeSkillDefinition,
  isAttacking: boolean,
): boolean {
  if (isControlLocked(player)) return false
  if (skill.definition !== null) return false
  if (isAttacking) return false

  if (definition.slot === 'ultimate') {
    return isUltimateReady(player.ultimateGauge)
  }

  if (
    definition.slot === 'skill1' ||
    definition.slot === 'skill2' ||
    definition.slot === 'skill3'
  ) {
    return player.skillCooldownsMs[definition.slot] <= 0
  }

  return false
}

export function startSkill(
  player: RealtimeBattleEntity,
  skill: SkillState,
  definition: RealtimeSkillDefinition,
  elapsedMs: number,
  lockedTargetId: string | null = null,
): boolean {
  skill.definition = definition
  skill.sinceStartMs = 0
  skill.hitTargets.clear()
  skill.strikeHits.clear()
  skill.lockedTargetId = lockedTargetId

  player.state = 'skill'
  player.velocity = { x: 0, y: 0 }

  if (definition.slot === 'ultimate') {
    player.ultimateGauge = 0
  } else if (
    definition.slot === 'skill1' ||
    definition.slot === 'skill2' ||
    definition.slot === 'skill3'
  ) {
    player.skillCooldownsMs[definition.slot] = definition.cooldownMs
  }

  player.invulnerableUntilMs = elapsedMs + definition.invulnerableMs
  return true
}

export interface SkillTick {
  hitboxActive: boolean
  attack: AttackDefinition | null
  strikeIndex: number
}

export function stepSkill(
  player: RealtimeBattleEntity,
  skill: SkillState,
  deltaMs: number,
): SkillTick {
  if (!skill.definition) {
    return { hitboxActive: false, attack: null, strikeIndex: -1 }
  }

  if (player.state === 'dead') {
    skill.definition = null
    skill.hitTargets.clear()
    skill.strikeHits.clear()
    skill.lockedTargetId = null
    skill.sinceStartMs = 0
    return { hitboxActive: false, attack: null, strikeIndex: -1 }
  }

  if (player.hitStunRemainingMs > 0) {
    const phase = getPlayerSkillPhase(skill.definition.attack, skill.sinceStartMs)
    if (shouldInterruptMove(skill.definition.attack, phase)) {
      interruptPlayerSkill(player, skill)
      return { hitboxActive: false, attack: null, strikeIndex: -1 }
    }
  }

  skill.sinceStartMs += deltaMs
  const attack = skill.definition.attack

  if (skill.sinceStartMs >= totalDurationMs(attack)) {
    skill.definition = null
    skill.hitTargets.clear()
    skill.strikeHits.clear()
    skill.lockedTargetId = null
    skill.sinceStartMs = 0
    if (player.state === 'skill') player.state = 'idle'
    return { hitboxActive: false, attack: null, strikeIndex: -1 }
  }

  player.state = 'skill'
  const telegraph = attack.telegraphMs ?? 0
  const castDelay = attack.castDelayMs ?? 0
  const executeElapsed = Math.max(0, skill.sinceStartMs - telegraph - castDelay)
  const strikeIndex = getStrikeIndex(attack, executeElapsed)

  return {
    hitboxActive: isActiveWindow(attack, skill.sinceStartMs),
    attack,
    strikeIndex,
  }
}

export function isSkillPhaseInterruptible(skill: SkillState): boolean {
  if (!skill.definition) return true
  const phase = getMovePhase(skill.definition.attack, skill.sinceStartMs)
  if (phase === 'complete') return true
  return resolveInterruptible(skill.definition.attack, phase)
}
