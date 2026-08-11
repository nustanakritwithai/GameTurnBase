import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  directionFromVector,
  projectToWalkableArea,
  type Direction,
  type Point,
} from '../../game/adventure/movement'
import { ROSTER, type Character } from '../../game/characters'
import { deriveSpriteSize } from '../../game/realtimeBattle/entitySpritePresentation'
import { SCENE_WIDTH, SCENE_HEIGHT } from '../../game/sceneDimensions'
import { getWalkKit } from '../../game/walkKits'
import { TEMPLE_LOBBY_BG } from '../../game/backgroundAssets'
import styles from './WukongAdventure.module.css'

// url('/ui/...') ตรง ๆ ใน CSS ชี้ผิดที่ตอน deploy ขึ้น subpath (ดู src/lib/publicUrl.ts) —
// ส่งเข้าไปเป็น CSS custom property แทน
const BG_TEMPLE_STYLE: CSSProperties = {
  ['--bg-temple' as string]: `url(${TEMPLE_LOBBY_BG})`,
}

const FRAME_COUNT = 8
const WALK_SPEED = 215
const RUN_SPEED = 345

/**
 * เพดาน commit ของ React state (ไม่ใช่เพดาน physics) — 60fps เป็นค่ามาตรฐานสากลที่ยึดได้จริง
 * (baseline ของงานภาพเคลื่อนไหว/เกมทั่วไป, ตรงกับสมมติฐานพื้นฐานของ requestAnimationFrame เอง)
 *
 * physics ยังคำนวณทุกเฟรมเนทีฟของจอเสมอ (ผ่าน ref ไม่ผ่าน state) ตัวเลขนี้จำกัดแค่ "commit
 * ขึ้นจอกี่ครั้ง/วิ" — จอ 120Hz/144Hz จะ re-render ไม่เกิน 60 ครั้ง/วิเหมือนจอ 60Hz ทั่วไป
 * เพราะสไปรต์เดินเป็นเฟรมขั้นบันได (step) ไม่ใช่ interpolation ต่อเนื่อง re-render ถี่กว่านี้
 * ไม่ได้ให้ภาพลื่นขึ้นจริง มีแต่เปลืองซีพียู/แบตเปล่า ๆ
 */
const TARGET_COMMIT_HZ = 60
const COMMIT_INTERVAL_MS = 1000 / TARGET_COMMIT_HZ

const DEPTH_TOP = 530
const DEPTH_BOTTOM = 790

/*
   เรขาคณิตของกล่อง .actor — ต้องตรงกับ WukongAdventure.module.css เป๊ะ ๆ

   กล่องนี้ไม่ได้เป็นตัวกำหนด "ขนาด" ของตัวละครอีกแล้ว (เดิม object-fit: contain เป็นคนตัดสิน
   ซึ่งแปลว่าชีตคนละขนาดได้ตัวคนละขนาดโดยไม่มีใครสั่ง — วัดจริงบนโปรดักชัน: ยืน 396x376
   ใหญ่กว่าเดิน 640x512 อยู่ 81.5% ดู docs/SPRITE-CONFORMANCE.md ข้อ #100) ตอนนี้เหลือหน้าที่
   สองอย่างคือเป็นกรอบวางตำแหน่ง และเป็นที่ยึดของเงา/ฝุ่น/ป้ายชื่อ
*/
const ACTOR_BOX_HEIGHT_PX = 420
/** จุดที่ "พื้น" อยู่ในกล่อง — ค่าเดียวกับ transform-origin/translate ของ .actor */
const ACTOR_FOOT_ANCHOR_PX = 356

/**
 * ความสูงของ "ตัวละครหนึ่งหน่วยมาตรฐาน" ในหน่วย px ของกล่อง .actor
 *
 * ค่าเดียวที่ฉากนี้กำหนดเอง — ขนาดจริงของทุกเฟรมมาจาก deriveSpriteSize() ตามข้อ E3 ของ
 * docs/SPRITE-DESIGN-LOCK.md (ความสูงจากตารางเทียบพิกเซล, ความกว้างจากอัตราส่วนของชีตเอง,
 * ตำแหน่งเท้าจาก bottomInsetPx) ไม่มีเลขขนาดพิมพ์มืออยู่ในไฟล์นี้อีก
 *
 * ที่มาของ 322.83: 340 x 376/396 คือความสูงที่ชีตอ้างอิง 396x376 เคยได้จาก object-fit:
 * contain ในกล่องกว้าง 340 พอดี — ตั้งใจให้ "ท่ายืน" ซึ่งเป็นสิ่งแรกที่ผู้เล่นเห็นตอนเข้าฉาก
 * มีขนาดเท่าเดิมเป๊ะ แล้วให้ท่าอื่นวิ่งมาหาขนาดนี้แทน (ท่าเดินเดิมเล็กเกินไป ไม่ใช่ท่ายืนใหญ่เกิน)
 */
const SPRITE_CANONICAL_HEIGHT_PX = 322.83

const DIRECTIONS: Direction[] = [
  'down',
  'down-right',
  'right',
  'up-right',
  'up',
  'up-left',
  'left',
  'down-left',
]

const TURN_INDEX: Record<Direction, number> = {
  down: 0,
  'down-right': 1,
  right: 2,
  'up-right': 3,
  up: 4,
  'up-left': 5,
  left: 6,
  'down-left': 7,
}

const DIRECTION_LABEL: Record<Direction, string> = {
  down: 'หน้า',
  'down-right': 'เฉียงขวาล่าง',
  right: 'ขวา',
  'up-right': 'เฉียงขวาบน',
  up: 'หลัง',
  'up-left': 'เฉียงซ้ายบน',
  left: 'ซ้าย',
  'down-left': 'เฉียงซ้ายล่าง',
}

/**
 * เพดานจำนวนคำขอที่วิ่งพร้อมกันตอนโหลดเฟรมล่วงหน้า
 *
 * ของเดิมยิงทุก URL รวดเดียวใน tick เดียว วัดจริงบนโปรดักชัน 2026-08-11 (Resource Timing API)
 * ได้ **96 คำขอภายในวินาทีเดียว เริ่มที่ 748ms หลังเปิดหน้า** — ตรงช่วงที่หน้ากำลังโหลด
 * ทรัพยากรที่ผู้เล่นเห็นจริง ๆ อยู่พอดี เฟรมเดินที่จะได้ใช้อีกหลายวินาทีข้างหน้าจึงไปแย่งคิว
 * กับของที่ต้องขึ้นจอเดี๋ยวนี้ (ดู docs/SPRITE-CONFORMANCE.md §Delivery)
 *
 * 4 คือค่าที่เลือกเอง ไม่ได้อ้างอิงมาตรฐานไหน — ตั้งใจให้ต่ำพอที่จะไม่กินคิวหน้าเว็บ
 * แต่ยังโหลดครบ 80 เฟรมภายในไม่กี่ร้อยมิลลิวินาที (เฟรมละ ~26KB) ก่อนผู้เล่นจะเริ่มเดินจริง
 */
const PRELOAD_CONCURRENCY = 4

/**
 * URL ที่เคยสั่งโหลดไปแล้วในเซสชันนี้ — ระดับโมดูล ไม่ใช่ระดับ component โดยตั้งใจ
 *
 * วัดจริงบนโปรดักชันวันเดียวกัน: **144 คำขอ สำหรับ 97 URL = 1.48 เท่า** เพราะทุกครั้งที่
 * effect ทำงานรอบใหม่ (สลับตัวละคร / mount ใหม่) จะสร้าง Image ชุดเดิมทั้งกองซ้ำ โดยไม่มีใคร
 * ถือ Image เดิมไว้เลย (ทิ้งทันทีหลังตั้ง src) เหลือแต่ HTTP cache เป็นตัวกันเท่านั้น —
 * ซึ่งเฟรมเหล่านี้เสิร์ฟมาด้วย max-age=600 และชื่อไฟล์ไม่มี content hash (ดูข้อ #108)
 */
const requestedFrames = new Set<string>()

/**
 * โหลดล่วงหน้าแบบเข้าคิว: ยิงพร้อมกันไม่เกิน PRELOAD_CONCURRENCY ตัว ตัวถัดไปเริ่มเมื่อ
 * ตัวก่อนหน้าจบ (สำเร็จหรือ 404 ก็เดินหน้าต่อ ไม่งั้นคิวค้างทั้งกองเพราะไฟล์เดียวหาย)
 * URL ที่เคยสั่งไปแล้วจะไม่ถูกสั่งซ้ำ
 */
function preload(urls: string[]) {
  const queue: string[] = []
  for (const url of urls) {
    if (requestedFrames.has(url)) continue
    requestedFrames.add(url)
    queue.push(url)
  }

  let next = 0
  const pump = () => {
    if (next >= queue.length) return
    const image = new Image()
    /*
      บอกเบราว์เซอร์ตรง ๆ ว่าของพวกนี้รอได้ ให้ของที่ผู้เล่นเห็นตอนนี้ไปก่อน
      เป็น hint เฉย ๆ และเพิ่งเป็น Baseline ปี 2024 — เบราว์เซอร์ที่ต่ำกว่า floor ของ
      build target (ดู vite.config.ts) จะไม่รู้จักแล้วข้ามไปเงียบ ๆ ไม่พัง
      ตัวที่กันการยิงรัวจริง ๆ ในทุกเบราว์เซอร์คือคิวด้านบน ไม่ใช่บรรทัดนี้
    */
    image.fetchPriority = 'low'
    image.addEventListener('load', pump)
    image.addEventListener('error', pump)
    image.src = queue[next]
    next += 1
  }
  for (let slot = 0; slot < PRELOAD_CONCURRENCY; slot += 1) pump()
}

/**
 * เฟรม idle ที่ฉากนี้เลือกมาวาดจากเลขเฟรมปัจจุบัน — **ที่เดียวในไฟล์**
 *
 * ใช้ทั้งตอนเรนเดอร์และตอนสร้างรายการโหลดล่วงหน้า ห้ามคำนวณซ้ำที่อื่น ไม่งั้นรายการที่โหลด
 * กับสิ่งที่วาดจริงจะเพี้ยนออกจากกันเงียบ ๆ (ที่มาของข้อ #107: view.frame วิ่งแค่ 0-7 ฉากนี้
 * จึงวาด idle ได้แค่ 8 เฟรมจาก 24 แต่เดิมพรีโหลดไปทั้ง 24 — อีก 16 เฟรมโหลดมาไม่ได้ใช้เลย
 * เฟรมทั้ง 24 ไม่ได้ตายนะ CharacterPreview ใช้ครบทุกเฟรม แค่ฉากนี้ไม่ต้องโหลดมันมา)
 *
 * ค่าคงที่ 3 เป็นของเดิม ไม่ใช่ขอบเขตของข้อนี้ — ดู docs/SPRITE-CONFORMANCE.md §B3
 */
function idleFrameIndex(frame: number, idleCount: number) {
  return (frame * 3) % idleCount
}

/**
 * โหมดของฉาก — ใช้ระบบเดินชุดเดียวกันทั้งหมด ต่างกันแค่บรรยากาศและข้อความ
 * 'trial'     ลานฝึกวายุ — ปัจจุบันไม่มีจุดเรียกใช้ใน src/ (โหมดสำรวจ GameExplorationSession
 *             ถูกปิดไว้ชั่วคราวตั้งแต่ 2026-08-07 — ปุ่ม "เริ่มการผจญภัย" เปิด StageSelect แทน)
 *             เก็บโหมดนี้ไว้เป็นค่า default เผื่อ mount ตรง ๆ ในอนาคต ไม่ใช่ dead code ที่ลืมลบ
 * 'moonlight' เดินชมจันทร์ (เข้าจาก LobbyPage mount ตรง ๆ) — ฉากเดียวกันแต่ย้อมโทนคืนเดือนเพ็ญ
 */
export type AdventureMode = 'trial' | 'moonlight'

const MODE_COPY: Record<
  AdventureMode,
  {
    eyebrow: string
    heading: string
    caption: string
    place: string
    placeEn: string
  }
> = {
  trial: {
    eyebrow: 'บทฝึกที่ ๑ · วิถีราชาวานร',
    heading: 'ลานฝึกวายุ',
    caption: 'ควบคุมซุนหงอคงอย่างอิสระในฉาก 2.5D',
    place: 'ลานฝึกวายุ',
    placeEn: 'WIND TRIAL COURT',
  },
  moonlight: {
    eyebrow: 'ยามสาม · คืนเดือนเพ็ญ',
    heading: 'เดินชมจันทร์',
    caption: 'พาขุนพลออกเดินเล่นรอบลานวัดใต้แสงจันทร์',
    place: 'ลานพระจันทร์',
    placeEn: 'MOONLIT COURTYARD',
  },
}

interface WukongAdventureProps {
  /** โหมด moonlight เปิดค้างในลอบบี้ ไม่มีปุ่มออก จึงไม่ต้องส่งมา */
  onExit?: () => void
  mode?: AdventureMode
  /** ตัวละครที่ผู้เล่นครอบครอง — ใช้เป็นตัวเลือกในแถบเลือกขุนพล */
  characters: Character[]
  /**
   * ตัวที่จะพาเดิน — มาจากปุ่ม "เดินชมจันทร์" ในโปรไฟล์ (ดู ProfileModal.tsx)
   * ซึ่งเป็นทางเดียวที่เปลี่ยนตัวได้ ไม่ส่งมา (หรือส่ง null) ก็ใช้ตัวแรกที่มีชุดเฟรมเดิน
   */
  activeCharacterId?: string | null
}

export function WukongAdventure({
  onExit,
  mode = 'trial',
  characters,
  activeCharacterId,
}: WukongAdventureProps) {
  const copy = MODE_COPY[mode]
  // Migrating local accounts can briefly have no owned characters. This is
  // Wukong's trial, so keep a safe playable fallback instead of crashing.
  const ownedOrFallback = characters.length > 0 ? characters : [ROSTER[0]]

  /*
     แสดงเฉพาะตัวที่มีชุดเฟรมเดินจริง
     ตัวที่ยังไม่มีจะไม่ขึ้นในแถบเลือกเลย ดีกว่าให้เลือกแล้วเลื่อนไปแบบขาไม่ขยับ
     เมื่อวาดเฟรมเดินเพิ่มใน src/game/walkKits.ts ตัวนั้นจะโผล่มาเองทันที
  */
  const availableCharacters = ownedOrFallback.filter(
    (entry) => getWalkKit(entry.model.kind).walkPrefix !== null,
  )

  /*
     ตัวเริ่มต้นคือตัวแรกที่มีชุดเฟรมเดิน ส่วนการ "เปลี่ยนตัว" ทำได้จากปุ่ม
     "เดินชมจันทร์" ในโปรไฟล์ทางเดียว (ส่งมาทาง activeCharacterId) — เดิมมีแถบเลือก
     ลอยอยู่กลางฉากลอบบี้ด้วย แต่ถอดออกแล้วเพราะบังฉากและซ้ำซ้อนกับปุ่มในโปรไฟล์
  */
  const [internalActiveId] = useState(availableCharacters[0]?.id ?? '')
  // ค่าจากภายนอก (activeCharacterId) ชนะถ้ามี — ดู comment ของ prop ด้านบน
  const activeId = activeCharacterId ?? internalActiveId
  // undefined ได้ ถ้าผู้เล่นมีแต่ตัวที่ยังไม่มีเฟรมเดิน — จัดการหลัง hook ทั้งหมด
  const active: Character | undefined =
    availableCharacters.find((entry) => entry.id === activeId) ?? availableCharacters[0]

  // ใช้ชุดเฟรมของซุนหงอคงเป็นตัวยืนพื้น เพื่อให้ hook ด้านล่างมีค่าคงที่เสมอ
  const kit = getWalkKit((active ?? ROSTER[0]).model.kind)
  const walkPrefix = kit.walkPrefix ?? getWalkKit(ROSTER[0].model.kind).walkPrefix!
  const sceneRef = useRef<HTMLElement>(null)
  const pressedRef = useRef(new Set<string>())
  const virtualRef = useRef(new Set<string>())
  const positionRef = useRef<Point>({ x: 800, y: 650 })
  const velocityRef = useRef<Point>({ x: 0, y: 0 })
  const targetRef = useRef<Point | null>(null)
  const directionRef = useRef<Direction>('down')
  const frameRef = useRef(0)
  const distanceRef = useRef(0)
  const lastTimeRef = useRef<number | null>(null)
  const lastCommitRef = useRef(0)
  const [view, setView] = useState({
    x: 800,
    y: 650,
    direction: 'down' as Direction,
    frame: 0,
    moving: false,
    running: false,
  })
  const [destination, setDestination] = useState<Point | null>(null)
  const [dustTick, setDustTick] = useState(0)
  const [sceneSize, setSceneSize] = useState({ width: SCENE_WIDTH, height: SCENE_HEIGHT })

  // ฉากนี้ไม่ได้อยู่บนเวทีคงที่ 1600x900 อีกแล้ว (GameViewport ตัด letterbox ออก) —
  // ต้องวัดขนาดจริงของ .scene เองแล้วแม็ปพิกัดโลก (SCENE_WIDTH/HEIGHT) เป็นพิกัดจอจริง
  // ด้วยสูตรเดียวกับที่ CSS background-size:cover ใช้กับภาพพื้นหลัง (ย่อ/ขยายเท่ากันทั้งสองแกน
  // แล้ว crop ส่วนเกิน) ตำแหน่งเดินจึงตรงกับลานวัดในภาพเสมอไม่ว่าอัตราส่วนจอจะเป็นเท่าไหร่
  useLayoutEffect(() => {
    const el = sceneRef.current
    if (!el) return
    // วัด sync ทันทีตอน mount กัน ResizeObserver callback แรก (async เสมอ) ทำให้ตัวละคร
    // กระพริบไปโผล่ตำแหน่งเดิม (world coords ดิบ) ก่อนขยับมาตำแหน่งจริงในเฟรมถัดไป
    const rect = el.getBoundingClientRect()
    setSceneSize({ width: rect.width, height: rect.height })
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSceneSize({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
    // active?.id (ไม่ใช่ []): ตอน mount แรก active อาจยังเป็น undefined (ยังไม่มีขุนพลที่มีชุดเฟรมเดิน)
    // ซึ่ง branch นั้นไม่มี ref เลย พอ active มีค่าทีหลังในเซสชันเดียวกัน (component ไม่ unmount)
    // ต้อง re-run effect นี้เพื่อ attach ref เข้ากับ <section> จริงที่เพิ่งขึ้น
  }, [active?.id])

  /*
     เฟรมที่ฉากนี้วาดได้จริง — โหลดล่วงหน้าไว้ไม่ให้ภาพกระพริบตอนเริ่มเดิน

     เรียงตามลำดับที่ได้ใช้จริง เพราะคิวโหลดยิงทีละไม่กี่ตัว (ดู preload ด้านบนไฟล์)
     ตัวที่อยู่ต้นรายการจึงมาถึงก่อน: ยืนหันหน้า (เห็นทันทีที่เข้าฉาก) → หันทิศ (เห็นเมื่อ
     หันไปทางอื่น) → เดิน (ได้ใช้เมื่อผู้เล่นเริ่มขยับ ซึ่งช้ากว่าเสมอ)

     ชื่อเดิมคือ allFrames แต่ตอนนี้ไม่ใช่ "ทั้งหมด" อีกแล้ว — เฟรม idle ที่ฉากนี้วาดไม่ถึง
     ไม่อยู่ในรายการนี้ (ดู idleFrameIndex)
  */
  const drawableFrames = useMemo(() => {
    const idleIndexes = new Set(
      Array.from({ length: FRAME_COUNT }, (_, frame) => idleFrameIndex(frame, kit.idleCount)),
    )
    const idle = [...idleIndexes].map((index) => `${kit.idlePrefix}-${index}.webp`)
    const turn = Array.from(
      { length: FRAME_COUNT },
      (_, frame) => `${kit.turnPrefix}-${frame}.webp`,
    )
    const walk = kit.walkPrefix
      ? DIRECTIONS.flatMap((direction) =>
          Array.from(
            { length: FRAME_COUNT },
            (_, frame) => `${kit.walkPrefix}-${direction}-${frame}.webp`,
          ),
        )
      : []
    return [...idle, ...turn, ...walk]
  }, [kit])

  useEffect(() => preload(drawableFrames), [drawableFrames])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      /*
        ไม่แตะคีย์ที่ผู้เล่นกำลังพิมพ์ลงช่องกรอก

        ตัวเดินนี้ถูก mount ค้างไว้ตลอดเวลาที่อยู่ในลอบบี้ และ listener อยู่บน window
        คีย์จึงถึงที่นี่แม้โฟกัสอยู่ในช่องกรอกของโมดัลที่เปิดทับอยู่ ผลคือพิมพ์ w/a/s/d
        แล้วตัวละครหลังโมดัลเดิน และลูกศร/เว้นวรรคถูก preventDefault จนเลื่อนเคอร์เซอร์
        ในช่องกรอกไม่ได้ (ช่องคูปองในตั้งค่า และช่องรหัสเพื่อน) — ช่องแชทโลกกันปัญหานี้
        ด้วย stopPropagation ของตัวเอง ที่นี่กันให้ครบทุกช่องในที่เดียวแทน
      */
      const target = event.target as HTMLElement | null
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
        event.preventDefault()
      }
      pressedRef.current.add(event.key.toLowerCase())
      if (
        ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(
          event.key.toLowerCase(),
        )
      ) {
        targetRef.current = null
        setDestination(null)
      }
    }
    const up = (event: KeyboardEvent) => pressedRef.current.delete(event.key.toLowerCase())
    const clear = () => {
      pressedRef.current.clear()
      virtualRef.current.clear()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  useEffect(() => {
    let animationId = 0
    const animate = (time: number) => {
      const previous = lastTimeRef.current ?? time
      const delta = Math.min((time - previous) / 1000, 0.04)
      lastTimeRef.current = time

      const keys = new Set([...pressedRef.current, ...virtualRef.current])
      let inputX = 0
      let inputY = 0
      if (keys.has('a') || keys.has('arrowleft')) inputX -= 1
      if (keys.has('d') || keys.has('arrowright')) inputX += 1
      if (keys.has('w') || keys.has('arrowup')) inputY -= 1
      if (keys.has('s') || keys.has('arrowdown')) inputY += 1

      const position = positionRef.current
      if (inputX === 0 && inputY === 0 && targetRef.current) {
        const dx = targetRef.current.x - position.x
        const dy = targetRef.current.y - position.y
        const distance = Math.hypot(dx, dy)
        if (distance <= 12) {
          targetRef.current = null
          setDestination(null)
        } else {
          inputX = dx / distance
          inputY = dy / distance
        }
      }

      const magnitude = Math.hypot(inputX, inputY)
      if (magnitude > 0) {
        inputX /= magnitude
        inputY /= magnitude
      }

      const running = keys.has('shift')
      const desiredSpeed = running ? RUN_SPEED : WALK_SPEED
      const response = magnitude > 0 ? 1 - Math.exp(-18 * delta) : 1 - Math.exp(-24 * delta)
      const velocity = velocityRef.current
      velocity.x += (inputX * desiredSpeed - velocity.x) * response
      velocity.y += (inputY * desiredSpeed - velocity.y) * response
      if (Math.abs(velocity.x) < 0.5) velocity.x = 0
      if (Math.abs(velocity.y) < 0.5) velocity.y = 0

      const oldX = position.x
      const oldY = position.y
      const proposed = {
        x: position.x + velocity.x * delta,
        y: position.y + velocity.y * delta,
      }
      const resolved = projectToWalkableArea(proposed)
      position.x = resolved.x
      position.y = resolved.y

      // Remove only the velocity that pushes into a wall. Keeping the tangent
      // component makes movement slide naturally along diagonal boundaries.
      const correctionX = proposed.x - resolved.x
      const correctionY = proposed.y - resolved.y
      const correctionLength = Math.hypot(correctionX, correctionY)
      if (correctionLength > 0.001) {
        const normalX = correctionX / correctionLength
        const normalY = correctionY / correctionLength
        const intoWall = velocity.x * normalX + velocity.y * normalY
        if (intoWall > 0) {
          velocity.x -= normalX * intoWall
          velocity.y -= normalY * intoWall
        }
      }
      const travelled = Math.hypot(position.x - oldX, position.y - oldY)
      const moving = travelled > 0.05

      if (magnitude > 0) {
        directionRef.current = directionFromVector(inputX, inputY)
      }

      if (moving) {
        distanceRef.current += travelled
        const stride = running ? 28 : 34
        frameRef.current = Math.floor(distanceRef.current / stride) % FRAME_COUNT
      } else {
        frameRef.current = Math.floor(time / 170) % FRAME_COUNT
      }

      // ยืนนิ่งไม่ขยับ ตำแหน่ง/เฟรมก็ไม่เปลี่ยนทุก tick (เฟรม idle ขยับแค่ทุก 170ms ไม่ใช่ 60fps) —
      // คืน object เดิม (ไม่ใช่ตัวใหม่) เมื่อค่าไม่เปลี่ยนจริง ให้ React ข้าม re-render รอบนั้นไปเลย
      // (setState แบบ functional: ถ้าคืนค่าเดิมด้วย Object.is React จะไม่ re-render)
      // ไม่งั้นทั้ง component จะ re-render รัว ๆ ตามอัตราเฟรมเนทีฟของจอตลอดเวลาที่อยู่ Lobby แม้ผู้เล่น AFK
      //
      // ส่วนตอนกำลังเดิน (ค่าเปลี่ยนจริงทุกเฟรม) ยัง cap commit ไว้ที่ TARGET_COMMIT_HZ อยู่ดี —
      // จอ 120Hz/144Hz ไม่จำเป็นต้อง re-render ถี่กว่าจอ 60Hz เพราะสไปรต์เดินเป็นเฟรมขั้นบันได
      // (ดูคอมเมนต์ที่ค่าคงที่ด้านบนไฟล์) physics ใน ref ด้านบนยังคำนวณทุกเฟรมเนทีฟเหมือนเดิม
      // แค่ "ขึ้นจอ" ถูกจำกัดอัตราเท่านั้น ไม่กระทบความแม่นยำของตำแหน่ง/ชนกำแพง
      if (time - lastCommitRef.current >= COMMIT_INTERVAL_MS) {
        lastCommitRef.current = time
        setView((previousView) => {
          const next = {
            x: position.x,
            y: position.y,
            direction: directionRef.current,
            frame: frameRef.current,
            moving,
            running,
          }
          const unchanged =
            previousView.x === next.x &&
            previousView.y === next.y &&
            previousView.direction === next.direction &&
            previousView.frame === next.frame &&
            previousView.moving === next.moving &&
            previousView.running === next.running
          return unchanged ? previousView : next
        })
      }
      animationId = requestAnimationFrame(animate)
    }
    animationId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationId)
  }, [])

  useEffect(() => {
    if (!view.moving) return
    const timer = window.setInterval(
      () => setDustTick((value) => value + 1),
      view.running ? 105 : 165,
    )
    return () => window.clearInterval(timer)
  }, [view.moving, view.running])

  const courtyardScale = Math.max(sceneSize.width / SCENE_WIDTH, sceneSize.height / SCENE_HEIGHT)
  const courtyardOffsetX = (sceneSize.width - SCENE_WIDTH * courtyardScale) / 2
  const courtyardOffsetY = (sceneSize.height - SCENE_HEIGHT * courtyardScale) / 2
  const worldToScreen = useCallback(
    (point: Point) => ({
      x: courtyardOffsetX + point.x * courtyardScale,
      y: courtyardOffsetY + point.y * courtyardScale,
    }),
    [courtyardScale, courtyardOffsetX, courtyardOffsetY],
  )

  const onFloorPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return
      const bounds = sceneRef.current?.getBoundingClientRect()
      if (!bounds) return
      const target = projectToWalkableArea({
        x: (event.clientX - bounds.left - courtyardOffsetX) / courtyardScale,
        y: (event.clientY - bounds.top - courtyardOffsetY) / courtyardScale,
      })
      targetRef.current = target
      setDestination(target)
    },
    [courtyardScale, courtyardOffsetX, courtyardOffsetY],
  )

  // ชื่อ `pressed` ไม่ใช่ `active` — `active` ด้านบนคือตัวละครที่กำลังแสดงอยู่ คนละเรื่องกัน
  const setVirtualDirection = (key: string, pressed: boolean) => {
    if (pressed) {
      virtualRef.current.add(key)
      targetRef.current = null
      setDestination(null)
    } else {
      virtualRef.current.delete(key)
    }
  }

  const depthProgress = Math.min(1, Math.max(0, (view.y - DEPTH_TOP) / (DEPTH_BOTTOM - DEPTH_TOP)))
  const perspectiveScale = 0.8 + depthProgress * 0.24
  const turnUrl = `${kit.turnPrefix}-${TURN_INDEX[view.direction]}.webp`
  const idleFrame = view.direction === 'down' ? idleFrameIndex(view.frame, kit.idleCount) : null

  // เดิน = เฟรมเดินตามทิศ, ยืนหันหน้า = เฟรม idle, ยืนหันทิศอื่น = เฟรมหันทิศ
  const spriteUrl = view.moving
    ? `${walkPrefix}-${view.direction}-${view.frame}.webp`
    : idleFrame !== null
      ? `${kit.idlePrefix}-${idleFrame}.webp`
      : turnUrl

  /*
     ขนาดและตำแหน่งของภาพเฟรมนี้ — คำนวณจากพิกเซลจริงของชีต (E3) ไม่ใช่ให้กล่องเป็นคนตัดสิน
     `bottom` วางให้ "เส้นเท้า" ของชีต (bottomInsetPx) ตกลงที่ ACTOR_FOOT_ANCHOR_PX พอดี
     ทุกชีต — ซึ่งเป็นจุดเดียวกับที่เงาวงรีอยู่ (ข้อ #106: เดิมเท้าต่ำกว่าเงา 30-53px
     เงาจึงไปอยู่ระดับหัวเข่า)
  */
  const spriteSize = deriveSpriteSize(spriteUrl, SPRITE_CANONICAL_HEIGHT_PX)
  const spriteStyle: CSSProperties = {
    width: `${spriteSize.width}px`,
    height: `${spriteSize.height}px`,
    bottom: `${ACTOR_BOX_HEIGHT_PX - ACTOR_FOOT_ANCHOR_PX - spriteSize.footInset}px`,
  }

  const actorScreenPos = worldToScreen(view)
  const actorStyle = {
    '--actor-x': `${actorScreenPos.x}px`,
    '--actor-y': `${actorScreenPos.y}px`,
    '--actor-scale': perspectiveScale,
    zIndex: Math.round(view.y),
  } as CSSProperties
  const destinationScreenPos = destination ? worldToScreen(destination) : null

  // ผู้เล่นมีตัวละครแต่ยังไม่มีตัวไหนที่มีชุดเฟรมเดิน
  if (!active) {
    // โหมดชมจันทร์อยู่ในหน้าหลักตลอดเวลา — ไม่มีขุนพลเดินได้ก็แค่ไม่ต้องแสดงอะไรเลย
    // (การ์ดเต็มจอแบบเดิมเหมาะกับโหมดผจญภัยที่เป็นฉากแยกต่างหากเท่านั้น)
    if (mode === 'moonlight') return null

    return (
      <section
        className={`${styles.scene} ${styles.moonlight}`}
        aria-label={copy.heading}
        style={BG_TEMPLE_STYLE}
      >
        <div className={styles.emptyCast}>
          <strong>ยังไม่มีขุนพลที่ออกเดินได้</strong>
          <p>ขุนพลที่ท่านมีอยู่ยังไม่มีชุดท่าเดิน โปรดรอการอัญเชิญขุนพลที่พร้อมออกเดิน</p>
          <button type="button" onClick={() => onExit?.()}>
            กลับลานประลอง
          </button>
        </div>
      </section>
    )
  }

  return (
    <section
      ref={sceneRef}
      className={`${styles.scene} ${mode === 'moonlight' ? styles.moonlight : ''}`}
      aria-label={`${copy.heading} — ควบคุม${active.name}`}
      onPointerDown={onFloorPointerDown}
      style={BG_TEMPLE_STYLE}
    >
      <div className={styles.atmosphere} aria-hidden="true" />
      {mode === 'moonlight' ? <div className={styles.moonBeam} aria-hidden="true" /> : null}

      {mode === 'moonlight' ? null : (
        <header className={styles.hud}>
          <div className={styles.chapter}>
            <span className={styles.eyebrow}>{copy.eyebrow}</span>
            <strong>{copy.heading}</strong>
            <span>{copy.caption}</span>
          </div>
          <div className={styles.status}>
            <span className={view.moving ? styles.activeDot : styles.idleDot} />
            <div>
              <small>สถานะ</small>
              <b>{view.moving ? (view.running ? 'วิ่ง' : 'เดิน') : 'พร้อมรบ'}</b>
            </div>
            <i />
            <div>
              <small>ทิศ</small>
              <b>{DIRECTION_LABEL[view.direction]}</b>
            </div>
          </div>
          <button className={styles.exitButton} type="button" onClick={() => onExit?.()}>
            <span aria-hidden="true">‹</span> กลับลานประลอง
          </button>
        </header>
      )}

      <div className={styles.locationTitle} aria-hidden="true">
        <span />
        <b>{copy.place}</b>
        <small>{copy.placeEn}</small>
      </div>

      {destinationScreenPos ? (
        <div
          className={styles.destination}
          style={{ left: destinationScreenPos.x, top: destinationScreenPos.y }}
          aria-hidden="true"
        >
          <span />
        </div>
      ) : null}

      <div className={styles.actor} style={actorStyle} aria-label={active.name}>
        <div className={styles.shadow} />
        {view.moving ? (
          <div className={styles.dust} key={dustTick} aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
        ) : null}
        <img
          className={styles.sprite}
          style={spriteStyle}
          src={spriteUrl}
          alt={active.name}
          draggable={false}
        />
        {mode === 'moonlight' ? null : (
          <div className={styles.nameplate}>
            <span>{active.epithet}</span>
            <strong>{active.name}</strong>
          </div>
        )}
      </div>

      {mode === 'moonlight' ? null : (
        <div className={styles.helpBar}>
          <span>
            <kbd>WASD</kbd>
            <kbd>↑↓←→</kbd> เคลื่อนที่
          </span>
          <i />
          <span>
            <kbd>SHIFT</kbd> วิ่ง
          </span>
          <i />
          <span>
            <kbd className={styles.mouse}>◉</kbd> คลิกพื้นเพื่อเดิน
          </span>
        </div>
      )}

      <div className={styles.mobilePad} aria-label="ปุ่มควบคุมทิศทาง">
        <HoldButton
          label="ขึ้น"
          symbol="▲"
          keyName="w"
          className={styles.up}
          onChange={setVirtualDirection}
        />
        <HoldButton
          label="ซ้าย"
          symbol="◀"
          keyName="a"
          className={styles.left}
          onChange={setVirtualDirection}
        />
        <span className={styles.padCenter}>◆</span>
        <HoldButton
          label="ขวา"
          symbol="▶"
          keyName="d"
          className={styles.right}
          onChange={setVirtualDirection}
        />
        <HoldButton
          label="ลง"
          symbol="▼"
          keyName="s"
          className={styles.down}
          onChange={setVirtualDirection}
        />
      </div>
    </section>
  )
}

interface HoldButtonProps {
  label: string
  symbol: string
  keyName: string
  className: string
  onChange: (key: string, active: boolean) => void
}

function HoldButton({ label, symbol, keyName, className, onChange }: HoldButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={className}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        onChange(keyName, true)
      }}
      onPointerUp={() => onChange(keyName, false)}
      onPointerCancel={() => onChange(keyName, false)}
      onContextMenu={(event) => event.preventDefault()}
    >
      {symbol}
    </button>
  )
}
