import { useCallback, useRef, useState, type CSSProperties } from 'react'
import { DEFAULT_COMBAT_UI_LAYOUT } from '../../game/realtimeBattle/combatUILayout'
import { clampStickVector } from '../../game/realtimeBattle/joystickMath'
import { vec2ToMovementInput, type MovementInput } from '../../game/realtimeBattle/playerInput'
import styles from './BattleScene.module.css'

const STICK_RADIUS = 52

export interface BattleJoystickProps {
  onChange: (input: MovementInput) => void
}

/**
 * Virtual joystick — bottom-left, multi-touch isolated, dead-zone normalized.
 *
 * Outputs MovementInput (x + depth) — combat never reads screen coordinates.
 */
export function BattleJoystick({ onChange }: BattleJoystickProps) {
  const baseRef = useRef<HTMLDivElement>(null)
  const activePointer = useRef<number | null>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })

  const emit = useCallback(
    (raw: { x: number; y: number }) => {
      setKnob(raw)
      onChange(vec2ToMovementInput({ x: raw.x, y: raw.y }))
    },
    [onChange],
  )

  const update = useCallback(
    (clientX: number, clientY: number) => {
      const base = baseRef.current
      if (!base) return

      const rect = base.getBoundingClientRect()
      const dx = clientX - (rect.left + rect.width / 2)
      const dy = clientY - (rect.top + rect.height / 2)
      const scale = rect.width / (STICK_RADIUS * 2)
      const raw = clampStickVector(dx / scale, dy / scale, STICK_RADIUS)
      emit(raw)
    },
    [emit],
  )

  const release = useCallback(() => {
    activePointer.current = null
    emit({ x: 0, y: 0 })
  }, [emit])

  return (
    <div
      className={styles.joystickZone}
      style={{ '--combat-dead-zone': String(DEFAULT_COMBAT_UI_LAYOUT.deadZone) } as CSSProperties}
    >
      <div
        ref={baseRef}
        className={styles.joystickBase}
        role="application"
        aria-label="แป้นบังคับทิศทาง"
        onPointerDown={(event) => {
          if (activePointer.current !== null) return
          activePointer.current = event.pointerId
          event.currentTarget.setPointerCapture(event.pointerId)
          update(event.clientX, event.clientY)
        }}
        onPointerMove={(event) => {
          if (activePointer.current !== event.pointerId) return
          update(event.clientX, event.clientY)
        }}
        onPointerUp={(event) => {
          if (activePointer.current !== event.pointerId) return
          release()
        }}
        onPointerCancel={(event) => {
          if (activePointer.current !== event.pointerId) return
          release()
        }}
      >
        <div
          className={styles.joystickKnob}
          style={{
            transform: `translate(${knob.x * STICK_RADIUS}px, ${knob.y * STICK_RADIUS}px)`,
          }}
        />
      </div>
    </div>
  )
}
