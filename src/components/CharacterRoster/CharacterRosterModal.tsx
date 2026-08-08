import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useModalA11y } from '../../hooks/useModalA11y'
import { ROSTER } from '../../game/characters'
import { resolveHeroLevelStats } from '../../game/progression/heroStatsResolver'
import { createDefaultSkillLevels } from '../../game/realtimeBattle/SkillProgressionSystem'
import type { Player } from '../../types/player'
import { CharacterCard } from './CharacterCard'
import { CharacterPreview } from './CharacterPreview'
import { CharacterStats } from './CharacterStats'
import { HeroProgressionPanel } from './HeroProgressionPanel'
import styles from './CharacterRosterModal.module.css'

/** ระยะแอนิเมชันตอนปิด (ต้องตรงกับ keyframes shell-out / veil-out ใน CSS) */
const CLOSE_MS = 200

interface CharacterRosterModalProps {
  player: Player
  onClose: () => void
  onPlayerChange: (next: Player) => Promise<boolean>
}

type RightPanelTab = 'details' | 'progression'

/**
 * หน้าทำเนียบวีรชน — เปิดทับหน้า Lobby แบบเต็มจอ
 *
 * หน้า Lobby ยังอยู่ครบด้านหลัง (ไม่ถูก unmount) ฉาก 3D และแอนิเมชันตัวละคร
 * จึงเล่นต่อเนื่องและกลับมาอยู่ในสถานะเดิมทันทีเมื่อปิด
 */
export function CharacterRosterModal({
  player,
  onClose,
  onPlayerChange,
}: CharacterRosterModalProps) {
  const ownedRoster = useMemo(
    () =>
      player.ownedCharacters.flatMap((owned) => {
        const character = ROSTER.find((entry) => entry.id === owned.characterId)
        if (!character) return []
        const levelStats = resolveHeroLevelStats(owned.characterId, owned.level)
        return [
          {
            ...character,
            level: owned.level,
            exp: owned.exp,
            expToNext: owned.expToNext,
            skillLevels: owned.skillLevels ?? createDefaultSkillLevels(),
            stats: levelStats ?? character.stats,
          },
        ]
      }),
    [player.ownedCharacters],
  )

  const [selectedId, setSelectedId] = useState(ownedRoster[0]?.id ?? '')
  const [rightTab, setRightTab] = useState<RightPanelTab>('details')
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<number | undefined>(undefined)

  const selected = ownedRoster.find((character) => character.id === selectedId) ?? ownedRoster[0]

  /** เล่นแอนิเมชันปิดให้จบก่อนค่อยถอด component ออก */
  const requestClose = useCallback(() => {
    setClosing(true)
    closeTimer.current = window.setTimeout(onClose, CLOSE_MS)
  }, [onClose])

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  // Esc, backdrop-click, focus trap, คืนโฟกัสตอนปิด — รวมไว้ที่ useModalA11y ตัวเดียว
  const { shellRef, backdropProps } = useModalA11y<HTMLDivElement>(requestClose)

  if (!selected) return null

  return (
    <div className={styles.backdrop} data-closing={closing} {...backdropProps}>
      <div
        ref={shellRef}
        className={styles.shell}
        role="dialog"
        aria-modal="true"
        aria-label="ตัวละครทั้งหมดของฉัน"
        tabIndex={-1}
      >
        {(['cornerTl', 'cornerTr', 'cornerBr', 'cornerBl'] as const).map((corner) => (
          <span key={corner} className={`${styles.corner} ${styles[corner]}`} aria-hidden="true">
            <KranokCorner />
          </span>
        ))}

        <div className={styles.roofCrest} aria-hidden="true">
          <ThaiRoofCrest />
        </div>

        <header className={styles.header}>
          <div className={styles.headerText}>
            <h2 className={styles.title}>ตัวละครทั้งหมดของฉัน</h2>
            <span className={styles.count}>
              ครอบครองแล้ว <span className={styles.countNumber}>{ownedRoster.length}</span> ขุนพล
            </span>
          </div>

          <div className={styles.headerTools}>
            <button
              type="button"
              className={styles.toolButton}
              onClick={requestClose}
              aria-label="ย้อนกลับสู่ลานประลอง"
            >
              <BackIcon />
              ย้อนกลับ
            </button>
            <button
              type="button"
              className={`${styles.toolButton} ${styles.closeButton}`}
              onClick={requestClose}
              aria-label="ปิดหน้าตัวละครทั้งหมดของฉัน"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className={styles.divider} aria-hidden="true">
          <KranokDivider />
        </div>

        <div className={styles.body}>
          <ul className={styles.roster} aria-label="รายชื่อขุนพล">
            <li className={styles.rosterHint}>เลือกขุนพลเพื่อดูรายละเอียด</li>
            {ownedRoster.map((character) => (
              <li key={character.id}>
                <CharacterCard
                  character={character}
                  selected={character.id === selected.id}
                  onSelect={setSelectedId}
                />
              </li>
            ))}
          </ul>

          <div className={styles.previewColumn}>
            <CharacterPreview character={selected} />
          </div>

          <div className={styles.detailColumn}>
            <div className={styles.tabRow} role="tablist" aria-label="แผงรายละเอียดขุนพล">
              <button
                type="button"
                role="tab"
                aria-selected={rightTab === 'details'}
                className={rightTab === 'details' ? styles.tabActive : styles.tab}
                onClick={() => setRightTab('details')}
              >
                รายละเอียด
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={rightTab === 'progression'}
                className={rightTab === 'progression' ? styles.tabActive : styles.tab}
                onClick={() => setRightTab('progression')}
              >
                พัฒนา
              </button>
            </div>
            {rightTab === 'details' ? (
              <CharacterStats character={selected} />
            ) : (
              <HeroProgressionPanel
                player={player}
                heroId={selected.id}
                onPlayerChange={onPlayerChange}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- เครื่องประดับลายไทย (วาดเป็น SVG ไม่ใช้ emoji) ---------- */

/** หัวกนกมุมกรอบ */
function KranokCorner() {
  return (
    <svg viewBox="0 0 26 26" fill="none" aria-hidden="true" focusable="false">
      <path d="M1 25V9C1 4.6 4.6 1 9 1h16" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M4 21c0-7 4-11 11-12-4 3-5 5-5 8 0 2-2 4-6 4z"
        fill="currentColor"
        fillOpacity="0.55"
      />
      <path d="M6.5 6.5 9 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

/** หน้าบันและช่อฟ้าแบบย่อ ใช้เป็นมงกุฎเหนือชื่อหน้าต่าง */
function ThaiRoofCrest() {
  return (
    <svg viewBox="0 0 360 54" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M18 45c46-3 82-14 112-34 15 17 32 27 50 32 18-5 35-15 50-32 30 20 66 31 112 34"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M82 38c25-7 42-17 52-30 4 15 14 27 29 35M278 38c-25-7-42-17-52-30-4 15-14 27-29 35"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M180 4c4 10 11 18 21 24-9 0-16 3-21 10-5-7-12-10-21-10 10-6 17-14 21-24Z"
        fill="currentColor"
        fillOpacity=".9"
      />
      <path d="M180 15c2 5 5 9 10 12-5 1-8 3-10 7-2-4-5-6-10-7 5-3 8-7 10-12Z" fill="#24120c" />
      <path d="M18 45h324" stroke="currentColor" strokeWidth="1" strokeOpacity=".42" />
    </svg>
  )
}

/** เส้นคั่นลายกนก มีเพชรตรงกลาง */
function KranokDivider() {
  return (
    <svg
      viewBox="0 0 600 12"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M0 6h258M342 6h258" stroke="currentColor" strokeWidth="1" strokeOpacity="0.55" />
      <path
        d="M258 6c8-4 14-4 20 0-6 4-12 4-20 0zM342 6c-8-4-14-4-20 0 6 4 12 4 20 0z"
        fill="currentColor"
      />
      <path d="M300 0.5 306.5 6 300 11.5 293.5 6z" fill="currentColor" />
      <path d="M300 3.2 303.6 6 300 8.8 296.4 6z" fill="#0b1b28" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />
    </svg>
  )
}
