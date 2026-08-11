import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ROSTER } from '../../game/characters'
import { getWalkKit } from '../../game/walkKits'

/*
  ล็อกนโยบายการโหลดเฟรมล่วงหน้าของฉากเดิน (ข้อ #107 ใน docs/SPRITE-CONFORMANCE.md)

  ที่มา — วัดจริงบนโปรดักชัน 2026-08-11 ด้วย Resource Timing API:
    ยิงพรวด    96 คำขอภายในวินาทีเดียว เริ่มที่ 748ms หลังเปิดหน้า
    ยิงซ้ำ     144 คำขอ สำหรับ 97 URL = 1.48 เท่า
    ของเสีย    16 จาก 24 เฟรม idle โหลดมาแล้วฉากนี้วาดไม่ถึงเลย

  เทสต์นี้วัด "รูปแบบคำขอ" ที่โค้ดปล่อยออกมาจริง ๆ โดยดัก Image ทั้งคลาส ไม่ได้วัดพฤติกรรม
  เครือข่ายจริง (ทำไม่ได้ถ้าไม่มีเบราว์เซอร์) — สิ่งที่ล็อกได้คือ ยิงกี่ URL, ยิงอะไร,
  ยิงพร้อมกันกี่ตัว, และยิงซ้ำหรือเปล่า ซึ่งเป็นต้นเหตุของตัวเลขทั้งสามข้างบน

  requestedFrames เป็น state ระดับโมดูล จึงต้อง resetModules + import ใหม่ทุกเทสต์
  ไม่งั้นเทสต์ที่สองจะเห็นคิวว่างเปล่าเพราะเทสต์แรกสั่งโหลดไปหมดแล้ว
*/

const KIT = getWalkKit(ROSTER[0].model.kind)

/*
  เฟรม idle ที่ฉากนี้วาดถึงจริง — เขียนตายตัวโดยตั้งใจ ไม่ได้เรียกสูตรเดิมในซอร์สมาคำนวณซ้ำ
  ถ้าคำนวณจากสูตรเดียวกับที่โค้ดใช้ เทสต์จะพิสูจน์แค่ว่าเลขคณิตถูก (ผ่านเสมอ ต่อให้สูตรผิด)
  ชุดนี้มาจากการวัด: view.frame วิ่งแค่ 0-7 และ idleCount = 24 (ดู §B3 ของ SPRITE-CONFORMANCE)
  แก้ stride/idleCount เมื่อไหร่ (งาน #102) ต้องมาแก้บรรทัดนี้ด้วยตาตัวเอง — ตั้งใจให้แดง
*/
const REACHABLE_IDLE_INDEXES = [0, 3, 6, 9, 12, 15, 18, 21]

const PRELOAD_CONCURRENCY = 4

let requested: string[] = []
let inFlight: Array<{ settle: () => void; priority: string }> = []

class FakeImage {
  fetchPriority = 'auto'
  // เก็บทีละชนิด เพราะของจริงยิงแค่ load *หรือ* error อย่างใดอย่างหนึ่ง ไม่ใช่ทั้งคู่ —
  // ถ้า fake ยิงทั้งสองตัว คิวจะเดินหน้าสองก้าวต่อหนึ่งคำขอ แล้ววัดเพดานผิด
  private readonly handlers = new Map<string, () => void>()

  addEventListener(type: string, handler: () => void) {
    this.handlers.set(type, handler)
  }

  set src(url: string) {
    requested.push(url)
    inFlight.push({ settle: () => this.handlers.get('load')?.(), priority: this.fetchPriority })
  }
}

/** ปล่อยให้คำขอที่ค้างอยู่ "โหลดเสร็จ" ทีละตัวจนคิวหมด แล้วคืนจำนวนรอบที่ต้องใช้ */
function drainAll() {
  let rounds = 0
  while (inFlight.length > 0 && rounds < 500) {
    inFlight.shift()!.settle()
    rounds += 1
  }
  return rounds
}

async function mountScene() {
  vi.resetModules()
  const { WukongAdventure } = await import('./WukongAdventure')
  return render(<WukongAdventure characters={[ROSTER[0]]} mode="moonlight" />)
}

describe('WukongAdventure — นโยบายโหลดเฟรมล่วงหน้า', () => {
  beforeEach(() => {
    requested = []
    inFlight = []
    vi.stubGlobal('Image', FakeImage)
    // jsdom ไม่มี ResizeObserver — ฉากนี้ใช้วัดขนาด .scene จริงตอน mount
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  test('ไม่ยิงรวดเดียวทั้งกอง — พร้อมกันไม่เกินเพดาน แล้วค่อยไหลไปตัวถัดไป', async () => {
    await mountScene()

    // ของเดิมยิง 96 ตัวรวดเดียวตรงนี้
    expect(requested).toHaveLength(PRELOAD_CONCURRENCY)

    // ตัวหนึ่งเสร็จ = ปล่อยตัวถัดไปเข้ามาหนึ่งตัว ไม่ใช่ปล่อยทั้งกอง
    inFlight.shift()!.settle()
    expect(requested).toHaveLength(PRELOAD_CONCURRENCY + 1)
  })

  test('บอกเบราว์เซอร์ว่าเฟรมพวกนี้รอได้ (fetchPriority = low)', async () => {
    await mountScene()

    expect(inFlight.map((entry) => entry.priority)).toEqual(Array(PRELOAD_CONCURRENCY).fill('low'))
  })

  test('โหลดเฉพาะเฟรม idle ที่ฉากนี้วาดถึง — อีก 16 เฟรมต้องไม่ถูกยิงเลย', async () => {
    await mountScene()
    drainAll()

    const idleRequested = requested
      .filter((url) => url.startsWith(`${KIT.idlePrefix}-`))
      .map((url) => Number(url.slice(KIT.idlePrefix.length + 1, -'.webp'.length)))

    expect(idleRequested.toSorted((a, b) => a - b)).toEqual(REACHABLE_IDLE_INDEXES)
    expect(KIT.idleCount - REACHABLE_IDLE_INDEXES.length).toBe(16)
  })

  test('เฟรมที่ฉากวาดได้ต้องโหลดครบ — ไม่ให้แก้ปัญหายิงพรวดด้วยการเลิกพรีโหลด', async () => {
    await mountScene()
    drainAll()

    const walk = requested.filter((url) => url.startsWith(`${KIT.walkPrefix}-`))
    const turn = requested.filter((url) => url.startsWith(`${KIT.turnPrefix}-`))

    expect(walk).toHaveLength(64) // 8 ทิศ x 8 เฟรม
    expect(turn).toHaveLength(8)
    expect(requested).toHaveLength(64 + 8 + REACHABLE_IDLE_INDEXES.length)
  })

  test('เฟรมที่เห็นก่อนต้องได้คิวก่อน — ยืนหันหน้ามาก่อนเฟรมเดิน', async () => {
    await mountScene()

    expect(requested[0].startsWith(`${KIT.idlePrefix}-`)).toBe(true)
  })

  /*
    ข้อ #100/#106 — ขนาดของภาพต้องมาจากพิกเซลจริงของชีต ไม่ใช่จากกล่อง

    เดิม .sprite เป็น width/height:100% + object-fit:contain กล่องขนาดเดียวจึงบีบชีตคนละขนาด
    ให้ได้ตัวคนละขนาด (วัดจริง: ยืนใหญ่กว่าเดิน 81.5%) เทสต์นี้ล็อกว่า <img> ต้องถูกกำหนดขนาด
    เป็น px จริง และอัตราส่วนต้องเท่ากับชีตที่กำลังแสดง

    396/376 เขียนตายตัวโดยตั้งใจ ไม่ได้เรียกตารางเทียบพิกเซลมาคำนวณซ้ำ — ถ้าคำนวณจากตาราง
    เดียวกับที่โค้ดใช้ เทสต์จะพิสูจน์แค่ว่าเลขคณิตตรงกับตัวเอง เลขนี้มาจากไฟล์จริง
    (ดู "Frame inventory" ใน docs/SPRITE-CONFORMANCE.md — ชีตยืน/หันทิศของซุนหงอคง)
  */
  test('ขนาดภาพมาจากชีต ไม่ใช่จากกล่อง — และได้อัตราส่วนของชีตนั้นจริง (#100)', async () => {
    const { container } = await mountScene()
    const sprite = container.querySelector('img')!

    expect(sprite.style.width).toMatch(/px$/)
    expect(sprite.style.height).toMatch(/px$/)
    expect(sprite.style.bottom).toMatch(/px$/)

    const width = Number.parseFloat(sprite.style.width)
    const height = Number.parseFloat(sprite.style.height)
    expect(width / height).toBeCloseTo(396 / 376, 4)
  })

  test('mount ใหม่ไม่ยิงชุดเดิมซ้ำ (ต้นเหตุอัตราซ้ำ 1.48 เท่า)', async () => {
    vi.resetModules()
    const { WukongAdventure } = await import('./WukongAdventure')

    render(<WukongAdventure characters={[ROSTER[0]]} mode="moonlight" />)
    drainAll()
    const firstMount = requested.length
    cleanup()

    render(<WukongAdventure characters={[ROSTER[0]]} mode="moonlight" />)
    drainAll()

    expect(firstMount).toBeGreaterThan(0)
    expect(requested).toHaveLength(firstMount)
  })
})
