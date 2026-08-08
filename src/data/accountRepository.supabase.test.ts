import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createDefaultSkillLevels } from '../game/realtimeBattle/SkillProgressionSystem'
import { mapOwnedCharacterRow } from './accountRepository.supabase.mapping'

/*
  work contract #14 (docs/agent-blueprint/14-progression-system.md) done-criterion #1:
  shape parity ระหว่าง accountRepository.ts (localStorage) กับ accountRepository.supabase.ts
  — เทสต์นี้ล็อกฝั่ง Supabase (pure mapping ล้วน ไม่ต้องมี Supabase จริงรัน)
*/

describe('mapOwnedCharacterRow', () => {
  test('แถวเก่าก่อน migration 0005 ไม่มี skill_levels — เติม default เดียวกับ createDefaultSkillLevels()', () => {
    const owned = mapOwnedCharacterRow({
      character_id: 'monkey-king',
      level: 5,
      exp: 0,
      exp_to_next: 100,
      obtained_at: '2026-01-01T00:00:00.000Z',
    })

    expect(owned.skillLevels).toEqual(createDefaultSkillLevels())
  })

  test('แถวที่มี skill_levels อยู่แล้ว — ใช้ค่าจริงจาก DB ไม่ทับด้วย default', () => {
    const stored = {
      skill1: { level: 5, exp: 10, expToNext: 400 },
      skill2: { level: 1, exp: 0, expToNext: 200 },
      skill3: { level: 1, exp: 0, expToNext: 200 },
      ultimate: { level: 2, exp: 0, expToNext: 240 },
    }
    const owned = mapOwnedCharacterRow({
      character_id: 'monkey-king',
      level: 5,
      exp: 0,
      exp_to_next: 100,
      obtained_at: '2026-01-01T00:00:00.000Z',
      skill_levels: stored,
    })

    expect(owned.skillLevels).toEqual(stored)
  })

  test('แถวที่มี talent_state / awakening_state — map ตรง shape OwnedCharacter', () => {
    const owned = mapOwnedCharacterRow({
      character_id: 'monkey-king',
      level: 2,
      exp: 10,
      exp_to_next: 90,
      obtained_at: '2026-01-01T00:00:00.000Z',
      talent_state: { unlockedNodes: ['mk-talent-1'] },
      awakening_state: { tier: 1, unlockedEffects: [] },
    })

    expect(owned.talentState).toEqual({ unlockedNodes: ['mk-talent-1'] })
    expect(owned.awakeningState).toEqual({ tier: 1, unlockedEffects: [] })
  })

  test('แถวเก่าก่อน migration 0008 — default talent/awakening ว่าง', () => {
    const owned = mapOwnedCharacterRow({
      character_id: 'pig-warrior',
      level: 3,
      exp: 12,
      exp_to_next: 90,
      obtained_at: '2026-01-02T00:00:00.000Z',
    })

    expect(owned.talentState).toEqual({ unlockedNodes: [] })
    expect(owned.awakeningState).toEqual({ tier: 0, unlockedEffects: [] })
  })

  test('field mapping ตรงกับ shape ของ OwnedCharacter ฝั่ง localStorage (accountRepository.ts) เป๊ะ', () => {
    const owned = mapOwnedCharacterRow({
      character_id: 'pig-warrior',
      level: 3,
      exp: 12,
      exp_to_next: 90,
      obtained_at: '2026-01-02T00:00:00.000Z',
    })

    expect(owned).toEqual({
      characterId: 'pig-warrior',
      level: 3,
      exp: 12,
      expToNext: 90,
      obtainedAt: '2026-01-02T00:00:00.000Z',
      skillLevels: createDefaultSkillLevels(),
      talentState: { unlockedNodes: [] },
      awakeningState: { tier: 0, unlockedEffects: [] },
    })
  })
})

/*
  item 145 (2026-08-08, MEMORY.md): a CoalBoard reality-lens review found this module's real
  RPC wrapper functions (earnGold/grantItem/redeemCoupon/findPlayerByUid) had ZERO test
  coverage — the 618 passing tests elsewhere in the repo exercise the parallel localStorage
  `accountRepository.ts`, not this file. These tests mock `supabase` itself so they run without
  a live project, and pin the one thing most likely to silently regress: the exact RPC
  name/param wiring (a typo'd RPC name or param key fails ONLY at runtime against a real
  Postgres project — nothing here would catch it before this).
*/

const { supabaseMock, rpcMock, fromMock, reportErrorMock } = vi.hoisted(() => {
  const rpcFn = vi.fn()
  const fromFn = vi.fn()
  const reportErrorFn = vi.fn()
  return {
    rpcMock: rpcFn,
    fromMock: fromFn,
    reportErrorMock: reportErrorFn,
    supabaseMock: {
      rpc: rpcFn,
      from: fromFn,
      auth: { onAuthStateChange: vi.fn(), getSession: vi.fn() },
    },
  }
})

vi.mock('../lib/supabaseClient', () => ({ supabase: supabaseMock }))
vi.mock('../lib/errors/reportError', () => ({ reportError: reportErrorMock }))

type QueryResult = { data: unknown; error: unknown }

/*
  ทั้งสอง helper คืนค่าเป็น Promise จริง (Promise.resolve) แล้วแปะ method chain เพิ่มทับ —
  ไม่ประกอบ object literal ที่มี `then` เอง (oxlint unicorn/no-thenable ห้าม) `.then` ที่ใช้
  งานได้จริงจึงมาจาก Promise.prototype ตรง ๆ ไม่ใช่ของปลอม
*/

/** ผลลัพธ์ทั้ง await ตรง ๆ (`await supabase.rpc(...)`) และ chain ต่อ `.maybeSingle()` ได้ */
function rpcResult(data: unknown, error: { message: string } | null = null) {
  const result: QueryResult = { data, error }
  const promise = Promise.resolve(result) as Promise<QueryResult> & {
    maybeSingle: () => Promise<QueryResult>
  }
  promise.maybeSingle = () => Promise.resolve(result)
  return promise
}

/** chain แบบ query builder ของ Supabase (`.select().eq().maybeSingle()` ฯลฯ) — resolve ค่าเดียวกันทุกจุดจบ */
function chainable(result: QueryResult) {
  const promise = Promise.resolve(result) as Promise<QueryResult> & {
    select: () => ReturnType<typeof chainable>
    eq: () => ReturnType<typeof chainable>
    order: () => ReturnType<typeof chainable>
    maybeSingle: () => Promise<QueryResult>
  }
  promise.select = () => chainable(result)
  promise.eq = () => chainable(result)
  promise.order = () => chainable(result)
  promise.maybeSingle = () => Promise.resolve(result)
  return promise
}

describe('accountRepository.supabase RPC wrapper wiring', () => {
  beforeEach(() => {
    rpcMock.mockReset()
    fromMock.mockReset()
    reportErrorMock.mockReset()
    // loadPlayer() ยิง 7 ตารางพร้อมกัน (Promise.all) — ให้ทุกตารางว่างเปล่าเป็นค่าเริ่มต้น
    // เว้น profiles ที่ต้องมีแถวเสมอ ไม่งั้น loadPlayer คืน null (ดู accountRepository.supabase.ts:82)
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return chainable({
          data: {
            id: 'profile-1',
            uid: '1234567890',
            name: 'Tester',
            title: 'ผู้จาริกหน้าใหม่',
            level: 1,
            exp: 0,
            exp_to_next: 100,
            gold: 500,
            gem: 20,
            frame_id: 'arcane',
            flags: {},
            defeated_npc_ids: [],
          },
          error: null,
        })
      }
      return chainable({ data: [], error: null })
    })
  })

  test('earnGold: เรียก RPC ชื่อ earn_gold พร้อม param p_source/p_amount/p_ref_id ตรงตัว', async () => {
    const { earnGold } = await import('./accountRepository.supabase')
    rpcMock.mockReturnValue(rpcResult({ id: 'profile-1' }))

    await earnGold('uid-ignored', 'quest', 50, 'quest-1')

    expect(rpcMock).toHaveBeenCalledWith('earn_gold', {
      p_source: 'quest',
      p_amount: 50,
      p_ref_id: 'quest-1',
    })
  })

  test('earnGold: RPC error คืน ok:false พร้อมข้อความ error, ไม่ยิง loadPlayer ต่อ', async () => {
    const { earnGold } = await import('./accountRepository.supabase')
    rpcMock.mockReturnValue(rpcResult(null, { message: 'จำนวนทองเกินขีดจำกัดต่อครั้ง' }))

    const result = await earnGold('uid-ignored', 'quest', 999_999, undefined)

    expect(result).toEqual({ ok: false, error: 'จำนวนทองเกินขีดจำกัดต่อครั้ง' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  test('grantItem: เรียก RPC ชื่อ grant_item พร้อม param p_item_id/p_quantity/p_source ตรงตัว', async () => {
    const { grantItem } = await import('./accountRepository.supabase')
    rpcMock.mockReturnValue(rpcResult({ id: 'profile-1' }))

    await grantItem('uid-ignored', 'spirit-incense', 2, 'drop')

    expect(rpcMock).toHaveBeenCalledWith('grant_item', {
      p_item_id: 'spirit-incense',
      p_quantity: 2,
      p_source: 'drop',
      p_ref_id: null,
    })
  })

  test('redeemCoupon: เรียก RPC ชื่อ redeem_coupon พร้อม param p_code ตรงตัว', async () => {
    const { redeemCoupon } = await import('./accountRepository.supabase')
    rpcMock.mockReturnValue(rpcResult({ profile: { id: 'profile-1' }, amount: 100 }))

    await redeemCoupon('uid-ignored', 'WELCOME2026')

    expect(rpcMock).toHaveBeenCalledWith('redeem_coupon', { p_code: 'WELCOME2026' })
  })

  test('findPlayerByUid: เรียก RPC find_player_by_uid ไม่ query ตาราง profiles ตรง ๆ อีกต่อไป (item 145)', async () => {
    const { findPlayerByUid } = await import('./accountRepository.supabase')
    // returns table(...) มาเป็น array ผ่าน PostgREST เสมอ ไม่ใช่ object เดี่ยว
    rpcMock.mockReturnValue(
      rpcResult([{ uid: '9876543210', name: 'Friend', level: 10, title: 'นักรบ' }]),
    )

    const result = await findPlayerByUid('9876543210')

    expect(rpcMock).toHaveBeenCalledWith('find_player_by_uid', { p_uid: '9876543210' })
    expect(fromMock).not.toHaveBeenCalledWith('profiles')
    expect(result).toEqual({ uid: '9876543210', name: 'Friend', level: 10, title: 'นักรบ' })
  })

  test('findPlayerByUid: ไม่พบ UID คืน null (array ว่าง)', async () => {
    const { findPlayerByUid } = await import('./accountRepository.supabase')
    rpcMock.mockReturnValue(rpcResult([]))

    expect(await findPlayerByUid('0000000000')).toBeNull()
    expect(reportErrorMock).not.toHaveBeenCalled()
  })

  test('findPlayerByUid: RPC error รายงานผ่าน reportError (SILENT) แยกจาก "หาไม่เจอจริง" — คืน null เหมือนกันแต่ log แยกได้ (adversary-lens finding 3)', async () => {
    const { findPlayerByUid } = await import('./accountRepository.supabase')
    const rpcError = { message: 'permission denied for function find_player_by_uid' }
    rpcMock.mockReturnValue(rpcResult(null, rpcError))

    const result = await findPlayerByUid('9876543210')

    expect(result).toBeNull()
    expect(reportErrorMock).toHaveBeenCalledWith('FRIEND_LOOKUP_FAIL', 'silent', rpcError)
  })
})
