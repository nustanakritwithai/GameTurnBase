import { TEMPLE_LOBBY_BG, BATTLE_ART_BG } from '../backgroundAssets'
import type { AttackDefinition } from './attacks'
import {
  SPIRIT_GUARDIAN_BOSS_PHASE_1_ATTACKS,
  SPIRIT_GUARDIAN_BOSS_PHASE_2_ATTACKS,
} from './attacks'
import type { CharacterModelKind } from '../characters'
import { resolvePlayerSpawn } from './spawnFormation'
import type { EnemyTier, Vec2 } from './types'

/**
 * ข้อมูลด่านของห้องต่อสู้ real-time — แหล่งความจริงจุดเดียว
 *
 * ห้าม hard-code ข้อมูลด่านไว้ใน Component (§9) ทุกอย่างที่ห้องต่อสู้ต้องรู้
 * (ขนาดห้อง จุดเกิด คลื่นศัตรู ภาพพื้นหลัง) อยู่ในไฟล์นี้ไฟล์เดียว
 *
 * ค่าสถานะศัตรูตั้งต้นอ้างอิงจาก ENEMY_TEMPLATES ของระบบเทิร์นเดิม
 * (ไฟล์นั้นถูกลบไปพร้อมระบบเทิร์นแล้ว ดูของเดิมได้จากประวัติ git) แต่ปรับสเกลใหม่
 * ให้เข้ากับการต่อสู้แบบเรียลไทม์:
 * เทิร์นเบสคิดดาเมจครั้งละมาก ๆ ทีละเทิร์น ส่วนเรียลไทม์ตีถี่กว่ามาก HP จึงถูกลดลง
 *
 * ── เรื่อง atk ที่ต้องระวัง ─────────────────────────────────
 * สูตรดาเมจหักเกราะแบบ `atk - def * 0.42` และมีพื้นขั้นต่ำที่ 1 แปลว่าถ้า atk ของศัตรู
 * ต่ำกว่า `def ของผู้เล่น × 0.42` **ทุกหมัดจะเข้าแค่ 1 แต้ม** ผู้เล่นจะอมตีไปตลอด
 * เคยตั้ง atk ไว้ 22 ตอนแรกแล้วเจออาการนี้จริงตอนทดสอบในเบราว์เซอร์: สู้กับศัตรู 3 ตัว
 * ราว 8 วินาที ผู้เล่นเสียเลือดรวม 2 แต้ม
 * หงอคงมี def 78 → เกณฑ์ขั้นต่ำคือ ~33 ค่าที่ใช้จึงเผื่อไว้เหนือเกณฑ์นั้นพอสมควร
 * ถ้าจะเพิ่มตัวละครที่ def สูงกว่านี้ ต้องกลับมาทบทวนตัวเลขชุดนี้ด้วย
 * ────────────────────────────────────────────────────────────
 */

/** หน่วยพิกัดของ runtime ต่อ 1 หน่วยของ Three.js */
export const WORLD_SCALE = 0.01

export interface RealtimeEnemyTemplate {
  id: string
  name: string
  /** ชุดเฟรมภาพที่ใช้ (ดู src/game/battleSpriteSequences.ts) */
  spriteKind: CharacterModelKind
  accent: string
  maxHp: number
  atk: number
  def: number
  /** หน่วยต่อวินาที */
  speed: number
  collisionRadius: number
  hurtboxRadius: number
  /**
   * ระยะที่เริ่มไล่ผู้เล่น
   *
   * ต้องกว้างพอครอบระยะจากจุดเกิดศัตรูถึงจุดเกิดผู้เล่น ไม่งั้นศัตรูจะยืนนิ่งตั้งแต่ต้น
   * และการต่อสู้จะไม่มีวันเริ่ม — ในลานฝึกหน้าวิหารระยะนั้นคือ ~784 หน่วย
   * (เจอตอนเขียนเทสต์: ค่าเดิม 520 ทำให้ศัตรูไม่ขยับเลยแม้แต่ก้าวเดียว)
   * ค่าที่ใช้จึงเผื่อไว้ให้ครอบเกือบทั้งห้อง แต่ยังเป็นขอบเขตจริงสำหรับด่านที่ใหญ่กว่านี้
   */
  detectRange: number
  /** ระยะที่เข้าโจมตีได้ */
  attackRange: number
  attackCooldownMs: number
  /**
   * ระดับความแรง (§3.8.4) — 'elite' โดน ELITE_STAT_MULTIPLIER คูณสเตตัสตอนสร้าง entity จริง
   * (createWaveEnemies) ค่าด้านบนในนี้ยังเป็นสเตตัส "ฐาน" ก่อนคูณเสมอ ไม่ใช่ค่าที่คูณแล้ว
   */
  tier: EnemyTier
  /** Attack row id in ENEMY_ATTACKS */
  attackId: string
  /** AI role config — same core, different data */
  aiRole: 'melee' | 'ranged' | 'tank' | 'controller' | 'support' | 'elite'
  combatTier: 'mob' | 'elite' | 'boss'
}

/**
 * ตัวคูณสเตตัสของ Elite tier เหนือสเตตัสฐานใน template (§3.8.4, world-class bar — Genshin
 * Mitachurl/Samachurl: AI/move-data เดิม + ตัวคูณสเตตัส ไม่ใช่ kit ใหม่)
 *
 * data-driven จุดเดียว — ห้าม hard-code ตัวเลขนี้ซ้ำใน EnemyAISystem/DamageSystem (Done-criterion #5)
 */
export const ELITE_STAT_MULTIPLIER = {
  maxHp: 2.4,
  atk: 1.5,
  def: 1.3,
} as const

/**
 * ท่าโจมตีของบอส — เหมือน AttackDefinition ปกติทุกอย่าง บวก telegraphMs (#11 Boss System)
 *
 * §3.6.7: "Boss/enemy attacks additionally define: telegraphMs, attackShape, phase eligibility"
 * — attackShape คือ hitShape ที่มีอยู่แล้วใน AttackDefinition (ไม่ต้องมีฟิลด์ซ้ำ), phase
 * eligibility คือ "ท่านี้อยู่ใน phases[].attacks ไหน" (ตำแหน่งในตารางคือ eligibility อยู่แล้ว
 * ไม่ต้องมีฟิลด์แยก) เหลือแค่ telegraphMs ที่ต้องเพิ่มจริง ๆ
 */
export interface BossAttackRow extends AttackDefinition {
  /** เวลาที่อยู่ในสถานะ Telegraph ก่อนเข้า AttackActive — baseline 800–1200ms (§3.6.12) */
  telegraphMs: number
}

export interface BossPhaseTemplate {
  /** พูลท่าของเฟสนี้ — เลือกวนตามลำดับ (round-robin) ใน EnemyAISystem */
  attacks: BossAttackRow[]
}

/**
 * แม่แบบบอส — สเตตัสฐานชุดเดียวกับ RealtimeEnemyTemplate (ตั้งใจไม่ extend ตรง ๆ เพราะบอส
 * ไม่มี `tier: EnemyTier` แบบ enemy ปกติ — 'boss' คือ entityType ของตัวเองอยู่แล้ว ไม่ใช่ elite)
 * บวกค่าเฉพาะของ phase-transition (§3.6.9) — baseline 2 เฟส เปลี่ยนที่ 50% HP (§3.6.12)
 */
export interface BossTemplate {
  id: string
  name: string
  spriteKind: CharacterModelKind
  accent: string
  maxHp: number
  atk: number
  def: number
  speed: number
  collisionRadius: number
  hurtboxRadius: number
  detectRange: number
  attackRange: number
  attackCooldownMs: number
  /** สัดส่วน HP (0–1) ที่ข้ามแล้วเปลี่ยนเฟส — baseline 0.5 */
  phaseHpThreshold: number
  /** ระยะเวลาที่บอสอยู่ยงคงกระพันระหว่างเปลี่ยนเฟส (state: 'phase-transition', §3.6.9) */
  phaseTransitionMs: number
  /** เฟส 1 และเฟส 2 — baseline 2 เฟสตาม §3.6.12 ยังไม่รองรับ N เฟส (สเปกยังไม่ต้องการ) */
  phases: [BossPhaseTemplate, BossPhaseTemplate]
}

/**
 * เนื้อหาบอสจริง — วางลงด่านผ่าน templateId ใน waves (§11 Boss System)
 */
export const BOSS_TEMPLATES: Record<string, BossTemplate> = {
  'spirit-guardian-boss': {
    id: 'spirit-guardian-boss',
    name: 'ผู้พิทักษ์วิญญาณ',
    spriteKind: 'pilgrim-monk',
    accent: '#4dffb0',
    maxHp: 1400,
    atk: 78,
    def: 28,
    speed: 128,
    collisionRadius: 46,
    hurtboxRadius: 54,
    detectRange: 1800,
    attackRange: 92,
    attackCooldownMs: 1800,
    phaseHpThreshold: 0.5,
    phaseTransitionMs: 2000,
    phases: [
      { attacks: SPIRIT_GUARDIAN_BOSS_PHASE_1_ATTACKS as BossAttackRow[] },
      { attacks: SPIRIT_GUARDIAN_BOSS_PHASE_2_ATTACKS as BossAttackRow[] },
    ],
  },
}

export function getBossTemplate(id: string): BossTemplate | null {
  return BOSS_TEMPLATES[id] ?? null
}

export interface BattleWaveDefinition {
  id: string
  enemies: Array<{ templateId: string; spawnIndex: number }>
}

/**
 * ประเภทด่าน (§5.2 ล็อกไว้ — "ไม่ใช่ Wave → Wave → Elite ทุกด่าน")
 *
 * แต่ละประเภทมีเงื่อนไขแพ้ชนะของตัวเอง — ดู StageVariationSystem.ts เป็นจุดเดียวที่มี
 * branch ต่อ stageType ทั้งระบบ (§9: ห้าม hard-code ข้อมูลด่านไว้ใน Component ขยายมาถึง
 * "ห้าม branch ต่อประเภทด่านไว้ใน Component" ด้วยเหตุผลเดียวกัน)
 */
export type StageType =
  'wave' | 'survival' | 'defend' | 'chase' | 'hazard' | 'mini-boss' | 'time-attack' | 'custom'

export interface SurvivalStageParams {
  /** ต้องรอดให้ครบเวลานี้ (ms) ถึงจะชนะ — ไม่ต้องฆ่าศัตรูให้หมด */
  durationMs: number
}

export interface DefendStageParams {
  /** เลือดของเป้าหมายที่ต้องป้องกัน — หมด = แพ้ทันที (ดู RealtimeBattleState.objectiveHp) */
  objectiveHp: number
  /** ตำแหน่งเป้าหมาย — ข้อมูลสำหรับชั้นวาด/ด่านในอนาคต ไม่ถูกใช้คำนวณแพ้ชนะเอง (เหมือน enemySpawns) */
  position: Vec2
}

export interface TimeAttackStageParams {
  /** ต้องเคลียร์ทุกคลื่นก่อนเวลานี้หมด ไม่งั้นแพ้ */
  timeBudgetMs: number
}

export interface MiniBossStageParams {
  /** ศัตรู Elite-tier ตัวเดียวที่เป็นเป้าหมายของด่าน (§3.8.4 — ไม่มี phase-transition) */
  templateId: string
}

export interface ChaseStageParams {
  /** ตำแหน่งที่ต้องไปให้ถึง */
  targetPosition: Vec2
  /** ระยะที่ถือว่า "ถึง" แล้ว */
  arrivalRadius: number
  /** ต้องถึงก่อนเวลานี้หมด ไม่งั้นแพ้ */
  timeBudgetMs: number
}

export interface HazardStageParams {
  /** เลือดของกลไกอันตรายที่ไหลลงเรื่อย ๆ (เช่น โครงสร้างทรุด/ไฟไหม้ลาม) — หมด = แพ้ */
  hazardHp: number
  /** อัตราไหลของ hazardHp ต่อวินาที */
  decayPerSecond: number
}

export interface RealtimeBattleStage {
  id: string
  name: string

  /** ขนาดห้องในพิกัด runtime */
  width: number
  height: number

  playerSpawn: Vec2
  enemySpawns: Vec2[]

  waves: BattleWaveDefinition[]

  backgroundAsset?: string
  musicAsset?: string

  /** กลุ่มแชปเตอร์ที่ด่านนี้อยู่ — ใช้จัดลำดับ Chapter→Stage→Boss (§5.1 ล็อกไว้) */
  chapterId: string
  /** ลำดับด่านในแชปเตอร์ (เริ่มที่ 1) — ตัวปลดล็อกด่านถัดไปอ้างลำดับนี้ ไม่ใช่ตำแหน่งใน object */
  order: number
  /** ด่านบอสปิดท้ายแชปเตอร์ — ใช้แค่ติดป้ายในหน้าเลือกด่าน ไม่มีผลต่อ gating */
  isBoss?: boolean
  /**
   * false = สนามทดสอบภายใน (เช่น P5 dungeon slice) — ซ่อนจากหน้าเลือกด่านผจญภัย
   * default true เมื่อไม่ระบุ
   */
  showInAdventureSelect?: boolean
  /**
   * ตัวคูณความยากของด่าน — data-table stub (§5.1, tune ที่ P11)
   * คูณ maxHp/atk/def ตอนสร้างศัตรูใน createWaveEnemies
   */
  difficultyMultiplier?: number
  /** ค่า energy ที่ใช้ต่อครั้ง — default จาก ENERGY_CONFIG.costPerStage */
  energyCost?: number

  /** ประเภทด่าน (§17 Stage Variation System) — กำหนดเงื่อนไขแพ้ชนะที่ StageVariationSystem.ts ใช้ */
  stageType: StageType
  /** พารามิเตอร์เฉพาะ stageType — มีเฉพาะเมื่อ stageType ตรงกับชนิดนั้น */
  survival?: SurvivalStageParams
  defend?: DefendStageParams
  timeAttack?: TimeAttackStageParams
  miniBoss?: MiniBossStageParams
  chase?: ChaseStageParams
  hazard?: HazardStageParams
}

export const ENEMY_TEMPLATES: Record<string, RealtimeEnemyTemplate> = {
  'shadow-soldier': {
    id: 'shadow-soldier',
    name: 'ทหารเงา',
    spriteKind: 'pig-warrior',
    accent: '#8b7cff',
    maxHp: 210,
    atk: 55,
    def: 18,
    speed: 132,
    collisionRadius: 34,
    hurtboxRadius: 40,
    detectRange: 1600,
    attackRange: 74,
    attackCooldownMs: 1500,
    tier: 'normal',
    attackId: 'enemy-melee',
    aiRole: 'melee',
    combatTier: 'mob',
  },
  'demon-captain': {
    id: 'demon-captain',
    name: 'แม่ทัพปีศาจ',
    spriteKind: 'pig-warrior',
    accent: '#ff6a5c',
    maxHp: 340,
    atk: 72,
    def: 24,
    speed: 118,
    collisionRadius: 40,
    hurtboxRadius: 48,
    detectRange: 1700,
    attackRange: 86,
    attackCooldownMs: 1700,
    tier: 'normal',
    attackId: 'enemy-elite-slam',
    aiRole: 'elite',
    combatTier: 'elite',
  },
  'spirit-guardian': {
    id: 'spirit-guardian',
    name: 'ผู้พิทักษ์วิญญาณ',
    spriteKind: 'pilgrim-monk',
    accent: '#6dffb8',
    maxHp: 260,
    atk: 62,
    def: 20,
    speed: 148,
    collisionRadius: 34,
    hurtboxRadius: 40,
    detectRange: 1600,
    attackRange: 78,
    attackCooldownMs: 1300,
    tier: 'normal',
    attackId: 'enemy-melee',
    aiRole: 'controller',
    combatTier: 'mob',
  },
  /**
   * ขุนศึกปีศาจ — ตัวอย่าง Elite/mini-boss (§3.8.4/§5.2): สเตตัสฐานเท่า demon-captain
   * แล้วโดน ELITE_STAT_MULTIPLIER คูณตอนสร้าง entity จริง (createRealtimeBattle.ts)
   * ยืม AI/ท่าโจมตีชุดเดียวกับศัตรูทั่วไป ไม่มี kit พิเศษ ตาม world-class bar ของสเปกนี้
   */
  'demon-warlord': {
    id: 'demon-warlord',
    name: 'ขุนศึกปีศาจ',
    spriteKind: 'pig-warrior',
    accent: '#ff2e2e',
    maxHp: 340,
    atk: 72,
    def: 24,
    speed: 118,
    collisionRadius: 40,
    hurtboxRadius: 48,
    detectRange: 1700,
    attackRange: 86,
    attackCooldownMs: 1700,
    tier: 'elite',
    attackId: 'enemy-elite-slam',
    aiRole: 'elite',
    combatTier: 'elite',
  },
}

/**
 * ห้องแรก: ลานฝึกหน้าวิหาร (Temple Training Arena)
 *
 * Spawn composition มาจาก `spawnFormation.ts` + `battlePresentation.ts`
 * (player ซ้าย / enemy ขวา / formation กลางสนาม) — `playerSpawn`/`enemySpawns`
 * ใน stage object เป็น snapshot สำหรับเทสต์/เอกสารเท่านั้น
 */
const ARENA_SIZE = { width: 1800, height: 1100 }
const PRESENTATION_PLAYER_SPAWN = resolvePlayerSpawn(ARENA_SIZE)

export const REALTIME_STAGES: Record<string, RealtimeBattleStage> = {
  'trial-01': {
    id: 'trial-01',
    name: 'ลานฝึกหน้าวิหาร',
    width: ARENA_SIZE.width,
    height: ARENA_SIZE.height,
    playerSpawn: PRESENTATION_PLAYER_SPAWN,
    enemySpawns: [],
    waves: [
      {
        id: 'wave-1',
        enemies: [
          { templateId: 'shadow-soldier', spawnIndex: 0 },
          { templateId: 'shadow-soldier', spawnIndex: 1 },
          { templateId: 'shadow-soldier', spawnIndex: 2 },
        ],
      },
    ],
    backgroundAsset: TEMPLE_LOBBY_BG,
    chapterId: 'chapter-1',
    order: 1,
    stageType: 'wave',
  },
  'trial-02': {
    id: 'trial-02',
    name: 'ประตูปีศาจ',
    width: ARENA_SIZE.width,
    height: ARENA_SIZE.height,
    playerSpawn: PRESENTATION_PLAYER_SPAWN,
    enemySpawns: [],
    waves: [
      {
        id: 'wave-1',
        enemies: [
          { templateId: 'shadow-soldier', spawnIndex: 0 },
          { templateId: 'spirit-guardian', spawnIndex: 2 },
        ],
      },
      {
        id: 'wave-2',
        enemies: [
          { templateId: 'demon-captain', spawnIndex: 1 },
          { templateId: 'shadow-soldier', spawnIndex: 3 },
          { templateId: 'shadow-soldier', spawnIndex: 4 },
        ],
      },
    ],
    backgroundAsset: BATTLE_ART_BG,
    chapterId: 'chapter-1',
    order: 2,
    stageType: 'wave',
    difficultyMultiplier: 1.05,
  },
  /**
   * P5 dungeon vertical slice arenas (PR #30) — เก็บแค่รูปร่างสนาม/waves ให้ createRealtimeBattle
   * อ่าน. เงื่อนไขแพ้ชนะจริงของดันเจี้ยนอยู่ที่ dungeonConfig.ts/dungeonOrchestrator.ts (schema
   * ของตัวเอง แยกจาก StageVariationSystem.ts) — RealtimeBattleRuntime นี้แค่ autoWaveAdvance:false
   * แล้วปล่อยให้ dungeon orchestrator ตัดสินแพ้ชนะแทน stageType/params ด้านล่างจึงไม่ถูกอ่านจริง
   * ใส่ค่า default ที่ compile ผ่านเฉยๆ (chapterId แยกจาก chapter-1 ปกติ กันชนกับระบบ Adventure)
   */
  'p5-survival-arena': {
    id: 'p5-survival-arena',
    name: 'ดันเจี้ยนทดสอบ — เอาชีวิตรอด',
    width: ARENA_SIZE.width,
    height: ARENA_SIZE.height,
    playerSpawn: PRESENTATION_PLAYER_SPAWN,
    enemySpawns: [],
    waves: [
      {
        id: 'w1',
        enemies: [
          { templateId: 'shadow-soldier', spawnIndex: 0 },
          { templateId: 'shadow-soldier', spawnIndex: 1 },
        ],
      },
      {
        id: 'w2',
        enemies: [
          { templateId: 'shadow-soldier', spawnIndex: 0 },
          { templateId: 'shadow-soldier', spawnIndex: 1 },
          { templateId: 'spirit-guardian', spawnIndex: 2 },
        ],
      },
    ],
    backgroundAsset: TEMPLE_LOBBY_BG,
    chapterId: 'dungeon-p5-test',
    order: 1,
    stageType: 'wave',
    showInAdventureSelect: false,
  },
  'p5-hazard-arena': {
    id: 'p5-hazard-arena',
    name: 'ดันเจี้ยนทดสอบ — อันตราย',
    width: ARENA_SIZE.width,
    height: ARENA_SIZE.height,
    playerSpawn: PRESENTATION_PLAYER_SPAWN,
    enemySpawns: [],
    waves: [
      {
        id: 'w1',
        enemies: [
          { templateId: 'shadow-soldier', spawnIndex: 0 },
          { templateId: 'shadow-soldier', spawnIndex: 2 },
        ],
      },
    ],
    backgroundAsset: BATTLE_ART_BG,
    chapterId: 'dungeon-p5-test',
    order: 2,
    stageType: 'wave',
    showInAdventureSelect: false,
  },
  'p5-elite-arena': {
    id: 'p5-elite-arena',
    name: 'ดันเจี้ยนทดสอบ — มินิบอส',
    width: ARENA_SIZE.width,
    height: ARENA_SIZE.height,
    playerSpawn: PRESENTATION_PLAYER_SPAWN,
    enemySpawns: [],
    waves: [
      {
        id: 'w1',
        enemies: [{ templateId: 'demon-captain', spawnIndex: 1 }],
      },
    ],
    backgroundAsset: BATTLE_ART_BG,
    chapterId: 'dungeon-p5-test',
    order: 3,
    stageType: 'wave',
    showInAdventureSelect: false,
  },
  'p5-boss-arena': {
    id: 'p5-boss-arena',
    name: 'ดันเจี้ยนทดสอบ — บอส',
    width: ARENA_SIZE.width,
    height: ARENA_SIZE.height,
    playerSpawn: PRESENTATION_PLAYER_SPAWN,
    enemySpawns: [],
    waves: [
      {
        id: 'w1',
        enemies: [{ templateId: 'spirit-guardian-boss', spawnIndex: 1 }],
      },
    ],
    backgroundAsset: BATTLE_ART_BG,
    chapterId: 'dungeon-p5-test',
    order: 4,
    isBoss: true,
    stageType: 'wave',
    showInAdventureSelect: false,
  },
  /**
   * ด่าน Survival (§5.2/§17) — ไม่ต้องฆ่าศัตรูให้หมด แค่รอดให้ครบเวลา
   * ศัตรูคลื่นเดียวคอยกดดัน แต่ผลแพ้ชนะดูจากนาฬิกา ไม่ใช่จำนวนศัตรูที่เหลือ
   */
  'trial-03': {
    id: 'trial-03',
    name: 'ทุ่งรอคอย',
    width: ARENA_SIZE.width,
    height: ARENA_SIZE.height,
    playerSpawn: PRESENTATION_PLAYER_SPAWN,
    enemySpawns: [],
    waves: [
      {
        id: 'wave-1',
        enemies: [
          { templateId: 'shadow-soldier', spawnIndex: 0 },
          { templateId: 'shadow-soldier', spawnIndex: 1 },
        ],
      },
    ],
    backgroundAsset: TEMPLE_LOBBY_BG,
    chapterId: 'chapter-1',
    order: 3,
    stageType: 'survival',
    survival: { durationMs: 60_000 },
  },
  /**
   * ด่าน Defend (§5.2/§17) — เคลียร์ทุกคลื่นเหมือน wave แต่แพ้ทันทีถ้า objectiveHp หมดก่อน
   * (ดู StageVariationSystem.ts's resolveDefendOutcome + RealtimeBattleState.objectiveHp)
   */
  'trial-04': {
    id: 'trial-04',
    name: 'ปกป้องศาลเจ้า',
    width: ARENA_SIZE.width,
    height: ARENA_SIZE.height,
    playerSpawn: PRESENTATION_PLAYER_SPAWN,
    enemySpawns: [],
    waves: [
      {
        id: 'wave-1',
        enemies: [
          { templateId: 'shadow-soldier', spawnIndex: 0 },
          { templateId: 'shadow-soldier', spawnIndex: 1 },
          { templateId: 'spirit-guardian', spawnIndex: 2 },
        ],
      },
    ],
    backgroundAsset: BATTLE_ART_BG,
    chapterId: 'chapter-1',
    order: 4,
    stageType: 'defend',
    defend: { objectiveHp: 300, position: { x: ARENA_SIZE.width / 2, y: ARENA_SIZE.height / 2 } },
    difficultyMultiplier: 1.1,
  },
  /**
   * บอสปิดท้ายแชปเตอร์ 1 (§5.1 Chapter→Stage→Boss) — ใช้ BOSS_TEMPLATES + phase-transition AI
   */
  'trial-05': {
    id: 'trial-05',
    name: 'ผู้พิทักษ์วิญญาณ',
    width: ARENA_SIZE.width,
    height: ARENA_SIZE.height,
    playerSpawn: PRESENTATION_PLAYER_SPAWN,
    enemySpawns: [],
    waves: [
      {
        id: 'wave-1',
        enemies: [{ templateId: 'spirit-guardian-boss', spawnIndex: 1 }],
      },
    ],
    backgroundAsset: BATTLE_ART_BG,
    chapterId: 'chapter-1',
    order: 5,
    isBoss: true,
    stageType: 'wave',
    difficultyMultiplier: 1.15,
  },
}

export function getRealtimeStage(id: string): RealtimeBattleStage | null {
  return REALTIME_STAGES[id] ?? null
}

export function getEnemyTemplate(id: string): RealtimeEnemyTemplate | null {
  return ENEMY_TEMPLATES[id] ?? null
}

/** ด่านทั้งหมด (หรือของแชปเตอร์เดียว) เรียงตาม `order` — ใช้ทั้ง gating และหน้าเลือกด่าน */
export function getOrderedStages(chapterId?: string): RealtimeBattleStage[] {
  return Object.values(REALTIME_STAGES)
    .filter((stage) => !chapterId || stage.chapterId === chapterId)
    .toSorted((a, b) => a.order - b.order)
}

/** แชปเตอร์ที่แสดงในหน้าเลือกด่านผจญภัย — กรองสนามทดสอบภายใน (P5 dungeon slice) ออก */
export function getAdventureChapters(): Array<{
  chapterId: string
  stages: RealtimeBattleStage[]
}> {
  const chapterIds = [
    ...new Set(
      Object.values(REALTIME_STAGES)
        .filter((stage) => stage.showInAdventureSelect !== false)
        .map((stage) => stage.chapterId),
    ),
  ]
  return chapterIds.map((chapterId) => ({
    chapterId,
    stages: getOrderedStages(chapterId).filter((stage) => stage.showInAdventureSelect !== false),
  }))
}

/**
 * ด่านแรกของแชปเตอร์ปลดล็อกเสมอ ด่านถัดไปต้องเคลียร์ด่านก่อนหน้าก่อน (clear-gate only)
 *
 * ระบบ stamina/energy — โครงสร้างล็อกแล้ว (§5.1, HetCreep 2026-08-08) ดู adventure/energySystem.ts
 * ตัวเลข pool/regen/cost ยังเป็น stub NON-PRODUCTION — tune ที่ P11
 */
export function isStageUnlocked(stageId: string, flags: Record<string, boolean>): boolean {
  const stage = REALTIME_STAGES[stageId]
  if (!stage) return false

  const ordered = getOrderedStages(stage.chapterId)
  const index = ordered.findIndex((s) => s.id === stageId)
  if (index <= 0) return true

  const previous = ordered[index - 1]
  return flags[`trial_cleared_${previous.id}`] === true
}
