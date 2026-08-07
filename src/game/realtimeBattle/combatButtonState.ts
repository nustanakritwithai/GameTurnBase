import type { SkillSlot } from './skills'
import { isUltimateReady, ULTIMATE_GAUGE_CONFIG } from './ultimateGauge'
import type { RealtimeBattleEntity } from './types'

export type CombatButtonVisualState = 'ready' | 'cooldown' | 'casting' | 'disabled' | 'locked'

export interface CombatButtonMetrics {
  state: CombatButtonVisualState
  /** 0 = ready, 1 = full cooldown remaining */
  cooldownRatio: number
  /** Seconds shown on overlay (ceil) */
  cooldownSeconds: number
  /** Ultimate gauge fill 0–1 when slot is ultimate */
  ultimateFill: number
}

function isPlayerBlocked(player: RealtimeBattleEntity): boolean {
  return player.state === 'dead' || player.hitStunRemainingMs > 0
}

export function getAttackButtonState(
  player: RealtimeBattleEntity,
  isCastingSkill: boolean,
): CombatButtonMetrics {
  if (player.state === 'dead') {
    return { state: 'disabled', cooldownRatio: 0, cooldownSeconds: 0, ultimateFill: 0 }
  }
  if (player.hitStunRemainingMs > 0) {
    return { state: 'disabled', cooldownRatio: 0, cooldownSeconds: 0, ultimateFill: 0 }
  }
  if (player.state === 'attack') {
    return { state: 'casting', cooldownRatio: 0, cooldownSeconds: 0, ultimateFill: 0 }
  }
  if (isCastingSkill) {
    return { state: 'disabled', cooldownRatio: 0, cooldownSeconds: 0, ultimateFill: 0 }
  }
  return { state: 'ready', cooldownRatio: 0, cooldownSeconds: 0, ultimateFill: 0 }
}

export function getSkillButtonState(
  slot: SkillSlot,
  player: RealtimeBattleEntity,
  castingSlot: SkillSlot | null,
  cooldownMs: number,
  isAttacking: boolean,
  locked = false,
): CombatButtonMetrics {
  const ultimateFill = player.ultimateGauge / ULTIMATE_GAUGE_CONFIG.max

  if (locked) {
    return { state: 'locked', cooldownRatio: 1, cooldownSeconds: 0, ultimateFill }
  }
  if (isPlayerBlocked(player)) {
    return { state: 'disabled', cooldownRatio: 0, cooldownSeconds: 0, ultimateFill }
  }
  if (castingSlot === slot) {
    return { state: 'casting', cooldownRatio: 0, cooldownSeconds: 0, ultimateFill }
  }
  if (castingSlot !== null || isAttacking) {
    return { state: 'disabled', cooldownRatio: 0, cooldownSeconds: 0, ultimateFill }
  }

  if (slot === 'ultimate') {
    if (!isUltimateReady(player.ultimateGauge)) {
      return {
        state: 'cooldown',
        cooldownRatio: 1 - ultimateFill,
        cooldownSeconds: 0,
        ultimateFill,
      }
    }
    return { state: 'ready', cooldownRatio: 0, cooldownSeconds: 0, ultimateFill: 1 }
  }

  const remaining = player.skillCooldownsMs[slot]
  if (remaining > 0) {
    const ratio = Math.min(1, remaining / cooldownMs)
    return {
      state: 'cooldown',
      cooldownRatio: ratio,
      cooldownSeconds: Math.ceil(remaining / 1000),
      ultimateFill,
    }
  }

  return { state: 'ready', cooldownRatio: 0, cooldownSeconds: 0, ultimateFill }
}
