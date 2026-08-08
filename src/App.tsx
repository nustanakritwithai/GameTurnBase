import { useState } from 'react'
import { AuthModal } from './components/AuthModal/AuthModal'
import { GameViewport } from './components/GameViewport/GameViewport'
import { NameModal } from './components/NameModal/NameModal'
import { ToastProvider } from './components/Toast/ToastProvider'
import { UpdateBanner } from './components/UpdateBanner/UpdateBanner'
import { useAuth } from './hooks/useAuth'
import { LobbyPage } from './pages/LobbyPage'
import { TitlePage } from './pages/TitlePage'

/**
 * เส้นทางเข้าเกม
 *
 *   ยังไม่ล็อกอิน            → หน้าเริ่มเกม → กดแล้วขึ้นหน้าสมัคร/เข้าสู่ระบบ
 *   ล็อกอินแล้วแต่ยังไม่ตั้งชื่อ → หน้าตั้งชื่อตัวละคร
 *   ครบแล้ว                  → ลอบบี้
 *
 * ผู้เล่นที่เคยล็อกอินไว้จะเข้าลอบบี้ทันทีโดยไม่ต้องผ่านสองหน้าแรก
 * (session ถูกกู้จากฐานข้อมูลใน useAuth)
 */
export default function App() {
  const {
    status,
    player,
    register,
    login,
    loginWithGoogle,
    loginAsGuest,
    logout,
    hasGoogleLinked,
    linkGoogleAccount,
    isGuest,
    updatePlayer,
    earnGold,
    topUpGold,
    topUpGems,
    redeemCoupon,
    findFriendByUid,
    isAdmin,
    grantCharacter,
    grantItem,
    pullGacha,
    exportSave,
  } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)

  // ล็อกอินแล้วและตั้งชื่อแล้ว → เข้าลอบบี้
  if (status === 'signed-in' && player && player.name.length > 0) {
    return (
      <GameViewport>
        <UpdateBanner />
        <ToastProvider>
          <LobbyPage
            player={player}
            onPlayerChange={updatePlayer}
            onEarnGold={earnGold}
            onGrantItem={grantItem}
            onLogout={logout}
            onTopUpGold={topUpGold}
            onTopUpGems={topUpGems}
            onRedeemCoupon={redeemCoupon}
            onFindFriend={findFriendByUid}
            isAdmin={isAdmin}
            onGiveCharacter={grantCharacter}
            onExportSave={exportSave}
            hasGoogleLinked={hasGoogleLinked}
            onLinkGoogleAccount={linkGoogleAccount}
            isGuest={isGuest}
            onPullGacha={pullGacha}
          />
        </ToastProvider>
      </GameViewport>
    )
  }

  const needsName = status === 'signed-in' && player !== null && player.name.length === 0

  return (
    <GameViewport>
      <UpdateBanner />
      <ToastProvider>
        {/* หน้าเริ่มเกมเป็นฉากหลังตลอดช่วงก่อนเข้าลอบบี้ */}
        <TitlePage onStart={() => setAuthOpen(true)} />

        {status === 'guest' && authOpen ? (
          <AuthModal
            onRegister={register}
            onLogin={login}
            onLoginWithGoogle={loginWithGoogle}
            onLoginAsGuest={loginAsGuest}
          />
        ) : null}

        {needsName && player ? (
          <NameModal
            onConfirm={(characterName) => updatePlayer({ ...player, name: characterName })}
          />
        ) : null}
      </ToastProvider>
    </GameViewport>
  )
}
