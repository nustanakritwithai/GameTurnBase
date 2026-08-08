import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LobbyBattleSession } from './LobbyBattleSession'
import { createDefaultSkillLevels } from '../../game/realtimeBattle/SkillProgressionSystem'
import type { Player } from '../../types/player'
import { EMPTY_PROGRESS } from '../../types/player'
import type { LobbyBattleProgressionRpcPayload } from '../../data/accountRepository.supabase'
import type { RealtimeBattleResult } from '../../game/realtimeBattle/types'

vi.mock('../BattleScene/BattleScene', () => ({
  BattleScene: ({ onComplete }: { onComplete: (result: RealtimeBattleResult) => void }) => (
    <button
      type="button"
      onClick={() =>
        onComplete({
          outcome: 'victory',
          stageId: 'trial-01',
          stageName: 'ทดสอบ',
          elapsedMs: 1000,
          defeatedEnemyIds: ['e1'],
          damageDealt: 100,
          damageTaken: 10,
          earnedExp: 50,
          earnedGold: 20,
          droppedItems: [],
          finishedAt: '2026-08-08T08:00:00.000Z',
        })
      }
    >
      mock-complete
    </button>
  ),
}))

/**
 * เทสต์ตาม Done-criteria #3 (docs/agent-blueprint/16-stage-adventure-system.md):
 * "rejects a locked stageId before BattleScene mounts"
 *
 * ตัว gating logic เองเทสต์เป็น pure predicate แล้วที่ stageConfig.test.ts —
 * ไฟล์นี้ปักหมุดจุดที่เรียกมันจริง: LobbyBattleSession ต้องไม่ mount BattleScene
 * จนกว่าจะมีด่านที่ปลดล็อกถูกเลือกก่อน
 */

function makePlayer(): Player {
  return {
    id: 'acc-1',
    uid: '1234567890',
    name: 'ผู้ทดสอบ',
    title: 'นักเดินทาง',
    level: 10,
    exp: 0,
    expToNext: 100,
    currency: { gold: 0, gem: 0 },
    ownedCharacters: [
      {
        characterId: 'monkey-king',
        level: 12,
        exp: 0,
        expToNext: 100,
        obtainedAt: '2026-01-01T00:00:00.000Z',
        skillLevels: createDefaultSkillLevels(),
      },
    ],
    inventory: [],
    friends: [],
    teamSlots: ['monkey-king', null, null, null],
    frameId: 'default',
    progress: EMPTY_PROGRESS,
  }
}

function rewardMocks(
  overrides: Partial<{
    onCommitProgression: (
      payload: LobbyBattleProgressionRpcPayload,
    ) => Promise<{ ok: true; player: Player } | { ok: false; error: string }>
    onRecordPending: (result: RealtimeBattleResult, transactionId: string) => Promise<boolean>
    onClearPending: (transactionId: string) => Promise<void>
    onGetPendingRewards: () => Promise<never[]>
  }> = {},
) {
  return {
    onCommitProgression: vi.fn(async (payload: LobbyBattleProgressionRpcPayload) => ({
      ok: true as const,
      player: payload.player,
    })),
    onRecordPending: vi.fn(async () => true),
    onClearPending: vi.fn(),
    onGetPendingRewards: vi.fn(async () => []),
    ...overrides,
  }
}

describe('LobbyBattleSession', () => {
  it('เริ่มที่หน้าเลือกด่านเสมอ — ไม่ mount BattleScene จนกว่าจะเลือกด่านที่ปลดล็อกแล้ว', () => {
    render(
      <LobbyBattleSession
        player={makePlayer()}
        onPlayerChange={vi.fn()}
        onEarnGold={vi.fn()}
        onGrantItem={vi.fn()}
        {...rewardMocks()}
        onExit={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'เลือกด่าน' })).toBeInTheDocument()
    expect(screen.queryByText('กำลังเตรียมห้องต่อสู้…')).not.toBeInTheDocument()
  })

  it('ด่านที่ยังไม่ปลดล็อก (trial-02) กดไม่ได้จากหน้าเลือกด่าน', () => {
    render(
      <LobbyBattleSession
        player={makePlayer()}
        onPlayerChange={vi.fn()}
        onEarnGold={vi.fn()}
        onGrantItem={vi.fn()}
        {...rewardMocks()}
        onExit={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /ประตูปีศาจ/ })).toBeDisabled()
  })

  it('does not exit lobby when progression commit fails — earnGold not called', async () => {
    const onExit = vi.fn()
    const onEarnGold = vi.fn()

    render(
      <LobbyBattleSession
        player={makePlayer()}
        onPlayerChange={vi.fn(async () => true)}
        onEarnGold={onEarnGold}
        onGrantItem={vi.fn()}
        {...rewardMocks({
          onCommitProgression: vi.fn(async () => ({ ok: false as const, error: 'rpc fail' })),
        })}
        onExit={onExit}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /ลานฝึกหน้าวิหาร/ }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'mock-complete' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'mock-complete' }))

    await waitFor(() => {
      expect(onEarnGold).not.toHaveBeenCalled()
    })
    expect(onExit).not.toHaveBeenCalled()
  })

  it('exits lobby only after progression save succeeds', async () => {
    const onExit = vi.fn()
    const player = makePlayer()

    render(
      <LobbyBattleSession
        player={player}
        onPlayerChange={vi.fn(async () => true)}
        onEarnGold={vi.fn(async () => ({
          ok: true as const,
          player: { ...player, currency: { gold: 520, gem: 0 } },
          amount: 20,
        }))}
        onGrantItem={vi.fn()}
        {...rewardMocks()}
        onExit={onExit}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /ลานฝึกหน้าวิหาร/ }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'mock-complete' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'mock-complete' }))

    await waitFor(() => {
      expect(onExit).toHaveBeenCalledTimes(1)
    })
  })

  it('retry Continue after gold failure does not duplicate earnGold on success path', async () => {
    const onExit = vi.fn()
    const player = makePlayer()
    let currentPlayer = player
    const onPlayerChange = vi.fn(async (next: Player) => {
      currentPlayer = next
      return true
    })
    const onEarnGold = vi
      .fn()
      .mockResolvedValueOnce({ ok: false as const, error: 'ledger down' })
      .mockResolvedValueOnce({
        ok: true as const,
        player: { ...currentPlayer, currency: { gold: 520, gem: 0 } },
        amount: 20,
      })

    const { rerender } = render(
      <LobbyBattleSession
        player={currentPlayer}
        onPlayerChange={onPlayerChange}
        onEarnGold={onEarnGold}
        onGrantItem={vi.fn()}
        {...rewardMocks()}
        onExit={onExit}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /ลานฝึกหน้าวิหาร/ }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'mock-complete' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'mock-complete' }))
    await waitFor(() => expect(onEarnGold).toHaveBeenCalledTimes(1))

    rerender(
      <LobbyBattleSession
        player={currentPlayer}
        onPlayerChange={onPlayerChange}
        onEarnGold={onEarnGold}
        onGrantItem={vi.fn()}
        {...rewardMocks()}
        onExit={onExit}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'mock-complete' }))
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1))
    expect(onEarnGold).toHaveBeenCalledTimes(2)
  })
})
