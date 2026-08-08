import { useCallback, useRef, useState } from 'react'
import { useRealtimeBattle } from '../../hooks/useRealtimeBattle'
import type { RealtimeBattleResult } from '../../game/realtimeBattle/types'
import type { Player } from '../../types/player'
import { BattleResultPanel } from './BattleResultPanel'
import { RealtimeBattleRoom } from './RealtimeBattleRoom'
import styles from './BattleScene.module.css'

/**
 * ทางเข้าห้องต่อสู้ — ห้องเดียวของเกมที่การต่อสู้เกิดขึ้น
 *
 * Contract กับระบบนอกห้องต่อสู้: รับ player/stageId แล้วคืนผลผ่าน onComplete
 * เมื่อผู้เล่นกดดำเนินการต่อจากแผงผล หรือ onExit เมื่อออกกลางคัน
 * ห้ามไฟล์นี้ (หรืออะไรใต้มัน) เขียน localStorage / Player / ทอง / กระเป๋าไอเทมเอง
 */
interface BattleSceneProps {
  player: Player
  stageId: string
  onComplete: (result: RealtimeBattleResult) => void
  onExit: () => void
}

export function BattleScene({ player, stageId, onComplete, onExit }: BattleSceneProps) {
  const [pendingResult, setPendingResult] = useState<RealtimeBattleResult | null>(null)
  /** กันปุ่ม "กลับล็อบบี้" / Escape ยิง onComplete ซ้ำก่อน async บันทึกเสร็จ */
  const continuingRef = useRef(false)

  const {
    phase,
    errorMessage,
    runtime,
    snapshot,
    requestExit,
    setJoystick,
    pressAttack,
    pressSkill,
  } = useRealtimeBattle({
    player,
    stageId,
    onComplete: setPendingResult,
  })

  // หยุดจำลองก่อนเสมอ แล้วค่อยให้ระบบเกมพาผู้เล่นกลับ — กันไม่ให้ลูปเดินต่อระหว่างเปลี่ยนฉาก
  const handleExit = useCallback(() => {
    requestExit()
    onExit()
  }, [onExit, requestExit])

  const handleContinue = useCallback(() => {
    if (!pendingResult || continuingRef.current) return
    continuingRef.current = true
    onComplete(pendingResult)
  }, [onComplete, pendingResult])

  if (phase === 'error') {
    return (
      <div className={styles.scene}>
        <div className={styles.fallback} role="alert">
          <p>{errorMessage}</p>
          <button type="button" className={styles.exitBtn} onClick={handleExit}>
            กลับล็อบบี้
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'loading' || !runtime || !snapshot) {
    return (
      <div className={styles.scene}>
        <div className={styles.fallback} aria-live="polite">
          <p>กำลังเตรียมห้องต่อสู้…</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <RealtimeBattleRoom
        runtime={runtime}
        snapshot={snapshot}
        onExit={handleExit}
        onMove={setJoystick}
        onAttack={pressAttack}
        onSkill={pressSkill}
      />
      {pendingResult ? (
        <BattleResultPanel result={pendingResult} onContinue={handleContinue} />
      ) : null}
    </>
  )
}
