import { beforeEach, describe, expect, test } from 'vitest'
import { register, grantCharacter, getSessionPlayer } from './accountRepository'
import { ROSTER } from '../game/characters'
import { createInitialOwnedCharacterProgress } from '../game/progression/progressionMigration'
import { mapOwnedCharacterRow } from './accountRepository.supabase.mapping'
import * as fs from 'fs'
import * as path from 'path'

describe('Hero Collection System (#13)', () => {
  let uid: string

  beforeEach(async () => {
    localStorage.clear()
    // Register a fresh test account
    const result = await register('hero-test@example.com', 'Password123!')
    if (result.ok && result.player) {
      uid = result.player.uid
    } else {
      throw new Error('Failed to register test account')
    }
  })

  describe('grantCharacter - Done-criterion #1 & #2 (Duplicate & Invalid Checks)', () => {
    test('มอบตัวละครสำเร็จสำหรับตัวละครที่ยังไม่ครอบครอง', async () => {
      // ซุนหงอคงมีอยู่แล้วตั้งแต่สมัคร (STARTER_CHARACTER_ID)
      // ตือโป๊ยก่าย (pig-warrior) ยังไม่มี
      const result = await grantCharacter(uid, 'pig-warrior')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.characterId).toBe('pig-warrior')
        expect(result.player.ownedCharacters.some((c) => c.characterId === 'pig-warrior')).toBe(
          true,
        )
      }

      // ตรวจสอบจาก session จริง
      const player = await getSessionPlayer()
      expect(player?.ownedCharacters.some((c) => c.characterId === 'pig-warrior')).toBe(true)
    })

    test('ปฏิเสธการมอบตัวละครที่ครอบครองอยู่แล้ว และไม่เพิ่มซ้ำ', async () => {
      // ซุนหงอคง (monkey-king) มีอยู่แล้ว
      const result = await grantCharacter(uid, 'monkey-king')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('ครอบครองตัวละครนี้อยู่แล้ว')
      }

      const player = await getSessionPlayer()
      // ต้องมีแค่ 1 ตัว (ซุนหงอคงตัวเดียว)
      const monkeyKingCount = player?.ownedCharacters.filter(
        (c) => c.characterId === 'monkey-king',
      ).length
      expect(monkeyKingCount).toBe(1)
    })

    test('ป้องกันสภาวะแข่งขัน (Race Conditions) จากการเรียกซ้อนกันพร้อมกัน (Promise.all)', async () => {
      // ลองกดรับ พระถังซัมจั๋ง (pilgrim-monk) สองครั้งพร้อมกัน
      const results = await Promise.all([
        grantCharacter(uid, 'pilgrim-monk'),
        grantCharacter(uid, 'pilgrim-monk'),
      ])

      const successes = results.filter((r) => r.ok)
      const failures = results.filter((r) => !r.ok)

      expect(successes.length).toBe(1)
      expect(failures.length).toBe(1)
      expect(failures[0].error).toBe('ครอบครองตัวละครนี้อยู่แล้ว')

      const player = await getSessionPlayer()
      const monkCount = player?.ownedCharacters.filter(
        (c) => c.characterId === 'pilgrim-monk',
      ).length
      expect(monkCount).toBe(1)
    })

    test('ปฏิเสธหากระบุ characterId ที่ไม่มีในสารระบบ และไม่แก้ไขฐานข้อมูล', async () => {
      const dbBefore = localStorage.getItem('los:db:v1')

      const result = await grantCharacter(uid, 'non-existent-hero-id')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('ไม่พบตัวละคร')
      }

      const dbAfter = localStorage.getItem('los:db:v1')
      expect(dbAfter).toBe(dbBefore)
    })

    test('ปฏิเสธหากไม่พบ uid ของผู้เล่น', async () => {
      const result = await grantCharacter('non-existent-uid', 'pig-warrior')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('ไม่พบบัญชีผู้เล่น')
      }
    })
  })

  describe('Anti-Reskin Validation - Done-criterion #3', () => {
    test('ทุกตัวละครใน ROSTER ต้องมีบทบาท (role) ที่ไม่ซ้ำกันตามกฎ §4.1', () => {
      const roles = ROSTER.map((character) => character.role)
      const uniqueRoles = new Set(roles)

      // ตรวจสอบว่าจำนวนบทบาททั้งหมด เท่ากับจำนวนบทบาทที่ไม่ซ้ำกัน
      expect(roles.length).toBe(uniqueRoles.size)
    })
  })

  describe('Local vs Supabase Shape Parity - Done-criterion #4', () => {
    test('โครงสร้างตัวละครเริ่มต้นฝั่ง local และ supabase mapping ต้องเหมือนกันทุกคีย์และชนิดข้อมูล', () => {
      const date = new Date().toISOString()
      const localChar = createInitialOwnedCharacterProgress('pig-warrior', date)
      const mappedChar = mapOwnedCharacterRow({
        character_id: 'pig-warrior',
        level: 1,
        exp: 0,
        exp_to_next: 500,
        obtained_at: date,
      })

      // เทียบเอาคีย์หลักทั้งหมด (ยกเว้น progressionVersion ที่ฝั่ง Supabase จะเติมตอนผ่าน migrateOwnedCharacters เสมอ)
      const localKeys = Object.keys(localChar)
        .filter((k) => k !== 'progressionVersion')
        .toSorted()
      const mappedKeys = Object.keys(mappedChar)
        .filter((k) => k !== 'progressionVersion')
        .toSorted()

      expect(localKeys).toEqual(mappedKeys)

      // เทียบ type/โครงสร้างของ nested properties
      expect(typeof localChar.level).toBe(typeof mappedChar.level)
      expect(typeof localChar.exp).toBe(typeof mappedChar.exp)
      expect(typeof localChar.expToNext).toBe(typeof mappedChar.expToNext)
      expect(typeof localChar.obtainedAt).toBe(typeof mappedChar.obtainedAt)

      expect(Object.keys(localChar.skillLevels).toSorted()).toEqual(
        Object.keys(mappedChar.skillLevels).toSorted(),
      )
      expect(localChar.talentState).toEqual(mappedChar.talentState)
      expect(localChar.awakeningState).toEqual(mappedChar.awakeningState)
    })
  })

  describe('Single Write Path Validation - Done-criterion #5', () => {
    test('ต้องไม่มีการดัดแปลงหรือเขียนข้อมูลลง ownedCharacters ตรงๆ นอกเหนือจากฟังก์ชัน grantCharacter', () => {
      const srcDir = path.resolve(__dirname, '..')
      const sourceFiles = scanDirectory(srcDir)
      const violations: string[] = []

      // มองหาโค้ดที่แอบ push หรือ reassign ownedCharacters
      // เช่น .ownedCharacters.push( หรือ .ownedCharacters =
      const mutationRegex = /\.ownedCharacters\s*=\s*|\.ownedCharacters\.push\s*\(/

      sourceFiles.forEach((file) => {
        const content = fs.readFileSync(file, 'utf8')
        if (mutationRegex.test(content)) {
          violations.push(path.relative(srcDir, file))
        }
      })

      expect(violations).toEqual([])
    })
  })
})

function scanDirectory(dir: string): string[] {
  let files: string[] = []
  const list = fs.readdirSync(dir)
  list.forEach((file) => {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) {
      if (
        file !== 'node_modules' &&
        file !== '.git' &&
        file !== 'dist' &&
        file !== '.gemini' &&
        file !== '.cursor' &&
        file !== '.claude'
      ) {
        files = files.concat(scanDirectory(filePath))
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      // ไม่สแกนไฟล์ทดสอบ, ไฟล์ตั้งค่า, หรือไฟล์ที่เป็น write-path หลัก
      const isTest =
        file.endsWith('.test.ts') || file.endsWith('.test.tsx') || file.includes('.fuzz.')
      const isRepo = file === 'accountRepository.ts' || file === 'accountRepository.supabase.ts'
      const isMigration = file === 'progressionMigration.ts'
      if (!isTest && !isRepo && !isMigration) {
        files.push(filePath)
      }
    }
  })
  return files
}
