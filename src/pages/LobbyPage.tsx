import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { getCharacter } from '../game/characters'
import { hasWalkFrames } from '../game/walkKits'
import { AddFriendModal } from '../components/AddFriendModal/AddFriendModal'
import { WukongAdventure } from '../components/AdventureScene/WukongAdventure'
import { ErrorBoundary, SceneCrashFallback } from '../components/ErrorBoundary/ErrorBoundary'
import { LoadingScreen } from '../components/LoadingScreen/LoadingScreen'
import { WorldChat } from '../components/WorldChat/WorldChat'
import { DungeonSession } from '../components/DungeonSession/DungeonSession'
import { LobbyBattleSession } from '../components/LobbyBattleSession/LobbyBattleSession'
import { CharacterRosterModal } from '../components/CharacterRoster/CharacterRosterModal'
import { ItemsModal } from '../components/ItemsModal/ItemsModal'
import { SummonModal } from '../components/SummonModal/SummonModal'
import { MainNavigation } from '../components/MainNavigation/MainNavigation'
import { ProfileModal } from '../components/ProfileModal/ProfileModal'
import { SettingsModal, type AudioSettings } from '../components/SettingsModal/SettingsModal'
import { getAudioSettings, initAudioEngine, setAudioSettings } from '../lib/audio/AudioEngine'
import { getPerformanceSettings, setPerformanceSettings } from '../lib/performanceSettings'
import type { QualityOverride } from '../hooks/usePerformanceQuality'
import { SideActions } from '../components/SideActions/SideActions'
import { StartAdventure } from '../components/StartAdventure/StartAdventure'
import { TopBar } from '../components/TopBar/TopBar'
import { MOCK_BADGES } from '../data/mockPlayer'
import type {
  CharacterGrantResult,
  CurrencyResult,
  GachaPullResult,
  GoldSource,
  ItemResult,
} from '../data/accountRepository.shared'
import type { GachaPullCount } from '../game/gacha/executeGachaPull'
import type { FriendCandidate, Player } from '../types/player'
import styles from './LobbyPage.module.css'

/** โหลดฉาก 3D แยก chunk เพื่อให้ HUD ขึ้นก่อน (three.js มีขนาดใหญ่) */
const LobbyScene = lazy(() =>
  import('../components/LobbyScene/LobbyScene').then((m) => ({ default: m.LobbyScene })),
)

interface LobbyPageProps {
  /** ผู้เล่นที่ล็อกอินอยู่ — มาจากฐานข้อมูล ไม่ใช่ mock อีกแล้ว */
  player: Player
  /** บันทึกความคืบหน้ากลับลงฐานข้อมูล */
  /** คืน true เมื่อบันทึกลงที่เก็บข้อมูลจริง — false แปลว่าหน้าจอถูกย้อนกลับแล้ว */
  onPlayerChange: (next: Player) => Promise<boolean>
  /** ทองจากการเล่น (ดรอป/เควส) — ผ่าน ledger */
  onEarnGold: (source: GoldSource, amount: number, refId?: string) => Promise<CurrencyResult>
  /** ไอเทมดรอปจากการต่อสู้ */
  onGrantItem: (itemId: string, quantity: number, source: GoldSource) => Promise<ItemResult>
  onLogout: () => Promise<void>
  /** เติมทองด้วยเงินจริง */
  onTopUpGold: (packageId: string) => Promise<CurrencyResult>
  /** เติมหยกด้วยเงินจริง */
  onTopUpGems: (packageId: string) => Promise<CurrencyResult>
  /** แลกโค้ดคูปองเป็นหยก */
  onRedeemCoupon: (code: string) => Promise<CurrencyResult>
  /** ค้นหาผู้เล่นจาก UID เพื่อเพิ่มเพื่อน */
  onFindFriend: (uid: string) => Promise<FriendCandidate | null>
  /** บัญชีนี้ใช้คำสั่งลับในแชทได้ไหม — ไม่มีผลต่อหน้าตา UI เลย (ดู supabase/migrations/0004_admin_accounts.sql) */
  isAdmin: boolean
  /** มอบตัวละครให้บัญชีนี้ — เรียกจากคำสั่งลับในแชท (ดู WorldChat.tsx) */
  onGiveCharacter: (characterId: string) => Promise<CharacterGrantResult>
  /** ส่งออก save เป็นไฟล์ JSON — คืน null เมื่อสำเร็จ (ดาวน์โหลดแล้ว) คืนข้อความเมื่อผิดพลาด */
  onExportSave: () => Promise<string | null>
  /** บัญชีนี้เชื่อมกับ Google ไว้แล้วหรือยัง — โชว์ใน SettingsModal */
  hasGoogleLinked: boolean
  /** เริ่มเชื่อมบัญชีนี้กับ Google — เปลี่ยนหน้าออกไปทันทีเมื่อสำเร็จ */
  onLinkGoogleAccount: () => Promise<string | null>
  /** บัญชีนี้เป็น guest (ยังไม่เคยอัพเกรด) ไหม — โชว์คำเตือนใน SettingsModal */
  isGuest: boolean
  /** อัญเชิญ gacha — หักหยกผ่าน ledger */
  onPullGacha: (bannerId: string, pullCount: GachaPullCount) => Promise<GachaPullResult>
}

export function LobbyPage({
  player,
  onPlayerChange,
  onEarnGold,
  onGrantItem,
  onLogout,
  onTopUpGold,
  onTopUpGems,
  onRedeemCoupon,
  onFindFriend,
  isAdmin,
  onGiveCharacter,
  onExportSave,
  hasGoogleLinked,
  onLinkGoogleAccount,
  isGuest,
  onPullGacha,
}: LobbyPageProps) {
  // แจ้งเตือนจดหมาย/ภารกิจยังเป็น mock เพราะยังไม่มีระบบทั้งสองอย่าง
  const badges = MOCK_BADGES

  /** ตัวละครที่บัญชีนี้ครอบครองจริง — ใช้เป็นตัวเลือกในฉากเดิน */
  const ownedCharacters = useMemo(
    () =>
      player.ownedCharacters.flatMap((owned) => {
        const character = getCharacter(owned.characterId)
        return character
          ? [{ ...character, level: owned.level, exp: owned.exp, expToNext: owned.expToNext }]
          : []
      }),
    [player.ownedCharacters],
  )
  /**
   * ตัวที่มีชุดเฟรมเดินจริง — เกณฑ์เดียวกับที่ WukongAdventure ใช้กรอง castBar ของตัวเอง
   * (ดู src/components/AdventureScene/WukongAdventure.tsx) ใช้ค่าเดียวกันที่นี่เพื่อให้
   * ปุ่ม "เดินชมจันทร์" ใน ProfileModal เสนอเฉพาะตัวที่เดินได้จริง ไม่ใช่ทุกตัวที่ครอบครอง
   */
  const walkableCharacters = useMemo(
    () => ownedCharacters.filter((entry) => hasWalkFrames(entry.model.kind)),
    [ownedCharacters],
  )
  /** ตัวที่กำลังเดินอยู่ในฉากเดินชมจันทร์ — null คือยังไม่เคยเลือก ใช้ตัวแรกที่เดินได้เป็นค่าเริ่มต้น
   * เปลี่ยนได้จากปุ่ม "เดินชมจันทร์" ในโปรไฟล์ทางเดียว (แถบเลือกที่เคยลอยอยู่กลางฉากถูกถอดออกแล้ว) */
  const [walkingCharacterId, setWalkingCharacterId] = useState<string | null>(null)
  /**
   * ตัวละครที่ถูกแตะในฉาก — ตอนนี้ใช้แค่แสดงวงแหวนใต้เท้าและกระตุ้นท่าประจำตัว
   * (แผงข้อมูลตอนแตะโมเดลถูกถอดออกไว้ก่อน รอดูว่าจะใส่อะไรแทนในอนาคต)
   */
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [rosterOpen, setRosterOpen] = useState(false)
  const [battleOpen, setBattleOpen] = useState(false)
  const [dungeonOpen, setDungeonOpen] = useState(false)
  const [addFriendOpen, setAddFriendOpen] = useState(false)
  const [itemsOpen, setItemsOpen] = useState(false)
  const [summonOpen, setSummonOpen] = useState(false)
  // ค่าเริ่มต้นอ่านจาก engine (persist ผ่าน localStorage) — เก็บ mirror ไว้ที่นี่แค่ให้ React re-render
  const [audio, setAudio] = useState<AudioSettings>(getAudioSettings())
  const handleAudioChange = (next: AudioSettings) => {
    setAudioSettings(next)
    setAudio(next)
  }
  // ยกมาไว้ที่นี่แบบเดียวกับ audio — LobbyScene (ฉาก 3D) ต้องอ่านค่านี้แบบเรียลไทม์
  // ตอนผู้เล่นเปลี่ยนจาก SettingsModal โดยไม่ต้องปิดแล้วเปิดฉากใหม่
  const [performanceOverride, setPerformanceOverride] = useState<QualityOverride>(
    () => getPerformanceSettings().qualityOverride,
  )
  const handlePerformanceOverrideChange = (next: QualityOverride) => {
    setPerformanceSettings({ qualityOverride: next })
    setPerformanceOverride(next)
  }
  /**
   * ผู้เล่นที่เคย login ไว้แล้วเข้าตรงมาที่ลอบบี้เลย ไม่ผ่าน TitlePage (ดู App.tsx)
   * ที่นั่นเป็นจุดเดียวที่เคยเรียก initAudioEngine() มาก่อน — คนกลุ่มนี้เลย
   * ไม่เคยมี AudioContext ถูกสร้างเลย ต้องดัก user gesture แรกในลอบบี้เองด้วย
   */
  useEffect(() => {
    const unlock = () => initAudioEngine()
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])

  return (
    <main className={styles.page}>
      <ErrorBoundary
        fallback={
          <SceneCrashFallback
            message="ฉากลอบบี้ขัดข้อง ลองกลับหน้าเริ่มเกมแล้วเข้าใหม่"
            onBack={() => void onLogout()}
            backLabel="กลับหน้าเริ่มเกม"
          />
        }
      >
        <Suspense fallback={<LoadingScreen label="กำลังเข้าสู่ลานประลอง…" />}>
          <LobbyScene
            teamSlots={player.teamSlots}
            selectedId={selectedId}
            onSelect={setSelectedId}
            qualityOverride={performanceOverride}
          />
        </Suspense>
      </ErrorBoundary>

      <TopBar
        player={player}
        onOpenProfile={() => setProfileOpen(true)}
        onTopUpGold={onTopUpGold}
        onTopUpGems={onTopUpGems}
      />

      <div className={styles.stage}>
        <SideActions
          badges={badges}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenAddFriend={() => setAddFriendOpen(true)}
        />
      </div>

      <div className={styles.startRow}>
        <StartAdventure onStart={() => setDungeonOpen(true)} />
      </div>

      <MainNavigation
        onOpenHeroes={() => setRosterOpen(true)}
        onOpenBattle={() => setBattleOpen(true)}
        onOpenItems={() => setItemsOpen(true)}
        onOpenSummon={() => setSummonOpen(true)}
      />

      {/*
        แชทเห็นได้ทุกบัญชีตั้งใจ (ไม่ใช่ dev-only/admin-only gate อีกต่อไป — คำสั่งลับ
        ผู้ดูแลซ่อนอยู่ข้างในโดยไม่ใบ้อะไรใน UI เลย ดู WorldChat.tsx). แทนที่ CommandConsole
        เดิม (ซึ่งอีกเครื่องเพิ่งใส่ import.meta.env.DEV gate ไว้พร้อมกัน — ไม่ต้องแล้วเพราะ
        component เปลี่ยนชื่อ/พฤติกรรมไปคนละแบบ ไม่ใช่คอนโซลลับอีกต่อไป)
      */}
      <WorldChat playerName={player.name} isAdmin={isAdmin} onGiveCharacter={onGiveCharacter} />

      {dungeonOpen ? (
        <DungeonSession
          player={player}
          onPlayerChange={onPlayerChange}
          onEarnGold={onEarnGold}
          onGrantItem={onGrantItem}
          onExit={() => setDungeonOpen(false)}
        />
      ) : null}

      {battleOpen ? (
        <LobbyBattleSession
          player={player}
          onPlayerChange={onPlayerChange}
          onEarnGold={onEarnGold}
          onGrantItem={onGrantItem}
          onExit={() => setBattleOpen(false)}
        />
      ) : null}

      {/*
        เดินชมจันทร์เปิดอยู่ตลอดเวลาที่อยู่ในลอบบี้ ไม่ต้องกดปุ่มเปิดจากโปรไฟล์อีกต่อไป
        คุมทิศทางด้วย WASD/คลิกพื้นได้เหมือนเดิม เลือกตัวที่จะเดินได้จากแถบเลือกขุนพล
        (ตำแหน่งที่เดินอยู่ยังคงอยู่แม้สลับตัวละคร เพราะ component ไม่ถูก mount ใหม่)
      */}
      <WukongAdventure
        mode="moonlight"
        characters={ownedCharacters}
        activeCharacterId={walkingCharacterId}
      />

      {/* หน้า Lobby ยังคง mount อยู่ข้างหลัง ฉาก 3D และแอนิเมชันตัวละครจึงไม่รีเซ็ต */}
      {rosterOpen ? (
        <CharacterRosterModal
          player={player}
          onClose={() => setRosterOpen(false)}
          onPlayerChange={onPlayerChange}
        />
      ) : null}

      {profileOpen ? (
        <ProfileModal
          player={player}
          walkableCharacters={walkableCharacters}
          activeWalkCharacterId={walkingCharacterId}
          onSelectWalkCharacter={(id) => {
            setWalkingCharacterId(id)
            setProfileOpen(false)
          }}
          onClose={() => setProfileOpen(false)}
        />
      ) : null}

      {addFriendOpen ? (
        <AddFriendModal
          player={player}
          onPlayerChange={onPlayerChange}
          onSearch={onFindFriend}
          onClose={() => setAddFriendOpen(false)}
        />
      ) : null}

      {itemsOpen ? <ItemsModal player={player} onClose={() => setItemsOpen(false)} /> : null}

      {summonOpen ? (
        <SummonModal
          player={player}
          onClose={() => setSummonOpen(false)}
          onPullGacha={onPullGacha}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsModal
          audio={audio}
          onAudioChange={handleAudioChange}
          performanceOverride={performanceOverride}
          onPerformanceOverrideChange={handlePerformanceOverrideChange}
          onLogout={onLogout}
          onRedeemCoupon={onRedeemCoupon}
          ownedCharacterCount={ownedCharacters.length}
          onClose={() => setSettingsOpen(false)}
          onExportSave={onExportSave}
          hasGoogleLinked={hasGoogleLinked}
          onLinkGoogleAccount={onLinkGoogleAccount}
          isGuest={isGuest}
        />
      ) : null}
    </main>
  )
}
