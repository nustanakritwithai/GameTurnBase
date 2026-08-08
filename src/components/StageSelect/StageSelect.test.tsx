import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StageSelect } from './StageSelect'
import { EMPTY_PROGRESS } from '../../types/player'

/**
 * เทสต์ตาม Done-criteria #2 (docs/agent-blueprint/16-stage-adventure-system.md):
 * "A stage-select surface lists only unlocked stages"
 */

describe('StageSelect', () => {
  it('ไม่แสดงสนามทดสอบ dungeon-p5-test', () => {
    render(<StageSelect progress={EMPTY_PROGRESS} onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /ดันเจี้ยนทดสอบ/ })).not.toBeInTheDocument()
  })

  it('ด่านแรกกดได้ ด่านถัดไปที่ยังไม่ปลดล็อกกดไม่ได้ (disabled)', () => {
    render(<StageSelect progress={EMPTY_PROGRESS} onSelect={vi.fn()} onClose={vi.fn()} />)

    const first = screen.getByRole('button', { name: /ลานฝึกหน้าวิหาร/ })
    const second = screen.getByRole('button', { name: /ประตูปีศาจ/ })

    expect(first).toBeEnabled()
    expect(second).toBeDisabled()
  })

  it('กดด่านที่ปลดล็อกแล้วเรียก onSelect ด้วย stageId ที่ถูกต้อง', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<StageSelect progress={EMPTY_PROGRESS} onSelect={onSelect} onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /ลานฝึกหน้าวิหาร/ }))

    expect(onSelect).toHaveBeenCalledWith('trial-01')
  })

  it('กดด่านที่ล็อกอยู่ไม่เรียก onSelect เลย', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<StageSelect progress={EMPTY_PROGRESS} onSelect={onSelect} onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /ประตูปีศาจ/ }))

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('เคลียร์ด่านแรกแล้ว ด่านบอสถัดไปปลดล็อกและกดได้', () => {
    const cleared = { ...EMPTY_PROGRESS, flags: { 'trial_cleared_trial-01': true } }
    render(<StageSelect progress={cleared} onSelect={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByRole('button', { name: /ประตูปีศาจ/ })).toBeEnabled()
  })
})
