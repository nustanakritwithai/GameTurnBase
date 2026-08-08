import { useEffect, useReducer } from 'react'
import { isAttacking } from '../../game/realtimeBattle/ComboSystem'
import {
  getAttackButtonState,
  getSkillButtonState,
} from '../../game/realtimeBattle/combatButtonState'
import type { RealtimeBattleRuntime } from '../../game/realtimeBattle/RealtimeBattleRuntime'
import {
  getRealtimeSkillKit,
  getSkillFromKit,
  type SkillSlot,
} from '../../game/realtimeBattle/skills'
import { CombatActionButton } from './CombatActionButton'
import styles from './BattleScene.module.css'

const SLOT_LABELS: Record<SkillSlot, string> = {
  skill1: 'S1',
  skill2: 'S2',
  skill3: 'S3',
  ultimate: 'ULT',
}

/**
 * Right-thumb combat cluster — Blueprint §3.3 row above Attack.
 */
export function CombatCluster({
  runtime,
  onAttack,
  onSkill,
  disabled = false,
}: {
  runtime: RealtimeBattleRuntime
  onAttack: () => void
  onSkill: (slot: SkillSlot) => void
  disabled?: boolean
}) {
  const [, tick] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {
    let frame = 0
    const loop = () => {
      tick()
      frame = window.requestAnimationFrame(loop)
    }
    frame = window.requestAnimationFrame(loop)
    return () => window.cancelAnimationFrame(frame)
  }, [runtime])

  const characterId = runtime.getState().player.characterId
  const kit = getRealtimeSkillKit(characterId)

  if (!kit) return null

  const player = runtime.getState().player
  const castingSlot = runtime.getCastingSkillSlot()
  const attacking = isAttacking(runtime.getPlayerComboState())
  const attackMetrics = getAttackButtonState(player, castingSlot !== null)

  return (
    <div
      className={`${styles.combatCluster}${disabled ? ` ${styles.combatClusterBlocked}` : ''}`}
      aria-hidden={disabled}
    >
      <div className={styles.combatSkillsRow}>
        {(['skill1', 'skill2', 'skill3', 'ultimate'] as SkillSlot[]).map((slot) => {
          const def = getSkillFromKit(kit, slot)
          const metrics = getSkillButtonState(slot, player, castingSlot, def.cooldownMs, attacking)
          return (
            <CombatActionButton
              key={slot}
              actionId={slot}
              label={SLOT_LABELS[slot]}
              ariaLabel={
                slot === 'ultimate'
                  ? `อัลติเมท ${def.name}`
                  : `สกิล ${SLOT_LABELS[slot]} ${def.name}`
              }
              variant={slot === 'ultimate' ? 'ultimate' : 'skill'}
              state={metrics.state}
              cooldownRatio={slot === 'ultimate' ? 1 - metrics.ultimateFill : metrics.cooldownRatio}
              cooldownSeconds={metrics.cooldownSeconds}
              ultimateReady={metrics.state === 'ready' && slot === 'ultimate'}
              onPress={() => onSkill(slot)}
            />
          )
        })}
      </div>

      <div className={styles.combatAttackRow}>
        <CombatActionButton
          actionId="basic-attack"
          label="ATK"
          ariaLabel="โจมตี"
          variant="attack"
          state={attackMetrics.state}
          cooldownRatio={attackMetrics.cooldownRatio}
          cooldownSeconds={attackMetrics.cooldownSeconds}
          onPress={onAttack}
        />
      </div>
    </div>
  )
}
