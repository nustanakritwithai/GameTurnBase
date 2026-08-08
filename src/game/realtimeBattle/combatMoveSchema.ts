import type { AttackDefinition } from './attacks'

/** Locked P4 baselines — per-move overrides optional on AttackDefinition. */
export const COMBAT_DEFAULTS = {
  hitstunMs: 200,
  telegraphMs: 280,
  knockdownMs: 700,
  getUpMs: 450,
  getUpInvulnerableMs: 200,
  softTargetAssistRange: 220,
} as const

export type MovePhase = 'telegraph' | 'castDelay' | 'startup' | 'active' | 'recovery'

export interface PhaseOverride {
  interruptible?: boolean
}

export type MovePhaseOverrides = Partial<Record<MovePhase, PhaseOverride>>

export function resolveTelegraphMs(attack: AttackDefinition): number {
  return attack.telegraphMs ?? 0
}

/** Wind-up before startup/active — skills only; basic attacks omit (§3.6.12). */
export function resolveCastDelayMs(attack: AttackDefinition): number {
  return attack.castDelayMs ?? 0
}

/** Whether the player may receive movement input while this move is executing. */
export function allowsMovementDuringCast(attack: AttackDefinition): boolean {
  return attack.movementDuringCast === true
}

export function resolveHitstunMs(attack: AttackDefinition): number {
  return attack.hitstunMs ?? COMBAT_DEFAULTS.hitstunMs
}

export function resolveKnockdownMs(attack: AttackDefinition): number {
  return attack.knockdownMs ?? COMBAT_DEFAULTS.knockdownMs
}

export function resolveGetUpMs(attack: AttackDefinition): number {
  return attack.getUpMs ?? COMBAT_DEFAULTS.getUpMs
}

export function attackTotalDurationMs(attack: AttackDefinition): number {
  return (
    resolveTelegraphMs(attack) +
    resolveCastDelayMs(attack) +
    attack.startupMs +
    attack.activeMs +
    attack.recoveryMs
  )
}

/** Elapsed ms within the execute block (startup → active → recovery), after telegraph. */
export function getExecutePhase(
  attack: AttackDefinition,
  executeElapsedMs: number,
): MovePhase | 'complete' {
  if (executeElapsedMs < attack.startupMs) return 'startup'
  if (executeElapsedMs < attack.startupMs + attack.activeMs) return 'active'
  if (executeElapsedMs < attack.startupMs + attack.activeMs + attack.recoveryMs) {
    return 'recovery'
  }
  return 'complete'
}

/** Full timeline including telegraph (player attacks usually have telegraphMs = 0). */
export function getMovePhase(attack: AttackDefinition, elapsedMs: number): MovePhase | 'complete' {
  const telegraph = resolveTelegraphMs(attack)
  if (elapsedMs < telegraph) return 'telegraph'
  const afterTelegraph = elapsedMs - telegraph
  const castDelay = resolveCastDelayMs(attack)
  if (afterTelegraph < castDelay) return 'castDelay'
  return getExecutePhase(attack, afterTelegraph - castDelay)
}

export function isExecuteActiveWindow(attack: AttackDefinition, executeElapsedMs: number): boolean {
  return getExecutePhase(attack, executeElapsedMs) === 'active'
}

export function isFullMoveActiveWindow(attack: AttackDefinition, elapsedMs: number): boolean {
  return getMovePhase(attack, elapsedMs) === 'active'
}

export function resolveInterruptible(attack: AttackDefinition, phase: MovePhase): boolean {
  const override = attack.phaseOverrides?.[phase]?.interruptible
  if (override !== undefined) return override
  return attack.interruptible ?? true
}

/** Strike index during active window for multi-hit moves (e.g. ultimate). */
export function getStrikeIndex(attack: AttackDefinition, executeElapsedMs: number): number {
  const phase = getExecutePhase(attack, executeElapsedMs)
  if (phase !== 'active') return -1
  const strikes = attack.strikeCount ?? 1
  if (strikes <= 1) return 0
  const activeStart = attack.startupMs
  const inActive = executeElapsedMs - activeStart
  const slot = Math.floor((inActive / attack.activeMs) * strikes)
  return Math.min(strikes - 1, Math.max(0, slot))
}
