import type { ReactNode } from 'react'
import { playSfx } from '../../lib/audio/AudioEngine'
import { publicUrl } from '../../lib/publicUrl'
import { ItemBagIcon, PawIcon, TeamFormationIcon } from '../icons/GameIcons'
import { useToast } from '../Toast/useToast'
import styles from './MainNavigation.module.css'

interface NavItem {
  id: string
  label: string
  accent: string
  /** ภาพวาดมือของเมนู (ถ้ายังไม่มีไฟล์ ให้ใช้ icon แทน) */
  image?: string
  /** ไอคอน SVG สำรอง สำหรับเมนูที่ยังไม่มีภาพวาด */
  icon?: ReactNode
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'battle',
    label: 'ต่อสู้',
    image: publicUrl('ui/navigation/battle.webp'),
    accent: '#f2a443',
  },
  {
    id: 'heroes',
    label: 'ตัวละคร',
    image: publicUrl('ui/navigation/heroes.webp'),
    accent: '#f0c35e',
  },
  { id: 'pets', label: 'สัตว์เลี้ยง', icon: <PawIcon />, accent: '#e58fb4' },
  {
    id: 'training',
    label: 'ค่ายฝึก',
    image: publicUrl('ui/navigation/training.webp'),
    accent: '#77b9db',
  },
  { id: 'team', label: 'จัดทีม', icon: <TeamFormationIcon />, accent: '#8fa9f0' },
  { id: 'items', label: 'ไอเทม', icon: <ItemBagIcon />, accent: '#e0a86b' },
  {
    id: 'summon',
    label: 'อัญเชิญ',
    image: publicUrl('ui/navigation/summon.webp'),
    accent: '#67d6a0',
  },
  { id: 'guild', label: 'กิลด์', image: publicUrl('ui/navigation/guild.webp'), accent: '#7ad1b0' },
]

interface MainNavigationProps {
  /** เปิดหน้าตัวละครทั้งหมดของฉัน — ผูกกับปุ่ม id="heroes" เท่านั้น */
  onOpenHeroes: () => void
  /** เข้าห้องต่อสู้ (ด่านแรก) โดยตรง — ไม่ผ่านโหมดสำรวจ */
  onOpenBattle: () => void
  /** เปิดกระเป๋าไอเทม — ผูกกับปุ่ม id="items" เท่านั้น */
  onOpenItems: () => void
  /** เปิดหน้าอัญเชิญ — ผูกกับปุ่ม id="summon" เท่านั้น */
  onOpenSummon: () => void
}

export function MainNavigation({
  onOpenHeroes,
  onOpenBattle,
  onOpenItems,
  onOpenSummon,
}: MainNavigationProps) {
  const { comingSoon } = useToast()

  const handleSelect = (id: string, label: string) => {
    void playSfx('buttonClick')
    if (id === 'heroes') {
      onOpenHeroes()
      return
    }
    if (id === 'battle') {
      onOpenBattle()
      return
    }
    if (id === 'items') {
      onOpenItems()
      return
    }
    if (id === 'summon') {
      onOpenSummon()
      return
    }
    comingSoon(label)
  }

  return (
    <nav className={styles.nav} aria-label="เมนูหลัก">
      <div className={styles.rail}>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.item}
            style={{ '--nav-accent': item.accent } as React.CSSProperties}
            aria-label={item.label}
            data-menu-id={item.id}
            onClick={() => handleSelect(item.id, item.label)}
          >
            <span className={styles.art}>
              {item.image ? <img src={item.image} alt="" draggable={false} /> : item.icon}
            </span>
            <span className={styles.label}>{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
