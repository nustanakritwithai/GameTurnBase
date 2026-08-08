import { useMemo } from 'react'
import { useModalA11y } from '../../hooks/useModalA11y'
import { playSfx } from '../../lib/audio/AudioEngine'
import {
  canAffordStageEnergy,
  normalizeEnergy,
  tickEnergyRegen,
} from '../../game/adventure/energySystem'
import {
  getAdventureChapters,
  isStageUnlocked,
  type RealtimeBattleStage,
} from '../../game/realtimeBattle/stageConfig'
import type { PlayerProgress } from '../../types/player'
import styles from './StageSelect.module.css'

interface StageSelectProps {
  progress: PlayerProgress
  onSelect: (stageId: string) => void
  onClose: () => void
}

/**
 * หน้าเลือกด่าน — เรนเดอร์ตรงจากข้อมูลด่านจริงใน `stageConfig.ts` ไม่มี preview
 * hand-author ต่อด่าน (§ World-class bar ของ docs/agent-blueprint/16-stage-adventure-system.md)
 *
 * ด่านที่ล็อกอยู่กดไม่ได้ — gating เป็น clear-gate only (ดูเหตุผลที่ `isStageUnlocked`)
 */
export function StageSelect({ progress, onSelect, onClose }: StageSelectProps) {
  const { shellRef, backdropProps } = useModalA11y<HTMLDivElement>(onClose)

  const chapters = useMemo(() => getAdventureChapters(), [])
  const energy = useMemo(() => tickEnergyRegen(normalizeEnergy(progress.energy)), [progress.energy])

  const handlePick = (stage: RealtimeBattleStage) => {
    void playSfx('buttonClick')
    onSelect(stage.id)
  }

  return (
    <div className={styles.backdrop} {...backdropProps}>
      <div
        ref={shellRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="เลือกด่าน"
        tabIndex={-1}
      >
        <header className={styles.header}>
          <h2 className={styles.headerTitle}>เลือกด่าน</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="ปิด">
            ×
          </button>
        </header>

        <section className={styles.panel}>
          {chapters.map(({ chapterId, stages }) => (
            <ul key={chapterId} className={styles.list}>
              {stages.map((stage) => {
                const unlocked = isStageUnlocked(stage.id, progress.flags)
                const affordable = canAffordStageEnergy(energy, stage)
                const cleared = progress.flags[`trial_cleared_${stage.id}`] === true
                const selectable = unlocked && affordable
                return (
                  <li key={stage.id}>
                    <button
                      type="button"
                      className={styles.stage}
                      disabled={!selectable}
                      onClick={() => handlePick(stage)}
                    >
                      <span className={styles.stageName}>{stage.name}</span>
                      <span className={styles.stageMeta}>
                        {stage.isBoss ? 'บอส' : `ด่าน ${stage.order}`}
                        {cleared ? ' · ผ่านแล้ว' : ''}
                        {!unlocked ? ' · ล็อกอยู่' : ''}
                        {unlocked && !affordable ? ' · พลังงานไม่พอ' : ''}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ))}
        </section>
      </div>
    </div>
  )
}
