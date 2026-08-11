import { useCallback, useRef, useState } from 'react'
import type { CurrencyResult, GoldSource, ItemResult } from '../../data/accountRepository.shared'
import { appendBattleHistory } from '../../game/dialogue/actions'
import { P5_TEST_DUNGEON } from '../../game/dungeon/dungeonConfig'
import type { DungeonResult } from '../../game/dungeon/dungeonSchema'
import {
  grantAndFinalizeDungeonRewards,
  resolveDungeonRewards,
} from '../../game/reward/dungeonRewardPipeline'
import type { ResultViewModel } from '../../game/reward/rewardSchema'
import { useDungeonStageBattle } from '../../hooks/useDungeonStageBattle'
import type { Player } from '../../types/player'
import { RealtimeBattleRoom } from '../BattleScene/RealtimeBattleRoom'
import { DungeonResultPanel } from './DungeonResultPanel'
import { StageObjectiveHud } from './StageObjectiveHud'
import styles from '../BattleScene/BattleScene.module.css'

const LOADING = (
  <div className={styles.scene}>
    <div className={styles.fallback} aria-live="polite">
      <p>กำลังเข้าดันเจี้ยน…</p>
    </div>
  </div>
)

export const P5_DUNGEON_ID = P5_TEST_DUNGEON.id

export function DungeonSession({
  player,
  onPlayerChange,
  onEarnGold,
  onGrantItem,
  onExit,
}: {
  player: Player
  onPlayerChange: (next: Player) => Promise<boolean>
  onEarnGold: (source: GoldSource, amount: number, refId?: string) => Promise<CurrencyResult>
  onGrantItem: (itemId: string, quantity: number, source: GoldSource) => Promise<ItemResult>
  onExit: () => void
}) {
  const [resultViewModel, setResultViewModel] = useState<ResultViewModel | null>(null)
  const [pendingResult, setPendingResult] = useState<DungeonResult | null>(null)
  const savedRef = useRef(false)

  const handleDungeonComplete = useCallback(
    (result: DungeonResult) => {
      setPendingResult(result)
      const presentation = resolveDungeonRewards(result, P5_TEST_DUNGEON, player.progress.flags)
      setResultViewModel(presentation.viewModel)
    },
    [player.progress.flags],
  )

  const {
    phase,
    errorMessage,
    runtime,
    snapshot,
    stageSnapshot,
    requestExit,
    setJoystick,
    pressAttack,
    pressSkill,
  } = useDungeonStageBattle({
    dungeon: P5_TEST_DUNGEON,
    player,
    onDungeonComplete: handleDungeonComplete,
  })

  const handleExit = useCallback(() => {
    requestExit()
    onExit()
  }, [onExit, requestExit])

  const handleContinue = useCallback(() => {
    if (!pendingResult || !resultViewModel || savedRef.current) return
    savedRef.current = true

    void (async () => {
      const pipeline = await grantAndFinalizeDungeonRewards({
        result: pendingResult,
        dungeon: P5_TEST_DUNGEON,
        player,
        deps: { onEarnGold, onGrantItem },
      })

      if (!pipeline.grant.success) {
        savedRef.current = false
        return
      }

      let next = pipeline.player
      const progress = appendBattleHistory(next.progress, {
        id: `dungeon-${pendingResult.runId}`,
        opponent: P5_TEST_DUNGEON.metadata?.name ?? pendingResult.dungeonId,
        result: pendingResult.success ? 'win' : 'lose',
        finishedAt: new Date(pendingResult.completedAt).toISOString(),
        durationMs: pendingResult.clearTimeMs,
      })

      const saved = await onPlayerChange({ ...next, progress })
      if (!saved) {
        savedRef.current = false
        return
      }
      onExit()
    })()
  }, [onEarnGold, onExit, onGrantItem, onPlayerChange, pendingResult, player, resultViewModel])

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

  // Cleared runs dispose the battle runtime — must not treat null runtime as "still loading".
  if (phase === 'complete' && resultViewModel) {
    return (
      <div className={styles.scene}>
        <DungeonResultPanel viewModel={resultViewModel} onContinue={handleContinue} />
      </div>
    )
  }

  if (phase === 'loading' || !runtime || !snapshot) {
    return LOADING
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
        objectiveOverlay={<StageObjectiveHud snapshot={stageSnapshot} />}
      />
      {resultViewModel ? (
        <DungeonResultPanel viewModel={resultViewModel} onContinue={handleContinue} />
      ) : null}
    </>
  )
}
