import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MainNavigation } from './MainNavigation'
import { ToastProvider } from '../Toast/ToastProvider'

/*
  MainNavigation คือ chrome ที่ mount ค้างตลอด lobby — ประตูเดียวเข้าสู่ battle/heroes/items
  และเมนูอื่น ๆ ที่ยังไม่เปิด (comingSoon ผ่าน ToastProvider จริง ไม่ mock เพราะ useToast()
  throw ถ้าไม่มี provider ครอบ — ต้องเทสต์ผ่าน context จริงเหมือนที่ใช้งานจริงในแอป)
*/

function renderNav(overrides: Partial<Parameters<typeof MainNavigation>[0]> = {}) {
  const onOpenHeroes = vi.fn()
  const onOpenBattle = vi.fn()
  const onOpenItems = vi.fn()
  const onOpenSummon = vi.fn()
  render(
    <ToastProvider>
      <MainNavigation
        onOpenHeroes={onOpenHeroes}
        onOpenBattle={onOpenBattle}
        onOpenItems={onOpenItems}
        onOpenSummon={onOpenSummon}
        {...overrides}
      />
    </ToastProvider>,
  )
  return { onOpenHeroes, onOpenBattle, onOpenItems, onOpenSummon }
}

describe('MainNavigation', () => {
  test('render ครบ 8 ปุ่มเมนู ภายใต้ nav ที่มี label', () => {
    renderNav()

    expect(screen.getByRole('navigation', { name: 'เมนูหลัก' })).toBeInTheDocument()
    for (const label of [
      'ต่อสู้',
      'ตัวละคร',
      'สัตว์เลี้ยง',
      'ค่ายฝึก',
      'จัดทีม',
      'ไอเทม',
      'อัญเชิญ',
      'กิลด์',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  test('กด "ตัวละคร" เรียก onOpenHeroes เท่านั้น ไม่ยิง callback อื่น', async () => {
    const user = userEvent.setup()
    const { onOpenHeroes, onOpenBattle, onOpenItems } = renderNav()

    await user.click(screen.getByRole('button', { name: 'ตัวละคร' }))

    expect(onOpenHeroes).toHaveBeenCalledTimes(1)
    expect(onOpenBattle).not.toHaveBeenCalled()
    expect(onOpenItems).not.toHaveBeenCalled()
  })

  test('กด "ต่อสู้" เรียก onOpenBattle', async () => {
    const user = userEvent.setup()
    const { onOpenBattle } = renderNav()

    await user.click(screen.getByRole('button', { name: 'ต่อสู้' }))

    expect(onOpenBattle).toHaveBeenCalledTimes(1)
  })

  test('กด "ไอเทม" เรียก onOpenItems', async () => {
    const user = userEvent.setup()
    const { onOpenItems } = renderNav()

    await user.click(screen.getByRole('button', { name: 'ไอเทม' }))

    expect(onOpenItems).toHaveBeenCalledTimes(1)
  })

  test('กด "อัญเชิญ" เรียก onOpenSummon', async () => {
    const user = userEvent.setup()
    const { onOpenSummon } = renderNav()

    await user.click(screen.getByRole('button', { name: 'อัญเชิญ' }))

    expect(onOpenSummon).toHaveBeenCalledTimes(1)
  })

  test('กดเมนูที่ยังไม่เปิด (เช่น "กิลด์") ไม่เรียก callback ไหนเลย แต่ขึ้น toast comingSoon', async () => {
    const user = userEvent.setup()
    const { onOpenHeroes, onOpenBattle, onOpenItems } = renderNav()

    await user.click(screen.getByRole('button', { name: 'กิลด์' }))

    expect(onOpenHeroes).not.toHaveBeenCalled()
    expect(onOpenBattle).not.toHaveBeenCalled()
    expect(onOpenItems).not.toHaveBeenCalled()
    expect(await screen.findByText('กิลด์ — เร็ว ๆ นี้')).toBeInTheDocument()
  })
})
