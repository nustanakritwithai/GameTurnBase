/**
 * ทะเบียน error code ทั้งเกม — object literal ธรรมดา ไม่ใช่ TS enum โดยตั้งใจ
 * (tsconfig.app.json เปิด erasableSyntaxOnly ซึ่งห้าม enum จริง ๆ — ใช้แล้ว build พัง)
 *
 * เพิ่ม error ใหม่ = เพิ่ม entry ที่นี่บรรทัดเดียว แล้วเรียก reportError(code, ...)
 * จากจุดที่เกิด error จริง — ห้ามเรียก console.error/warn/debug ตรง ๆ อีก (บังคับด้วย
 * oxlint no-console, ดู .oxlintrc.json — ยกเว้นเฉพาะไฟล์ในโฟลเดอร์นี้)
 */
export const ERROR_CODES = {
  // ตาข่ายจับ error ระดับบนสุด (VISIBLE — ดู reportError.ts's tier)
  BOUNDARY_RENDER_CRASH: 'เกิดข้อผิดพลาดขณะแสดงผล',
  GLOBAL_UNCAUGHT: 'เกิดข้อผิดพลาดที่ไม่คาดคิด',
  GLOBAL_REJECTION: 'มี promise ที่ไม่ถูกจัดการ',

  // ระบบเสียง (src/lib/audio/AudioEngine.ts, src/pages/TitlePage.tsx) — ทุกจุดตั้งใจ SILENT
  // เพราะไม่มีเสียงไม่ทำให้เกมเล่นไม่ได้
  AUDIO_CONTEXT_INIT_FAIL: 'เปิดระบบเสียงไม่สำเร็จ',
  AUDIO_BUFFER_LOAD_FAIL: 'โหลดไฟล์เสียงไม่สำเร็จ',
  AUDIO_SETTINGS_SAVE_FAIL: 'บันทึกค่าเสียงไม่สำเร็จ',
  AUDIO_PORTAL_SOUND_FAIL: 'เล่นเสียงพอร์ทัลไม่สำเร็จ',

  // localStorage (src/lib/storage.ts) — SILENT ทั้งหมด เป็นไปตามเจตนาเดิมของไฟล์
  // ("ทุกกรณีต้องไม่ทำให้เกมล่ม") ไม่ใช่ error ที่ควรขึ้นกล่องแดงให้ผู้เล่นตกใจ
  STORAGE_READ_FAIL: 'อ่านข้อมูลที่บันทึกไว้ไม่สำเร็จ',
  STORAGE_WRITE_FAIL: 'บันทึกข้อมูลไม่สำเร็จ',
  STORAGE_REMOVE_FAIL: 'ลบข้อมูลที่บันทึกไว้ไม่สำเร็จ',

  // ข้อมูลใน localStorage อ่านไม่ออก (เลข version ไม่ใช่ที่รองรับ หรือโครงสร้างเสีย)
  // VISIBLE — ระบบจะปฏิเสธการเขียนทับทั้งหมดตั้งแต่นี้ไป ผู้เล่นต้องรู้ว่าทำไมเซฟไม่ลง
  DB_VERSION_UNSUPPORTED: 'ข้อมูลที่บันทึกไว้เป็นรูปแบบที่เกมรุ่นนี้อ่านไม่ออก',

  // เปิดเกมพร้อมกันสองแท็บแล้วบันทึกชนกัน (optimistic concurrency ปฏิเสธการเขียนทับ)
  // SILENT — ผู้เรียกทุกรายเห็น saveDb() คืน false แล้วแสดง "บันทึกข้อมูลไม่สำเร็จ" อยู่แล้ว
  DB_WRITE_CONFLICT: 'บันทึกชนกับแท็บอื่นที่เปิดพร้อมกัน',

  // ข้อมูลผู้เล่นขาดฟิลด์ที่หน้าจอต้องใช้ ถูกเติมค่าว่างให้เพื่อให้เข้าเกมได้
  // VISIBLE — ของบางอย่างอาจหายไปจริง ผู้เล่นควรได้รู้เพื่อนำเข้าไฟล์สำรองกลับ
  PLAYER_DATA_INCOMPLETE: 'ข้อมูลผู้เล่นไม่ครบ บางส่วนถูกตั้งเป็นค่าว่าง',

  // บันทึกความคืบหน้าผู้เล่นไม่สำเร็จ — VISIBLE เพราะผู้เล่นจะเห็นหน้าจอเหมือนเซฟติดแล้ว
  // ทั้งที่ข้อมูลไม่ได้ลง (updatePlayer อัปเดต state ก่อนเขียนเสมอ) เงียบตรงนี้คือทำข้อมูลหาย
  PLAYER_SAVE_FAIL: 'บันทึกความคืบหน้าไม่สำเร็จ พื้นที่เก็บข้อมูลอาจเต็ม',

  // รางวัลหลังต่อสู้ — ledger ล้มหลังบันทึก EXP แล้ว (progression อยู่ ทอง/ไอเทมยังไม่เข้า)
  REWARD_GOLD_FAIL: 'บันทึกทองจากรางวัลไม่สำเร็จ ประสบการณ์ถูกบันทึกแล้ว',
  REWARD_ITEM_FAIL: 'บันทึกไอเทมจากรางวัลไม่สำเร็จ ประสบการณ์ถูกบันทึกแล้ว',

  // สำรองข้อมูลออกเป็นไฟล์ไม่สำเร็จ — SILENT เพราะปุ่มที่กดแสดงข้อความบอกอยู่แล้ว
  SAVE_EXPORT_FAIL: 'สำรองข้อมูลเป็นไฟล์ไม่สำเร็จ',

  // เช็คว่ามีเวอร์ชันใหม่บนเซิร์ฟเวอร์ไหม — SILENT เน็ตหลุดชั่วคราวเป็นเรื่องปกติ
  // มีรหัสไว้เพื่อให้แยกออกได้ว่า "ไม่เคยเช็คสำเร็จเลย" ต่างจาก "เช็คแล้วไม่มีของใหม่"
  DEPLOY_CHECK_FAIL: 'ตรวจเวอร์ชันใหม่ไม่สำเร็จ',

  // นำเข้าไฟล์ save — SILENT เพราะผู้เล่นเห็นข้อความบอกสาเหตุอยู่แล้วจาก AuthModal
  // มีรหัสไว้เพื่อให้ผู้เล่นอ้างอิงได้เวลาแจ้งปัญหา: เกมนี้ไม่ส่ง telemetry ไปไหน
  // (ตัดสินใจไว้แล้ว ดู .agents/rules/ecc/web/observability.md) รหัสจึงทำหน้าที่แทน stack trace
  SAVE_IMPORT_PARSE_FAIL: 'ไฟล์ save ที่เลือกไม่ใช่ JSON ที่อ่านได้',

  // เข้าสู่ระบบ/โปรไฟล์ — SILENT เพราะไม่ critical (last-email เป็นแค่ความสะดวก,
  // clipboard fail ผู้เล่นเห็น toast อยู่แล้วจากอีกทาง)
  AUTH_UI_READ_FAIL: 'อ่านอีเมลล่าสุดไม่สำเร็จ',
  AUTH_UI_SAVE_FAIL: 'บันทึกอีเมลล่าสุดไม่สำเร็จ',

  // สมัคร/เข้าสู่ระบบล้มด้วยข้อผิดพลาดที่ไม่คาดคิด — SILENT เพราะกล่องล็อกอิน
  // แสดงข้อความให้อยู่แล้ว มีรหัสไว้แยกว่าพังตรงไหน (WebCrypto ใช้ไม่ได้ ฯลฯ)
  // ซึ่งข้อความบนจอตัวเดียวแยกไม่ออก
  AUTH_SUBMIT_FAIL: 'สมัครหรือเข้าสู่ระบบไม่สำเร็จด้วยข้อผิดพลาดที่ไม่คาดคิด',

  // ล็อกอินด้วย Google (OAuth) — SILENT เพราะกล่องล็อกอินแสดงข้อความให้อยู่แล้ว
  // มีรหัสไว้แยกสาเหตุฝั่งนักพัฒนา (เช่น provider ยังไม่เปิดใน Supabase Dashboard)
  AUTH_OAUTH_FAIL: 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ',

  // ตรวจว่าที่เก็บข้อมูลใช้ได้ไหมแล้วโยนข้อผิดพลาด (โหมดส่วนตัว/คุกกี้ปิด/โควตา)
  // SILENT — ผู้เรียกแสดงข้อความให้ผู้เล่นอยู่แล้ว รหัสมีไว้แยกสาเหตุฝั่งนักพัฒนา
  STORAGE_PROBE_FAIL: 'เบราว์เซอร์นี้ใช้พื้นที่เก็บข้อมูลไม่ได้',

  // เตรียมห้องต่อสู้ไม่สำเร็จ (สร้าง runtime / ผูกคีย์บอร์ด / เริ่มลูป ไม่ใช่แค่โหลดภาพ)
  BATTLE_INIT_FAIL: 'เตรียมห้องต่อสู้ไม่สำเร็จ',
  PROFILE_CLIPBOARD_FAIL: 'คัดลอกไม่สำเร็จ',

  // ฉาก 3D ลอบบี้ (src/components/LobbyScene/LobbyScene.tsx)
  LOBBY_SCENE_DEVICE_LOST: 'การ์ดจอขาดการเชื่อมต่อ (WebGPU)', // VISIBLE
  LOBBY_SCENE_WEBGL_CONTEXT_LOST: 'การ์ดจอขาดการเชื่อมต่อ (WebGL)', // VISIBLE
  LOBBY_SCENE_WEBGPU_INIT_FAIL: 'เปิด WebGPU ไม่สำเร็จ ใช้ WebGL2 แทน', // SILENT — fallback ทำงานถูกต้องอยู่แล้ว

  // ห้องต่อสู้เรียลไทม์ (src/game/realtimeBattle/**, src/hooks/useRealtimeBattle.ts,
  // src/components/BattleScene/RealtimeBattleRoom.tsx)
  BATTLE_STAGE_NOT_FOUND: 'ไม่พบด่านต่อสู้', // VISIBLE — เข้าห้องต่อสู้ไม่ได้เลย
  BATTLE_NO_TEAM_CHARACTER: 'ทีมของคุณไม่มีตัวละคร', // VISIBLE — เข้าห้องต่อสู้ไม่ได้เลย
  BATTLE_ENEMY_TEMPLATE_MISSING: 'ไม่พบแม่แบบศัตรู', // SILENT — ข้ามศัตรูตัวนั้นไป ต่อสู้ต่อได้
  BATTLE_STAGE_NO_SPAWN: 'ด่านไม่มีจุดเกิดศัตรู', // SILENT — ข้ามศัตรูตัวนั้นไป ต่อสู้ต่อได้
  BATTLE_SUMMON_TEMPLATE_MISSING: 'ไม่พบแม่แบบหน่วยเรียก', // SILENT — เอฟเฟกต์ summon นี้ไม่เกิดหน่วยแค่ตัวเดียว
  BATTLE_ASSET_LOAD_FAIL: 'โหลดภาพตัวละครไม่สำเร็จ', // VISIBLE — โยน error ต่อจริง กระทบผู้เล่นเห็นชัด
  BATTLE_DEFERRED_ASSET_FAIL: 'โหลดเฟรมส่วนที่เหลือไม่ครบ', // SILENT — preload พื้นหลัง ไม่บล็อกการเล่น
  BATTLE_WEBGL_CONTEXT_LOST: 'การ์ดจอขาดการเชื่อมต่อระหว่างต่อสู้', // VISIBLE
  BATTLE_REWARD_FAIL: 'บันทึกรางวัลหลังต่อสู้ไม่สำเร็จ',

  // src/main.tsx — โหลด App.tsx แบบ dynamic import ไม่สำเร็จ (เช่น env ของ Supabase หาย)
  // VISIBLE — เกิดก่อน React ขึ้นจอเลย ผู้เล่นเห็นแค่ innerHTML สำรองที่ main.tsx เขียนเอง
  APP_BOOTSTRAP_FAIL: 'โหลดแอปไม่สำเร็จ',

  // ค้นหาผู้เล่นด้วย UID (เพิ่มเพื่อน) ล้มเหลวที่ชั้น RPC เอง — SILENT เพราะ AddFriendPanel
  // แสดง "ไม่พบผู้เล่นรหัสนี้" ให้อยู่แล้วทั้งสองกรณี (หาไม่เจอจริง vs RPC error) มีรหัสไว้แยก
  // สองกรณีนี้ออกจากกันในฝั่ง log เท่านั้น — ก่อนหน้านี้แยกไม่ออกเลย ซึ่งเป็นสาเหตุที่ทำให้ฟีเจอร์
  // นี้พังเงียบ ๆ ในโปรดักชันมาก่อน (ดู .agents/rules/public-profile-lookup-law.md)
  FRIEND_LOOKUP_FAIL: 'ค้นหาผู้เล่นด้วยรหัสไม่สำเร็จ',
} as const

export type ErrorCode = keyof typeof ERROR_CODES
