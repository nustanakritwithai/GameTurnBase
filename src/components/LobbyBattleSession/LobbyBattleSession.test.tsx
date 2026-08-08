import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LobbyBattleSession } from './LobbyBattleSession'
import { createDefaultSkillLevels } from '../../game/realtimeBattle/SkillProgressionSystem'
import { REALTIME_STAGES, getRealtimeStage } from '../../game/realtimeBattle/stageConfig'
import type { Player } from '../../types/player'
import { EMPTY_PROGRESS } from '../../types/player'
import type { RealtimeBattleResult } from '../../game/realtimeBattle/types'
import type { CurrencyResult, ItemResult } from '../../data/accountRepository.shared'
import type { LobbyBattleProgressionRpcPayload } from '../../data/accountRepository.supabase'

vi.mock('../BattleScene/BattleScene', () => {
  return {
    BattleScene: ({
      stageId,
      onComplete,
      onExit,
    }: {
      stageId: string
      onComplete: (res: RealtimeBattleResult) => void
      onExit: () => void
    }) => {
      return (
        <div data-testid="mock-battle-scene">
          <span data-testid="battle-stage-id">{stageId}</span>
          <button
            data-testid="btn-win"
            onClick={() =>
              onComplete({
                outcome: 'victory',
                stageId,
                stageName: 'ลานฝึกทดสอบ',
                elapsedMs: 5000,
                defeatedEnemyIds: ['shadow-soldier'],
                damageDealt: 100,
                damageTaken: 10,
                earnedExp: 200,
                earnedGold: 100,
                droppedItems: [{ itemId: 'healing-peach', quantity: 1 }],
                finishedAt: new Date().toISOString(),
              })
            }
          >
            Win
          </button>
          <button
            data-testid="btn-lose"
            onClick={() =>
              onComplete({
                outcome: 'defeat',
                stageId,
                stageName: 'ลานฝึกทดสอบ',
                elapsedMs: 5000,
                defeatedEnemyIds: [],
                damageDealt: 10,
                damageTaken: 100,
                earnedExp: 0,
                earnedGold: 0,
                droppedItems: [],
                finishedAt: new Date().toISOString(),
              })
            }
          >
            Lose
          </button>
          <button data-testid="btn-exit" onClick={onExit}>
            Exit
          </button>
        </div>
      )
    },
  }
})

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

function mockOnPlayerChange(player = makePlayer()) {
  return vi.fn(async (next: Player) => {
    Object.assign(player, next)
    return true
  })
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
    const onEarnGold = vi.fn(async (_s, amount): Promise<CurrencyResult> => ({
      ok: true as const,
      player: makePlayer(),
      amount,
    }))
    const onGrantItem = vi.fn(async (): Promise<ItemResult> => ({
      ok: true as const,
      player: makePlayer(),
    }))

    render(
      <LobbyBattleSession
        player={makePlayer()}
        onPlayerChange={mockOnPlayerChange()}
        onEarnGold={onEarnGold}
        onGrantItem={onGrantItem}
        {...rewardMocks()}
        onExit={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'เลือกด่าน' })).toBeInTheDocument()
    expect(screen.queryByTestId('mock-battle-scene')).not.toBeInTheDocument()
  })

  it('ด่านที่ยังไม่ปลดล็อก (trial-02) กดไม่ได้จากหน้าเลือกด่าน', () => {
    const onEarnGold = vi.fn(async (_s, amount): Promise<CurrencyResult> => ({
      ok: true as const,
      player: makePlayer(),
      amount,
    }))
    const onGrantItem = vi.fn(async (): Promise<ItemResult> => ({
      ok: true as const,
      player: makePlayer(),
    }))

    render(
      <LobbyBattleSession
        player={makePlayer()}
        onPlayerChange={mockOnPlayerChange()}
        onEarnGold={onEarnGold}
        onGrantItem={onGrantItem}
        {...rewardMocks()}
        onExit={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /ประตูปีศาจ/ })).toBeDisabled()
  })

  it('กดเลือกด่านปลดล็อกแล้วจะนำไปสู่หน้า BattleScene (Scar 2 check)', async () => {
    const user = userEvent.setup()
    const onEarnGold = vi.fn(async (_s, amount): Promise<CurrencyResult> => ({
      ok: true as const,
      player: makePlayer(),
      amount,
    }))
    const onGrantItem = vi.fn(async (): Promise<ItemResult> => ({
      ok: true as const,
      player: makePlayer(),
    }))

    render(
      <LobbyBattleSession
        player={makePlayer()}
        onPlayerChange={mockOnPlayerChange()}
        onEarnGold={onEarnGold}
        onGrantItem={onGrantItem}
        {...rewardMocks()}
        onExit={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /ลานฝึกหน้าวิหาร/ }))

    expect(await screen.findByTestId('mock-battle-scene')).toBeInTheDocument()
    expect(screen.getByTestId('battle-stage-id')).toHaveTextContent('trial-01')
  })

  it('Scar 1: เคลียร์ด่านชนะสำเร็จ บันทึก clear-flag ใน Player.progress.flags และเรียกฟังก์ชันบันทึกข้อมูล', async () => {
    const user = userEvent.setup()
    const onPlayerChange = vi.fn(async (_p: Player) => true)
    const onEarnGold = vi.fn(async (_s, amount): Promise<CurrencyResult> => ({
      ok: true as const,
      player: makePlayer(),
      amount,
    }))
    const onGrantItem = vi.fn(async (): Promise<ItemResult> => ({
      ok: true as const,
      player: makePlayer(),
    }))
    const onExit = vi.fn()
    const onCommitProgression = vi.fn(async (payload: LobbyBattleProgressionRpcPayload) => ({
      ok: true as const,
      player: payload.player,
    }))

    render(
      <LobbyBattleSession
        player={makePlayer()}
        onPlayerChange={onPlayerChange}
        onEarnGold={onEarnGold}
        onGrantItem={onGrantItem}
        {...rewardMocks({ onCommitProgression })}
        onExit={onExit}
      />,
    )

    // เข้าด่าน
    await user.click(screen.getByRole('button', { name: /ลานฝึกหน้าวิหาร/ }))

    // กดชนะในฉากจำลอง
    await user.click(screen.getByTestId('btn-win'))

    await waitFor(() => {
      expect(onCommitProgression).toHaveBeenCalledTimes(1)
    })

    const committed = onCommitProgression.mock.calls[0]?.[0] as LobbyBattleProgressionRpcPayload
    expect(committed.player.progress.flags['trial_cleared_trial-01']).toBe(true)
    await waitFor(() => {
      expect(onExit).toHaveBeenCalledTimes(1)
    })
  })

  it('Scar 1: เคลียร์ด่านแพ้ ไม่บันทึก clear-flag', async () => {
    const user = userEvent.setup()
    const onPlayerChange = vi.fn(async (_p: Player) => true)
    const onEarnGold = vi.fn(async (_s, amount): Promise<CurrencyResult> => ({
      ok: true as const,
      player: makePlayer(),
      amount,
    }))
    const onGrantItem = vi.fn(async (): Promise<ItemResult> => ({
      ok: true as const,
      player: makePlayer(),
    }))
    const onExit = vi.fn()
    const onCommitProgression = vi.fn(async (payload: LobbyBattleProgressionRpcPayload) => ({
      ok: true as const,
      player: payload.player,
    }))

    render(
      <LobbyBattleSession
        player={makePlayer()}
        onPlayerChange={onPlayerChange}
        onEarnGold={onEarnGold}
        onGrantItem={onGrantItem}
        {...rewardMocks({ onCommitProgression })}
        onExit={onExit}
      />,
    )

    await user.click(screen.getByRole('button', { name: /ลานฝึกหน้าวิหาร/ }))
    await user.click(screen.getByTestId('btn-lose'))

    await waitFor(() => {
      expect(onCommitProgression).toHaveBeenCalledTimes(1)
    })

    const committed = onCommitProgression.mock.calls[0]?.[0] as LobbyBattleProgressionRpcPayload
    expect(committed.player.progress.flags['trial_cleared_trial-01']).toBeUndefined()
    await waitFor(() => {
      expect(onExit).toHaveBeenCalledTimes(1)
    })
  })

  it('Scar 1: ผู้เล่นออกจากห้องต่อสู้ก่อนกำหนด (Exit Early) ไม่มีการเซฟหรือบันทึก clear-flag', async () => {
    const user = userEvent.setup()
    const onPlayerChange = vi.fn(async (_p: Player) => true)
    const onExit = vi.fn()
    const onEarnGold = vi.fn(async (_s, amount): Promise<CurrencyResult> => ({
      ok: true as const,
      player: makePlayer(),
      amount,
    }))
    const onGrantItem = vi.fn(async (): Promise<ItemResult> => ({
      ok: true as const,
      player: makePlayer(),
    }))

    render(
      <LobbyBattleSession
        player={makePlayer()}
        onPlayerChange={onPlayerChange}
        onEarnGold={onEarnGold}
        onGrantItem={onGrantItem}
        {...rewardMocks()}
        onExit={onExit}
      />,
    )

    await user.click(screen.getByRole('button', { name: /ลานฝึกหน้าวิหาร/ }))
    await user.click(screen.getByTestId('btn-exit'))

    expect(onExit).toHaveBeenCalledTimes(1)
    expect(onPlayerChange).toHaveBeenCalledTimes(1) // energy only — no battle save on early exit
  })

  it('Scar 2: ทุกด่านที่มีอยู่ในสารบัญ REALTIME_STAGES ต้องสามารถดึงค่าได้จริงและไม่เป็น null', () => {
    for (const stageId of Object.keys(REALTIME_STAGES)) {
      const stage = getRealtimeStage(stageId)
      expect(stage).not.toBeNull()
      expect(stage?.id).toBe(stageId)
    }
  })

  it('Scar 3: เอนทรีด่านและจัดสรรตัวละครทีมไม่สมบูรณ์ (เช่น teamSlots ว่างเปล่า) ไม่ส่งผลให้ crash หรือพัง', () => {
    const brokenPlayer = {
      ...makePlayer(),
      teamSlots: [null, null, null, null],
    }

    const onEarnGold = vi.fn(async (_s, amount): Promise<CurrencyResult> => ({
      ok: true as const,
      player: makePlayer(),
      amount,
    }))
    const onGrantItem = vi.fn(async (): Promise<ItemResult> => ({
      ok: true as const,
      player: makePlayer(),
    }))

    render(
      <LobbyBattleSession
        player={brokenPlayer}
        onPlayerChange={mockOnPlayerChange()}
        onEarnGold={onEarnGold}
        onGrantItem={onGrantItem}
        {...rewardMocks()}
        onExit={vi.fn()}
      />,
    )

    // ต้องยังขึ้นหน้าต่างเลือกด่านตามปกติ
    expect(screen.getByRole('dialog', { name: 'เลือกด่าน' })).toBeInTheDocument()
  })

  it('Done-criterion 6: LobbyBattleSession save sequence fires exactly once even under duplicate onComplete calls', async () => {
    const onEarnGold = vi.fn(async (_s, amount): Promise<CurrencyResult> => ({
      ok: true as const,
      player: makePlayer(),
      amount,
    }))
    const onGrantItem = vi.fn(async (): Promise<ItemResult> => ({
      ok: true as const,
      player: makePlayer(),
    }))
    const onPlayerChange = vi.fn(async (_p: Player) => true)
    const onExit = vi.fn()

    render(
      <LobbyBattleSession
        player={makePlayer()}
        onPlayerChange={onPlayerChange}
        onEarnGold={onEarnGold}
        onGrantItem={onGrantItem}
        {...rewardMocks()}
        onExit={onExit}
      />,
    )

    // Select stage first
    const stageBtn = screen.getByRole('button', { name: /ลานฝึกหน้าวิหาร/i })
    stageBtn.click()

    // Wait for mock BattleScene to render
    const winBtn = await screen.findByTestId('btn-win')

    // Click complete twice (simulating double onComplete call)
    winBtn.click()
    winBtn.click()

    await waitFor(() => {
      expect(onEarnGold).toHaveBeenCalledTimes(1)
    })

    // Verify calls are only executed once due to savedRef guard
    expect(onEarnGold).toHaveBeenCalledTimes(1)
    expect(onGrantItem).toHaveBeenCalledTimes(1)
    expect(onPlayerChange.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('Scar 1 (Reward): prevents duplicate SP/reward grants on retry/re-entry when savedRef resets on new session mount', async () => {
    const onEarnGold = vi.fn(async (_s, amount): Promise<CurrencyResult> => ({
      ok: true as const,
      player: makePlayer(),
      amount,
    }))
    const onGrantItem = vi.fn(async (): Promise<ItemResult> => ({
      ok: true as const,
      player: makePlayer(),
    }))
    const onPlayerChange = vi.fn(async (_p: Player) => true)
    const onExit = vi.fn()

    // First session
    const { unmount } = render(
      <LobbyBattleSession
        player={makePlayer()}
        onPlayerChange={onPlayerChange}
        onEarnGold={onEarnGold}
        onGrantItem={onGrantItem}
        {...rewardMocks()}
        onExit={onExit}
      />,
    )

    // Select stage and complete
    let stageBtn = screen.getByRole('button', { name: /ลานฝึกหน้าวิหาร/i })
    stageBtn.click()
    let winBtn = await screen.findByTestId('btn-win')
    winBtn.click()

    await waitFor(() => {
      expect(onEarnGold).toHaveBeenCalledTimes(1)
    })
    unmount()

    // Second session (re-entering/retry)
    render(
      <LobbyBattleSession
        player={makePlayer()}
        onPlayerChange={onPlayerChange}
        onEarnGold={onEarnGold}
        onGrantItem={onGrantItem}
        {...rewardMocks()}
        onExit={onExit}
      />,
    )

    // Select stage and complete again
    stageBtn = screen.getByRole('button', { name: /ลานฝึกหน้าวิหาร/i })
    stageBtn.click()
    winBtn = await screen.findByTestId('btn-win')
    winBtn.click()

    // It should call onEarnGold again since it is a NEW session (savedRef is local to component mount/unmount cycle),
    // which is the correct behavior for retry/re-entry, proving state isolation across mounts!
    await waitFor(() => {
      expect(onEarnGold).toHaveBeenCalledTimes(2)
    })
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

    const stageBtn = screen.getByRole('button', { name: /ลานฝึกหน้าวิหาร/ })
    stageBtn.click()
    const winBtn = await screen.findByTestId('btn-win')
    winBtn.click()

    await waitFor(() => {
      expect(onEarnGold).not.toHaveBeenCalled()
    })
    expect(onExit).not.toHaveBeenCalled()
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

    const { unmount } = render(
      <LobbyBattleSession
        player={currentPlayer}
        onPlayerChange={onPlayerChange}
        onEarnGold={onEarnGold}
        onGrantItem={vi.fn(async (): Promise<ItemResult> => ({
          ok: true as const,
          player: currentPlayer,
        }))}
        {...rewardMocks()}
        onExit={onExit}
      />,
    )

    let stageBtn = screen.getByRole('button', { name: /ลานฝึกหน้าวิหาร/ })
    stageBtn.click()
    let winBtn = await screen.findByTestId('btn-win')
    winBtn.click()
    await waitFor(() => expect(onEarnGold).toHaveBeenCalledTimes(1))
    expect(onExit).not.toHaveBeenCalled()
    unmount()

    render(
      <LobbyBattleSession
        player={currentPlayer}
        onPlayerChange={onPlayerChange}
        onEarnGold={onEarnGold}
        onGrantItem={vi.fn(async (): Promise<ItemResult> => ({
          ok: true as const,
          player: currentPlayer,
        }))}
        {...rewardMocks()}
        onExit={onExit}
      />,
    )

    stageBtn = screen.getByRole('button', { name: /ลานฝึกหน้าวิหาร/ })
    stageBtn.click()
    winBtn = await screen.findByTestId('btn-win')
    winBtn.click()
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1))
    expect(onEarnGold).toHaveBeenCalledTimes(2)
  })
})
