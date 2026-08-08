import { useCallback, useEffect, useState } from 'react'
import * as accounts from '../data/accountRepository.supabase'
import type {
  CharacterGrantResult,
  CurrencyResult,
  FriendCandidate,
  GachaPullResult,
  GoldSource,
  ItemResult,
  ItemSource,
} from '../data/accountRepository.supabase'
import { reportError } from '../lib/errors/reportError'
import { downloadSaveJson } from '../lib/saveFile'
import type { GachaPullCount } from '../game/gacha/executeGachaPull'
import type { Player } from '../types/player'

/**
 * สถานะบัญชีผู้เล่นของทั้งเกม
 *
 * ทุกหน้าจอคุยกับ hook นี้เท่านั้น ไม่เรียก localStorage ตรง ๆ
 * เปลี่ยนไปใช้ฐานข้อมูลจริงเมื่อไหร่ ให้แก้ import ด้านบนบรรทัดเดียว
 * (ดู src/data/accountRepository.ts)
 */

export type AuthStatus = 'loading' | 'guest' | 'signed-in'

export interface AuthState {
  status: AuthStatus
  player: Player | null
  register: (email: string, password: string, captchaToken?: string) => Promise<string | null>
  login: (email: string, password: string, captchaToken?: string) => Promise<string | null>
  /**
   * เริ่ม OAuth flow กับ Google — เปลี่ยนหน้าออกไปทันทีเมื่อสำเร็จ (ไม่มีทาง resolve กลับมา
   * ที่นี่ในเคสนั้น) คืนข้อความเฉพาะตอนยิง redirect เองไม่สำเร็จ (เช่น provider ปิดอยู่)
   */
  loginWithGoogle: () => Promise<string | null>
  /**
   * เข้าเล่นทันทีแบบ guest (signInAnonymously) ไม่ต้องกรอกอะไรเลย — status จะกลายเป็น
   * 'signed-in' เหมือนบัญชีปกติทุกประการ (ไม่ใช่ AuthStatus 'guest' ที่แปลว่า "ยังไม่ล็อกอิน"
   * — ดู `isGuest` ด้านล่างสำหรับแยกแยะว่าบัญชีที่ signed-in อยู่นี้เป็น guest หรือไม่)
   */
  loginAsGuest: (captchaToken?: string) => Promise<string | null>
  logout: () => Promise<void>
  /** เชื่อมบัญชีนี้ (ไม่ว่าล็อกอินด้วย email หรือ Google) เข้ากับ Google — ต้อง signed-in อยู่แล้ว */
  hasGoogleLinked: boolean
  /** บัญชีที่ signed-in อยู่นี้เป็น guest (ยังไม่เคยอัพเกรด) ไหม — คนละความหมายกับ AuthStatus 'guest' */
  isGuest: boolean
  /** เริ่มเชื่อมบัญชี Google — เปลี่ยนหน้าออกไปทันทีเมื่อสำเร็จ เหมือน loginWithGoogle */
  linkGoogleAccount: () => Promise<string | null>
  /** บันทึกความคืบหน้า เช่น ตั้งชื่อตัวละคร จัดทีม อัปเกรด */
  /** คืน true เมื่อบันทึกลงที่เก็บข้อมูลจริง — false แปลว่าหน้าจอถูกย้อนกลับแล้ว */
  updatePlayer: (next: Player) => Promise<boolean>
  /** ให้ทองจากการเล่นเท่านั้น — ทำเควสสำเร็จหรือของดรอป (ดู accountRepository.earnGold) */
  earnGold: (source: GoldSource, amount: number, refId?: string) => Promise<CurrencyResult>
  /** เติมทองด้วยเงินจริง (ดู accountRepository.topUpGold) */
  topUpGold: (packageId: string) => Promise<CurrencyResult>
  /** เติมหยกด้วยเงินจริง (ดู accountRepository.topUpGems) */
  topUpGems: (packageId: string) => Promise<CurrencyResult>
  /** แลกโค้ดคูปองเป็นหยก (ดู accountRepository.redeemCoupon) */
  redeemCoupon: (code: string) => Promise<CurrencyResult>
  /** ค้นหาผู้เล่นจาก UID เพื่อเพิ่มเพื่อน — คืน null ถ้าไม่พบ (ดู accountRepository.findPlayerByUid) */
  findFriendByUid: (uid: string) => Promise<FriendCandidate | null>
  /**
   * บัญชีนี้ใช้คำสั่งผู้ดูแลได้ไหม — มาจากตาราง admin_accounts ฝั่ง Supabase
   * (ดู supabase/migrations/0004_admin_accounts.sql) ไม่มีทาง insert/update ให้ authenticated
   * role เลย ตั้งค่าได้ทาง Supabase dashboard เท่านั้น — เป็นขอบเขตความปลอดภัยจริงแล้ว
   * (ต่างจาก static list เดิมใน src/data/admins.ts ที่เป็นแค่ client-side convenience)
   */
  isAdmin: boolean
  /** มอบตัวละครให้บัญชีนี้ — ตอนนี้เรียกจากช่องคำสั่งผู้ดูแลเท่านั้น */
  grantCharacter: (characterId: string) => Promise<CharacterGrantResult>
  /** ให้ไอเทมจากการเล่น (ดรอป/เควส) — ดู accountRepository.grantItem */
  grantItem: (itemId: string, quantity: number, source: ItemSource) => Promise<ItemResult>
  /** อัญเชิญ gacha — ดู accountRepository.pullGacha */
  pullGacha: (bannerId: string, pullCount: GachaPullCount) => Promise<GachaPullResult>
  /** ส่งออก save เป็นไฟล์ JSON ไว้สำรอง/ย้ายเครื่อง — คืน null เมื่อสำเร็จ (ไฟล์ถูกดาวน์โหลดแล้ว) */
  exportSave: () => Promise<string | null>
}

export function useAuth(): AuthState {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [player, setPlayer] = useState<Player | null>(null)
  // อีเมล/isAdmin ไม่ได้อยู่ใน Player (เป็นข้อมูลบัญชี ไม่ใช่ของตัวละคร) จึงเก็บแยก
  const [isAdmin, setIsAdmin] = useState(false)
  const [hasGoogleLinked, setHasGoogleLinked] = useState(false)
  const [isGuest, setIsGuest] = useState(false)

  const refreshLinkedProviders = useCallback(async () => {
    const providers = await accounts.getLinkedProviders()
    setHasGoogleLinked(providers.includes('google'))
  }, [])

  // กู้ session ตอนเปิดเกม เพื่อไม่ต้องล็อกอินซ้ำทุกครั้ง
  useEffect(() => {
    let cancelled = false

    accounts.getSessionPlayer().then((restored) => {
      if (cancelled) return
      setPlayer(restored)
      setIsAdmin(restored ? accounts.getSessionIsAdmin() : false)
      setIsGuest(restored ? accounts.getSessionIsGuest() : false)
      setStatus(restored ? 'signed-in' : 'guest')
      if (restored) void refreshLinkedProviders()
      return undefined
    })

    return () => {
      cancelled = true
    }
  }, [refreshLinkedProviders])

  /** คืน null เมื่อสำเร็จ คืนข้อความเมื่อผิดพลาด */
  const register = useCallback(
    async (nextEmail: string, password: string, captchaToken?: string) => {
      const result = await accounts.register(nextEmail, password, captchaToken)
      if (!result.ok) return result.error
      setPlayer(result.player)
      setIsAdmin(accounts.getSessionIsAdmin())
      setIsGuest(false)
      setStatus('signed-in')
      void refreshLinkedProviders()
      return null
    },
    [refreshLinkedProviders],
  )

  const login = useCallback(
    async (nextEmail: string, password: string, captchaToken?: string) => {
      const result = await accounts.login(nextEmail, password, captchaToken)
      if (!result.ok) return result.error
      setPlayer(result.player)
      setIsAdmin(accounts.getSessionIsAdmin())
      setIsGuest(false)
      setStatus('signed-in')
      void refreshLinkedProviders()
      return null
    },
    [refreshLinkedProviders],
  )

  const loginAsGuest = useCallback(
    async (captchaToken?: string) => {
      const result = await accounts.signInAsGuest(captchaToken)
      if (!result.ok) return result.error
      setPlayer(result.player)
      setIsAdmin(false)
      setIsGuest(true)
      setStatus('signed-in')
      void refreshLinkedProviders()
      return null
    },
    [refreshLinkedProviders],
  )

  const loginWithGoogle = useCallback(async () => {
    const result = await accounts.signInWithGoogle()
    if (result.ok) return null
    reportError('AUTH_OAUTH_FAIL', 'silent')
    return result.error ?? 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ'
  }, [])

  const linkGoogleAccount = useCallback(async () => {
    const result = await accounts.linkGoogleIdentity()
    if (result.ok) return null
    reportError('AUTH_OAUTH_FAIL', 'silent')
    return result.error ?? 'เชื่อมบัญชี Google ไม่สำเร็จ'
  }, [])

  const logout = useCallback(async () => {
    await accounts.logout()
    setPlayer(null)
    setIsAdmin(false)
    setHasGoogleLinked(false)
    setIsGuest(false)
    setStatus('guest')
  }, [])

  /*
    เขียนความคืบหน้าผู้เล่นลงที่เก็บข้อมูล — คืน true เมื่อบันทึกลงจริง

    เดิมทิ้งค่าที่ savePlayer คืนมาโดยไม่ดู ทั้งที่ทุกฟังก์ชันพี่น้องใน accountRepository
    (register/login/earnGold/...) เช็คค่าเดียวกันนี้แล้วขึ้นข้อความบอกผู้ใช้
    และนี่คือเส้นทางเขียนของความคืบหน้าทั้งเกม — ทีม อัปเกรด เงิน ผลต่อสู้ เพื่อน
    ผลคือพื้นที่เก็บข้อมูลเต็มแล้วหน้าจอยังโชว์เหมือนเซฟติด ผู้เล่นเล่นต่อจนปิดแท็บ
    แล้วของหายทั้งหมดโดยไม่เคยมีสัญญาณอะไรเลย

    ที่นี่ประกาศผลด้วยการ "ย้อนหน้าจอกลับ" ไม่ใช่ toast เพราะ useAuth ถูกเรียกเหนือ
    ToastProvider ใน App.tsx จึงเรียก useToast ไม่ได้ และการโชว์ค่าเดิมที่เป็นความจริง
    ดีกว่าโชว์ค่าใหม่ที่ไม่ได้ถูกบันทึก

    คืน boolean ให้ผู้เรียกตัดสินใจต่อได้ — ปุ่มเพิ่มเพื่อนเป็นรายแรกที่ต้องใช้จริง
    (ก่อนหน้านี้ตัดค่าคืนทิ้งเพราะยังไม่มีใครใช้ แล้วผู้ใช้ก็โผล่มาจริงในวันเดียวกัน)
  */
  const updatePlayer = useCallback(
    async (next: Player): Promise<boolean> => {
      const previous = player
      // อัปเดตหน้าจอทันที แล้วค่อยเขียนลงฐานข้อมูล
      setPlayer(next)

      if (await accounts.savePlayer(next)) return true

      reportError('PLAYER_SAVE_FAIL', 'visible')
      setPlayer(previous)
      return false
    },
    [player],
  )

  // สี่ฟังก์ชันด้านล่างคุยกับ accountRepository ที่บังคับระบุแหล่งที่มาของทอง/หยกเสมอ
  // (ดูคอมเมนต์หัวไฟล์ accountRepository.ts) จึงไม่มี setGold/setGem ตรง ๆ ให้เรียกจากที่อื่น

  const earnGold = useCallback(
    async (source: GoldSource, amount: number, refId?: string) => {
      if (!player) return { ok: false, error: 'ยังไม่ได้ล็อกอิน' } as const
      const result = await accounts.earnGold(player.uid, source, amount, refId)
      if (result.ok) setPlayer(result.player)
      return result
    },
    [player],
  )

  const topUpGold = useCallback(
    async (packageId: string) => {
      if (!player) return { ok: false, error: 'ยังไม่ได้ล็อกอิน' } as const
      const result = await accounts.topUpGold(player.uid, packageId)
      if (result.ok) setPlayer(result.player)
      return result
    },
    [player],
  )

  const topUpGems = useCallback(
    async (packageId: string) => {
      if (!player) return { ok: false, error: 'ยังไม่ได้ล็อกอิน' } as const
      const result = await accounts.topUpGems(player.uid, packageId)
      if (result.ok) setPlayer(result.player)
      return result
    },
    [player],
  )

  const redeemCoupon = useCallback(
    async (code: string) => {
      if (!player) return { ok: false, error: 'ยังไม่ได้ล็อกอิน' } as const
      const result = await accounts.redeemCoupon(player.uid, code)
      if (result.ok) setPlayer(result.player)
      return result
    },
    [player],
  )

  /** ค้นหาไม่ต้องล็อกอินก็เรียกได้จริง แต่ล็อกไว้เผื่อผู้เล่นเรียกจากหน้าที่ต้องล็อกอินก่อนเสมออยู่แล้ว */
  const findFriendByUid = useCallback(async (uid: string) => accounts.findPlayerByUid(uid), [])

  const grantCharacter = useCallback(
    async (characterId: string) => {
      if (!player) return { ok: false, error: 'ยังไม่ได้ล็อกอิน' } as const
      const result = await accounts.grantCharacter(player.uid, characterId)
      if (result.ok) setPlayer(result.player)
      return result
    },
    [player],
  )

  const grantItem = useCallback(
    async (itemId: string, quantity: number, source: ItemSource) => {
      if (!player) return { ok: false, error: 'ยังไม่ได้ล็อกอิน' } as const
      const result = await accounts.grantItem(player.uid, itemId, quantity, source)
      if (result.ok) setPlayer(result.player)
      return result
    },
    [player],
  )

  const pullGacha = useCallback(
    async (bannerId: string, pullCount: GachaPullCount) => {
      if (!player) return { ok: false, error: 'ยังไม่ได้ล็อกอิน' } as const
      const result = await accounts.pullGacha(player.uid, bannerId, pullCount)
      if (result.ok) setPlayer(result.player)
      return result
    },
    [player],
  )

  const exportSave = useCallback(async () => {
    const result = await accounts.exportSave()
    if (!result.ok) return result.error

    // ดาวน์โหลดเป็นไฟล์ .json — ไม่มี backend ให้ส่งไปเก็บ ผู้เล่นต้องเก็บไฟล์เอง
    downloadSaveJson(result.json)
    return null
  }, [])

  return {
    status,
    player,
    register,
    login,
    loginWithGoogle,
    loginAsGuest,
    logout,
    hasGoogleLinked,
    linkGoogleAccount,
    isGuest,
    updatePlayer,
    earnGold,
    topUpGold,
    topUpGems,
    redeemCoupon,
    findFriendByUid,
    isAdmin,
    grantCharacter,
    grantItem,
    pullGacha,
    exportSave,
  }
}
