import { useEffect, useRef } from 'react'
import type { CombatButtonVisualState } from '../../game/realtimeBattle/combatButtonState'
import styles from './BattleScene.module.css'

export interface CombatActionButtonProps {
  actionId: string
  label: string
  ariaLabel: string
  variant: 'attack' | 'skill' | 'ultimate'
  state: CombatButtonVisualState
  cooldownRatio: number
  cooldownSeconds: number
  ultimateReady?: boolean
  onPress: () => void
  className?: string
}

/**
 * Shared combat action button — attack + skills + ultimate.
 *
 * Immediate press feedback; cooldown uses radial mask + numeric countdown.
 */
export function CombatActionButton({
  actionId,
  label,
  ariaLabel,
  variant,
  state,
  cooldownRatio,
  cooldownSeconds,
  ultimateReady = false,
  onPress,
  className,
}: CombatActionButtonProps) {
  const cooldownRef = useRef<HTMLSpanElement>(null)
  const pressedRef = useRef(false)

  useEffect(() => {
    if (!cooldownRef.current) return
    const degrees = Math.max(0, Math.min(360, cooldownRatio * 360))
    cooldownRef.current.style.setProperty('--cooldown-deg', `${degrees}deg`)
  }, [cooldownRatio])

  const variantClass =
    variant === 'attack'
      ? styles.combatBtnAttack
      : variant === 'ultimate'
        ? styles.combatBtnUltimate
        : styles.combatBtnSkill

  const stateClass =
    state === 'ready'
      ? styles.combatBtnReady
      : state === 'cooldown'
        ? styles.combatBtnCooldown
        : state === 'casting'
          ? styles.combatBtnCasting
          : state === 'locked'
            ? styles.combatBtnLocked
            : styles.combatBtnDisabled

  const readyPulse = state === 'ready' && (variant === 'ultimate' ? ultimateReady : true)

  return (
    <button
      type="button"
      data-action-id={actionId}
      className={[
        styles.combatBtn,
        variantClass,
        stateClass,
        readyPulse ? styles.combatBtnPulse : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={ariaLabel}
      aria-disabled={state === 'disabled' || state === 'locked' ? true : undefined}
      onPointerDown={(event) => {
        event.preventDefault()
        pressedRef.current = true
        event.currentTarget.classList.add(styles.combatBtnPressed)
        onPress()
      }}
      onPointerUp={(event) => {
        if (!pressedRef.current) return
        pressedRef.current = false
        event.currentTarget.classList.remove(styles.combatBtnPressed)
      }}
      onPointerCancel={(event) => {
        pressedRef.current = false
        event.currentTarget.classList.remove(styles.combatBtnPressed)
      }}
      onPointerLeave={(event) => {
        if (!pressedRef.current) return
        pressedRef.current = false
        event.currentTarget.classList.remove(styles.combatBtnPressed)
      }}
    >
      <span ref={cooldownRef} className={styles.combatBtnCooldownRadial} aria-hidden="true" />
      {state === 'cooldown' && cooldownSeconds > 0 ? (
        <span className={styles.combatBtnCooldownText} aria-hidden="true">
          {cooldownSeconds}
        </span>
      ) : null}
      {variant === 'ultimate' && state !== 'ready' ? (
        <span
          className={styles.combatBtnUltimateFill}
          style={{ transform: `scaleY(${1 - cooldownRatio})` }}
          aria-hidden="true"
        />
      ) : null}
      <span className={styles.combatBtnLabel}>{label}</span>
    </button>
  )
}
