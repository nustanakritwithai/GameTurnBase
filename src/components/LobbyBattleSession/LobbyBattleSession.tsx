import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import type { CurrencyResult, GoldSource, ItemResult } from '../../data/accountRepository.shared'
import type { LobbyBattleProgressionRpcPayload } from '../../data/accountRepository.supabase'
import type { PendingLobbyRewardRow } from '../../data/accountRepository.supabase'
import { ErrorBoundary, SceneCrashFallback } from '../ErrorBoundary/ErrorBoundary'
import {
  consumeStageEnergy,
  normalizeEnergy,
  tickEnergyRegen,
} from '../../game/adventure/energySystem'
import {
  finalizeLobbyBattleRewards,
  pendingLobbyRewardToResult,
  type LobbyBattleProgressionCommit,
} from '../../game/reward/lobbyBattleRewardPipeline'
import { getRealtimeStage, isStageUnlocked } from '../../game/realtimeBattle/stageConfig'
import type { RealtimeBattleResult } from '../../game/realtimeBattle/types'
import { reportError } from '../../lib/errors/reportError'
import type { Player } from '../../types/player'
import { StageSelect } from '../StageSelect/StageSelect'

/**
 * ทางเข้าห้องต่อสู้จากล็อบบี้ — กดปุ่มแล้วเลือกด่านก่อนเข้าห้อง
 *
 * ไฟล์นี้ตั้งใจให้บางที่สุด: เลือกด่าน → เปิดห้อง → แสดงผล → บันทึกรางวัล/ประวัติ → ปิด
 */

const BattleScene = lazy(() =>
  import('../BattleScene/BattleScene').then((m) => ({ default: m.BattleScene })),
)

export function LobbyBattleSession({
  player,
  onPlayerChange,
  onEarnGold,
  onGrantItem,
  onCommitProgression,
  onRecordPending,
  onClearPending,
  onGetPendingRewards,
  onExit,
}: {
  player: Player
  /** คืน true เมื่อบันทึกลงที่เก็บข้อมูลจริง — false แปลว่าหน้าจอถูกย้อนกลับแล้ว */
  onPlayerChange: (next: Player) => Promise<boolean>
  /** ทองจากการเล่น — ต้องผ่าน ledger (earnGold) ไม่ใช่เซตตรง */
  onEarnGold: (source: GoldSource, amount: number, refId?: string) => Promise<CurrencyResult>
  /** ไอเทมดรอป — ต้องผ่าน grantItem */
  onGrantItem: (
    itemId: string,
    quantity: number,
    source: GoldSource,
    refId?: string,
  ) => Promise<ItemResult>
  onCommitProgression: (
    payload: LobbyBattleProgressionRpcPayload,
  ) => Promise<{ ok: true; player: Player } | { ok: false; error: string }>
  onRecordPending: (result: RealtimeBattleResult, transactionId: string) => Promise<boolean>
  onClearPending: (transactionId: string) => Promise<void>
  onGetPendingRewards: () => Promise<PendingLobbyRewardRow[]>
  onExit: () => void
}) {
  /*
    กันบันทึกผลซ้ำ

    BattleScene เรียก onComplete ครั้งเดียวตอนผู้เล่นกด "กลับล็อบบี้" จากแผงผล
    แต่ตัวนี้เขียนลงข้อมูลผู้เล่นจริง จึงกันไว้อีกชั้น
  */
  const savedRef = useRef(false)
  const playerRef = useRef(player)
  playerRef.current = player
  /** ยังไม่เลือกด่าน = null → แสดงหน้าเลือกด่านก่อน ยังไม่ mount BattleScene */
  const [stageId, setStageId] = useState<string | null>(null)

  const buildRewardDeps = useCallback(
    () => ({
      onPlayerChange,
      onEarnGold,
      onGrantItem,
      onCommitProgression: async (payload: LobbyBattleProgressionCommit) => {
        const result = await onCommitProgression(payload)
        if (!result.ok) return { ok: false as const, error: result.error }
        return { ok: true as const, player: result.player }
      },
      onRecordPending: async (result: RealtimeBattleResult, transactionId: string) =>
        onRecordPending(result, transactionId),
      onClearPending,
    }),
    [onClearPending, onCommitProgression, onEarnGold, onGrantItem, onPlayerChange, onRecordPending],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const pending = await onGetPendingRewards()
      if (cancelled || pending.length === 0 || savedRef.current) return

      for (const row of pending) {
        const result = pendingLobbyRewardToResult(row)
        const pipeline = await finalizeLobbyBattleRewards(
          result,
          playerRef.current,
          buildRewardDeps(),
        )
        if (pipeline.ok) {
          savedRef.current = true
          onExit()
          return
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [buildRewardDeps, onExit, onGetPendingRewards])

  const handleSelectStage = useCallback(
    (id: string) => {
      const stage = getRealtimeStage(id)
      if (!stage || !isStageUnlocked(id, player.progress.flags)) return

      const energy = tickEnergyRegen(normalizeEnergy(player.progress.energy))
      const nextEnergy = consumeStageEnergy(energy, stage)
      void onPlayerChange({
        ...player,
        progress: { ...player.progress, energy: nextEnergy },
      }).then((ok) => {
        if (ok) setStageId(id)
        return ok
      })
    },
    [onPlayerChange, player],
  )

  const handleComplete = useCallback(
    (result: RealtimeBattleResult) => {
      if (savedRef.current) return
      savedRef.current = true

      void (async () => {
        try {
          const pipeline = await finalizeLobbyBattleRewards(
            result,
            playerRef.current,
            buildRewardDeps(),
          )

          if (!pipeline.ok) {
            savedRef.current = false
            if (pipeline.failure === 'progression_save') {
              // updatePlayer แสดง PLAYER_SAVE_FAIL แล้ว — อย่าออกจากห้อง
              return
            }
            if (pipeline.failure === 'gold_grant') {
              reportError('REWARD_GOLD_FAIL', 'visible')
              return
            }
            if (pipeline.failure === 'item_grant') {
              reportError('REWARD_ITEM_FAIL', 'visible')
              return
            }
            return
          }

          onExit()
        } catch (cause: unknown) {
          savedRef.current = false
          reportError('BATTLE_REWARD_FAIL', 'visible', cause)
        }
      })()
    },
    [buildRewardDeps, onExit],
  )

  // เช็คซ้ำก่อน mount เสมอ (ไม่ใช่แค่ตอนแสดงรายการ) — กันด่านล็อกหลุดเข้าห้องต่อสู้แม้ผ่าน
  // ทางที่ไม่ได้กดจากรายการนี้ตรง ๆ (เช่น state ค้างจาก re-render)
  if (!stageId || !isStageUnlocked(stageId, player.progress.flags)) {
    return <StageSelect progress={player.progress} onSelect={handleSelectStage} onClose={onExit} />
  }

  return (
    <ErrorBoundary
      fallback={
        <SceneCrashFallback
          message="ห้องต่อสู้ขัดข้อง กลับล็อบบี้แล้วลองใหม่"
          onBack={onExit}
          backLabel="กลับล็อบบี้"
        />
      }
    >
      <Suspense fallback={null}>
        <BattleScene
          player={player}
          stageId={stageId}
          onComplete={handleComplete}
          onExit={onExit}
        />
      </Suspense>
    </ErrorBoundary>
  )
}
