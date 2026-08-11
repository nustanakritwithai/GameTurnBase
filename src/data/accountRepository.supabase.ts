import { getSupabase } from '../lib/supabaseClient'
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
  type GachaPullResult,
  type ItemResult,
  type ItemSource,
  type StarAscensionResult,
  type AccountRepositorySubset,
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
export type { StarAscensionResult }
export type { GachaPullResult }
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
  const supabase = getSupabase()
  const results = await Promise.all([
    supabase.from('profiles').select('*').eq('id', profileId).maybeSingle(),
    supabase.from('owned_characters').select('*').eq('profile_id', profileId),
    supabase.from('team_slots').select('*').eq('profile_id', profileId).order('slot_index'),
    supabase.from('inventory_items').select('*').eq('profile_id', profileId),
    supabase.from('friends').select('*').eq('profile_id', profileId),
    supabase.from('battle_history').select('*').eq('profile_id', profileId).order('finished_at'),
    supabase.from('admin_accounts').select('profile_id').eq('profile_id', profileId).maybeSingle(),
    supabase.from('gacha_pity').select('banner_id,pity_count').eq('profile_id', profileId),
  ])

  /*
    เช็ค error ให้ครบทั้ง 8 คำขอ ไม่ใช่แค่ profiles ตัวเดียวเหมือนเดิม

    supabase-js ไม่ throw — คืน { data, error } เสมอ คำขอที่ล้ม (เน็ตหลุด/RLS/timeout) จึงมี
    data เป็น null แล้วโค้ดด้านล่างที่เขียน `?? []` ไว้ทุกบรรทัดกลืนมันเป็น "ไม่มีข้อมูล"
    อย่างเงียบสนิท ผู้เล่นเข้าเกมมาด้วยทีมว่าง กระเป๋าว่าง เพื่อนหาย — แล้ว savePlayer
    ครั้งถัดไป upsert ทีมว่างทับทีมจริงในฐานข้อมูล ข้อมูลหายถาวรจากคำขอที่ล้มชั่วคราวครั้งเดียว

    ล้มดัง ๆ ดีกว่า: คืน null (ผู้เรียกทุกรายแสดงข้อความ "โหลดข้อมูลผู้เล่นไม่สำเร็จ" อยู่แล้ว)
    บวก reportError tier 'visible' ที่ GlobalErrorBanner รับไปแสดงพร้อมรหัส
  */
  const failed = results.find((result) => result.error !== null)
  if (failed) {
    reportError('PLAYER_LOAD_FAIL', 'visible', failed.error)
    return null
  }

  const [profileRes, charsRes, slotsRes, itemsRes, friendsRes, historyRes, adminRes, pityRes] =
    results

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
    gachaPity: Object.fromEntries(
      (pityRes.data ?? []).map((row) => [row.banner_id as string, row.pity_count as number]),
    ),
  }
}

interface GachaRpcPayload {
  results: Array<{
    characterId: string
    rarity: 'common' | 'rare' | 'epic' | 'legendary'
    isPity: boolean
    isNew: boolean
    shardsGranted: number
  }>
  cost: number
  currencyUsed: 'gem' | 'gold'
  newPity: number
}

interface GachaRpcRow {
  payload: GachaRpcPayload
  replayed: boolean
}

/** Server-authoritative Gacha: Gem debit, RNG, pity and Hero/shard grants commit in one RPC. */
export async function pullGacha(
  bannerId: string,
  pullCount: 1 | 10,
  requestId: string,
): Promise<GachaPullResult> {
  const { data, error } = await getSupabase().rpc('perform_gacha_pull', {
    p_request_id: requestId,
    p_banner_id: bannerId,
    p_pull_count: pullCount,
  })
  if (error) return { ok: false, error: error.message }

  const row = (data as GachaRpcRow[] | null)?.[0]
  if (!row?.payload) return { ok: false, error: 'อัญเชิญไม่สำเร็จ ลองใหม่อีกครั้ง' }

  const { data: sessionData } = await getSupabase().auth.getSession()
  const profileId = sessionData.session?.user.id
  if (!profileId) return { ok: false, error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' }

  const player = await loadPlayer(profileId)
  if (!player) return { ok: false, error: 'อัญเชิญสำเร็จแต่โหลดข้อมูลผู้เล่นไม่สำเร็จ' }

  return {
    ok: true,
    player,
    results: row.payload.results,
    cost: row.payload.cost,
    currencyUsed: row.payload.currencyUsed,
    newPity: row.payload.newPity,
    replayed: row.replayed,
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
    const { data, error } = await getSupabase().auth.signUp({
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

/**
 * ข้อความเดียวที่ครอบทั้ง "รหัสผ่านผิด" และ "ไม่มีบัญชีของอีเมลนี้แล้ว"
 *
 * ── ทำไมไม่แยกสองกรณีนี้ออกจากกัน ────────────────────────────────────────────
 * **แยกไม่ได้จริง ๆ ไม่ใช่เลือกจะไม่แยก** — ยืนยันจากซอร์สของเซิร์ฟเวอร์ ไม่ใช่การเดา:
 * supabase/auth `internal/api/token.go` (ResourceOwnerPasswordGrant) คืน
 * `NewBadRequestError(ErrorCodeInvalidCredentials, InvalidLoginMessage)` ตัวเดียวกันทั้งกิ่ง
 * "หาผู้ใช้ไม่เจอ" และกิ่ง "รหัสผ่านไม่ถูก" → HTTP 400 + error_code `invalid_credentials` +
 * msg "Invalid login credentials" เหมือนกันทุกไบต์ ส่วน `user_not_found` ที่มีอยู่ในรายการ
 * ErrorCode ของ auth-js ไม่เคยออกจาก endpoint นี้เลย (มีแต่ admin API / JWT sub / OAuth)
 * และไม่มีสวิตช์ระดับโปรเจกต์ให้เปิดคำตอบแบบละเอียด
 *
 * และต่อให้แยกได้ก็ไม่ควรแยก: หน้าสมัครเปิดให้ทุกคน คำตอบที่ต่างกันจึงกลายเป็น oracle
 * ให้คนนอกไล่เก็บรายชื่ออีเมลผู้เล่นได้ฟรี
 *
 * ของเดิมคือ 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' ประโยคเดียว ซึ่ง**ไม่ผิดแต่ไม่ครบ**: มันบอกเป็นนัยว่า
 * สาเหตุเดียวที่เป็นไปได้คือพิมพ์ผิด ผู้เล่นที่บัญชีถูกลบไปแล้ว (หรือจำรหัสผ่านไม่ได้จริง ๆ)
 * จึงพิมพ์ซ้ำไปเรื่อย ๆ แล้วสรุปเอาเองว่าเซฟหาย/โดนแฮก ทั้งที่ไม่ใช่ทั้งคู่ ข้อความนี้จึงบอก
 * **ทั้งสองความเป็นไปได้** โดยไม่บอกว่าอันไหน
 *
 * ⚠️ ประโยคท้ายพูดตรง ๆ ว่า "ยังไม่มีระบบตั้งรหัสผ่านใหม่" เพราะตอนนี้**ไม่มีจริง ๆ**: ทางกู้บัญชี
 * ทางอีเมลเขียนไว้แล้วแต่ยังส่งไม่ออก โปรเจกต์ยังไม่ได้ตั้ง custom SMTP (`smtp_host` เป็น null)
 * อีเมลบริการเริ่มต้นของ Supabase จึงปฏิเสธทุกปลายทางที่ไม่ได้อยู่ในทีมของโปรเจกต์ ห้ามเปลี่ยน
 * ประโยคนี้ไปชี้ปุ่ม/ลิงก์ใด ๆ จนกว่าปุ่มนั้นจะมีอยู่บนจอจริง — สัญญาที่ไม่มีของอยู่หลังมันคือ
 * ทางตันแบบเดียวกับที่งานนี้กำลังแก้อยู่ (ปุ่มสำรองข้อมูลบนหน้าจอ crash ที่โปรเจกต์นี้ลบทิ้ง
 * ไปแล้วด้วยเหตุผลเดียวกันเป๊ะ ๆ)
 */
export const SIGN_IN_FAILED_MESSAGE =
  'เข้าสู่ระบบไม่สำเร็จ — อีเมลหรือรหัสผ่านไม่ถูกต้อง หรืออีเมลนี้ไม่มีบัญชีอยู่ในระบบแล้ว ' +
  'ตรวจอีเมลและรหัสผ่านอีกครั้งแล้วลองใหม่ ตอนนี้เกมยังไม่มีระบบตั้งรหัสผ่านใหม่'

const SIGN_IN_NETWORK_MESSAGE =
  'ติดต่อเซิร์ฟเวอร์ไม่สำเร็จ ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่อีกครั้ง'

const SIGN_IN_UNEXPECTED_MESSAGE = 'เข้าสู่ระบบไม่สำเร็จด้วยข้อผิดพลาดที่ไม่คาดคิด ลองใหม่อีกครั้ง'

/**
 * code ที่ GoTrue ส่งมาจริงตอนเข้าสู่ระบบไม่ผ่าน → ข้อความที่ "ตรงกับสาเหตุนั้นจริง ๆ"
 *
 * ⚠️ กฎของตารางนี้: **ใส่ได้เฉพาะ code ที่ยิงได้โดยไม่สนว่าอีเมลนั้นมีบัญชีอยู่หรือไม่**
 * ทั้งสองตัวที่อยู่ในนี้ผ่านเกณฑ์: rate limit นับตามผู้เรียก และ captcha ถูกตรวจ *ก่อน* หา
 * ผู้ใช้ในฐานข้อมูล ทั้งคู่จึงตอบเหมือนกันทั้งอีเมลที่มีบัญชีและไม่มี
 *
 * `email_not_confirmed` กับ `user_banned` เคยอยู่ในตารางนี้และถูก**ถอดออกโดยตั้งใจ** ทั้งคู่ยิงได้
 * เฉพาะเมื่อ "หาผู้ใช้เจอแล้ว" เท่านั้น ข้อความเฉพาะของมันจึงเป็นคำตอบที่ต่างจาก
 * SIGN_IN_FAILED_MESSAGE ให้กับอีเมลที่มีบัญชี = account-existence oracle บนเส้นทางล็อกอิน
 * ซึ่งเป็นสิ่งเดียวกับที่ invalid_credentials จงใจไม่ทำ (ดู SIGN_IN_FAILED_MESSAGE) วัดกับ
 * โปรเจกต์จริงเมื่อ 2026-08-11: `mailer_autoconfirm: true`, ผู้ใช้ที่ยังไม่ยืนยัน 0 คน, ถูกแบน
 * 0 คน — email_not_confirmed จึงยิงไม่ได้เลยวันนี้ และวันที่มันยิงได้ (วันที่ปิด autoconfirm
 * = วันเดียวกับที่ตั้ง SMTP) คือวันที่ oracle ติดอาวุธเอง ทั้งคู่ตกไปที่ข้อความกลาง ๆ แทน
 * ถ้าจะเพิ่ม code ใหม่เข้าตารางนี้ ต้องตอบให้ได้ก่อนว่ามันยิงให้อีเมลที่ "ไม่มี" บัญชีด้วยหรือไม่
 */
const SIGN_IN_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: SIGN_IN_FAILED_MESSAGE,
  over_request_rate_limit: 'ลองเข้าสู่ระบบถี่เกินไป รอสักครู่แล้วลองใหม่อีกครั้ง',
  captcha_failed: 'ตรวจสอบว่าไม่ใช่บอทไม่ผ่าน โหลดหน้าใหม่แล้วลองอีกครั้ง',
}

/**
 * แปล error ของ Supabase Auth เป็นข้อความที่ตรงกับสาเหตุจริง — แยกเป็นฟังก์ชันบริสุทธิ์เพื่อให้
 * เทสต์ตรึงได้ (แบบเดียวกับ resolveOAuthRedirectUrl ด้านล่าง)
 *
 * เดิม `login()` ตอบ 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' ให้ **ทุก** ความล้มเหลว ไม่ใช่แค่สองกรณี
 * ที่แยกไม่ได้จริง: เน็ตหลุด, เซิร์ฟเวอร์ 5xx, Turnstile ไม่ผ่าน, โดน rate limit — ทั้งหมดนี้
 * แยกออกจากกันได้ชัดเจนที่ฝั่งเรา แต่ผู้เล่นได้รับคำตอบเดียวกันหมดว่า "รหัสผ่านคุณผิด"
 * ซึ่งไม่จริงและทำให้เขาไปแก้ผิดจุด (เปลี่ยนรหัสผ่านทั้งที่ปัญหาคือ Wi-Fi)
 *
 * แยกสองชั้น: network/5xx มาจากคลาส AuthRetryableFetchError (auth-js โยนคลาสนี้ให้ status 0
 * และ 500–530 ดู @supabase/auth-js/src/lib/fetch.ts) ไม่มี `code` ให้ดู ที่เหลือดูจาก `code`
 * ที่ GoTrue ส่งมาตรง ๆ code ที่ไม่รู้จักตกไป "ไม่คาดคิด" ไม่ใช่ตกไป "รหัสผ่านผิด" — เดาแทน
 * ผู้เล่นว่าเป็นความผิดของเขาคือความผิดพลาดเดิมที่กำลังแก้อยู่ และ default ตัวนี้ยังเป็นตัวที่
 * ทำให้ code ที่รู้ว่าบัญชีมีอยู่ (email_not_confirmed / user_banned) ไม่รั่วออกไปด้วย
 */
export function describeSignInError(
  error: { name?: string; code?: string } | null | undefined,
): string {
  // ไม่มี error แต่ก็ไม่มี user กลับมา — ไม่ควรเกิด แต่ถ้าเกิดก็ไม่ใช่ความผิดของรหัสผ่านแน่ ๆ
  if (!error) return SIGN_IN_UNEXPECTED_MESSAGE
  if (error.name === 'AuthRetryableFetchError') return SIGN_IN_NETWORK_MESSAGE
  return SIGN_IN_ERROR_MESSAGES[error.code ?? ''] ?? SIGN_IN_UNEXPECTED_MESSAGE
}

export async function login(
  email: string,
  password: string,
  captchaToken?: string,
): Promise<AuthResult> {
  const { data, error } = await getSupabase().auth.signInWithPassword({
    email: email.trim(),
    password,
    options: { captchaToken },
  })
  if (error || !data.user) {
    // SILENT — ผู้เล่นเห็นข้อความบนกล่องล็อกอินอยู่แล้ว รหัสมีไว้แยกว่าล้มเพราะอะไรฝั่ง log
    // (ข้อความบนจอรวมสองกรณีที่แยกไม่ได้ไว้ด้วยกันโดยตั้งใจ — ดู SIGN_IN_FAILED_MESSAGE)
    reportError('AUTH_SUBMIT_FAIL', 'silent', error)
    return { ok: false, error: describeSignInError(error) }
  }

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
  const { data, error } = await getSupabase().auth.signInAnonymously({ options: { captchaToken } })
  if (error || !data.user)
    return { ok: false, error: 'เข้าเล่นแบบ guest ไม่สำเร็จ ลองใหม่อีกครั้ง' }

  const player = await loadPlayer(data.user.id)
  if (!player) return { ok: false, error: 'เข้าเล่นแบบ guest ไม่สำเร็จ ลองใหม่อีกครั้ง' }
  return { ok: true, player }
}

/**
 * URL ที่ผู้ให้บริการ OAuth ต้องส่งผู้ใช้กลับมา — ต้องเป็น "หน้าแอปจริง" ไม่ใช่แค่ origin
 *
 * เดิมโค้ดส่ง `window.location.origin` ตรง ๆ ซึ่งเป็นบั๊กจริงที่เจอบน production (2026-08-09):
 * แอปอยู่ที่ https://katomnoistudio.github.io/LegendOfSoulTH/ (GitHub Pages *project site*,
 * vite ตั้ง base = '/LegendOfSoulTH/') แต่ `origin` ตัด path ทิ้งเสมอ คืนแค่
 * https://katomnoistudio.github.io — Google จึงส่งกลับไปที่ root ขององค์กรซึ่ง "ไม่มีแอปอยู่"
 * ผลคือไม่มีใครเรียก detectSessionInUrl → token ค้างอยู่ในช่อง address และผู้ใช้ไม่ได้ล็อกอิน
 *
 * แยกเป็นฟังก์ชันบริสุทธิ์เพื่อให้เทสต์ตรึงได้ว่า base path ไม่หลุดอีก (ดูเทสต์ในไฟล์คู่)
 */
export function resolveOAuthRedirectUrl(origin: string, basePath: string): string {
  return new URL(basePath, origin).href
}

function appRedirectUrl(): string {
  return resolveOAuthRedirectUrl(window.location.origin, import.meta.env.BASE_URL)
}

/**
 * เริ่ม OAuth flow กับ Google — เปลี่ยนหน้าออกไปยัง Google ทันที (ไม่ใช่ popup)
 * แล้ว Google ส่งกลับมาที่ redirectTo พร้อม `?code=` (PKCE — ดู supabaseClient.ts) ซึ่ง
 * supabase-js แลกเป็น session เองอัตโนมัติ (ค่าเริ่มต้น detectSessionInUrl: true) —
 * useAuth's getSessionPlayer()/onAuthStateChange ที่มีอยู่แล้วจะเห็น session นี้เหมือน login
 * ปกติทุกประการ ไม่ต้องเพิ่มโค้ดฝั่งรับ callback เอง
 *
 * ⚠️ redirectTo ต้องถูกเพิ่มใน Supabase Dashboard → Authentication → URL Configuration →
 * Redirect URLs ด้วย ไม่งั้น Supabase ปฏิเสธ redirect
 *
 * handle_new_user() trigger (0001_init.sql) สร้าง profile/starter character ให้อัตโนมัติ
 * เหมือน register() ทุกประการ — ไม่สนใจว่าผู้ใช้เข้ามาทาง email/password หรือ OAuth
 *
 * คืนค่าแค่ตอนยิง redirect ไม่สำเร็จ (เช่น provider ยังไม่เปิดใน Supabase Dashboard) —
 * ตอนสำเร็จหน้าเปลี่ยนไปแล้ว ไม่มีทางกลับมา return ที่นี่ได้ทัน
 */
export async function signInWithGoogle(): Promise<{ ok: boolean; error?: string }> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: appRedirectUrl() },
  })
  if (error) return { ok: false, error: 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ ลองใหม่อีกครั้ง' }
  return { ok: true }
}

/**
 * ผู้ให้บริการที่บัญชีนี้ล็อกอินได้ตอนนี้ — ใช้โชว์ "เชื่อมบัญชี Google แล้ว" ใน SettingsModal
 * ต้องล็อกอินอยู่ก่อน (getUserIdentities อ่านจาก session ปัจจุบัน) — ยังไม่ล็อกอิน = อาร์เรย์ว่าง
 */
export async function getLinkedProviders(): Promise<string[]> {
  const { data } = await getSupabase().auth.getUserIdentities()
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
  const { error } = await getSupabase().auth.linkIdentity({
    provider: 'google',
    options: { redirectTo: appRedirectUrl() },
  })
  if (error) return { ok: false, error: 'เชื่อมบัญชี Google ไม่สำเร็จ ลองใหม่อีกครั้ง' }
  return { ok: true }
}

export async function logout(): Promise<void> {
  await getSupabase().auth.signOut()
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

let authCacheSubscription: { unsubscribe: () => void } | null = null

/**
 * เริ่มชั้นกันพลาดของ cache อีเมล/guest — เรียกครั้งเดียวตอนบูตแอป (src/main.tsx)
 *
 * เดิมบรรทัด `supabase.auth.onAuthStateChange(...)` วางไว้ที่ module scope ตรง ๆ จึงทำงาน
 * ตั้งแต่ "ใครก็ตาม import ไฟล์นี้" รวมถึงเทสต์ที่แค่อยากเรียกฟังก์ชัน mapping สักตัว —
 * เป็น side effect ที่ยกเลิกไม่ได้ (ไม่มีใครถือ subscription ไว้เลย) และเขียนตัวแปร module
 * สามตัวโดยที่ผู้เรียกไม่รู้ตัว
 *
 * คืนฟังก์ชันเลิกรับ และเรียกซ้ำได้ปลอดภัย (ครั้งที่สองคืนตัวเลิกรับของครั้งแรก ไม่ subscribe ซ้อน)
 */
export function initAuthCache(): () => void {
  if (!authCacheSubscription) {
    const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
      cachedSessionEmail = session?.user.email ?? null
      cachedSessionIsGuest = session?.user.is_anonymous ?? false
    })
    authCacheSubscription = data.subscription
  }

  const subscription = authCacheSubscription
  return () => {
    subscription.unsubscribe()
    if (authCacheSubscription === subscription) authCacheSubscription = null
  }
}

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
  const { data } = await getSupabase().auth.getSession()
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
  const { data, error } = await getSupabase().rpc('find_player_by_uid', { p_uid: uid })
  // เช็ค error แยกจาก "หาไม่เจอจริง" ไว้เสมอ — เดิมไม่เช็คเลย ทำให้ RPC พัง/สิทธิ์ไม่ครบ
  // ดูเหมือน "ไม่พบผู้เล่น" เฉย ๆ บนหน้าจอ ซึ่งเป็นสาเหตุเดิมที่ฟีเจอร์นี้พังเงียบ ๆ มาก่อน
  // (ดู .agents/rules/public-profile-lookup-law.md) — SILENT เพราะ UI แสดงข้อความเดียวกัน
  // ทั้งสองกรณีอยู่แล้ว รหัสมีไว้แยกสาเหตุฝั่ง log เท่านั้น
  if (error) reportError('FRIEND_LOOKUP_FAIL', 'silent', error)
  const row = (data as FriendCandidate[] | null)?.[0]
  if (!row) return null
  return { uid: row.uid, name: row.name, level: row.level, title: row.title }
}

/**
 * ห้ามส่ง level/exp/exp_to_next จากที่นี่ — คอลัมน์เหล่านั้นถูก revoke สิทธิ์ UPDATE ของ role
 * `authenticated` ไปแล้ว (supabase/migrations/20260810130000_security_harden_lobby_progression_rpc.sql)
 * ทางเดียวที่เขียนได้คือ RPC `commit_lobby_battle_progression` (SECURITY DEFINER) ถ้าใส่กลับเข้ามา
 * Postgres จะตอบ 42501 → savePlayer คืน false → useAuth ย้อนการบันทึกทั้งก้อน (ทีม/เพื่อน/flags)
 * ไม่ใช่แค่ค่าความคืบหน้า — พังกว้างกว่าช่องโหว่ที่ปิดไปมาก
 *
 * `currency.gold` กับ `inventory` ก็ส่งจากที่นี่ไม่ได้เหมือนกัน และ **นั่นถูกแล้ว**
 * ─────────────────────────────────────────────────────────────────────────────
 * `profiles.gold` ถูก revoke สิทธิ์ UPDATE ตั้งแต่ 0009_economy_integrity_fixes และ
 * `inventory_items` ไม่มี write policy ให้ role `authenticated` เลยตั้งแต่ 0001_init.sql
 * (มีแต่ `select`) — เขียนได้ทางเดียวคือ RPC แบบ SECURITY DEFINER
 *
 * เดิมคอมเมนต์ตรงนี้บรรยายว่า "อัปเกรดฟรีไม่จำกัด" เป็นสภาพปัจจุบัน และเสนอให้สร้าง RPC
 * หักเงินขึ้นมา — **ปิดไปแล้วทั้งคู่** ตั้งแต่ 20260810180000: `spend_progression_upgrade`
 * หักทองพร้อมเขียนผลอัปเกรดใน transaction เดียว โดยอ่านราคาจาก `progression_cost_catalog`
 * ที่ client แตะไม่ได้ ส่วน inventory ยังเป็นฝั่งรับอย่างเดียว (`grant_item`) เพราะยังไม่มี
 * ราคาไหนใช้วัสดุ — progressionCostParity.test.ts ตรึงข้อนี้ไว้ และ planUpgrade() ปฏิเสธ
 * คำขอที่มีวัสดุแทนที่จะเก็บแต่ทอง
 */
export async function savePlayer(player: Player): Promise<boolean> {
  const supabase = getSupabase()

  const { error } = await supabase
    .from('profiles')
    .update({
      name: player.name,
      title: player.title,
      frame_id: player.frameId,
      flags: player.progress.flags,
      defeated_npc_ids: player.progress.defeatedNpcIds,
    })
    .eq('id', player.id)

  if (error) return false

  /*
    owned_characters ไม่ถูกเขียนจากที่นี่อีกต่อไปแล้ว — ทั้งตารางไม่มีคอลัมน์ที่ client เขียนได้

    เดิมบล็อกนี้เขียน skill_levels/talent_state/awakening_state ซึ่งเป็น "ผล" ของการอัปเกรด
    ส่วน "ค่าใช้จ่าย" (ทอง/ไอเทม) เขียนไม่ได้เลยเพราะคอลัมน์ถูกล็อก ผลคืออัปเกรดฟรีไม่จำกัด
    (task #26/#35) ทางแก้ไม่ใช่เปิดสิทธิ์เขียนทอง แต่คือย้าย "ผล" ไปอยู่ฝั่งเซิร์ฟเวอร์ให้
    commit พร้อมกับการหักทองใน transaction เดียว — RPC `spend_progression_upgrade`
    (supabase/migrations/20260810180000_p26_progression_cost_authority.sql)

    migration นั้น `revoke update on public.owned_characters from authenticated` โดยไม่ grant
    คืนสักคอลัมน์ ถ้าโค้ดนี้ยังส่ง Postgres จะตอบ 42501 → savePlayer คืน false → useAuth ย้อน
    การบันทึกทั้งก้อน (ทีม/เพื่อน/flags) ไม่ใช่แค่ค่าอัปเกรด — เหตุผลเดียวกับที่ #25 ต้องเอา
    level/exp/exp_to_next ออกจากฝั่ง profiles

    ทุกทางเขียนของตารางนี้เป็น SECURITY DEFINER ทั้งหมด:
      level/exp/exp_to_next         → commit_lobby_battle_progression
      star/shards                   → ascend_character_star (20260808204905)
      skill/talent/awakening        → spend_progression_upgrade (20260810180000)

    ⚠ ประโยคข้างบนเป็นจริง "หลัง 20260810180000 §6" เท่านั้น ไม่ใช่หลัง revoke อย่างเดียว —
    ฉบับก่อนของคอมเมนต์นี้เขียนเหมือนว่า revoke ปิดครบแล้ว ซึ่งไม่จริง:
    `commit_lobby_battle_progression` (20260810130000:112-114) รับ p_skill_levels/p_talent_state/
    p_awakening_state แล้วเขียนลงตรง ๆ ที่ :256-263 โดยไม่ตรวจอะไรเลย และเป็น SECURITY DEFINER
    (รันด้วยสิทธิ์เจ้าของ) revoke ของ client จึงไม่แตะมัน — ช่องอัปเกรดฟรียังเปิดอยู่ทั้งรอบ QC
    §6 ของ migration นั้นตัดสามพารามิเตอร์ทิ้ง (ไม่ใช่แค่เลิกเขียน) และ commitLobbyBattleProgression
    ด้านล่างเลิกส่งไปด้วย
  */

  /*
    friends: เขียนจริงตั้งแต่ตอนนี้ — เดิม loadPlayer อ่านตารางนี้มาใส่ Player แต่ savePlayer
    ไม่เคยเขียนกลับเลยสักบรรทัด ผลคือ AddFriendPanel ขึ้น toast "เพิ่มเป็นเพื่อนแล้ว" (เพราะ
    savePlayer คืน true จริง ๆ) แล้วเพื่อนหายทุกครั้งที่โหลดใหม่ ตารางกับ RLS write policy
    มีอยู่แล้วตั้งแต่ 0001_init.sql:113 — ขาดแค่ฝั่ง client เรียกใช้

    upsert ก่อน แล้วค่อยลบส่วนเกิน โดยตั้งใจ: ถ้าลำดับกลับกันแล้วขั้นที่สองล้ม รายชื่อเพื่อน
    จะหายทั้งก้อน ลำดับนี้อย่างแย่ที่สุดคือเหลือเพื่อนที่ลบไปแล้วค้างไว้ ซึ่งการเซฟครั้งหน้าเก็บกวาดต่อได้
  */
  const friendRows = player.friends.map((friend) => ({
    profile_id: player.id,
    friend_uid: friend.uid,
    name: friend.name,
    level: friend.level,
    title: friend.title,
  }))

  if (friendRows.length > 0) {
    const { error: friendError } = await supabase.from('friends').upsert(friendRows)
    if (friendError) return false
  }

  const removeStaleFriends = supabase.from('friends').delete().eq('profile_id', player.id)
  const { error: friendPruneError } = await (friendRows.length > 0
    ? removeStaleFriends.not(
        'friend_uid',
        'in',
        `("${friendRows.map((r) => r.friend_uid).join('","')}")`,
      )
    : removeStaleFriends)
  if (friendPruneError) return false

  /*
    ทีมว่างทั้ง 4 ช่องทั้งที่มีตัวละครในบัญชี = สถานะที่ UI สร้างไม่ได้เลย (CharacterRosterModal
    เขียน [selected.id, null, null, null] เสมอ มีหัวหน้าทีมทุกครั้ง) มาจากทางเดียวคือ Player
    ในหน่วยความจำถูกประกอบจากข้อมูลที่โหลดไม่ครบ — ปล่อยให้ upsert ต่อคือเขียนทีมว่างทับทีมจริง
    ในฐานข้อมูล ปฏิเสธแล้วล้มดัง ๆ ดีกว่า (ชั้นสองของการแก้ loadPlayer ด้านบน)
  */
  const hasEmptyTeam = player.teamSlots.every((characterId) => characterId === null)
  if (hasEmptyTeam && player.ownedCharacters.length > 0) {
    reportError('PLAYER_SAVE_FAIL', 'visible', new Error('refusing to save an empty team'))
    return false
  }

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
  const { data, error } = await getSupabase().rpc('earn_gold', {
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
  const { data, error } = await getSupabase().rpc('redeem_coupon', { p_code: code })
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
 *
 * คืนเฉพาะช่วงร้อน (< 12 เดือน) — รายการเก่ากว่านั้นถูกย้ายไป currency_transactions_archive
 * โดย cron รายเดือน (ไม่เคยลบทิ้ง, ดู CurrencyTransaction's JSDoc ใน accountRepository.shared.ts
 * + .agents/rules/currency-ledger-retention.md) ยอดสะสมตลอดชีพที่ตรงเสมอต่อให้รายการย่อยถูกย้าย
 * อยู่ที่ profiles.lifetime_gold_earned/lifetime_gem_earned ไม่ใช่ผลรวมจากอาร์เรย์นี้
 */
export async function getTransactions(uid: string): Promise<CurrencyTransaction[]> {
  const { data: profile } = await getSupabase()
    .from('profiles')
    .select('id')
    .eq('uid', uid)
    .maybeSingle()
  if (!profile) return []
  const { data } = await getSupabase()
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

  const { data, error } = await getSupabase().rpc('commit_lobby_battle_progression', {
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
    /*
      ห้ามส่ง p_skill_levels/p_talent_state/p_awakening_state กลับเข้ามาอีก — พารามิเตอร์สามตัวนี้
      ถูก "ตัดออกจาก signature" ใน 20260810180000 §6 ไม่ใช่แค่เลิกเขียน ใส่กลับ = PGRST202

      เดิม RPC นี้เขียนสามคอลัมน์นั้นตรง ๆ โดยไม่ตรวจอะไรเลย ทั้งที่เป็น SECURITY DEFINER —
      แปลว่าอัปสกิล/พรสวรรค์/ปลุกพลังครบทุกช่องได้ฟรีผ่านทางนี้ (วัดจริง: มูลค่า 2,940 ทอง
      บัญชีใหม่มี 500) และยังมีอีกทางหนึ่ง: `finalizeLobbyBattleRewards` รับ Player เป็น argument
      แล้วมี await คั่นก่อนเรียก RPC นี้ **หนึ่งจังหวะ** (onRecordPending — วัดแล้ว ไม่ใช่หลายจังหวะ
      ตามที่ร่างแรกเขียนไว้; อีกห้า await อยู่หลัง commit ทั้งหมด) และ battleOpen/rosterOpen ใน
      LobbyPage เป็น boolean แยกกัน เปิดพร้อมกันได้ ถ้าผู้เล่นอัปเกรดในจังหวะนั้น commit จะเขียน
      สกิลระดับเก่าทับของที่เพิ่งจ่ายเงินไป — เสียทองแล้วอัปเกรดหาย เงียบสนิท ช่องแคบ แต่ไม่ใช่ปิด
    */
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
  const { error } = await getSupabase().rpc('upsert_pending_lobby_reward', {
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

/**
 * ลบแถวรางวัลค้าง — คืน false เมื่อลบไม่สำเร็จ
 *
 * เดิมทิ้งค่า error ไปเฉย ๆ (`await` เปล่า ๆ คืน void) ซึ่งทำให้แถวที่ลบไม่ผ่านกลายเป็นแถวที่
 * ลบไม่ได้อีกเลย: รอบหน้าที่เข้าล็อบบี้ finalizeLobbyBattleRewards เห็น flag ครบแล้วจึง
 * early-return ตั้งแต่บรรทัดแรก ซึ่งอยู่ "เหนือ" จุดที่เรียกลบ — pipeline กู้รางวัลจึงวนทำงานใหม่
 * ทุกครั้งที่เข้าล็อบบี้ตลอดไป (ดูฝั่ง pipeline ที่ย้ายการลบขึ้นมาก่อน early-return แล้ว)
 */
export async function clearPendingLobbyReward(transactionId: string): Promise<boolean> {
  const { error } = await getSupabase().rpc('clear_pending_lobby_reward', {
    p_transaction_id: transactionId,
  })
  return !error
}

export async function getPendingLobbyRewards(): Promise<PendingLobbyRewardRow[]> {
  const { data: session } = await getSupabase().auth.getSession()
  const userId = session.session?.user.id
  if (!userId) return []

  const { data } = await getSupabase()
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
  const { data, error } = await getSupabase().rpc('grant_item', {
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
  const { data, error } = await getSupabase().rpc('grant_character', {
    p_character_id: characterId,
  })
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

interface StarAscensionRpcRow {
  new_star: number
  shards_remaining: number
  shards_spent: number
  replayed: boolean
}

/**
 * เลื่อนดาวผ่าน Postgres RPC เท่านั้น — `_uid` คงไว้ให้ signature เข้ากับ repository API เดิม
 * แต่ฐานข้อมูลยืนยันเจ้าของจาก auth.uid() และใช้ requestId สำหรับ retry แบบ idempotent
 */
export async function ascendCharacterStar(
  _uid: string,
  characterId: string,
  requestId: string,
): Promise<StarAscensionResult> {
  const { data, error } = await getSupabase().rpc('ascend_character_star', {
    p_request_id: requestId,
    p_character_id: characterId,
  })
  if (error) return { ok: false, error: error.message }

  const row = (data as StarAscensionRpcRow[] | null)?.[0]
  if (!row) return { ok: false, error: 'เลื่อนระดับดาวไม่สำเร็จ' }
  return {
    ok: true,
    newStar: row.new_star,
    shardsRemaining: row.shards_remaining,
    shardsSpent: row.shards_spent,
    replayed: row.replayed,
  }
}

interface ProgressionSpendRpcRow {
  gold_spent: number
  gold_balance: number
  new_level: number
  replayed: boolean
}

export type ProgressionUpgradeKind = 'skill' | 'talent' | 'awakening'

export interface ProgressionUpgradeRequest {
  requestId: string
  characterId: string
  kind: ProgressionUpgradeKind
  /** ช่องสกิล ('skill1'..'ultimate') · id ของ talent node · '' สำหรับ awakening */
  upgradeKey: string
  /** ระดับ/tier ปัจจุบันที่ client เชื่อว่าเป็น — เซิร์ฟเวอร์ใช้เทียบแบบ compare-and-swap */
  fromLevel: number
}

export type ProgressionUpgradeResult =
  | { ok: true; player: Player; goldSpent: number; newLevel: number; replayed: boolean }
  | { ok: false; error: string }

/**
 * อัปเกรดสกิล/พรสวรรค์/ปลุกพลัง — หักทองและเขียนผลใน transaction เดียวฝั่งเซิร์ฟเวอร์
 *
 * client ไม่ส่งราคามาเลย เซิร์ฟเวอร์อ่านจาก `progression_cost_catalog` เอง (ตารางที่ client
 * แตะไม่ได้) `fromLevel` ที่ส่งไปไม่ใช่ข้อมูลที่เชื่อ — เป็นแค่ "คำอ้าง" ที่เซิร์ฟเวอร์เอาไป
 * เทียบกับสถานะจริงใน owned_characters ถ้าไม่ตรงคือปฏิเสธ ซึ่งเป็นตัวกัน replay ตัวจริง
 * (`requestId` client เป็นคนสร้าง จึงกันได้แค่การยิงซ้ำของคำขอเดียวกัน ไม่ใช่การอัปเกรดซ้ำ)
 */
export async function spendProgressionUpgrade(
  request: ProgressionUpgradeRequest,
): Promise<ProgressionUpgradeResult> {
  const { data, error } = await getSupabase().rpc('spend_progression_upgrade', {
    p_request_id: request.requestId,
    p_character_id: request.characterId,
    p_upgrade_kind: request.kind,
    p_upgrade_key: request.upgradeKey,
    p_from_level: request.fromLevel,
  })
  if (error) return { ok: false, error: error.message }

  const row = (data as ProgressionSpendRpcRow[] | null)?.[0]
  if (!row) return { ok: false, error: 'อัปเกรดไม่สำเร็จ ลองใหม่อีกครั้ง' }

  const { data: sessionData } = await getSupabase().auth.getSession()
  const profileId = sessionData.session?.user.id
  if (!profileId) return { ok: false, error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' }

  const player = await loadPlayer(profileId)
  if (!player) return { ok: false, error: 'อัปเกรดสำเร็จแต่โหลดข้อมูลผู้เล่นไม่สำเร็จ' }

  return {
    ok: true,
    player,
    goldSpent: row.gold_spent,
    newLevel: row.new_level,
    replayed: row.replayed,
  }
}

/**
 * เสกทองให้บัญชีผู้ดูแลเอง (self-target เหมือน grantCharacter) — ผ่าน RPC แยกจาก earnGold
 * โดยตั้งใจ (0015_admin_grant_and_chat_block.sql): เพดานสูงกว่า earnGold's 1000/ครั้งมาก
 * (สำหรับ dev/testing) แต่ยังเช็คสิทธิ์ admin_accounts เหมือน grantCharacter ทุกประการ
 */
export async function grantGoldAdmin(amount: number): Promise<CurrencyResult> {
  const { data, error } = await getSupabase().rpc('grant_gold_admin', { p_amount: amount })
  if (error || !data) return { ok: false, error: error?.message ?? 'บันทึกข้อมูลไม่สำเร็จ' }
  const player = await loadPlayer(data.id)
  if (!player) return { ok: false, error: 'บันทึกข้อมูลไม่สำเร็จ' }
  return { ok: true, player, amount }
}

/** เสกไอเทมให้บัญชีผู้ดูแลเอง — เดียวกับ grantGoldAdmin แต่สำหรับไอเทม */
export async function grantItemAdmin(itemId: string, quantity: number): Promise<ItemResult> {
  const { data, error } = await getSupabase().rpc('grant_item_admin', {
    p_item_id: itemId,
    p_quantity: quantity,
  })
  if (error || !data) return { ok: false, error: error?.message ?? 'บันทึกข้อมูลไม่สำเร็จ' }
  const player = await loadPlayer(data.id)
  if (!player) return { ok: false, error: 'บันทึกข้อมูลไม่สำเร็จ' }
  return { ok: true, player }
}

// Type-level assertion to ensure this file's exports satisfy the common repository interface subset
export const assertion: AccountRepositorySubset = {
  register,
  login,
  logout,
  getSessionPlayer,
  getSessionEmail,
  findPlayerByUid,
  savePlayer,
  earnGold,
  redeemCoupon,
  topUpGold,
  topUpGems,
  getTransactions,
  grantItem,
  grantCharacter,
}
