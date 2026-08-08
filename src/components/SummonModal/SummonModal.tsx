import { useState } from 'react'
import { getCharacter } from '../../game/characters'
import { GACHA_BANNERS } from '../../game/gacha/gachaConfig'
import { computeGemCost } from '../../game/gacha/gachaPipeline'
import type { GachaPullCount } from '../../game/gacha/executeGachaPull'
import type { GachaPullOutcome } from '../../game/gacha/gachaPipeline'
import { useModalA11y } from '../../hooks/useModalA11y'
import { formatNumber } from '../../lib/format'
import type { GachaPullResult } from '../../data/accountRepository.shared'
import type { Player } from '../../types/player'
import { SummonIcon } from '../icons/GameIcons'
import styles from './SummonModal.module.css'

interface SummonModalProps {
  player: Player
  onClose: () => void
  onPullGacha: (bannerId: string, pullCount: GachaPullCount) => Promise<GachaPullResult>
}

const STANDARD_BANNER = GACHA_BANNERS.standard

export function SummonModal({ player, onClose, onPullGacha }: SummonModalProps) {
  const { shellRef, backdropProps } = useModalA11y<HTMLDivElement>(onClose)
  const [results, setResults] = useState<GachaPullOutcome[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pulling, setPulling] = useState(false)

  const pityCount = player.progress.gacha?.pity?.[STANDARD_BANNER.id]?.pullsSinceLastPityRarity ?? 0
  const singleCost = computeGemCost(STANDARD_BANNER, 1)
  const tenCost = computeGemCost(STANDARD_BANNER, 10)
  const canSingle = player.currency.gem >= singleCost
  const canTen = player.currency.gem >= tenCost

  const handlePull = async (pullCount: GachaPullCount) => {
    if (pulling) return
    setPulling(true)
    setError(null)

    const outcome = await onPullGacha(STANDARD_BANNER.id, pullCount)
    if (!outcome.ok) {
      setError(outcome.error)
      setPulling(false)
      return
    }

    setResults(outcome.results)
    setPulling(false)
  }

  return (
    <div className={styles.backdrop} {...backdropProps}>
      <div
        ref={shellRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="อัญเชิญ"
        tabIndex={-1}
      >
        <header className={styles.header}>
          <SummonIcon className={styles.headerIcon} />
          <h2 className={styles.headerTitle}>{STANDARD_BANNER.name}</h2>
          <span className={styles.gemCount}>{formatNumber(player.currency.gem)} หยก</span>
          <button type="button" className={styles.close} onClick={onClose} aria-label="ปิด">
            ×
          </button>
        </header>

        <div className={styles.body}>
          <p className={styles.rules}>
            รับประกัน {STANDARD_BANNER.pityRarity} ภายใน {STANDARD_BANNER.hardPity} ครั้ง
            (นับจากครั้งล่าสุด: {pityCount}/{STANDARD_BANNER.hardPity}) — ตัวเลขยังเป็น stub
            NON-PRODUCTION
          </p>

          {error ? <p className={styles.error}>{error}</p> : null}

          {results ? (
            <ul className={styles.results} aria-label="ผลอัญเชิญ">
              {results.map((entry, index) => {
                const character = getCharacter(entry.characterId)
                return (
                  <li key={`${entry.characterId}-${index}`} className={styles.resultCard}>
                    <span className={styles.resultName}>
                      {character?.name ?? entry.characterId}
                    </span>
                    <span className={styles.resultMeta}>
                      {entry.isNew ? 'ใหม่' : 'ซ้ำ'} · ★{entry.star}
                      {!entry.isNew && entry.duplicateShards > 0
                        ? ` · shard ${entry.duplicateShards}`
                        : ''}
                      {entry.wasHardPity ? ' · pity' : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className={styles.hint}>เลือกจำนวนครั้งเพื่ออัญเชิญฮีโร่จากพูลมาตรฐาน</p>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.pullButton}
              disabled={!canSingle || pulling}
              onClick={() => void handlePull(1)}
            >
              อัญเชิญ ×1 ({formatNumber(singleCost)} หยก)
            </button>
            <button
              type="button"
              className={styles.pullButton}
              disabled={!canTen || pulling}
              onClick={() => void handlePull(10)}
            >
              อัญเชิญ ×10 ({formatNumber(tenCost)} หยก)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
