import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import WebGL from 'three/addons/capabilities/WebGL.js'
import { reportError } from '../../lib/errors/reportError'
import type { RealtimeBattleRuntime } from '../../game/realtimeBattle/RealtimeBattleRuntime'
import type { MovementInput } from '../../game/realtimeBattle/playerInput'
import type { RealtimeBattleSnapshot } from '../../game/realtimeBattle/types'
import type { SkillSlot } from '../../game/realtimeBattle/skills'
import { BattleArena } from './BattleArena'
import { BattleControls } from './BattleControls'
import { BattleHud } from './BattleHud'
import { DamageNumberLayer } from './DamageNumberLayer'
import { EnemyHealthBar } from './EnemyHealthBar'
import { ScreenProjector, type ScreenProjection } from './ScreenProjector'
import styles from './BattleScene.module.css'

/**
 * ห้องต่อสู้ที่พร้อมเล่นแล้ว — ผืนผ้าใบ 3 มิติ + HUD
 *
 * แยกจาก BattleScene เพราะ BattleScene มีหน้าที่จัดการ "ก่อนถึงห้อง" (โหลด/ผิดพลาด/ออก)
 * ส่วนไฟล์นี้สมมติได้เลยว่า runtime พร้อมใช้งานแล้ว
 */
export function RealtimeBattleRoom({
  runtime,
  snapshot,
  onExit,
  onMove,
  onAttack,
  onSkill,
}: {
  runtime: RealtimeBattleRuntime
  snapshot: RealtimeBattleSnapshot
  onExit: () => void
  onMove: (input: MovementInput) => void
  onAttack: () => void
  onSkill: (slot: SkillSlot) => void
}) {
  const [webglAvailable] = useState(() => WebGL.isWebGL2Available())
  const [contextLost, setContextLost] = useState(false)
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null)

  /*
    ฟังก์ชันฉายพิกัดโลก → ตำแหน่งบนจอ ถูกเขียนโดย ScreenProjector ที่อยู่ข้างใน Canvas
    แล้วชั้น DOM ข้างนอก (เลขดาเมจ / หลอดเลือด) อ่านผ่าน ref เดียวกันนี้
    ใช้ ref ไม่ใช่ state เพราะมันถูกเขียนใหม่ทุกเฟรม
  */
  const projection = useRef<ScreenProjection>({ project: null })

  /*
    ผูก/ถอด listener ของ WebGL context ใน effect ไม่ใช่ผูกทิ้งไว้ตอน onCreated

    เบราว์เซอร์ยิง webglcontextlost ตอนทำลาย canvas ด้วย ถ้าไม่ถอด listener ก่อน unmount
    จะได้ console.error หลอก ๆ ทุกครั้งที่ผู้เล่นออกจากห้องต่อสู้ ทั้งที่ไม่มีอะไรผิด
    (เจอจริงตอนทดสอบในเบราว์เซอร์ — ขึ้น "[RealtimeBattleRoom] WebGL context lost" ทุกครั้งที่กดออก)
    การถอด listener ตอน cleanup ยังเป็นข้อบังคับของ §28 อยู่แล้ว
  */
  useEffect(() => {
    if (!canvasElement) return

    const onLost = (event: Event) => {
      event.preventDefault()
      reportError('BATTLE_WEBGL_CONTEXT_LOST', 'visible')
      setContextLost(true)
    }
    const onRestored = () => setContextLost(false)

    canvasElement.addEventListener('webglcontextlost', onLost)
    canvasElement.addEventListener('webglcontextrestored', onRestored)

    return () => {
      canvasElement.removeEventListener('webglcontextlost', onLost)
      canvasElement.removeEventListener('webglcontextrestored', onRestored)
    }
  }, [canvasElement])

  if (!webglAvailable) {
    return (
      <div className={styles.scene}>
        <div className={styles.fallback}>
          <p>เบราว์เซอร์นี้ไม่รองรับ WebGL2 — เปิดห้องต่อสู้ไม่ได้</p>
          <button type="button" className={styles.exitBtn} onClick={onExit}>
            กลับไปสำรวจ
          </button>
        </div>
      </div>
    )
  }

  return (
    <section className={styles.scene} aria-label="ห้องต่อสู้">
      {contextLost ? (
        <div className={styles.fallback}>
          <p>การ์ดจอขาดการเชื่อมต่อ — กำลังลองใหม่</p>
        </div>
      ) : null}

      <Canvas
        className={styles.canvas}
        dpr={[1, 2]}
        // วัดขนาดจาก offsetWidth/Height แทน getBoundingClientRect เพื่อไม่ให้ transform ใด ๆ
        // ที่ครอบอยู่ทำให้ขนาด canvas เพี้ยน (เหตุผลเดียวกับ LobbyScene — ดูคอมเมนต์ในไฟล์นั้น)
        resize={{ offsetSize: true }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 42, near: 0.1, far: 200 }}
        onCreated={({ gl }) => setCanvasElement(gl.domElement)}
      >
        <BattleArena runtime={runtime} />
        <ScreenProjector stage={runtime.getState().stage} projection={projection} />
      </Canvas>

      <EnemyHealthBar runtime={runtime} projection={projection} />
      <DamageNumberLayer runtime={runtime} projection={projection} />

      <BattleHud snapshot={snapshot} onExit={onExit} />
      <BattleControls runtime={runtime} onMove={onMove} onAttack={onAttack} onSkill={onSkill} />

      {snapshot.status === 'intro' ? (
        <div className={styles.introBanner} aria-live="polite">
          {snapshot.stageName}
        </div>
      ) : null}
    </section>
  )
}
