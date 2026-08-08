import { describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CharacterRosterModal } from './CharacterRosterModal'
import { ToastProvider } from '../Toast/ToastProvider'
import { createDefaultSkillLevels } from '../../game/realtimeBattle/SkillProgressionSystem'
import { EMPTY_PROGRESS, type Player, type OwnedCharacter } from '../../types/player'

/*
  หน้าทำเนียบวีรชนคือทางเดียวที่ผู้เล่นดูตัวละครที่ครอบครองอยู่ทั้งหมด — ถ้า roster
  render ผิด (ตัวละครหาย, การ์ดกดเลือกไม่ได้, แผงรายละเอียดไม่อัปเดตตามตัวที่เลือก)
  ผู้เล่นจะเข้าไม่ถึงตัวละครของตัวเองเลย
*/

function buildPlayer(): Player {
  return {
    id: 'p1',
    uid: '1234567890',
    name: 'ผู้เล่นทดสอบ',
    title: 'นักรบมือใหม่',
    level: 5,
    exp: 100,
    expToNext: 500,
    currency: { gold: 1000, gem: 50 },
    ownedCharacters: [
      {
        characterId: 'monkey-king',
        level: 40,
        exp: 7320,
        expToNext: 12000,
        obtainedAt: '2026-01-01T00:00:00.000Z',
        skillLevels: createDefaultSkillLevels(),
      },
      {
        characterId: 'pig-warrior',
        level: 38,
        exp: 5140,
        expToNext: 11000,
        obtainedAt: '2026-01-02T00:00:00.000Z',
        skillLevels: createDefaultSkillLevels(),
      },
    ],
    inventory: [],
    friends: [],
    teamSlots: [null, null, null, null],
    frameId: 'default',
    progress: EMPTY_PROGRESS,
  }
}

// CharacterStats เรียก useToast() ซึ่ง throw ถ้าไม่มี ToastProvider ครอบอยู่ — ต้องครอบทุกครั้ง
function renderModal(onClose = vi.fn(), onPlayerChange = vi.fn(async () => true)) {
  const player = buildPlayer()
  render(
    <ToastProvider>
      <CharacterRosterModal player={player} onClose={onClose} onPlayerChange={onPlayerChange} />
    </ToastProvider>,
  )
  return { onClose, onPlayerChange }
}

describe('CharacterRosterModal', () => {
  test('render ด้วยข้อมูลผู้เล่นจริง — เห็นตัวละครที่ครอบครองครบและเลือกตัวแรกไว้ก่อน', () => {
    renderModal()

    expect(screen.getByRole('dialog', { name: 'ตัวละครทั้งหมดของฉัน' })).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument() // จำนวนขุนพลที่ครอบครอง

    const monkeyCard = screen.getByRole('button', { name: /ซุนหงอคง เลเวล 40/ })
    const pigCard = screen.getByRole('button', { name: /ตือโป๊ยก่าย เลเวล 38/ })
    expect(monkeyCard).toHaveAttribute('aria-pressed', 'true')
    expect(pigCard).toHaveAttribute('aria-pressed', 'false')

    // แผงรายละเอียดแสดงตัวที่เลือกไว้เป็นค่าเริ่มต้น (ตัวแรกใน ownedCharacters)
    expect(screen.getByRole('heading', { name: 'ซุนหงอคง' })).toBeInTheDocument()
  })

  test('ปุ่มสำคัญทุกตัวมี label ที่ screen reader อ่านได้', () => {
    renderModal()

    expect(screen.getByRole('list', { name: 'รายชื่อขุนพล' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ย้อนกลับสู่ลานประลอง' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ปิดหน้าตัวละครทั้งหมดของฉัน' })).toBeInTheDocument()
  })

  test('กดการ์ดตัวละครตัวอื่น — สลับตัวที่เลือกและอัปเดตแผงรายละเอียดจริง', async () => {
    const user = userEvent.setup()
    renderModal()

    const pigCard = screen.getByRole('button', { name: /ตือโป๊ยก่าย เลเวล 38/ })
    await user.click(pigCard)

    expect(pigCard).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /ซุนหงอคง เลเวล 40/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    // แผงสถานะฝั่งขวาต้องตามตัวที่เลือกใหม่ ไม่ใช่ค้างตัวเดิม
    expect(screen.getByRole('heading', { name: 'ตือโป๊ยก่าย' })).toBeInTheDocument()
  })

  test('กดปุ่มปิด — เล่นแอนิเมชันปิดแล้วค่อยเรียก onClose (ไม่ปิดทันที)', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()

    await user.click(screen.getByRole('button', { name: 'ปิดหน้าตัวละครทั้งหมดของฉัน' }))

    expect(onClose).not.toHaveBeenCalled()
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  test('Done-criterion 4: handles ownedCharacters without skillLevels field gracefully (backward compatibility)', () => {
    const legacyPlayer: Player = {
      ...buildPlayer(),
      ownedCharacters: [
        {
          characterId: 'monkey-king',
          level: 40,
          exp: 7320,
          expToNext: 12000,
          obtainedAt: '2026-01-01T00:00:00.000Z',
          // skillLevels is missing
        } as unknown as OwnedCharacter,
      ],
    }

    render(
      <ToastProvider>
        <CharacterRosterModal
          player={legacyPlayer}
          onClose={vi.fn()}
          onPlayerChange={vi.fn(async () => true)}
        />
      </ToastProvider>,
    )

    // Should render successfully and show "เลเวล 1" for skills
    expect(screen.getByRole('heading', { name: 'ซุนหงอคง' })).toBeInTheDocument()
    expect(screen.getAllByText(/เลเวล 1/)).toHaveLength(4) // 4 skills start at lvl 1
  })
})
