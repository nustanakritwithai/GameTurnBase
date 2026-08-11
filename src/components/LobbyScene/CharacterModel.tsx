import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { AdditiveBlending, DoubleSide, SRGBColorSpace, TextureLoader } from 'three'
import type { Mesh, MeshBasicMaterial } from 'three'
import type { Character, ModelSpec } from '../../game/characters'
import { deriveSpriteSize } from '../../game/realtimeBattle/entitySpritePresentation'
import { getSpriteSequence } from '../../game/spriteSequences'
import { publicUrl } from '../../lib/publicUrl'
import type { SlotTransform } from '../../game/team'

/**
 * ตัวละครหนึ่งตัวในฉาก Lobby — วาดด้วยภาพสไปรต์ที่วาดมือไว้แล้ว
 *
 * แอนิเมชันหายใจ หาง และผ้าคลุม อยู่ในเฟรมภาพเอง (ดู src/game/spriteSequences.ts)
 * ไฟล์นี้จึงมีหน้าที่แค่เล่นลำดับเฟรม จัดตำแหน่งตามช่องในทีม และรับการกด
 *
 * ── ถ้าจะเปลี่ยนไปใช้โมเดล 3D จริงในอนาคต ──────────────────
 * เพิ่มฟิลด์ modelUrl กลับเข้า ModelSpec แล้วแตกสาขาตรง <SpriteRig>
 * ส่วนโครงรอบนอก (ตำแหน่งช่อง hitbox วงเลือก hover) ใช้ซ้ำได้ทั้งหมด
 * ───────────────────────────────────────────────────────────
 */

/**
 * ความสูงของ "ตัวละครหนึ่งหน่วยมาตรฐาน" ในหน่วยโลกของฉาก Lobby
 *
 * นี่คือค่าเดียวที่ฉากนี้กำหนดเอง (คู่กับ ENTITY_SPRITE_HEIGHT ของห้องต่อสู้) — ขนาดจริงของ
 * ระนาบแต่ละเฟรมมาจาก deriveSpriteSize() ตามข้อ E3 ของ docs/SPRITE-DESIGN-LOCK.md
 * ไม่ได้พิมพ์มือ
 *
 * ที่มาของเลข 3.213: เท่ากับความสูงระนาบเดิมที่พิมพ์มือไว้ (4.018 x 3.213) พอดี ซึ่งกับชีต
 * อ้างอิง 396x376 ให้ผลลัพธ์เท่าเดิมเป๊ะ — ตั้งใจให้ท่ายืน (ท่าที่เห็นเกือบตลอดเวลาในลอบบี้)
 * ไม่เปลี่ยนขนาดจากของเดิมเลย ที่เปลี่ยนคือความ "กว้าง" (เดิมยืดเกิน 18.74% เพราะระนาบถูก
 * ตั้งไว้ตามอัตราส่วน 640x512 แต่เอาชีต 396x376 มาแปะ) และท่าแอ็กชันที่เดิมหดลง 27%
 */
const LOBBY_SPRITE_HEIGHT = 3.213

interface CharacterModelProps {
  character: Character
  /** ตำแหน่งช่องที่ผู้เล่นจัดตัวละครนี้ไว้ (มาจากผังทีม ไม่ใช่จากตัวละคร) */
  transform: SlotTransform
  isSelected: boolean
  onSelect: (id: string) => void
}

export function CharacterModel({
  character,
  transform,
  isSelected,
  onSelect,
}: CharacterModelProps) {
  const { model: spec } = character

  const ring = useRef<Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const [actionKey, setActionKey] = useState(0)

  // กันเคอร์เซอร์ค้างเป็นรูปมือถ้า component ถูก unmount ตอนที่ยัง hover อยู่
  useEffect(() => {
    return () => {
      document.body.style.cursor = 'auto'
    }
  }, [])

  /** ให้วงแหวนของแต่ละตัวเต้นไม่พร้อมกัน โดยสุ่มจาก id แบบคงที่ */
  const phase = useMemo(() => hashToPhase(character.id), [character.id])

  useFrame((state) => {
    if (!ring.current) return
    const t = state.clock.elapsedTime + phase
    ring.current.rotation.z = t * 0.55
    ring.current.scale.setScalar(1 + Math.sin(t * 2.6) * 0.04)
  })

  return (
    <group
      position={transform.position}
      rotation={[0, transform.rotationY, 0]}
      onClick={(e) => {
        e.stopPropagation()
        setActionKey((key) => key + 1)
        onSelect(character.id)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        document.body.style.cursor = 'auto'
      }}
    >
      {/* hitbox โปร่งใส — ทำให้กด/แตะโดนง่ายบนมือถือ */}
      <mesh position={[0, 0.95, 0]} visible={false}>
        <boxGeometry args={[1.3, 2.1, 1.1]} />
      </mesh>

      <group scale={0.8}>
        <SpriteRig spec={spec} actionKey={actionKey} />
      </group>

      <SelectionRing ref={ring} color={spec.accent} active={isSelected} hovered={hovered} />
    </group>
  )
}

/**
 * เล่นลำดับเฟรมภาพของตัวละคร
 *
 * ใช้ระนาบสองแผ่นซ้อนกันแล้วไล่ opacity ข้ามกัน (crossfade) แทนการสลับภาพห้วน ๆ
 * ทำให้ 8 เฟรมต่อวินาทีดูลื่นกว่าที่ควรจะเป็น
 */
function SpriteRig({ spec, actionKey }: { spec: ModelSpec; actionKey: number }) {
  const config = useMemo(() => getSpriteSequence(spec.kind), [spec.kind])
  const urls = useMemo(() => [...config.idleUrls, ...config.actionUrls], [config])
  const textures = useLoader(TextureLoader, urls)
  const currentMesh = useRef<Mesh>(null)
  const nextMesh = useRef<Mesh>(null)
  const pendingAction = useRef(false)
  const manualActionStart = useRef<number | null>(null)
  const previousActionKey = useRef(actionKey)
  const phase = useMemo(() => hashToPhase(spec.kind), [spec.kind])

  /*
     ขนาดระนาบของแต่ละชุดท่า — คำนวณจากพิกเซลจริงของชีต (E3) ไม่ใช่เลขพิมพ์มือ
     ท่ายืนกับท่าแอ็กชันอยู่คนละชีต (396x376 vs 640x512) เดิมใช้ระนาบใบเดียวกันทั้งคู่
     ตัวละครจึงหด/โป่ง 27-32% ตอนสลับท่า ตอนนี้แต่ละชุดได้ขนาดของตัวเอง ตัวจริงในภาพ
     จึงสูงเท่ากันทุกท่า (วัดแล้วต่างกัน 0.03-0.18%)

     ทั้งสอง mesh ใช้ก้อนเดียวกันเสมอ เพราะ crossfade ไล่เฟรมอยู่ใน order ชุดเดียวกันเท่านั้น
     (ดู useFrame ด้านล่าง: current กับ next มาจาก order เดียวกันทุกกรณี)
  */
  const planeSize = useMemo(() => {
    const idle = deriveSpriteSize(config.idleUrls[0], LOBBY_SPRITE_HEIGHT)
    return {
      idle,
      action: config.actionUrls[0]
        ? deriveSpriteSize(config.actionUrls[0], LOBBY_SPRITE_HEIGHT)
        : idle,
    }
  }, [config])

  useEffect(() => {
    textures.forEach((texture) => {
      texture.colorSpace = SRGBColorSpace
      texture.needsUpdate = true
    })
  }, [textures])

  useEffect(() => {
    if (actionKey !== previousActionKey.current) {
      previousActionKey.current = actionKey
      pendingAction.current = true
    }
  }, [actionKey])

  useFrame((state) => {
    if (!currentMesh.current || !nextMesh.current) return
    const elapsed = state.clock.elapsedTime
    if (pendingAction.current) {
      manualActionStart.current = elapsed
      pendingAction.current = false
    }

    const idleOrder = config.idleUrls.map((_, index) => index)
    const actionOffset = config.idleUrls.length
    const actionOrder = config.actionOrder.map((index) => actionOffset + index)
    const actionDuration = actionOrder.length / config.actionRate
    const manualTime =
      manualActionStart.current === null
        ? Number.POSITIVE_INFINITY
        : elapsed - manualActionStart.current
    const automaticTime = (elapsed + phase) % config.autoPeriod
    const automaticStart = config.autoPeriod - actionDuration
    const manualActive = actionOrder.length > 0 && manualTime >= 0 && manualTime < actionDuration
    const automaticActive = actionOrder.length > 0 && automaticTime >= automaticStart
    const order = manualActive || automaticActive ? actionOrder : idleOrder
    const rate = manualActive || automaticActive ? config.actionRate : config.idleRate
    const sequenceTime = manualActive
      ? manualTime
      : automaticActive
        ? automaticTime - automaticStart
        : elapsed + phase
    const rawFrame = sequenceTime * rate
    const frameStep = Math.floor(rawFrame)
    const currentIndex = order[Math.min(order.length - 1, frameStep % order.length)]
    const nextStep =
      manualActive || automaticActive
        ? Math.min(order.length - 1, frameStep + 1)
        : (frameStep + 1) % order.length
    const nextIndex = order[nextStep]
    const blend = smoothstep(Math.max(0, (rawFrame - frameStep - 0.68) / 0.32))
    const currentMaterial = currentMesh.current.material as MeshBasicMaterial
    const nextMaterial = nextMesh.current.material as MeshBasicMaterial

    // ระนาบเป็นสี่เหลี่ยมหน่วย (1x1) แล้วขยายตามชีตที่กำลังเล่น — ย้ายที่นี่ไม่ใช่ใน JSX
    // เพราะชุดท่าเปลี่ยนได้ทุกเฟรมโดยไม่ re-render (แบบเดียวกับ .map/.opacity ด้านล่าง)
    const size = manualActive || automaticActive ? planeSize.action : planeSize.idle
    for (const mesh of [currentMesh.current, nextMesh.current]) {
      mesh.scale.set(size.width, size.height, 1)
      // ยกให้เท้า (ขอบล่างของภาพ + ระยะโปร่งใต้เท้า) แตะพื้นที่ y=0 พอดี — ข้อ E1
      mesh.position.y = size.height / 2 - size.footInset
    }

    currentMaterial.map = textures[currentIndex]
    currentMaterial.opacity = 1 - blend
    nextMaterial.map = textures[nextIndex]
    nextMaterial.opacity = blend
  })

  return (
    <group>
      {spec.kind === 'pilgrim-monk' ? <TripitakaEffects actionKey={actionKey} /> : null}
      {/* ค่าใน JSX คือค่าเริ่มต้น (ท่ายืน) เท่านั้น — useFrame ด้านบนเป็นเจ้าของจริง */}
      <mesh
        ref={currentMesh}
        position={[0, planeSize.idle.height / 2 - planeSize.idle.footInset, 0]}
        scale={[planeSize.idle.width, planeSize.idle.height, 1]}
        raycast={() => {}}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={textures[0]}
          transparent
          alphaTest={0.025}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh
        ref={nextMesh}
        position={[0, planeSize.idle.height / 2 - planeSize.idle.footInset, 0.004]}
        scale={[planeSize.idle.width, planeSize.idle.height, 1]}
        raycast={() => {}}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={textures[1] ?? textures[0]}
          transparent
          opacity={0}
          alphaTest={0.025}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

/** รัศมีพุทธบารมีและคลื่นพลังฝ่ามือ — เฉพาะพระถังซัมจั๋ง */
function TripitakaEffects({ actionKey }: { actionKey: number }) {
  const aura = useRef<Mesh>(null)
  const palm = useRef<Mesh>(null)
  const waves = useRef<Mesh[]>([])
  const auraUrl = publicUrl('characters/tripitaka-buddha-aura.webp')
  const auraTexture = useLoader(TextureLoader, auraUrl)
  /*
     ชีตรัศมีเป็นแนวตั้ง (1194x1317) แต่เดิมถูกแปะบนระนาบ 4.018 x 3.213 ซึ่งเป็นแนวนอน
     ภาพจึงถูกยืดออกด้านข้าง 37.9% — มากกว่าของตัวละครเองเท่าตัว ตอนนี้เอาสัดส่วนจากไฟล์
     (E3) ขนาดรวมยังเท่าเดิมคือสูงหนึ่งเท่าของตัวละครมาตรฐาน ส่วน scale.setScalar ที่เต้น
     อยู่ใน useFrame ยังทำงานทับบนขนาดนี้เหมือนเดิม
  */
  const auraSize = useMemo(() => deriveSpriteSize(auraUrl, LOBBY_SPRITE_HEIGHT), [auraUrl])

  useEffect(() => {
    auraTexture.colorSpace = SRGBColorSpace
    auraTexture.needsUpdate = true
  }, [auraTexture])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (aura.current) {
      const pulse = 1 + Math.sin(t * 1.45) * 0.025
      aura.current.scale.setScalar(pulse)
      ;(aura.current.material as MeshBasicMaterial).opacity =
        0.15 + (Math.sin(t * 1.45) + 1) * 0.045
    }
    if (palm.current) {
      const pulse = 0.86 + (Math.sin(t * 3.2) + 1) * 0.16
      palm.current.scale.setScalar(pulse)
    }
    waves.current.forEach((wave, index) => {
      if (!wave) return
      const cycle = (t * 0.52 + index / waves.current.length + actionKey * 0.13) % 1
      wave.position.x = 0.7 + cycle * 0.72
      wave.scale.set(0.55 + cycle * 1.9, 0.55 + cycle * 1.35, 1)
      ;(wave.material as MeshBasicMaterial).opacity = (1 - cycle) * 0.48
    })
  })

  return (
    <group>
      <mesh
        ref={aura}
        position={[0, auraSize.height / 2 - auraSize.footInset, -0.025]}
        raycast={() => {}}
      >
        <planeGeometry args={[auraSize.width, auraSize.height]} />
        <meshBasicMaterial
          map={auraTexture}
          transparent
          opacity={0.18}
          depthWrite={false}
          toneMapped={false}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh ref={palm} position={[0.7, 1.48, 0.025]} raycast={() => {}}>
        <circleGeometry args={[0.105, 32]} />
        <meshBasicMaterial
          color="#ffe083"
          transparent
          opacity={0.74}
          depthWrite={false}
          toneMapped={false}
          blending={AdditiveBlending}
        />
      </mesh>
      {Array.from({ length: 3 }, (_, index) => (
        <mesh
          key={index}
          ref={(node) => {
            if (node) waves.current[index] = node
          }}
          position={[0.7, 1.48, 0.02]}
          raycast={() => {}}
        >
          <ringGeometry args={[0.11, 0.145, 32]} />
          <meshBasicMaterial
            color={index === 1 ? '#ffd05a' : '#fff0a8'}
            transparent
            opacity={0}
            depthWrite={false}
            toneMapped={false}
            blending={AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  )
}

/** วงแหวนใต้เท้าของตัวละคร — แสดงสถานะ hover / ถูกเลือก */
function SelectionRing({
  ref,
  color,
  active,
  hovered,
}: {
  ref: React.Ref<Mesh>
  color: string
  active: boolean
  hovered: boolean
}) {
  const opacity = active ? 0.95 : hovered ? 0.5 : 0.16
  return (
    <mesh ref={ref} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.62, 0.78, 6, 1]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        toneMapped={false}
        side={DoubleSide}
      />
    </mesh>
  )
}

function smoothstep(value: number) {
  const x = Math.min(1, Math.max(0, value))
  return x * x * (3 - 2 * x)
}

/** แปลง id เป็นตัวเลข 0..2π เพื่อให้จังหวะของแต่ละตัวไม่ตรงกัน */
function hashToPhase(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1000
  return (h / 1000) * Math.PI * 2
}
