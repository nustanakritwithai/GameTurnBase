import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  getSessionPlayer,
  importSave,
  login,
  register,
  savePlayer,
  COUPONS,
  earnGold,
  redeemCoupon,
  topUpGold,
  topUpGems,
  getTransactions,
  type StoredAccount,
} from './accountRepository'
import { GAME_INFO } from '../game/gameInfo'

/*
  ไฟล์ save ที่นำเข้ามาคือข้อมูลจากภายนอกที่ผู้เล่นแก้เองได้ทั้งก้อน

  ก่อนแก้ ตัวตรวจดูแค่ฟิลด์ของบัญชี (exportVersion/uid/email/passwordHash) ไม่ได้ดู player
  ลำดับใน importSave คือเขียนบัญชีลง localStorage แล้วตั้ง session ให้เรียบร้อยก่อน
  จากนั้นค่อยอ่าน player ซึ่งจะโยนข้อผิดพลาดถ้าไม่มี ผลคือไฟล์ที่ไม่มี player ทำให้เกม
  เปิดไม่ได้ถาวร เพราะทุกครั้งที่โหลดหน้า getSessionPlayer จะเจอข้อผิดพลาดเดิมซ้ำ
  ทางออกเดียวคือให้ผู้เล่นล้าง localStorage เอง
*/

function saveFile(account: unknown): string {
  return JSON.stringify({ exportVersion: 1, exportedAt: new Date().toISOString(), account })
}

const VALID_PLAYER = {
  name: 'ผู้ทดสอบ',
  level: 1,
  currency: { gold: 0, gem: 0 },
}

describe('importSave', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('ปฏิเสธไฟล์ที่ไม่มี player แทนที่จะเขียนลงที่เก็บข้อมูลก่อนแล้วค่อยพัง', async () => {
    const result = await importSave(
      saveFile({ uid: '1234567890', email: 'a@b.co', passwordHash: '600000:AAAA' }),
    )

    expect(result.ok).toBe(false)
    // สำคัญกว่าค่า ok: ต้องไม่มีอะไรถูกเขียนทิ้งไว้เลย ไม่งั้นโหลดหน้าใหม่ก็ยังพังอยู่
    expect(localStorage.length).toBe(0)
    expect(await getSessionPlayer()).toBeNull()
  })

  test('ปฏิเสธไฟล์ที่ player มีอยู่แต่ไม่มีชื่อ', async () => {
    const result = await importSave(
      saveFile({
        uid: '1234567890',
        email: 'a@b.co',
        passwordHash: '600000:AAAA',
        player: { level: 1 },
      }),
    )

    expect(result.ok).toBe(false)
    expect(localStorage.length).toBe(0)
  })

  test('ยอมรับไฟล์ที่ครบถ้วน แล้วเข้าสู่ระบบให้ทันที', async () => {
    const result = await importSave(
      saveFile({
        uid: '1234567890',
        email: 'a@b.co',
        passwordHash: '600000:AAAA',
        player: VALID_PLAYER,
      }),
    )

    expect(result.ok).toBe(true)
    expect((await getSessionPlayer())?.name).toBe('ผู้ทดสอบ')
  })

  /*
    work contract #14 (Progression System) done-criterion #4: บัญชีเก่าก่อนมีระบบเลเวลสกิล
    ไม่มีฟิลด์ skillLevels บน ownedCharacters เลย — เหมือน inventory ?? []/friends ?? []
    ด้านบน ต้องเติม default ให้ ไม่ใช่ปล่อยให้ UI ที่ deref owned.skillLevels.skill1 พังตอนเรนเดอร์
  */
  test('บัญชีเก่าก่อนมีระบบเลเวลสกิล — ownedCharacters ไม่มี skillLevels ก็ยังโหลดได้ ไม่พัง', async () => {
    const result = await importSave(
      saveFile({
        uid: '1234567890',
        email: 'legacy-skill@b.co',
        passwordHash: '600000:AAAA',
        player: {
          ...VALID_PLAYER,
          ownedCharacters: [
            {
              characterId: 'monkey-king',
              level: 5,
              exp: 0,
              expToNext: 100,
              obtainedAt: '2026-01-01T00:00:00.000Z',
              // ไม่มี skillLevels — จำลองข้อมูลเก่าจริง
            },
          ],
        },
      }),
    )

    expect(result.ok).toBe(true)
    const player = await getSessionPlayer()
    const owned = player?.ownedCharacters[0]
    expect(owned?.skillLevels).toEqual({
      skill1: { level: 1, exp: 0, expToNext: 200 },
      skill2: { level: 1, exp: 0, expToNext: 200 },
      skill3: { level: 1, exp: 0, expToNext: 200 },
      ultimate: { level: 1, exp: 0, expToNext: 200 },
    })
  })
})

/*
  loadDb เคยคืนค่าคงที่ตัวเดียวร่วมกันแทนที่จะเป็นอ็อบเจ็กต์ใหม่ ผู้เรียกทุกรายแก้ผลลัพธ์
  ตรง ๆ บัญชีจากการสมัครที่บันทึกไม่สำเร็จจึงค้างอยู่ในตัวคงที่นั้น แล้ว login ครั้งถัดไป
  ในแท็บเดิมผ่านได้ทั้งที่ไม่มีอะไรถูกบันทึกจริง
*/
describe('accounts — สถานะไม่รั่วข้ามการอ่านฐานข้อมูลแต่ละครั้ง', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('บัญชีที่สมัครในรอบก่อนไม่ค้างมาให้รอบใหม่เห็น หลังล้างที่เก็บข้อมูล', async () => {
    const registered = await register('ghost@b.co', 'passw0rd!')
    expect(registered.ok).toBe(true)

    localStorage.clear()

    const relogin = await login('ghost@b.co', 'passw0rd!')
    expect(relogin.ok).toBe(false)
  })
})

/*
  ผู้เล่นเปิดเกมพร้อมกันสองแท็บได้ (localStorage ใช้ร่วมกันทั้งเบราว์เซอร์) — saveDb ต้องปฏิเสธ
  การเขียนทับถ้าอีกแท็บเขียนแซงไปแล้วตั้งแต่ตอนแท็บนี้ loadDb ไม่งั้นข้อมูลของแท็บที่เขียน
  ก่อนหายไปเงียบ ๆ โดยไม่มีอะไรบอก (resilience-canary, 2026-08-07)
*/
describe('saveDb — เขียนชนกันข้ามแท็บต้องไม่ทับข้อมูลกันเงียบ ๆ', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('แท็บ A ถือสำเนาเก่าไว้ระหว่างแท็บ B เขียนแซง — แท็บ A save ไม่ผ่าน ข้อมูลแท็บ B ไม่ถูกทับ', async () => {
    const registered = await register('race@b.co', 'passw0rd!')
    expect(registered.ok).toBe(true)
    if (!registered.ok) return

    // แท็บ A "ถือ" สำเนาฐานข้อมูล ณ ตอนสมัครเสร็จไว้ในมือ (rev ก่อนแท็บ B เขียน)
    const staleRaw = localStorage.getItem('los:db:v1')
    expect(staleRaw).not.toBeNull()

    // แท็บ B เขียนสำเร็จไปแล้วจริง ๆ ก่อนแท็บ A — rev ขยับขึ้นในสตอเรจจริง
    const tabB = await savePlayer({ ...registered.player, name: 'จากแท็บ B' })
    expect(tabB).toBe(true)

    // แท็บ A save ด้วยสำเนาที่ค้างอยู่ในมือ — เลียนแบบ race จริงด้วยการทำให้ getItem
    // ครั้งแรก (loadDb ภายใน savePlayer ของแท็บ A) เห็นสำเนาเก่าที่ยึดไว้ตอนต้น ส่วน getItem
    // ครั้งถัดไป (การเช็ค rev ปัจจุบันข้างใน saveDb) อ่านค่าจริงบน localStorage ตามปกติ
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => staleRaw)
    const tabA = await savePlayer({ ...registered.player, name: 'จากแท็บ A' })
    spy.mockRestore()

    expect(tabA).toBe(false)
    expect((await getSessionPlayer())?.name).toBe('จากแท็บ B')
  })
})

/*
  เดิม session ไม่มีวันหมดอายุเลย — เขียนแค่ uid/email ไม่มี timestamp ผู้เล่นที่ล็อกอินครั้ง
  เดียวจะเข้าเกมได้ตลอดไปไม่มีเงื่อนไข ต่อให้ปิดแท็บทิ้งไว้เป็นปี (รายงานจาก HetCreep 2026-08-07)
*/
describe('session — หมดอายุแบบ sliding window ไม่ใช่ค้าง login ตลอดไป', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('ไม่แตะเลย 31 วัน — session หมดอายุ ต้องล็อกอินใหม่', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-01-01T00:00:00.000Z')
    vi.setSystemTime(now)

    const registered = await register('sleepy@b.co', 'passw0rd!')
    expect(registered.ok).toBe(true)
    expect(await getSessionPlayer()).not.toBeNull()

    vi.setSystemTime(new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000))
    expect(await getSessionPlayer()).toBeNull()
  })

  test('เล่นต่อเนื่องทุกไม่กี่วัน — session ต่ออายุ (sliding) ไม่หลุดแม้รวมเกิน 30 วัน', async () => {
    vi.useFakeTimers()
    const start = new Date('2026-01-01T00:00:00.000Z')
    vi.setSystemTime(start)

    const registered = await register('active@b.co', 'passw0rd!')
    expect(registered.ok).toBe(true)

    // เข้าเกมทุก 10 วัน รวม 6 รอบ (60 วัน) — ถ้าเป็นวันหมดอายุตายตัวจะหลุดตั้งแต่รอบที่ 4
    for (let i = 1; i <= 6; i++) {
      vi.setSystemTime(new Date(start.getTime() + i * 10 * 24 * 60 * 60 * 1000))
      expect(await getSessionPlayer()).not.toBeNull()
    }
  })

  test('session รูปแบบเก่าที่ไม่มี expiresAt เลย ถือว่าหมดอายุทันที ไม่ใช่ค้าง login ไม่จำกัดเวลา', async () => {
    const registered = await register('legacy@b.co', 'passw0rd!')
    expect(registered.ok).toBe(true)

    // จำลอง session ที่เขียนไว้ก่อนมีฟีเจอร์นี้ (ไม่มี expiresAt)
    const raw = localStorage.getItem('los:session:v1')
    expect(raw).not.toBeNull()
    const legacy = { ...JSON.parse(raw as string) }
    delete legacy.expiresAt
    localStorage.setItem('los:session:v1', JSON.stringify(legacy))

    expect(await getSessionPlayer()).toBeNull()
  })

  test('เกมอัปเดต (เลขเวอร์ชันเปลี่ยน) — session เก่าหมดอายุทันที ไม่ต้องรอครบ 30 วัน', async () => {
    const registered = await register('updated@b.co', 'passw0rd!')
    expect(registered.ok).toBe(true)
    expect(await getSessionPlayer()).not.toBeNull()

    // จำลองว่า build ใหม่ถูก deploy — session ที่มีอยู่เดิมยังถืออีเมล/uid เดิม แต่ตราด้วย
    // เวอร์ชันเก่าอยู่ (GAME_INFO.version ตอนนี้ต่างจากตอนที่ session ถูกเขียน)
    const raw = localStorage.getItem('los:session:v1')
    expect(raw).not.toBeNull()
    const stale = { ...JSON.parse(raw as string), appVersion: `${GAME_INFO.version}-เก่ากว่านี้` }
    localStorage.setItem('los:session:v1', JSON.stringify(stale))

    expect(await getSessionPlayer()).toBeNull()
  })
})

describe('Currency System', () => {
  let uidA = ''
  let uidB = ''

  beforeEach(async () => {
    localStorage.clear()

    // สร้าง 2 บัญชีเพื่อใช้ทดสอบ cross-account
    const regA = await register('currency-a@b.co', 'passw0rd123')
    const regB = await register('currency-b@b.co', 'passw0rd456')

    if (regA.ok && regB.ok) {
      // ดึง uid จากบัญชีที่สร้างขึ้นมา
      const rawA = localStorage.getItem('los:db:v1')
      if (rawA) {
        const db = JSON.parse(rawA)
        const entries = Object.entries(db.accounts || {}) as [string, StoredAccount][]
        const entA = entries.find(([, acc]) => acc.email === 'currency-a@b.co')
        const entB = entries.find(([, acc]) => acc.email === 'currency-b@b.co')
        if (entA) uidA = entA[1].uid
        if (entB) uidB = entB[1].uid
      }
    }
  })

  afterEach(() => {
    // ลบคูปองทดสอบหลังเทสแต่ละเคสเสร็จ
    delete COUPONS.TEST_LIMIT
    delete COUPONS.TEST_EXPIRED
  })

  describe('earnGold', () => {
    test('เพิ่มทองสำเร็จ ยอดทองในตัวเพิ่มขึ้น และบันทึก transaction', async () => {
      // ดึงข้อมูลผู้เล่นก่อน
      const db = JSON.parse(localStorage.getItem('los:db:v1') || '{}')
      const initialGold = db.accounts['currency-a@b.co']?.player.currency.gold || 0

      const result = await earnGold(uidA, 'quest', 500, 'quest-123')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.player.currency.gold).toBe(initialGold + 500)
      }

      const txs = await getTransactions(uidA)
      expect(txs.length).toBe(1)
      expect(txs[0].currency).toBe('gold')
      expect(txs[0].source).toBe('quest')
      expect(txs[0].amount).toBe(500)
      expect(txs[0].refId).toBe('quest-123')
    })

    test('ปฏิเสธทองที่จำนวน <= 0 หรือไม่ใช่จำนวนเต็ม', async () => {
      const resZero = await earnGold(uidA, 'quest', 0)
      expect(resZero.ok).toBe(false)
      if (!resZero.ok) {
        expect(resZero.error).toBe('จำนวนทองไม่ถูกต้อง')
      }

      const resNegative = await earnGold(uidA, 'quest', -100)
      expect(resNegative.ok).toBe(false)
      if (!resNegative.ok) {
        expect(resNegative.error).toBe('จำนวนทองไม่ถูกต้อง')
      }

      const resFloat = await earnGold(uidA, 'quest', 50.5)
      expect(resFloat.ok).toBe(false)
      if (!resFloat.ok) {
        expect(resFloat.error).toBe('จำนวนทองไม่ถูกต้อง')
      }
    })

    test('ปฏิเสธหากไม่พบ uid ของผู้เล่น', async () => {
      const result = await earnGold('non-existent-uid', 'quest', 100)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('ไม่พบบัญชีผู้เล่น')
      }
    })
  })

  describe('topUpGold / topUpGems', () => {
    test('เติมทองสำเร็จตามแพ็กเกจ และบันทึก transaction', async () => {
      const db = JSON.parse(localStorage.getItem('los:db:v1') || '{}')
      const initialGold = db.accounts['currency-a@b.co']?.player.currency.gold || 0

      const result = await topUpGold(uidA, 'gold-medium')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.player.currency.gold).toBe(initialGold + 5500)
      }

      const txs = await getTransactions(uidA)
      expect(txs[0].currency).toBe('gold')
      expect(txs[0].source).toBe('topup')
      expect(txs[0].amount).toBe(5500)
      expect(txs[0].refId).toBe('gold-medium')
    })

    test('เติมหยกสำเร็จตามแพ็กเกจ และบันทึก transaction', async () => {
      const db = JSON.parse(localStorage.getItem('los:db:v1') || '{}')
      const initialGems = db.accounts['currency-a@b.co']?.player.currency.gem || 0

      const result = await topUpGems(uidA, 'gem-large')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.player.currency.gem).toBe(initialGems + 980)
      }

      const txs = await getTransactions(uidA)
      expect(txs[0].currency).toBe('gem')
      expect(txs[0].source).toBe('topup')
      expect(txs[0].amount).toBe(980)
      expect(txs[0].refId).toBe('gem-large')
    })

    test('ปฏิเสธแพ็กเกจเติมเงินที่ไม่ถูกต้อง', async () => {
      const resGold = await topUpGold(uidA, 'invalid-gold-pack')
      expect(resGold.ok).toBe(false)
      if (!resGold.ok) {
        expect(resGold.error).toBe('ไม่พบแพ็กเกจทองนี้')
      }

      const resGem = await topUpGems(uidA, 'invalid-gem-pack')
      expect(resGem.ok).toBe(false)
      if (!resGem.ok) {
        expect(resGem.error).toBe('ไม่พบแพ็กเกจหยกนี้')
      }
    })
  })

  describe('redeemCoupon', () => {
    test('แลกคูปองสำเร็จ ได้หยกเพิ่มขึ้น และบันทึก transaction', async () => {
      const db = JSON.parse(localStorage.getItem('los:db:v1') || '{}')
      const initialGems = db.accounts['currency-a@b.co']?.player.currency.gem || 0

      const result = await redeemCoupon(uidA, 'welcome2026')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.player.currency.gem).toBe(initialGems + 50)
      }

      const txs = await getTransactions(uidA)
      expect(txs[0].currency).toBe('gem')
      expect(txs[0].source).toBe('coupon')
      expect(txs[0].amount).toBe(50)
      expect(txs[0].refId).toBe('WELCOME2026')
    })

    test('ปฏิเสธโค้ดคูปองที่ไม่มีอยู่จริง', async () => {
      const result = await redeemCoupon(uidA, 'INVALIDCOUPON')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('โค้ดนี้ไม่ถูกต้องหรือหมดอายุแล้ว')
      }
    })

    test('ปฏิเสธคูปองที่หมดอายุแล้ว', async () => {
      COUPONS.TEST_EXPIRED = { gem: 10, expiresAt: '2020-01-01T00:00:00.000Z' }

      const result = await redeemCoupon(uidA, 'TEST_EXPIRED')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('โค้ดนี้หมดอายุแล้ว')
      }
    })

    test('ปฏิเสธการแลกซ้ำบนบัญชีเดียวกัน', async () => {
      const first = await redeemCoupon(uidA, 'WELCOME2026')
      expect(first.ok).toBe(true)

      const second = await redeemCoupon(uidA, 'WELCOME2026')
      expect(second.ok).toBe(false)
      if (!second.ok) {
        expect(second.error).toBe('ใช้โค้ดนี้ไปแล้ว')
      }
    })

    test('ปฏิเสธการแลกหากโควตารวม (maxRedemptions) เต็มแล้ว (Cross-account validation)', async () => {
      COUPONS.TEST_LIMIT = { gem: 10, maxRedemptions: 1 }

      // บัญชีแรกแลกคูปองจำกัดโควตา -> สำเร็จ
      const first = await redeemCoupon(uidA, 'TEST_LIMIT')
      expect(first.ok).toBe(true)

      // บัญชีที่สองพยายามแลกคูปองเดียวกัน -> ต้องถูกปฏิเสธเนื่องจากเต็มโควตาแล้ว
      const second = await redeemCoupon(uidB, 'TEST_LIMIT')
      expect(second.ok).toBe(false)
      if (!second.ok) {
        expect(second.error).toBe('โค้ดนี้ถูกใช้ครบจำนวนแล้ว')
      }
    })
  })

  describe('getTransactions ordering', () => {
    test('ประวัติธุรกรรมเรียงจากเก่าไปใหม่', async () => {
      await earnGold(uidA, 'quest', 100, 'first')
      await earnGold(uidA, 'quest', 200, 'second')
      await topUpGems(uidA, 'gem-small') // 60 gems

      const txs = await getTransactions(uidA)
      expect(txs.length).toBe(3)
      expect(txs[0].refId).toBe('first')
      expect(txs[1].refId).toBe('second')
      expect(txs[2].refId).toBe('gem-small')
    })
  })
})
