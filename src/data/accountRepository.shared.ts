import type { Player } from '../types/player'
import type { GachaPullOutcome } from '../game/gacha/gachaPipeline'

/**
 * ชนิด/ค่าคงที่/ตัวตรวจสอบที่ใช้ร่วมกันระหว่างทุก backend ของบัญชีผู้เล่น
 *
 * แยกจาก accountRepository.ts (backend localStorage เดิม ตอนนี้ dormant — useAuth.ts
 * ไม่ import แล้ว) เพราะของในไฟล์นี้ยังใช้งานจริงทั้งฝั่ง accountRepository.supabase.ts
 * (backend จริงที่ useAuth.ts ใช้) และหน้าจอต่าง ๆ ที่ import type ตรง ๆ
 * (AuthModal, TopBar, LobbyPage, ฯลฯ) ส่วน login/register/session ที่ผูกกับ localStorage
 * โดยเฉพาะยังอยู่ใน accountRepository.ts เหมือนเดิม (ดูคอมเมนต์หัวไฟล์นั้น)
 */

/** ทองได้จากการเล่น (เควส/ดรอป) หรือเติมเงินจริงก็ได้ */
export type GoldSource = 'quest' | 'drop' | 'topup'
/** หยกได้จากการเติมเงินจริง แลกคูปอง หรือใช้ gacha — ห้ามมีทางอื่น */
export type GemSource = 'topup' | 'coupon' | 'gacha'

export interface CurrencyTransaction {
  id: string
  currency: 'gold' | 'gem'
  source: GoldSource | GemSource
  amount: number
  createdAt: string
  /** อ้างอิงที่มา เช่น questId, dropId, รหัสคูปอง, หรือ id แพ็กเกจเติมหยก */
  refId?: string
}

export interface GemPackage {
  id: string
  amount: number
  /** ราคาที่แสดงผล — ยังไม่ผูกกับ payment gateway จริง */
  priceLabel: string
}

export const GEM_PACKAGES: GemPackage[] = [
  { id: 'gem-small', amount: 60, priceLabel: '฿30' },
  { id: 'gem-medium', amount: 320, priceLabel: '฿150' },
  { id: 'gem-large', amount: 980, priceLabel: '฿450' },
]

export interface GoldPackage {
  id: string
  amount: number
  /** ราคาที่แสดงผล — ยังไม่ผูกกับ payment gateway จริง */
  priceLabel: string
}

/** ราคาต่อหน่วยถูกกว่าเติมหยก — ทองเป็นสกุลเงินพื้นฐานที่ควรหาได้ง่ายกว่า */
export const GOLD_PACKAGES: GoldPackage[] = [
  { id: 'gold-small', amount: 1000, priceLabel: '฿30' },
  { id: 'gold-medium', amount: 5500, priceLabel: '฿150' },
  { id: 'gold-large', amount: 18000, priceLabel: '฿450' },
]

export type AuthResult = { ok: true; player: Player } | { ok: false; error: string }

export type CurrencyResult =
  { ok: true; player: Player; amount: number } | { ok: false; error: string }

/** ไอเทมได้จากการเล่นเท่านั้น — ทำเควสสำเร็จ หรือของดรอป (กติกาเดียวกับทอง) */
export type ItemSource = GoldSource

export type ItemResult = { ok: true; player: Player } | { ok: false; error: string }

export type CharacterGrantResult =
  { ok: true; player: Player; characterId: string; isNew?: boolean } | { ok: false; error: string }

export type GachaPullResult =
  { ok: true; player: Player; results: GachaPullOutcome[] } | { ok: false; error: string }

/** ตรวจรูปแบบอีเมลแบบพอดี ๆ — ไม่เข้มจนบล็อกอีเมลที่ใช้ได้จริง */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const PASSWORD_MIN_LENGTH = 8

export function validateEmail(email: string): string | null {
  const value = email.trim()
  if (value.length === 0) return 'กรุณากรอกอีเมล'
  if (!EMAIL_PATTERN.test(value)) return 'รูปแบบอีเมลไม่ถูกต้อง'
  return null
}

// รหัสผ่านที่พบบ่อยที่สุดจนไม่ป้องกันอะไรเลย แม้ยาวพอตาม PASSWORD_MIN_LENGTH ก็ตาม
// (รายการเล็ก ๆ พอกันกรณีชัดเจนที่สุด ไม่ใช่ dictionary attack เต็มรูปแบบ — ไม่ต้องพึ่ง library ภายนอก)
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty123',
  'qwertyui',
  'letmein1',
  'iloveyou',
  'admin123',
  'welcome1',
  '11111111',
  '00000000',
  'abc12345',
  'changeme',
])

export function validatePassword(password: string): string | null {
  if (password.length === 0) return 'กรุณากรอกรหัสผ่าน'
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'รหัสผ่านนี้ถูกใช้ทั่วไปมากเกินไป กรุณาตั้งรหัสอื่น'
  }
  return null
}
