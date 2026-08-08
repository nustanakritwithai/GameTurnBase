import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { BattleScene } from './BattleScene'
import type { RealtimeBattleResult } from '../../game/realtimeBattle/types'
import type { RealtimeBattleSnapshot } from '../../game/realtimeBattle/types'
import type { Player } from '../../types/player'
import { EMPTY_PROGRESS } from '../../types/player'
import { createDefaultSkillLevels } from '../../game/realtimeBattle/SkillProgressionSystem'

const mockRequestExit = vi.fn()
const mockSetJoystick = vi.fn()
const mockPressAttack = vi.fn()
const mockPressSkill = vi.fn()
let mockOnCompleteFromHook: ((result: RealtimeBattleResult) => void) | null = null

vi.mock('../../hooks/useRealtimeBattle', () => ({
  useRealtimeBattle: ({ onComplete }: { onComplete: (result: RealtimeBattleResult) => void }) => {
    mockOnCompleteFromHook = onComplete
    return {
      phase: 'ready' as const,
      errorMessage: null,
      runtime: { subscribe: () => () => {} },
      snapshot: { status: 'running' } as RealtimeBattleSnapshot,
      requestExit: mockRequestExit,
      setJoystick: mockSetJoystick,
      pressAttack: mockPressAttack,
      pressSkill: mockPressSkill,
    }
  },
}))

vi.mock('./RealtimeBattleRoom', () => ({
  RealtimeBattleRoom: () => <div data-testid="battle-room" />,
}))

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
        level: 1,
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

const victory: RealtimeBattleResult = {
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
}

describe('BattleScene victory exit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOnCompleteFromHook = null
  })

  it('calls onComplete once when continue is pressed — duplicate clicks ignored', async () => {
    const onComplete = vi.fn()
    const onExit = vi.fn()

    render(
      <BattleScene
        player={makePlayer()}
        stageId="trial-01"
        onComplete={onComplete}
        onExit={onExit}
      />,
    )

    act(() => {
      mockOnCompleteFromHook?.(victory)
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    const button = screen.getByRole('button', { name: 'กลับล็อบบี้' })
    fireEvent.click(button)
    fireEvent.click(button)

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith(victory)
    expect(onExit).not.toHaveBeenCalled()
  })
})
