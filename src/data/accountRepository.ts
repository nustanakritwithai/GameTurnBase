import { getCharacter } from '../game/characters'
import { GAME_INFO } from '../game/gameInfo'
import { getItem } from '../game/items'
import { generateUid } from '../game/uid'
import { TEAM_SIZE } from '../game/team'
import { reportError } from '../lib/errors/reportError'
import { createSalt, hashPassword, needsRehash, verifyPassword } from '../lib/password'
import { isStorageAvailable, readJson, removeKey, writeJson } from '../lib/storage'
import { EMPTY_PROGRESS, type FriendCandidate, type Player } from '../types/player'
import {
  createInitialOwnedCharacterProgress,
  migrateOwnedCharacters,
} from '../game/progression/progressionMigration'
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
  ชนิด/ค่าคงที่/ตัวตรวจสอบที่ใช้ร่วมกับ backend อื่น (เช่น accountRepository.supabase.ts)
  ย้ายไปอยู่ accountRepository.shared.ts แล้ว — ไฟล์นี้ re-export ต่อเพื่อความเข้ากันได้ย้อนหลัง
  (ผู้เรียกเดิมที่ import ชนิดพวกนี้จาก accountRepository.ts ตรง ๆ ไม่ต้องแก้)
*/
export {
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
}

/**
 * ฐานข้อมูลผู้เล่น (เวอร์ชันเก็บใน localStorage)
 *
 * ─── จุดสลับไปใช้ฐานข้อมูลจริง ────────────────────────────
 * ทุกฟังก์ชันที่ export เป็น async อยู่แล้ว และหน้าจอเรียกผ่าน interface นี้
 * เท่านั้น เมื่อมีเซิร์ฟเวอร์จริงให้เขียนไฟล์ใหม่ที่ export ชื่อเดียวกัน
 * แล้วเปลี่ยน import ที่ src/hooks/useAuth.ts จุดเดียว หน้าจอไม่ต้องแก้เลย
 *
 * ตารางที่เทียบเท่าใน SQL:
 *   accounts(uid PK, email UNIQUE, password_hash, password_salt, created_at)
 *   players(uid PK/FK, name, title, level, exp, exp_to_next, gold, gem, frame_id)
 *   owned_characters(uid FK, character_id, level, exp, exp_to_next, obtained_at)
 *   team_slots(uid FK, slot_index, character_id NULL)
 *   inventory(uid FK, item_id, quantity, obtained_at, obtained_from)
 *     — ไอเทมเพิ่มได้ผ่าน grantItem (source 'quest'/'drop') เท่านั้น กติกาเดียวกับทอง
 *   currency_transactions(id PK, uid FK, currency enum('gold','gem'),
 *     source enum('quest','drop','topup','coupon'), amount, ref_id, created_at)
 *     — ชั้นแอปบังคับว่า gold มาจาก source 'quest'/'drop'/'topup' เท่านั้น
 *       และ gem มาจาก 'topup'/'coupon' เท่านั้น (ดู earnGold/topUpGold/topUpGems/redeemCoupon
 *       ด้านล่าง — ไม่มีฟังก์ชันเซตทอง/หยกตรง ๆ ให้เรียกจากที่อื่นโดยไม่ระบุแหล่งที่มา)
 *
 * ─── ข้อจำกัดที่ต้องรู้ ────────────────────────────────────
 * ข้อมูลอยู่ในเบราว์เซอร์ของผู้เล่นเอง จึงแก้ได้ด้วย DevTools
 * ระบบนี้ใช้ "จำผู้เล่นบนเครื่องนี้" ได้ แต่ยังไม่ใช่การยืนยันตัวตนที่เชื่อถือได้
 * การ "จ่ายเงินจริง" ใน topUpGold/topUpGems ยังไม่ต่อ payment gateway — ถือว่าจ่ายสำเร็จเสมอ
 * (ใช้ทดสอบ/เดโมเท่านั้น ห้ามใช้ค้าจริงจนกว่าจะต่อระบบชำระเงินที่ตรวจสอบได้จริง)
 * ───────────────────────────────────────────────────────────
 */

const DB_KEY = 'los:db:v1'
const SESSION_KEY = 'los:session:v1'

/** อายุ session ก่อนหมดอายุถ้าไม่มีการใช้งานเลย — sliding window ต่ออายุทุกครั้งที่อ่านสำเร็จ */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

interface SessionRecord {
  uid: string
  email: string
  expiresAt: string
  /** เลขเวอร์ชันเกม (GAME_INFO.version) ตอนเขียน session นี้ — ดู readActiveSession */
  appVersion: string
}

function createSession(uid: string, email: string): SessionRecord {
  return {
    uid,
    email,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    appVersion: GAME_INFO.version,
  }
}

/*
  ผู้เรียกทุกรายต้องอ่าน session ผ่านฟังก์ชันนี้เท่านั้น ห้าม readJson(SESSION_KEY) ตรง ๆ

  เดิม session ไม่มีวันหมดอายุเลย (เขียนแค่ uid/email ไม่มี timestamp) — เข้าเกมครั้งเดียว
  ค้าง login ตลอดไปจนกว่าจะกด logout เอง ต่อให้ปิดแท็บทิ้งไปเป็นปี ผู้เล่นเจอเข้าเกมได้ทันที
  โดยไม่มีการันตีว่ายังเป็นเจ้าของอุปกรณ์จริง ๆ

  sliding window (ต่ออายุทุกครั้งที่อ่านสำเร็จ) แทนวันหมดอายุตายตัว เพราะผู้เล่นที่เล่นต่อเนื่อง
  ไม่ควรถูกเตะกลางเกมแค่เพราะ session อายุครบตามนาฬิกา — หมดอายุเฉพาะแท็บที่ปิดทิ้งไว้จริง ๆ
  เกิน 30 วันเท่านั้น

  session ยังหมดอายุทันทีถ้า appVersion ไม่ตรงกับ build ปัจจุบันด้วย (HetCreep 2026-08-07) —
  อัปเดตเกมแล้ว session เก่าใช้ต่อไม่ได้ ต้องล็อกอินใหม่เสมอ ไม่ใช่แค่ตอนแท็บที่เปิดค้างเห็น
  UpdateBanner แล้วกดรีเฟรชเอง แต่รวมถึงแท็บใหม่ที่เปิดขึ้นมาทีหลังด้วย (localStorage เดิม
  ยังอยู่แต่เป็นของ build เก่า) — กันข้อมูล Player รูปแบบเก่าที่อาจไม่ตรงกับโค้ดใหม่หลุดเข้าเกม
*/
function readActiveSession(): SessionRecord | null {
  const session = readJson<SessionRecord>(SESSION_KEY)
  if (!session) return null

  // session เก่าก่อนมีฟิลด์นี้ (เขียนไว้ตอนยังไม่มี expiry) — ถือว่าหมดอายุทันที
  // ปลอดภัยกว่าปล่อยให้ใช้ต่อแบบไม่มีเวลาจำกัดเงียบ ๆ
  if (!session.expiresAt || new Date(session.expiresAt).getTime() <= Date.now()) {
    removeKey(SESSION_KEY)
    return null
  }

  if (session.appVersion !== GAME_INFO.version) {
    removeKey(SESSION_KEY)
    return null
  }

  const renewed = createSession(session.uid, session.email)
  writeJson(SESSION_KEY, renewed)
  return renewed
}

/** ตัวละครที่ได้ฟรีตอนสมัครบัญชีใหม่ */
const STARTER_CHARACTER_ID = 'monkey-king'

export interface StoredAccount {
  uid: string
  email: string
  passwordHash: string
  passwordSalt: string
  createdAt: string
  player: Player
  /** ประวัติการได้ทอง/หยกทุกครั้ง — ใช้ตรวจสอบที่มาและกันแลกคูปองซ้ำ */
  transactions: CurrencyTransaction[]
}

interface Database {
  version: 1
  /**
   * ตัวนับรุ่นการเขียน — ไม่ใช่เลข schema version ด้านบน คนละเรื่องกัน
   * saveDb ใช้เทียบว่ามีแท็บอื่นเขียนแซงไปตั้งแต่ตอน loadDb หรือยัง (ดู saveDb)
   */
  rev: number
  /** คีย์เป็นอีเมลตัวพิมพ์เล็ก — บังคับความไม่ซ้ำของอีเมลโดยตัวโครงสร้างเอง */
  accounts: Record<string, StoredAccount>
}

/*
  มีข้อมูลเก็บอยู่จริงแต่อ่านไม่ออก (เช่น version เป็นเลขอื่น หรือไฟล์เสีย)

  ต่างจาก "ยังไม่มีอะไรเลย" คนละเรื่องกันโดยสิ้นเชิง และการแยกสองอย่างนี้เป็นเรื่องเป็นตาย:
  ถ้าไม่แยก loadDb จะคืนฐานข้อมูลเปล่าให้ แล้วการเขียนครั้งถัดไป — savePlayer ที่ยิงทุกครั้ง
  ที่ผู้เล่นทำอะไรก็ตาม — จะทับข้อมูลจริงทิ้งทั้งหมดโดยไม่มีอะไรบอก บัญชีทุกบัญชีในเบราว์เซอร์
  นั้นหายถาวรเพราะเลข version ตัวเดียวไม่ตรง ซึ่งเป็นสิ่งที่จะเกิดวันที่มีคนขึ้น version เป็น 2
  พอดี — คือวันที่ฟิลด์นี้ถูกใช้งานตามที่มันมีไว้
*/
let unreadableDb = false

/**
 * ต้องคืนอ็อบเจ็กต์ใหม่ทุกครั้ง ห้ามคืนค่าคงที่ตัวเดียวร่วมกัน
 *
 * ผู้เรียกทุกรายแก้ผลลัพธ์ตรง ๆ (`db.accounts[key] = ...` แล้วค่อย saveDb) ถ้าคืนตัวคงที่
 * ตัวเดิม การสมัครตอนพื้นที่เก็บข้อมูลเต็มจะแจ้งผู้ใช้ว่าบันทึกไม่สำเร็จ แต่บัญชีนั้นค้าง
 * อยู่ในตัวคงที่แล้ว — login ครั้งถัดไปในแท็บเดิมจึงผ่านได้ทั้งที่ไม่มีอะไรถูกบันทึกจริง
 */
function loadDb(): Database {
  const raw = readJson<Database>(DB_KEY)

  if (!raw) {
    // ไม่มีอะไรเก็บไว้ — เบราว์เซอร์ใหม่ เขียนทับได้ตามปกติ
    unreadableDb = false
    return { version: 1, rev: 0, accounts: {} }
  }

  if (raw.version !== 1 || typeof raw.accounts !== 'object') {
    unreadableDb = true
    reportError('DB_VERSION_UNSUPPORTED', 'visible', undefined, { version: raw.version })
    return { version: 1, rev: 0, accounts: {} }
  }

  unreadableDb = false
  // ข้อมูลเก่าก่อนมีฟิลด์นี้ไม่มี rev เลย — ถือเป็น 0 (เข้ากันได้กับของเดิมโดยไม่ต้อง migrate)
  return { ...raw, rev: raw.rev ?? 0 }
}

/**
 * บันทึกทับ localStorage — ปฏิเสธการเขียนถ้าอ่านฐานข้อมูลไม่ออก หรือมีแท็บอื่นเขียนแซงไปแล้ว
 *
 * ผู้เล่นเปิดเกมพร้อมกันหลายแท็บได้ (localStorage ใช้ร่วมกันทั้งเบราว์เซอร์) ทุกฟังก์ชัน
 * ในไฟล์นี้ทำ loadDb → แก้สำเนา → saveDb แบบ synchronous ไม่มีช่องให้แท็บอื่นแทรกระหว่างนั้น
 * ในแท็บเดียว แต่ "ระหว่างแท็บ" คือคนละ thread ของ JS กันเลย — แท็บ A loadDb ตอน rev=5,
 * แท็บ B ก็ loadDb ตอน rev=5 เหมือนกัน แก้แล้ว save ก่อน (rev กลายเป็น 6) แท็บ A save ทีหลัง
 * ด้วยข้อมูลที่คำนวณจาก rev=5 เดิม จะทับการเขียนของแท็บ B ทิ้งเงียบ ๆ ถ้าไม่เช็ค
 *
 * เทียบ rev ปัจจุบันในสตอเรจกับ rev ที่ db ก้อนนี้เคย loadDb มา — ตรงกันแปลว่าไม่มีใครแซง
 * เขียนได้ปกติแล้วขยับ rev ขึ้นหนึ่ง ไม่ตรง = แพ้การแข่ง คืน false เข้าช่องทางเดิมที่ผู้เรียก
 * ทุกรายเช็คอยู่แล้ว (register/login/importSave/savePlayer/earnGold/... ล้วนแปลง false
 * เป็นข้อความ "บันทึกข้อมูลไม่สำเร็จ") ผู้เล่นเห็นว่าบันทึกไม่ผ่าน แทนที่จะเห็นว่าสำเร็จ
 * แล้วข้อมูลของแท็บอื่นหายไปเงียบ ๆ — กด "ลองใหม่" (ซึ่งจะ loadDb รุ่นล่าสุดจริง) แก้ได้เอง
 */
function saveDb(db: Database): boolean {
  if (unreadableDb) return false

  const current = readJson<Database>(DB_KEY)
  const currentRev = current?.rev ?? 0
  if (db.rev !== currentRev) {
    reportError('DB_WRITE_CONFLICT', 'silent', undefined, { expected: db.rev, actual: currentRev })
    return false
  }

  return writeJson(DB_KEY, { ...db, rev: db.rev + 1 })
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function findAccountEntry(db: Database, uid: string): [string, StoredAccount] | undefined {
  return Object.entries(db.accounts).find(([, account]) => account.uid === uid)
}

/** เพิ่มรายการธุรกรรมและอัปเดตยอดทอง/หยกไปพร้อมกัน — จุดเดียวที่แก้ currency ได้ */
function appendTransaction(
  account: StoredAccount,
  entry: Omit<CurrencyTransaction, 'id' | 'createdAt'>,
): StoredAccount {
  const transaction: CurrencyTransaction = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }

  const currency = { ...account.player.currency }
  if (transaction.currency === 'gold') currency.gold += transaction.amount
  else currency.gem += transaction.amount

  return {
    ...account,
    player: { ...account.player, currency },
    transactions: [...(account.transactions ?? []), transaction],
  }
}

/* ---------------- ตารางคูปอง / แพ็กเกจเติมหยก ---------------- */

interface CouponDefinition {
  gem: number
  /** จำนวนครั้งสูงสุดที่แลกได้รวมทุกบัญชี — ไม่ระบุ = ไม่จำกัด */
  maxRedemptions?: number
  expiresAt?: string
}

/** โค้ดคูปอง — คีย์เป็นตัวพิมพ์ใหญ่เสมอ (ดู redeemCoupon ที่ normalize ก่อนเทียบ) */
export const COUPONS: Record<string, CouponDefinition> = {
  WELCOME2026: { gem: 50 },
}

/* ---------------- ผู้เล่นเริ่มต้น ---------------- */

/**
 * เติมฟิลด์ที่เพิ่มเข้ามาทีหลังให้บัญชีเก่า (progress, inventory)
 *
 * ข้อมูลใน localStorage ถูกเขียนไว้ตั้งแต่ตอนที่ Player ยังไม่มีฟิลด์นั้น การอ่านตรง ๆ
 * จึงได้ undefined แล้วหน้าจอที่วนลูป (เช่น inventory.map) จะพังทันที
 * ทุกทางที่อ่านผู้เล่นออกจากฐานข้อมูลต้องผ่านฟังก์ชันนี้เสมอ
 */
function normalizePlayer(player: Player): Player {
  /*
    ต้องเติมทุกฟิลด์ที่หน้าจอ deref ตรง ๆ ไม่ใช่แค่ฟิลด์ที่เพิ่มมาทีหลัง

    LobbyPage อ่าน `player.ownedCharacters.flatMap(...)` และ `player.teamSlots` ส่วน TopBar
    อ่าน `player.currency.gold` โดยไม่มี guard สักตัว ข้อมูลที่ขาดฟิลด์พวกนี้ (ไฟล์ save
    ที่ถูกแก้มา หรือข้อมูลใน localStorage ที่เสีย) จึงทำให้จอพังทันทีที่เรนเดอร์ และพังซ้ำ
    ทุกครั้งที่โหลดหน้าใหม่ เพราะ getSessionPlayer อ่านผ่านฟังก์ชันนี้เหมือนกัน — วนไม่จบ
    จนกว่าผู้เล่นจะล้าง localStorage เอง ซึ่งเป็นอาการเดียวกับบั๊กที่เพิ่งแก้ไปเรื่อง `player`
    หายทั้งก้อน แค่คนละระดับของโครงสร้าง

    เติมค่าว่างแล้วรายงาน ไม่ใช่เติมเงียบ ๆ — ผู้เล่นที่ตัวละครหายควรได้รู้ว่าเกิดอะไรขึ้น
    และยังเข้าเกมได้เพื่อกดนำเข้าไฟล์สำรอง ดีกว่าเจอจอพังที่ทำอะไรต่อไม่ได้เลย
  */
  const missing: string[] = []
  if (!Array.isArray(player.ownedCharacters)) missing.push('ownedCharacters')
  if (!Array.isArray(player.teamSlots)) missing.push('teamSlots')
  if (!player.currency || typeof player.currency !== 'object') missing.push('currency')
  if (missing.length > 0) {
    reportError('PLAYER_DATA_INCOMPLETE', 'visible', undefined, { missing })
  }

  return {
    ...player,
    progress: player.progress ?? EMPTY_PROGRESS,
    inventory: player.inventory ?? [],
    friends: player.friends ?? [],
    ownedCharacters: migrateOwnedCharacters(
      Array.isArray(player.ownedCharacters) ? player.ownedCharacters : [],
    ),
    teamSlots: Array.isArray(player.teamSlots)
      ? player.teamSlots
      : Array.from({ length: TEAM_SIZE }, () => null),
    currency:
      player.currency && typeof player.currency === 'object'
        ? player.currency
        : { gold: 0, gem: 0 },
  }
}

function createNewPlayer(uid: string): Player {
  return {
    id: uid,
    uid,
    // ยังไม่ตั้งชื่อ — หน้าตั้งชื่อตัวละครจะเติมให้หลังสมัครเสร็จ
    name: '',
    title: 'ผู้จาริกหน้าใหม่',
    level: 1,
    exp: 0,
    expToNext: 100,
    // ของขวัญตอนสมัครบัญชี — ข้อยกเว้นเดียวที่ตั้งค่าทอง/หยกตรง ๆ ได้
    // (เกิดครั้งเดียวตอนสร้างบัญชี ไม่ใช่ endpoint ที่เรียกซ้ำได้ระหว่างเล่น)
    // หลังจากนี้ทองต้องผ่าน earnGold/topUpGold และหยกต้องผ่าน topUpGems/redeemCoupon เท่านั้น
    currency: { gold: 500, gem: 20 },
    // สมัครใหม่ได้ตัวละครฟรี 1 ตัว ยืนช่องแรก อีก 3 ช่องว่าง
    ownedCharacters: [
      createInitialOwnedCharacterProgress(STARTER_CHARACTER_ID, new Date().toISOString()),
    ],
    teamSlots: Array.from({ length: TEAM_SIZE }, (_, index) =>
      index === 0 ? STARTER_CHARACTER_ID : null,
    ),
    // กระเป๋าเริ่มต้นว่างเปล่า — ไอเทมต้องได้จากการเล่นเท่านั้น (ดู grantItem)
    inventory: [],
    friends: [],
    frameId: 'arcane',
    progress: { ...EMPTY_PROGRESS },
  }
}

/* ---------------- คำสั่งหลัก ---------------- */

export async function register(email: string, password: string): Promise<AuthResult> {
  if (!isStorageAvailable()) {
    return { ok: false, error: 'เบราว์เซอร์นี้บันทึกข้อมูลไม่ได้ (อาจอยู่ในโหมดส่วนตัว)' }
  }

  const emailError = validateEmail(email)
  if (emailError) return { ok: false, error: emailError }

  const passwordError = validatePassword(password)
  if (passwordError) return { ok: false, error: passwordError }

  const db = loadDb()
  const key = normalizeEmail(email)
  if (db.accounts[key]) {
    return { ok: false, error: 'อีเมลนี้ถูกใช้สมัครไปแล้ว' }
  }

  // ออก UID ที่ไม่ซ้ำกับบัญชีอื่นในฐานข้อมูลนี้จริง ๆ
  const takenUids = new Set(Object.values(db.accounts).map((account) => account.uid))
  const uid = generateUid((candidate) => takenUids.has(candidate))

  const passwordSalt = createSalt()
  const passwordHash = await hashPassword(password, passwordSalt)

  const account: StoredAccount = {
    uid,
    email: email.trim(),
    passwordHash,
    passwordSalt,
    createdAt: new Date().toISOString(),
    player: createNewPlayer(uid),
    transactions: [],
  }

  db.accounts[key] = account
  if (!saveDb(db)) {
    return { ok: false, error: 'บันทึกข้อมูลไม่สำเร็จ พื้นที่เก็บข้อมูลอาจเต็ม' }
  }

  /*
    ต้องเช็คค่าที่คืนมาเหมือน saveDb ไม่ใช่ยิงทิ้ง

    บัญชีเขียนลงแล้วแต่ session เขียนไม่ลง (พื้นที่พอสำหรับก้อนใหญ่แต่ไม่พอสำหรับก้อนเล็ก
    ที่ตามมา) ให้ผลประหลาดที่สุด: หน้าจอเข้าเกมได้ตามปกติ แต่พอโหลดหน้าใหม่ getSessionPlayer
    หา session ไม่เจอแล้วเด้งกลับหน้าล็อกอิน ทั้งที่บัญชีถูกบันทึกไว้เรียบร้อยแล้วจริง ๆ
  */
  if (!writeJson(SESSION_KEY, createSession(uid, key))) {
    /*
      ถอนบัญชีที่เพิ่งสร้างออกด้วย

      บอกว่าสมัครไม่สำเร็จแต่ทิ้งบัญชีไว้ในฐานข้อมูล จะทำให้ผู้เล่นสมัครอีเมลเดิมซ้ำไม่ได้
      (เจอ "อีเมลนี้ถูกใช้สมัครไปแล้ว") ทั้งที่ระบบเพิ่งบอกเองว่าไม่สำเร็จ — ทางตันที่งงกว่า
      ปัญหาเดิมอีก ถอนออกให้สถานะกลับไปเหมือนก่อนกดสมัคร
    */
    delete db.accounts[key]
    saveDb(db)
    return { ok: false, error: 'บันทึกข้อมูลไม่สำเร็จ พื้นที่เก็บข้อมูลอาจเต็ม' }
  }
  return { ok: true, player: normalizePlayer(account.player) }
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const db = loadDb()
  const key = normalizeEmail(email)
  const account = db.accounts[key]

  // ข้อความเดียวกันทั้งกรณีไม่มีบัญชีและรหัสผิด
  // เพื่อไม่ให้เดาได้ว่าอีเมลไหนสมัครไว้แล้ว
  const failure: AuthResult = { ok: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }
  if (!account) return failure

  const matched = await verifyPassword(password, account.passwordSalt, account.passwordHash)
  if (!matched) return failure

  // ล็อกอินสำเร็จด้วยแฮชรอบเก่า (ITERATIONS เคยถูกปรับขึ้นทีหลัง) → รีแฮชด้วยรอบปัจจุบันทันที
  // ผู้เล่นไม่รู้สึกอะไรเลย แต่บัญชีที่ยัง active ค่อย ๆ อัปเกรดความปลอดภัยเองทุกครั้งที่ล็อกอิน
  if (needsRehash(account.passwordHash)) {
    account.passwordHash = await hashPassword(password, account.passwordSalt)
    saveDb(db)
  }

  // เช็คค่าที่คืนมาด้วยเหตุผลเดียวกับใน register (ดูคอมเมนต์ที่นั่น)
  if (!writeJson(SESSION_KEY, createSession(account.uid, key))) {
    return { ok: false, error: 'บันทึกข้อมูลไม่สำเร็จ พื้นที่เก็บข้อมูลอาจเต็ม' }
  }
  return { ok: true, player: normalizePlayer(account.player) }
}

export async function logout(): Promise<void> {
  removeKey(SESSION_KEY)
}

/** อ่านผู้เล่นของ session ที่ค้างอยู่ — ใช้ตอนเปิดเกมเพื่อไม่ต้องล็อกอินซ้ำ */
export async function getSessionPlayer(): Promise<Player | null> {
  const session = readActiveSession()
  if (!session) return null

  const account = loadDb().accounts[session.email]
  if (!account || account.uid !== session.uid) {
    // session ชี้ไปยังบัญชีที่ไม่มีแล้ว — ล้างทิ้งเพื่อไม่ให้ค้าง
    removeKey(SESSION_KEY)
    return null
  }

  return normalizePlayer(account.player)
}

const SAVE_EXPORT_VERSION = 1

interface SaveExport {
  exportVersion: typeof SAVE_EXPORT_VERSION
  exportedAt: string
  account: StoredAccount
}

/**
 * ส่งออกบัญชีของ session ปัจจุบันเป็น JSON — ให้ผู้เล่นโหลดเก็บไว้เป็นไฟล์สำรอง/ย้ายเครื่อง
 * ข้อมูลอยู่ใน localStorage ของเบราว์เซอร์เท่านั้น ไม่มี sync ข้ามอุปกรณ์ในตัว — ปุ่มนี้คือทางแก้
 */
export async function exportSave(): Promise<
  { ok: true; json: string } | { ok: false; error: string }
> {
  const session = readActiveSession()
  if (!session) return { ok: false, error: 'ยังไม่ได้ล็อกอิน' }

  const account = loadDb().accounts[session.email]
  if (!account) return { ok: false, error: 'ไม่พบบัญชี' }

  const payload: SaveExport = {
    exportVersion: SAVE_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    account,
  }
  return { ok: true, json: JSON.stringify(payload, null, 2) }
}

/** นำเข้าไฟล์ save ที่ export ไว้ — เขียนทับบัญชีเดิมถ้าอีเมลซ้ำ (กู้คืน/ย้ายเครื่อง) แล้วล็อกอินให้ทันที */
export async function importSave(json: string): Promise<AuthResult> {
  let parsed: SaveExport
  try {
    parsed = JSON.parse(json)
  } catch (error) {
    reportError('SAVE_IMPORT_PARSE_FAIL', 'silent', error)
    return { ok: false, error: 'ไฟล์ save เสียหายหรือไม่ใช่ไฟล์ที่ถูกต้อง' }
  }

  const account = parsed?.account
  if (
    parsed?.exportVersion !== SAVE_EXPORT_VERSION ||
    !account?.uid ||
    !account?.email ||
    !account?.passwordHash ||
    // ต้องเช็ค player ด้วย ไม่ใช่แค่ฟิลด์บัญชี: ด้านล่างเขียน account ลง localStorage และตั้ง
    // session ให้เรียบร้อยก่อน แล้วค่อยเรียก normalizePlayer() ซึ่งจะ throw ถ้า player หายไป
    // ผลคือไฟล์ที่ไม่มี player ทำให้เกมเปิดไม่ได้ถาวร (getSessionPlayer เจอ throw เดิมทุกครั้ง
    // ที่โหลดหน้า) แก้ได้ทางเดียวคือให้ผู้เล่นล้าง localStorage เอง — ต้องกันตั้งแต่ตรงนี้
    typeof account.player?.name !== 'string'
  ) {
    return { ok: false, error: 'ไฟล์ save ไม่ตรงรูปแบบที่รองรับ' }
  }

  const db = loadDb()
  const key = normalizeEmail(account.email)
  db.accounts[key] = account
  if (!saveDb(db)) {
    return { ok: false, error: 'บันทึกข้อมูลไม่สำเร็จ พื้นที่เก็บข้อมูลอาจเต็ม' }
  }

  // เช็คค่าที่คืนมาด้วยเหตุผลเดียวกับใน register (ดูคอมเมนต์ที่นั่น)
  if (!writeJson(SESSION_KEY, createSession(account.uid, key))) {
    return { ok: false, error: 'บันทึกข้อมูลไม่สำเร็จ พื้นที่เก็บข้อมูลอาจเต็ม' }
  }
  return { ok: true, player: normalizePlayer(account.player) }
}

/**
 * อีเมลของ session ที่ล็อกอินอยู่ — เวอร์ชัน Supabase ย้ายการตรวจสิทธิ์ผู้ดูแลไปที่ตาราง
 * `admin_accounts` แล้ว (ดู supabase/migrations/0004_admin_accounts.sql) ไม่ใช้อีเมลเช็คอีกต่อไป
 *
 * แยกจาก getSessionPlayer เพราะ Player ไม่มีฟิลด์อีเมล (ตั้งใจ — อีเมลเป็นข้อมูลบัญชี
 * ไม่ใช่ข้อมูลตัวละครที่ UI ทั่วไปต้องเห็น) ฟังก์ชันนี้จึงเป็นทางเดียวที่ควรใช้อ่านอีเมล
 */
export function getSessionEmail(): string | null {
  return readActiveSession()?.email ?? null
}

export type { FriendCandidate } from '../types/player'

/**
 * ค้นหาผู้เล่นจาก UID เพื่อเพิ่มเป็นเพื่อน — ใช้ UID เท่านั้น ไม่ใช้ชื่อ/อีเมล
 * (กันเดาชื่อคนอื่นมั่ว ๆ และไม่เปิดเผยอีเมลของเจ้าของบัญชี)
 *
 * ข้อจำกัดของ localStorage: หาเจอเฉพาะบัญชีที่เคยสมัครบนเบราว์เซอร์นี้เครื่องเดียวกัน
 * เท่านั้น (ยังไม่มีฐานข้อมูลกลางให้ค้นข้ามเครื่อง) — ดูหมายเหตุหัวไฟล์
 */
export async function findPlayerByUid(uid: string): Promise<FriendCandidate | null> {
  const db = loadDb()
  const entry = findAccountEntry(db, uid)
  if (!entry) return null

  const { player } = entry[1]
  return { uid: player.uid, name: player.name, level: player.level, title: player.title }
}

/** บันทึกความคืบหน้าของผู้เล่นกลับลงฐานข้อมูล */
export async function savePlayer(player: Player): Promise<boolean> {
  const db = loadDb()
  const entry = findAccountEntry(db, player.uid)
  if (!entry) return false

  const [key, account] = entry
  db.accounts[key] = { ...account, player: normalizePlayer(player) }
  return saveDb(db)
}

/* ---------------- ทอง/หยก — ต้องผ่านฟังก์ชันที่ระบุแหล่งที่มาเท่านั้น ---------------- */

/** ให้ทองจากการเล่นเท่านั้น — ทำเควสสำเร็จ หรือของดรอประหว่างเล่น */
export async function earnGold(
  uid: string,
  source: GoldSource,
  amount: number,
  refId?: string,
): Promise<CurrencyResult> {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, error: 'จำนวนทองไม่ถูกต้อง' }
  }

  const db = loadDb()
  const entry = findAccountEntry(db, uid)
  if (!entry) return { ok: false, error: 'ไม่พบบัญชีผู้เล่น' }

  const [key, account] = entry
  const updated = appendTransaction(account, { currency: 'gold', source, amount, refId })
  db.accounts[key] = updated

  if (!saveDb(db)) return { ok: false, error: 'บันทึกข้อมูลไม่สำเร็จ' }
  return { ok: true, player: updated.player, amount }
}

/** เติมหยกด้วยเงินจริง — ยังไม่ต่อ payment gateway จริง ถือว่าจ่ายสำเร็จเสมอ (ใช้เดโม) */
export async function topUpGems(uid: string, packageId: string): Promise<CurrencyResult> {
  const pack = GEM_PACKAGES.find((item) => item.id === packageId)
  if (!pack) return { ok: false, error: 'ไม่พบแพ็กเกจหยกนี้' }

  const db = loadDb()
  const entry = findAccountEntry(db, uid)
  if (!entry) return { ok: false, error: 'ไม่พบบัญชีผู้เล่น' }

  const [key, account] = entry
  const updated = appendTransaction(account, {
    currency: 'gem',
    source: 'topup',
    amount: pack.amount,
    refId: pack.id,
  })
  db.accounts[key] = updated

  if (!saveDb(db)) return { ok: false, error: 'บันทึกข้อมูลไม่สำเร็จ' }
  return { ok: true, player: updated.player, amount: pack.amount }
}

/** เติมทองด้วยเงินจริง — ยังไม่ต่อ payment gateway จริง ถือว่าจ่ายสำเร็จเสมอ (ใช้เดโม) */
export async function topUpGold(uid: string, packageId: string): Promise<CurrencyResult> {
  const pack = GOLD_PACKAGES.find((item) => item.id === packageId)
  if (!pack) return { ok: false, error: 'ไม่พบแพ็กเกจทองนี้' }

  const db = loadDb()
  const entry = findAccountEntry(db, uid)
  if (!entry) return { ok: false, error: 'ไม่พบบัญชีผู้เล่น' }

  const [key, account] = entry
  const updated = appendTransaction(account, {
    currency: 'gold',
    source: 'topup',
    amount: pack.amount,
    refId: pack.id,
  })
  db.accounts[key] = updated

  if (!saveDb(db)) return { ok: false, error: 'บันทึกข้อมูลไม่สำเร็จ' }
  return { ok: true, player: updated.player, amount: pack.amount }
}

/** แลกโค้ดคูปองเป็นหยก — แลกได้บัญชีละ 1 ครั้งต่อโค้ด และเช็กโควตารวมถ้ากำหนดไว้ */
export async function redeemCoupon(uid: string, code: string): Promise<CurrencyResult> {
  const normalized = code.trim().toUpperCase()
  const coupon = COUPONS[normalized]
  if (!coupon) return { ok: false, error: 'โค้ดนี้ไม่ถูกต้องหรือหมดอายุแล้ว' }
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
    return { ok: false, error: 'โค้ดนี้หมดอายุแล้ว' }
  }

  const db = loadDb()
  const entry = findAccountEntry(db, uid)
  if (!entry) return { ok: false, error: 'ไม่พบบัญชีผู้เล่น' }
  const [key, account] = entry

  const alreadyRedeemed = (account.transactions ?? []).some(
    (tx) => tx.source === 'coupon' && tx.refId === normalized,
  )
  if (alreadyRedeemed) return { ok: false, error: 'ใช้โค้ดนี้ไปแล้ว' }

  if (coupon.maxRedemptions !== undefined) {
    const totalRedeemed = Object.values(db.accounts).reduce(
      (count, other) =>
        count +
        (other.transactions ?? []).filter((tx) => tx.source === 'coupon' && tx.refId === normalized)
          .length,
      0,
    )
    if (totalRedeemed >= coupon.maxRedemptions) {
      return { ok: false, error: 'โค้ดนี้ถูกใช้ครบจำนวนแล้ว' }
    }
  }

  const updated = appendTransaction(account, {
    currency: 'gem',
    source: 'coupon',
    amount: coupon.gem,
    refId: normalized,
  })
  db.accounts[key] = updated

  if (!saveDb(db)) return { ok: false, error: 'บันทึกข้อมูลไม่สำเร็จ' }
  return { ok: true, player: updated.player, amount: coupon.gem }
}

/** ประวัติทอง/หยกทั้งหมดของบัญชี เรียงเก่า→ใหม่ — ใช้แสดงหน้าประวัติการทำรายการ */
export async function getTransactions(uid: string): Promise<CurrencyTransaction[]> {
  const db = loadDb()
  const entry = findAccountEntry(db, uid)
  return entry ? (entry[1].transactions ?? []) : []
}

/* ---------------- ไอเทม ---------------- */

/**
 * เพิ่มไอเทมเข้ากระเป๋าผู้เล่น — มีอยู่แล้วให้บวกจำนวน ไม่มีให้สร้างช่องใหม่
 *
 * ยังไม่มีหน้าจอไหนเรียกฟังก์ชันนี้ (ตั้งใจ — ไอเทมต้องมาจากเควส/ดรอปของจริงเท่านั้น
 * ไม่ใช่ปุ่มกดแจกเอง) เตรียมไว้ให้ระบบเควส/ต่อสู้เรียกใช้เมื่อสร้างเสร็จ
 */
export async function grantItem(
  uid: string,
  itemId: string,
  quantity: number,
  source: ItemSource,
  _refId?: string,
): Promise<ItemResult> {
  if (!getItem(itemId)) return { ok: false, error: 'ไม่พบไอเทมนี้' }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: 'จำนวนไอเทมไม่ถูกต้อง' }
  }

  const db = loadDb()
  const entry = findAccountEntry(db, uid)
  if (!entry) return { ok: false, error: 'ไม่พบบัญชีผู้เล่น' }

  const [key, account] = entry
  const inventory = account.player.inventory ?? []
  const existing = inventory.find((slot) => slot.itemId === itemId)

  const nextInventory = existing
    ? inventory.map((slot) =>
        slot.itemId === itemId ? { ...slot, quantity: slot.quantity + quantity } : slot,
      )
    : [
        ...inventory,
        { itemId, quantity, obtainedAt: new Date().toISOString(), obtainedFrom: source },
      ]

  const updated: StoredAccount = {
    ...account,
    player: { ...account.player, inventory: nextInventory },
  }
  db.accounts[key] = updated

  if (!saveDb(db)) return { ok: false, error: 'บันทึกข้อมูลไม่สำเร็จ' }
  return { ok: true, player: updated.player }
}

/* ---------------- ตัวละคร ---------------- */

/**
 * มอบตัวละครให้บัญชีผู้เล่น
 *
 * ยังไม่มีระบบกาชา/เควสที่มอบตัวละครได้จริง ฟังก์ชันนี้จึงถูกเรียกจากช่องคำสั่ง
 * ผู้ดูแลเท่านั้นในตอนนี้ (คำสั่งลับในแชท ดู src/components/WorldChat/) — เมื่อมีระบบได้ตัวละคร
 * ของจริงแล้ว ให้ระบบนั้นเรียกฟังก์ชันเดียวกันนี้ ไม่ต้องเขียนทางเพิ่มตัวละครเส้นใหม่
 *
 * ไม่แตะ teamSlots: การได้ตัวละครมากับการจัดทีมเป็นคนละเรื่อง ผู้เล่นเลือกเองในหน้าจัดทีม
 */
export async function grantCharacter(
  uid: string,
  characterId: string,
): Promise<CharacterGrantResult> {
  if (!getCharacter(characterId)) return { ok: false, error: `ไม่พบตัวละคร "${characterId}"` }

  const db = loadDb()
  const entry = findAccountEntry(db, uid)
  if (!entry) return { ok: false, error: 'ไม่พบบัญชีผู้เล่น' }

  const [key, account] = entry
  const owned = account.player.ownedCharacters ?? []
  if (owned.some((slot) => slot.characterId === characterId)) {
    return { ok: false, error: 'ครอบครองตัวละครนี้อยู่แล้ว' }
  }

  const updated: StoredAccount = {
    ...account,
    player: {
      ...account.player,
      ownedCharacters: [
        ...owned,
        createInitialOwnedCharacterProgress(characterId, new Date().toISOString()),
      ],
    },
  }
  db.accounts[key] = updated

  if (!saveDb(db)) return { ok: false, error: 'บันทึกข้อมูลไม่สำเร็จ' }
  return { ok: true, player: updated.player, characterId }
}
