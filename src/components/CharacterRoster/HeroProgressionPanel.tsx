import { useMemo } from 'react'
import type { Player } from '../../types/player'
import type { SkillSlotId } from '../../game/progression/progressionSchema'
import { progressionConfig } from '../../game/progression/progressionConfig'
import { buildHeroProgressionViewModel } from '../../game/progression/progressionViewModel'
import {
  advanceAwakening,
  unlockTalent,
  upgradeSkill,
} from '../../game/progression/progressionService'
import { clampRatio, formatNumber } from '../../lib/format'
import { useToast } from '../Toast/useToast'
import styles from './HeroProgressionPanel.module.css'

interface HeroProgressionPanelProps {
  player: Player
  heroId: string
  onPlayerChange: (next: Player) => Promise<boolean>
}

export function HeroProgressionPanel({
  player,
  heroId,
  onPlayerChange,
}: HeroProgressionPanelProps) {
  const { showToast } = useToast()
  const viewModel = useMemo(() => buildHeroProgressionViewModel(player, heroId), [player, heroId])

  if (!viewModel) return null

  const expRatio = clampRatio(viewModel.currentExp, viewModel.expToNext)

  async function persist(next: Player, message: string) {
    const ok = await onPlayerChange(next)
    if (ok) showToast(message)
    else showToast('บันทึกไม่สำเร็จ')
  }

  async function handleSkillUpgrade(slot: SkillSlotId) {
    const { player: next, result } = upgradeSkill(player, heroId, slot)
    if (!result.success) {
      showToast(result.error ?? 'อัปเกรดไม่สำเร็จ')
      return
    }
    await persist(next, `${viewModel?.heroName} — ${slot} Lv.${result.newLevel}`)
  }

  async function handleTalentUnlock(nodeId: string) {
    const { player: next, result } = unlockTalent(player, heroId, nodeId)
    if (!result.success) {
      showToast(result.error ?? 'ปลดล็อกไม่สำเร็จ')
      return
    }
    await persist(next, 'ปลดล็อกพรสวรรค์แล้ว')
  }

  async function handleAwakening() {
    const { player: next, result } = advanceAwakening(player, heroId)
    if (!result.success) {
      showToast(result.error ?? 'ปลุกพลังไม่สำเร็จ')
      return
    }
    await persist(next, `ปลุกพลัง Tier ${result.newTier}`)
  }

  return (
    <div className={styles.panel}>
      {viewModel.nonProductionBalance ? (
        <p className={styles.balanceNote}>NON-PRODUCTION BALANCE — ตัวเลขทดสอบเท่านั้น</p>
      ) : null}

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>เลเวล / EXP</h4>
        <div className={styles.expHead}>
          <span>Lv.{viewModel.level}</span>
          <span>
            {viewModel.atMaxLevel
              ? 'MAX'
              : `${formatNumber(viewModel.currentExp)} / ${formatNumber(viewModel.expToNext)}`}
          </span>
        </div>
        <div
          className={styles.expTrack}
          role="progressbar"
          aria-label={`EXP ${viewModel.heroName}`}
          aria-valuemin={0}
          aria-valuemax={viewModel.atMaxLevel ? 1 : viewModel.expToNext}
          aria-valuenow={viewModel.atMaxLevel ? viewModel.expToNext : viewModel.currentExp}
        >
          <div
            className={styles.expFill}
            style={{ width: `${(viewModel.atMaxLevel ? 1 : expRatio) * 100}%` }}
          />
        </div>
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>ค่าสถานะ (จากเลเวล)</h4>
        <dl className={styles.statGrid}>
          <div>
            <dt>HP</dt>
            <dd>{formatNumber(viewModel.stats.hp)}</dd>
          </div>
          <div>
            <dt>ATK</dt>
            <dd>{formatNumber(viewModel.stats.atk)}</dd>
          </div>
          <div>
            <dt>DEF</dt>
            <dd>{formatNumber(viewModel.stats.def)}</dd>
          </div>
          <div>
            <dt>SPD</dt>
            <dd>{formatNumber(viewModel.stats.spd)}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>สกิล</h4>
        <ul className={styles.skillList}>
          {viewModel.skills.map((skill) => (
            <li key={skill.skillSlot} className={styles.skillRow}>
              <div className={styles.skillInfo}>
                <span className={styles.skillName}>{skill.skillName}</span>
                <span className={styles.skillLevel}>
                  Lv.{skill.currentLevel}
                  {skill.nextLevel ? ` → ${skill.nextLevel}` : ' (MAX)'}
                </span>
                <span className={styles.skillCost}>{skill.costLabel}</span>
              </div>
              <button
                type="button"
                className={styles.upgradeBtn}
                disabled={!skill.canUpgrade}
                onClick={() => handleSkillUpgrade(skill.skillSlot)}
              >
                {skill.reason === 'MAX' ? 'MAX' : 'อัปเกรด'}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {progressionConfig.showTalentAwakeningUi && viewModel.talentNodes.length > 0 ? (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>พรสวรรค์</h4>
          <ul className={styles.talentList}>
            {viewModel.talentNodes.map((node) => (
              <li key={node.id} className={styles.talentRow}>
                <span className={node.unlocked ? styles.unlocked : styles.locked}>{node.name}</span>
                <span className={styles.skillCost}>{node.costLabel}</span>
                <button
                  type="button"
                  className={styles.upgradeBtn}
                  disabled={!node.canUnlock}
                  onClick={() => handleTalentUnlock(node.id)}
                >
                  {node.unlocked ? 'ปลดแล้ว' : 'ปลดล็อก'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {progressionConfig.showTalentAwakeningUi ? (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>ปลุกพลัง</h4>
          <p className={styles.awakeningSummary}>
            {viewModel.awakening.summary}
            {viewModel.awakening.tier >= viewModel.awakening.maxTier ? '' : ' (TBD content)'}
          </p>
          <button
            type="button"
            className={styles.upgradeBtn}
            disabled={!viewModel.awakening.canAdvance}
            onClick={handleAwakening}
          >
            {viewModel.awakening.tier >= viewModel.awakening.maxTier ? 'MAX' : 'ปลุกขั้นถัดไป'}
          </button>
        </section>
      ) : null}
    </div>
  )
}
