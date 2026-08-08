import { supabase } from '../lib/supabaseClient'
import { generateUid } from '../game/uid'
import { TEAM_SIZE } from '../game/team'
import { createDefaultSkillLevels } from '../game/realtimeBattle/SkillProgressionSystem'
import { migrateOwnedCharacters } from '../game/progression/progressionMigration'
import {
  EMPTY_PROGRESS,
  type FriendCandidate,
  type OwnedCharacter,
  type Player,
} from '../types/player'
import {
  GEM_PACKAGES,
  GOLD_PACKAGES,
  PASSWORD_MIN_LENGTH,
  validateEmail,
  validatePassword,
  type AuthResult,
  type CharacterGrantResult,
  type CurrencyResult,
  type CurrencyTransaction,
  type GemPackage,
  type GemSource,
  type GoldPackage,
  type GoldSource,
  type ItemResult,
  type ItemSource,
} from './accountRepository.shared'

/*
  ตัวสลับ backend จาก localStorage ไปหา Supabase (ดูคอมเมนต์หัวไฟล์ accountRepository.ts เดิม
  — "เปลี่ยน import ที่ src/hooks/useAuth.ts จุดเดียว หน้าจอไม่ต้องแก้เลย") export ชื่อฟังก์ชัน
  เดียวกันทั้งหมด ต่างกันแค่ที่มาของข้อมูล

  ── สิ่งที่เปลี่ยนไปจากเวอร์ชัน localStorage ──────────────────────────────────
  - auth (สมัคร/ล็อกอิน/รหัสผ่าน) ยกให้ Supabase Auth ทำแทน hand-roll PBKDF2 เดิม —
    ลด attack surface โดยไม่ต้องดูแล hash/salt/iteration เอง (ดูการตัดสินใจใน MEMORY.md)
  - session persistence เป็นหน้าที่ของ supabase-js เอง (เก็บใน localStorage ของมันเอง
    พร้อม refresh token) — ไม่ต้องมี readActiveSession/SESSION_TTL_MS/appVersion-check
    ของเวอร์ชัน localStorage อีก เพราะ Supabase คุม token expiry ที่ฝั่ง server จริง
  - earnGold/redeemCoupon/grantItem เรียกผ่าน RPC function (SECURITY DEFINER) ใน
    supabase/migrations/0001_init.sql — กติกา source/amount บังคับที่ชั้น Postgres จริง
    ไม่ใช่แค่ TypeScript ที่แก้ผ่าน DevTools ได้เหมือนเดิม
  - topUpGold/topUpGems: ยังไม่มี RPC ให้ (ดู fork issue #19 — ธุรกิจยังไม่ตัดสินใจ)
  ─────────────────────────────────────────────────────────────────────────────
*/

export type { GoldSource, GemSource, ItemSource, AuthResult, CurrencyResult, ItemResult }
export type { CharacterGrantResult, CurrencyTransaction, FriendCandidate, GemPackage, GoldPackage }
export { GEM_PACKAGES, GOLD_PACKAGES, PASSWORD_MIN_LENGTH, validateEmail, validatePassword }

interface OwnedCharacterRow {
  character_id: string
  level: number
  exp: number
  exp_to_next: number
  obtained_at: string
  /** แถวเก่าก่อน migration 0005 ยังไม่มีคอลัมน์นี้ — เติม default เหมือน normalizePlayer ฝั่ง localStorage */
  skill_levels?: OwnedCharacter['skillLevels'] | null
  talent_state?: OwnedCharacter['talentState'] | null
  awakening_state?: OwnedCharacter['awakeningState'] | null
}

/**
 * แปลงแถว owned_characters ดิบเป็น OwnedCharacter — แยกเป็นฟังก์ชัน pure เพื่อเทสต์ shape
 * parity กับ accountRepository.ts ได้โดยไม่ต้องมี Supabase จริง (done-criterion #1)
 */
export function mapOwnedCharacterRow(row: OwnedCharacterRow): OwnedCharacter {
  return {
    characterId: row.character_id,
    level: row.level,
    exp: row.exp,
    expToNext: row.exp_to_next,
    obtainedAt: row.obtained_at,
    skillLevels: row.skill_levels ?? createDefaultSkillLevels(),
    talentState: row.talent_state ?? { unlockedNodes: [] },
    awakeningState: row.awakening_state ?? { tier: 0, unlockedEffects: [] },
  }
}

interface ProfileRow {
  id: string
  uid: string
  name: string
  title: string
  level: number
  exp: number
  exp_to_next: number
  gold: number
  gem: number
  frame_id: string
  flags: Record<string, boolean>
  defeated_npc_ids: string[]
}

/** ประกอบ Player เต็มรูปจากตารางลูกทั้งหมด — เรียกซ้ำได้จากหลายจุด (login/register/session) */
async function loadPlayer(profileId: string): Promise<Player | null> {
  const [profileRes, charsRes, slotsRes, itemsRes, friendsRes, historyRes, adminRes] =
    await Promise.all([
      supabase.from('profiles').select('*').eq('id', profileId).maybeSingle(),
      supabase.from('owned_characters').select('*').eq('profile_id', profileId),
      supabase.from('team_slots').select('*').eq('profile_id', profileId).order('slot_index'),
      supabase.from('inventory_items').select('*').eq('profile_id', profileId),
      supabase.from('friends').select('*').eq('profile_id', profileId),
      supabase.from('battle_history').select('*').eq('profile_id', profileId).order('finished_at'),
      supabase
        .from('admin_accounts')
        .select('profile_id')
        .eq('profile_id', profileId)
        .maybeSingle(),
    ])

  const profile = profileRes.data as ProfileRow | null
  if (!profile) return null

  // แยกจาก Player โดยตั้งใจ (ไม่ใช่ข้อมูลตัวละคร เป็นสิทธิ์บัญชี) — cache แบบเดียวกับอีเมล
  cachedSessionIsAdmin = adminRes.data != null

  const teamSlots: (string | null)[] = Array.from({ length: TEAM_SIZE }, () => null)
  for (const row of slotsRes.data ?? []) {
    if (row.slot_index >= 0 && row.slot_index < TEAM_SIZE)
      teamSlots[row.slot_index] = row.character_id
  }

  return {
    id: profile.id,
    uid: profile.uid,
    name: profile.name,
    title: profile.title,
    level: profile.level,
    exp: profile.exp,
    expToNext: profile.exp_to_next,
    currency: { gold: profile.gold, gem: profile.gem },
    ownedCharacters: migrateOwnedCharacters((charsRes.data ?? []).map(mapOwnedCharacterRow)),
    inventory: (itemsRes.data ?? []).map((i) => ({
      itemId: i.item_id,
      quantity: i.quantity,
      obtainedAt: i.obtained_at,
      obtainedFrom: i.obtained_from,
    })),
    friends: (friendsRes.data ?? []).map((f) => ({
      uid: f.friend_uid,
      name: f.name,
      level: f.level,
      title: f.title,
    })),
    teamSlots,
    frameId: profile.frame_id,
    progress: {
      flags: profile.flags ?? EMPTY_PROGRESS.flags,
      defeatedNpcIds: profile.defeated_npc_ids ?? EMPTY_PROGRESS.defeatedNpcIds,
      battleHistory: (historyRes.data ?? []).map((h) => ({
        id: h.id,
        opponent: h.opponent,
        result: h.result,
        finishedAt: h.finished_at,
        durationMs: h.duration_ms ?? undefined,
      })),
    },
  }
}

export async function register(
  email: string,
  password: string,
  captchaToken?: string,
): Promise<AuthResult> {
  const emailError = validateEmail(email)
  if (emailError) return { ok: false, error: emailError }
  const passwordError = validatePassword(password)
  if (passwordError) return { ok: false, error: passwordError }

  // เผื่อชน UNIQUE ที่ trigger ฝั่ง DB — สุ่มใหม่แล้วลองอีกครั้ง (โอกาสชนจริงต่ำมาก ดู src/game/uid.ts)
  for (let attempt = 0; attempt < 3; attempt++) {
    const uid = generateUid()
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { uid }, captchaToken },
    })

    if (error) {
      if (error.message.includes('duplicate') && attempt < 2) continue
      return {
        ok: false,
        error: error.message.includes('already registered')
          ? 'อีเมลนี้ถูกใช้สมัครไปแล้ว'
          : 'สมัครไม่สำเร็จด้วยข้อผิดพลาดที่ไม่คาดคิด',
      }
    }
    if (!data.user) return { ok: false, error: 'สมัครไม่สำเร็จด้วยข้อผิดพลาดที่ไม่คาดคิด' }

    // trigger handle_new_user() สร้าง profile ให้อัตโนมัติ — อ่านกลับมาประกอบเป็น Player
    const player = await loadPlayer(data.user.id)
    if (!player)
      return { ok: false, error: 'สมัครสำเร็จแต่โหลดข้อมูลผู้เล่นไม่สำเร็จ ลองล็อกอินใหม่' }
    return { ok: true, player }
  }

  return { ok: false, error: 'สมัครไม่สำเร็จ ลองใหม่อีกครั้ง' }
}

export async function login(
  email: string,
  password: string,
  captchaToken?: string,
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
    options: { captchaToken },
  })
  if (error || !data.user) return { ok: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }

  const player = await loadPlayer(data.user.id)
  if (!player) return { ok: false, error: 'ไม่พบข้อมูลผู้เล่นของบัญชีนี้' }
  return { ok: true, player }
}

/**
 * เข้าเล่นแบบ guest — ไม่ต้องกรอกอีเมล/รหัสผ่านเลย (signInAnonymously)
 *
 * handle_new_user() trigger ทำงานเหมือนบัญชีปกติทุกประการ (ยืนยันแล้วด้วย manual test บน
 * project จริง: guest ได้ profile + monkey-king + ทอง 500/หยก 20 เหมือน register()) —
 * ไม่ต้องเขียน branch แยกสำหรับ guest ในโค้ดฝั่งนี้เลย
 *
 * ข้อจำกัดของ guest (ตามที่ Supabase เอกสารระบุไว้ตรง ๆ): ถ้าล้าง cookie/localStorage หรือ
 * เปลี่ยนเครื่อง จะกลับเข้าบัญชีเดิมไม่ได้อีก ต้องอัพเกรดเป็นบัญชีจริงก่อน (ดู linkGoogleIdentity
 * ด้านล่าง — ใช้ได้กับ guest เหมือนกับบัญชี email/password ทุกประการ ไม่มีโค้ดแยก)
 *
 * guest ที่ไม่เคยอัพเกรดและอายุเกิน 30 วัน ถูกลบอัตโนมัติทุกคืนโดย pg_cron
 * (0006_guest_cleanup.sql, เกณฑ์ 30 วันอ้างอิงจาก Firebase's official anonymous-auth
 * best-practices) — กันปั้ม guest จนข้อมูลค้าง ไม่กระทบ guest ที่ยังเล่นอยู่จริง
 */
export async function signInAsGuest(captchaToken?: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInAnonymously({ options: { captchaToken } })
  if (error || !data.user)
    return { ok: false, error: 'เข้าเล่นแบบ guest ไม่สำเร็จ ลองใหม่อีกครั้ง' }

  const player = await loadPlayer(data.user.id)
  if (!player) return { ok: false, error: 'เข้าเล่นแบบ guest ไม่สำเร็จ ลองใหม่อีกครั้ง' }
  return { ok: true, player }
}

/**
 * เริ่ม OAuth flow กับ Google — เปลี่ยนหน้าออกไปยัง Google ทันที (ไม่ใช่ popup)
 * แล้ว Google ส่งกลับมาที่ redirectTo พร้อม session ใน URL fragment ซึ่ง supabase-js
 * ดักจับเองอัตโนมัติ (ค่าเริ่มต้น detectSessionInUrl: true) — useAuth's getSessionPlayer()/
 * onAuthStateChange ที่มีอยู่แล้วจะเห็น session นี้เหมือน login ปกติทุกประการ ไม่ต้องเพิ่ม
 * โค้ดฝั่งรับ callback เอง
 *
 * handle_new_user() trigger (0001_init.sql) สร้าง profile/starter character ให้อัตโนมัติ
 * เหมือน register() ทุกประการ — ไม่สนใจว่าผู้ใช้เข้ามาทาง email/password หรือ OAuth
 *
 * คืนค่าแค่ตอนยิง redirect ไม่สำเร็จ (เช่น provider ยังไม่เปิดใน Supabase Dashboard) —
 * ตอนสำเร็จหน้าเปลี่ยนไปแล้ว ไม่มีทางกลับมา return ที่นี่ได้ทัน
 */
export async function signInWithGoogle(): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
  if (error) return { ok: false, error: 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ ลองใหม่อีกครั้ง' }
  return { ok: true }
}

/**
 * ผู้ให้บริการที่บัญชีนี้ล็อกอินได้ตอนนี้ — ใช้โชว์ "เชื่อมบัญชี Google แล้ว" ใน SettingsModal
 * ต้องล็อกอินอยู่ก่อน (getUserIdentities อ่านจาก session ปัจจุบัน) — ยังไม่ล็อกอิน = อาร์เรย์ว่าง
 */
export async function getLinkedProviders(): Promise<string[]> {
  const { data } = await supabase.auth.getUserIdentities()
  return (data?.identities ?? []).map((identity) => identity.provider)
}

/**
 * เชื่อมบัญชี Google เข้ากับบัญชีที่ล็อกอินอยู่ตอนนี้ (email/password หรือ Google อีกบัญชีก็ได้)
 * ต้องเปิด "Manual Linking" ที่ Supabase Dashboard ไว้ก่อน (ปิดเป็นค่าเริ่มต้น) — ต่างจาก
 * signInWithGoogle() ตรงที่นี่ "ผูกเพิ่ม" ไม่ใช่ "ล็อกอินใหม่" ต้องมี session อยู่แล้วเท่านั้น
 *
 * เปลี่ยนหน้าออกไปยัง Google ทันทีเหมือน signInWithGoogle() — คืนค่าแค่ตอนยิง redirect
 * เองไม่สำเร็จ
 */
export async function linkGoogleIdentity(): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
  if (error) return { ok: false, error: 'เชื่อมบัญชี Google ไม่สำเร็จ ลองใหม่อีกครั้ง' }
  return { ok: true }
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut()
  cachedSessionEmail = null
  cachedSessionIsAdmin = false
  cachedSessionIsGuest = false
}

/*
  getSessionEmail() ต้องเป็น sync ตาม signature เดิม แต่ supabase-js ไม่มีทาง sync อ่าน
  session ปัจจุบันได้เลย (getSession() เป็น Promise เสมอ แม้จะไม่ยิง network จริงก็ตาม)

  เก็บ cache ไว้เองแทน — อัปเดตทุกจุดที่ยืนยันตัวตนสำเร็จ (login/register/getSessionPlayer)
  และ subscribe onAuthStateChange ไว้เป็นชั้นกันพลาด เผื่อมีจุดอื่นที่ทำให้ session เปลี่ยนโดย
  ไม่ผ่านฟังก์ชันในไฟล์นี้ (เช่น token หมดอายุแล้ว refresh ไม่ผ่าน)
*/
let cachedSessionEmail: string | null = null

/*
  isAdmin เป็นข้อมูลในตาราง admin_accounts (ดู supabase/migrations/0004_admin_accounts.sql)
  ไม่ใช่ค่าใน JWT/auth session เหมือนอีเมล จึงรีเฟรชได้เฉพาะตอน loadPlayer ยิง query จริง
  (login/register/getSessionPlayer) — ไม่ผูกกับ onAuthStateChange เหมือนอีเมล เพราะ event
  นั้นไม่มีข้อมูลตารางนี้ให้อ่านแบบ sync
*/
let cachedSessionIsAdmin = false

/**
 * guest ไหม — มาจาก `is_anonymous` ใน JWT/session โดยตรงเหมือนอีเมล (ไม่ใช่ query แยกแบบ isAdmin)
 * จึงผูกกับ onAuthStateChange ได้ปกติ กลายเป็น false เองอัตโนมัติทันทีที่ upgrade สำเร็จ
 * (linkIdentity/updateUser ทำให้ GoTrue เปลี่ยน is_anonymous เป็น false ที่ฝั่งเซิร์ฟเวอร์)
 */
let cachedSessionIsGuest = false

supabase.auth.onAuthStateChange((_event, session) => {
  cachedSessionEmail = session?.user.email ?? null
  cachedSessionIsGuest = session?.user.is_anonymous ?? false
})

/** สิทธิ์แอดมิน — sync ตาม pattern เดียวกับ getSessionEmail() ค่าล่าสุดคือครั้งที่ loadPlayer() รันสำเร็จ */
export function getSessionIsAdmin(): boolean {
  return cachedSessionIsAdmin
}

/** guest ไหม — sync ตาม pattern เดียวกับ getSessionEmail() */
export function getSessionIsGuest(): boolean {
  return cachedSessionIsGuest
}

/** ใช้ session ที่ supabase-js จัดการเองอยู่แล้ว (localStorage + refresh token) ไม่ต้องมี TTL ของเราเอง */
export async function getSessionPlayer(): Promise<Player | null> {
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  cachedSessionEmail = data.session?.user.email ?? null
  cachedSessionIsGuest = data.session?.user.is_anonymous ?? false
  if (!userId) return null
  return loadPlayer(userId)
}

export function getSessionEmail(): string | null {
  return cachedSessionEmail
}

export async function findPlayerByUid(uid: string): Promise<FriendCandidate | null> {
  const { data } = await supabase
    .from('profiles')
    .select('uid,name,level,title')
    .eq('uid', uid)
    .maybeSingle()
  if (!data) return null
  return { uid: data.uid, name: data.name, level: data.level, title: data.title }
}

export async function savePlayer(player: Player): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .update({
      name: player.name,
      title: player.title,
      level: player.level,
      exp: player.exp,
      exp_to_next: player.expToNext,
      frame_id: player.frameId,
      flags: player.progress.flags,
      defeated_npc_ids: player.progress.defeatedNpcIds,
    })
    .eq('id', player.id)

  if (error) return false

  const charRows = player.ownedCharacters.map((owned) => ({
    profile_id: player.id,
    character_id: owned.characterId,
    level: owned.level,
    exp: owned.exp,
    exp_to_next: owned.expToNext,
    obtained_at: owned.obtainedAt,
    skill_levels: owned.skillLevels,
    talent_state: owned.talentState ?? { unlockedNodes: [] },
    awakening_state: owned.awakeningState ?? { tier: 0, unlockedEffects: [] },
  }))
  const { error: charError } = await supabase.from('owned_characters').upsert(charRows, {
    onConflict: 'profile_id,character_id',
  })
  if (charError) return false

  // team_slots: upsert ทั้ง 4 ช่องทับของเดิม (ตาราง PK คือ profile_id+slot_index อยู่แล้ว)
  const slotRows = player.teamSlots.map((characterId, slot_index) => ({
    profile_id: player.id,
    slot_index,
    character_id: characterId,
  }))
  const { error: slotError } = await supabase.from('team_slots').upsert(slotRows)
  return !slotError
}

export async function earnGold(
  _uid: string,
  source: GoldSource,
  amount: number,
  refId?: string,
): Promise<CurrencyResult> {
  const { data, error } = await supabase.rpc('earn_gold', {
    p_source: source,
    p_amount: amount,
    p_ref_id: refId ?? null,
  })
  if (error || !data) return { ok: false, error: error?.message ?? 'บันทึกข้อมูลไม่สำเร็จ' }
  const player = await loadPlayer(data.id)
  if (!player) return { ok: false, error: 'บันทึกข้อมูลไม่สำเร็จ' }
  return { ok: true, player, amount }
}

export async function redeemCoupon(_uid: string, code: string): Promise<CurrencyResult> {
  const { data, error } = await supabase.rpc('redeem_coupon', { p_code: code })
  if (error) return { ok: false, error: error.message }
  if (!data?.profile) return { ok: false, error: 'แลกคูปองไม่สำเร็จ' }

  const player = await loadPlayer(data.profile.id)
  if (!player) return { ok: false, error: 'แลกคูปองไม่สำเร็จ' }
  return { ok: true, player, amount: data.amount }
}

/** topUpGold/topUpGems: ยังไม่มี RPC (ไม่มี payment gateway จริง — ดู fork issue #19) */
export async function topUpGold(_uid: string, _packageId: string): Promise<CurrencyResult> {
  return { ok: false, error: 'ระบบเติมเงินยังไม่เปิดให้ใช้งาน' }
}
export async function topUpGems(_uid: string, _packageId: string): Promise<CurrencyResult> {
  return { ok: false, error: 'ระบบเติมเงินยังไม่เปิดให้ใช้งาน' }
}

export async function getTransactions(uid: string): Promise<CurrencyTransaction[]> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('uid', uid)
    .maybeSingle()
  if (!profile) return []
  const { data } = await supabase
    .from('currency_transactions')
    .select('*')
    .eq('profile_id', profile.id)
    .order('created_at')
  return (data ?? []).map((t) => ({
    id: t.id,
    currency: t.currency,
    source: t.source,
    amount: t.amount,
    createdAt: t.created_at,
    refId: t.ref_id ?? undefined,
  }))
}

export async function grantItem(
  _uid: string,
  itemId: string,
  quantity: number,
  source: ItemSource,
): Promise<ItemResult> {
  const { data, error } = await supabase.rpc('grant_item', {
    p_item_id: itemId,
    p_quantity: quantity,
    p_source: source,
  })
  if (error || !data) return { ok: false, error: error?.message ?? 'บันทึกข้อมูลไม่สำเร็จ' }
  const player = await loadPlayer(data.id)
  if (!player) return { ok: false, error: 'บันทึกข้อมูลไม่สำเร็จ' }
  return { ok: true, player }
}

export async function grantCharacter(
  _uid: string,
  characterId: string,
): Promise<CharacterGrantResult> {
  // ผ่าน RPC เหมือน earnGold/grantItem — owned_characters ไม่มี INSERT policy ให้ authenticated
  // ตรง ๆ โดยตั้งใจ + ฟังก์ชันเองเช็ค admin_accounts อีกชั้น (0004_admin_accounts.sql) —
  // ก่อนหน้านี้ไม่มีเช็คสิทธิ์เลย เรียก RPC ตรงผ่าน devtools ได้ตัวละครฟรีทุกตัว แก้แล้ว
  const { data, error } = await supabase.rpc('grant_character', { p_character_id: characterId })
  if (error) {
    return {
      ok: false,
      error: error.message.includes('duplicate') ? 'ครอบครองตัวละครนี้อยู่แล้ว' : error.message,
    }
  }
  if (!data) return { ok: false, error: 'บันทึกข้อมูลไม่สำเร็จ' }

  const player = await loadPlayer(data.id)
  if (!player) return { ok: false, error: 'บันทึกข้อมูลไม่สำเร็จ' }
  return { ok: true, player, characterId }
}

/** exportSave: ยังไม่มีความหมายเดิมกับ Supabase (ไม่มี localStorage ให้ย้ายออก) */
export async function exportSave(): Promise<
  { ok: true; json: string } | { ok: false; error: string }
> {
  return { ok: false, error: 'ฟีเจอร์นี้ใช้กับบัญชี Supabase ไม่ได้ — ข้อมูลอยู่บนเซิร์ฟเวอร์แล้ว' }
}
