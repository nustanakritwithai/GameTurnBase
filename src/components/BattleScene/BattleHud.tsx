import type { RealtimeBattleSnapshot } from '../../game/realtimeBattle/types'
import styles from './BattleScene.module.css'

/**
 * Combat HUD — player vitals (top-left), stage info (top-center), enemy summary (top-right).
 */
export function BattleHud({
  snapshot,
  onExit,
}: {
  snapshot: RealtimeBattleSnapshot
  onExit: () => void
}) {
  const { player } = snapshot
  const hpRatio = player.maxHp > 0 ? Math.max(0, player.hp / player.maxHp) : 0
  const enemiesLeft = snapshot.enemies.filter((enemy) => enemy.hp > 0).length
  const primaryEnemy = snapshot.enemies.find((enemy) => enemy.hp > 0)
  const enemyHpRatio =
    primaryEnemy && primaryEnemy.maxHp > 0 ? Math.max(0, primaryEnemy.hp / primaryEnemy.maxHp) : 0

  return (
    <div className={styles.hud}>
      <div className={styles.hudTop}>
        <div className={styles.playerVitals}>
          <span className={styles.playerPortrait} aria-hidden="true">
            {player.name.slice(0, 1)}
          </span>
          <div className={styles.playerVitalsBody}>
            <span className={styles.playerName}>{player.name}</span>
            <div className={styles.hpTrack}>
              <div className={styles.hpFill} style={{ width: `${hpRatio * 100}%` }} />
            </div>
            <span className={styles.hpText}>
              {Math.max(0, Math.ceil(player.hp))}/{player.maxHp}
            </span>
          </div>
        </div>

        <div className={styles.stageInfo}>
          <span className={styles.stageName}>{snapshot.stageName}</span>
          <span className={styles.waveText}>
            คลื่น {snapshot.currentWave}/{snapshot.totalWaves} · เหลือศัตรู {enemiesLeft}
          </span>
        </div>

        <div className={styles.enemyVitals}>
          {primaryEnemy ? (
            <>
              <div className={styles.enemyVitalsBody}>
                <span className={styles.enemyName}>{primaryEnemy.name}</span>
                <div className={styles.enemyHpTrack}>
                  <div className={styles.enemyHpFill} style={{ width: `${enemyHpRatio * 100}%` }} />
                </div>
                <span className={styles.hpText}>
                  {Math.max(0, Math.ceil(primaryEnemy.hp))}/{primaryEnemy.maxHp}
                </span>
              </div>
              <span className={styles.enemyPortrait} aria-hidden="true">
                {primaryEnemy.name.slice(0, 1)}
              </span>
            </>
          ) : (
            <span className={styles.enemyName}>—</span>
          )}
          <button
            type="button"
            className={styles.exitBtn}
            onClick={onExit}
            aria-label="ออกจากการต่อสู้"
          >
            ออก
          </button>
        </div>
      </div>
    </div>
  )
}
