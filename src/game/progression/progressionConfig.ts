/**
 * P8 BALANCE LOCK (Ring 0, 2026-08-08) — playtest baseline, NOT final live economy.
 * nonProductionBalance stays true until a full playtest round completes.
 */

import type { SkillSlotId, SkillLevelModifier } from './progressionSchema'

export const PROGRESSION_SCHEMA_VERSION = 1

/** Ring 0 locked caps — framework limits for P8 playtest. */
export const progressionConfig = {
  maxHeroLevel: 60,
  /** Default max skill level (Ring 0: maxSkillLevel 5). Per-skill overrides allowed in fixtures. */
  defaultSkillMaxLevel: 5,
  maxAwakeningTier: 3,
  nonProductionBalance: true as const,
  /** At max hero level: retain EXP at 0 (overflow ignored). */
  maxLevelExpBehavior: 'clamp_zero' as const,
  /** Talent/awakening production content deferred — hide test-fixture UI, keep framework + tests. */
  showTalentAwakeningUi: false,
}

export interface HeroExpTableEntry {
  level: number
  expToNext: number
}

/** EXP table Lv1–10 — Ring 0 confirmed placeholder. Lv11+ uses formula below (tunable, not final lock). */
export const PLACEHOLDER_HERO_EXP_TABLE: HeroExpTableEntry[] = [
  { level: 1, expToNext: 100 },
  { level: 2, expToNext: 150 },
  { level: 3, expToNext: 220 },
  { level: 4, expToNext: 300 },
  { level: 5, expToNext: 400 },
  { level: 6, expToNext: 520 },
  { level: 7, expToNext: 660 },
  { level: 8, expToNext: 820 },
  { level: 9, expToNext: 1000 },
  { level: 10, expToNext: 1200 },
]

export function getExpToNextForLevel(level: number): number {
  const entry = PLACEHOLDER_HERO_EXP_TABLE.find((row) => row.level === level)
  if (entry) return entry.expToNext
  // TUNABLE — not part of final balance lock (Ring 0: Lv11+ formula temporary).
  return Math.max(100, Math.round(100 + level * 80))
}

/** Per-level stat growth — Ring 0 playtest baseline (HP +12, ATK +2, DEF +1.5, SPD +0.5). */
export const PLACEHOLDER_LEVEL_STAT_GROWTH = {
  hp: 12,
  atk: 2,
  def: 1.5,
  spd: 0.5,
}

export interface SkillUpgradeCost {
  gold?: number
  materials?: Array<{ itemId: string; quantity: number }>
}

export interface SkillProgressionDefinition {
  skillId: string
  slot: SkillSlotId
  maxLevel: number
  upgradeCosts: SkillUpgradeCost[]
  levelModifiers: SkillLevelModifier[]
}

/** Test fixture skill progression — monkey-king only for P8 proof. */
export const SKILL_PROGRESSION_FIXTURES: Record<
  string,
  Partial<Record<SkillSlotId, SkillProgressionDefinition>>
> = {
  'monkey-king': {
    skill1: {
      skillId: 'spinning-golden-staff',
      slot: 'skill1',
      maxLevel: 5,
      upgradeCosts: [{ gold: 50 }, { gold: 80 }, { gold: 120 }, { gold: 180 }],
      levelModifiers: [
        { level: 1, damageScale: 1 },
        { level: 2, damageScale: 1.05 },
        { level: 3, damageScale: 1.1 },
        { level: 4, damageScale: 1.15 },
        { level: 5, damageScale: 1.2 },
      ],
    },
    skill2: {
      skillId: 'staff-thrust',
      slot: 'skill2',
      maxLevel: 5,
      upgradeCosts: [{ gold: 40 }, { gold: 70 }, { gold: 100 }, { gold: 150 }],
      levelModifiers: [
        { level: 1, damageScale: 1 },
        { level: 2, damageScale: 1.04 },
        { level: 3, damageScale: 1.08 },
        { level: 4, damageScale: 1.12 },
        { level: 5, damageScale: 1.16 },
      ],
    },
    skill3: {
      skillId: 'staff-sweep',
      slot: 'skill3',
      maxLevel: 5,
      upgradeCosts: [{ gold: 40 }, { gold: 70 }, { gold: 100 }, { gold: 150 }],
      levelModifiers: [
        { level: 1, damageScale: 1 },
        { level: 2, damageScale: 1.04 },
        { level: 3, damageScale: 1.08 },
        { level: 4, damageScale: 1.12 },
        { level: 5, damageScale: 1.16 },
      ],
    },
    ultimate: {
      skillId: 'golden-fury',
      slot: 'ultimate',
      maxLevel: 3,
      upgradeCosts: [{ gold: 100 }, { gold: 200 }],
      levelModifiers: [
        { level: 1, damageScale: 1 },
        { level: 2, damageScale: 1.1 },
        { level: 3, damageScale: 1.2 },
      ],
    },
  },
  'pig-warrior': {
    skill1: {
      skillId: 'pig-skill1',
      slot: 'skill1',
      maxLevel: 3,
      upgradeCosts: [{ gold: 45 }, { gold: 90 }],
      levelModifiers: [
        { level: 1, damageScale: 1 },
        { level: 2, damageScale: 1.08 },
        { level: 3, damageScale: 1.15 },
      ],
    },
  },
}

export interface TalentNodeDefinition {
  id: string
  name: string
  heroId: string
  prerequisites?: string[]
  cost?: SkillUpgradeCost
}

export const TALENT_NODE_FIXTURES: TalentNodeDefinition[] = [
  {
    id: 'mk-talent-1',
    name: 'ท่าเบา (test)',
    heroId: 'monkey-king',
    cost: { gold: 30 },
  },
  {
    id: 'mk-talent-2',
    name: 'ท่าแรง (test)',
    heroId: 'monkey-king',
    prerequisites: ['mk-talent-1'],
    cost: { gold: 60 },
  },
]

export const AWAKENING_TIER_FIXTURE_COSTS: Record<number, SkillUpgradeCost> = {
  1: { gold: 200 },
  2: { gold: 400 },
  3: { gold: 800 },
}
