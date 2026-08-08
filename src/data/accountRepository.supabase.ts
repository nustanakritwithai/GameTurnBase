import { supabase } from '../lib/supabaseClient'
import { reportError } from '../lib/errors/reportError'
import { generateUid } from '../game/uid'
import { TEAM_SIZE } from '../game/team'
import { migrateOwnedCharacters } from '../game/progression/progressionMigration'
import { mapOwnedCharacterRow } from './accountRepository.supabase.mapping'
import type { RealtimeBattleResult } from '../game/realtimeBattle/types'
import { EMPTY_PROGRESS, type FriendCandidate, type Player } from '../types/player'
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
export { mapOwnedCharacterRow } from './accountRepository.supabase.mapping'
export type { OwnedCharacterRow } from './accountRepository.supabase.mapping'

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

/**
 * ค้นหาผู้เล่นอื่นจาก UID (เพิ่มเพื่อน) — ผ่าน RPC `find_player_by_uid`
 * (supabase/migrations/0012_public_profile_lookup.sql) ไม่ query ตาราง profiles ตรง ๆ เพราะ
 * SELECT RLS policy เดียวของตารางนั้นคือ auth.uid() = id (แถวตัวเองเท่านั้น) — query ตรงหา
 * UID คนอื่นได้ 0 แถวเสมอ (เคย broken แบบเงียบ ๆ มาก่อน ดู .agents/rules/public-profile-lookup-law.md)
 */
export async function findPlayerByUid(uid: string): Promise<FriendCandidate | null> {
  // returns table(...) มาเป็น array เสมอผ่าน PostgREST (ไม่ใช่ object เดี่ยว) — ไม่ chain
  // .maybeSingle() เพราะ type ของ supabase-js แคบผิดตอนไม่มี generated Database type ให้ client
  const { data, error } = await supabase.rpc('find_player_by_uid', { p_uid: uid })
  // เช็ค error แยกจาก "หาไม่เจอจริง" ไว้เสมอ — เดิมไม่เช็คเลย ทำให้ RPC พัง/สิทธิ์ไม่ครบ
  // ดูเหมือน "ไม่พบผู้เล่น" เฉย ๆ บนหน้าจอ ซึ่งเป็นสาเหตุเดิมที่ฟีเจอร์นี้พังเงียบ ๆ มาก่อน
  // (ดู .agents/rules/public-profile-lookup-law.md) — SILENT เพราะ UI แสดงข้อความเดียวกัน
  // ทั้งสองกรณีอยู่แล้ว รหัสมีไว้แยกสาเหตุฝั่ง log เท่านั้น
  if (error) reportError('FRIEND_LOOKUP_FAIL', 'silent', error)
  const row = (data as FriendCandidate[] | null)?.[0]
  if (!row) return null
  return { uid: row.uid, name: row.name, level: row.level, title: row.title }
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

/**
 * ⚠️ `uid` ต้องเป็นของบัญชีที่ login อยู่ตอนนี้เท่านั้น — ห้ามใช้เรียกดูของบัญชีอื่นเด็ดขาด
 *
 * ตาราง profiles มี SELECT RLS policy เดียวคือ auth.uid() = id (แถวตัวเองเท่านั้น) ถ้าเรียกด้วย
 * uid ของคนอื่น query ด้านล่างได้ 0 แถวเงียบ ๆ — คืน [] เหมือน "ไม่มีธุรกรรมเลย" ทุกประการ
 * แยกไม่ออกจากกรณีจริง เป็น landmine คลาสเดียวกับที่ findPlayerByUid เคยพังเงียบ ๆ ในโปรดักชันมา
 * ก่อนแก้ผ่าน RPC เฉพาะ (ดู .agents/rules/public-profile-lookup-law.md +
 * supabase/migrations/0012_public_profile_lookup.sql) — ต่างกันตรงที่ฟังก์ชันนี้**ยังไม่ได้ผูก
 * เข้ากับ useAuth.ts หรือหน้าจอไหนเลย** (grep ยืนยันแล้ว, 2026-08-08) จึงยังไม่เคยถูกเรียกด้วย uid
 * ที่ไม่ใช่ของตัวเองจริง ๆ — สัญญาณเตือนนี้มีไว้ให้คนที่จะผูกใช้งานจริงในอนาคตเห็นก่อนพลาดซ้ำ
 * ไม่ใช้ auth.uid() ตรง ๆ แทน param `uid` เพราะฟังก์ชันนี้ต้อง shape parity กับ accountRepository.ts
 * (localStorage backend, keyed ด้วย uid ไม่ใช่ session) ดู work contract #14 done-criterion #1
 */
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

export interface PendingLobbyRewardRow {
  transactionId: string
  stageId: string
  stageName: string
  outcome: 'victory' | 'defeat'
  earnedExp: number
  earnedGold: number
  droppedItems: Array<{ itemId: string; quantity: number }>
  finishedAt: string
  durationMs?: number | null
}

export interface LobbyBattleProgressionRpcPayload {
  transactionId: string
  player: Player
  leadCharacterId: string
  battle: {
    externalId: string
    opponent: string
    result: 'win' | 'lose'
    durationMs: number
    finishedAt: string
  }
}

export async function commitLobbyBattleProgression(
  payload: LobbyBattleProgressionRpcPayload,
): Promise<{ ok: true; player: Player } | { ok: false; error: string }> {
  const lead = payload.player.ownedCharacters.find(
    (owned) => owned.characterId === payload.leadCharacterId,
  )
  if (!lead) {
    return { ok: false, error: 'ไม่พบตัวละครขุนพลสำหรับบันทึกความคืบหน้า' }
  }

  const { data, error } = await supabase.rpc('commit_lobby_battle_progression', {
    p_transaction_id: payload.transactionId,
    p_name: payload.player.name,
    p_title: payload.player.title,
    p_profile_level: payload.player.level,
    p_profile_exp: payload.player.exp,
    p_profile_exp_to_next: payload.player.expToNext,
    p_frame_id: payload.player.frameId,
    p_flags: payload.player.progress.flags,
    p_defeated_npc_ids: payload.player.progress.defeatedNpcIds,
    p_lead_character_id: payload.leadCharacterId,
    p_hero_level: lead.level,
    p_hero_exp: lead.exp,
    p_hero_exp_to_next: lead.expToNext,
    p_skill_levels: lead.skillLevels,
    p_talent_state: lead.talentState ?? { unlockedNodes: [] },
    p_awakening_state: lead.awakeningState ?? { tier: 0, unlockedEffects: [] },
    p_battle_external_id: payload.battle.externalId,
    p_opponent: payload.battle.opponent,
    p_battle_result: payload.battle.result,
    p_duration_ms: payload.battle.durationMs,
    p_finished_at: payload.battle.finishedAt,
  })

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'บันทึกความคืบหน้าไม่สำเร็จ' }
  }

  const player = await loadPlayer(data.id)
  if (!player) return { ok: false, error: 'บันทึกความคืบหน้าไม่สำเร็จ' }
  return { ok: true, player }
}

export async function upsertPendingLobbyReward(
  result: RealtimeBattleResult,
  transactionId: string,
): Promise<boolean> {
  const { error } = await supabase.rpc('upsert_pending_lobby_reward', {
    p_transaction_id: transactionId,
    p_stage_id: result.stageId,
    p_stage_name: result.stageName,
    p_outcome: result.outcome,
    p_earned_exp: result.earnedExp,
    p_earned_gold: result.earnedGold,
    p_dropped_items: result.droppedItems,
    p_finished_at: result.finishedAt,
    p_duration_ms: result.elapsedMs,
  })
  return !error
}

export async function clearPendingLobbyReward(transactionId: string): Promise<void> {
  await supabase.rpc('clear_pending_lobby_reward', { p_transaction_id: transactionId })
}

export async function getPendingLobbyRewards(): Promise<PendingLobbyRewardRow[]> {
  const { data: session } = await supabase.auth.getSession()
  const userId = session.session?.user.id
  if (!userId) return []

  const { data } = await supabase
    .from('pending_lobby_rewards')
    .select('*')
    .eq('profile_id', userId)
    .order('created_at')

  return (data ?? []).map((row) => ({
    transactionId: row.transaction_id,
    stageId: row.stage_id,
    stageName: row.stage_name,
    outcome: row.outcome as 'victory' | 'defeat',
    earnedExp: row.earned_exp,
    earnedGold: row.earned_gold,
    droppedItems: (row.dropped_items ?? []) as Array<{ itemId: string; quantity: number }>,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
  }))
}

export async function grantItem(
  _uid: string,
  itemId: string,
  quantity: number,
  source: ItemSource,
  refId?: string,
): Promise<ItemResult> {
  const { data, error } = await supabase.rpc('grant_item', {
    p_item_id: itemId,
    p_quantity: quantity,
    p_source: source,
    p_ref_id: refId ?? null,
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
