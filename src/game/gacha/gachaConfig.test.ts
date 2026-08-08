import { describe, expect, it } from 'vitest'
import { ROSTER } from '../characters'
import { GACHA_BANNERS, validateGachaConfig } from './gachaConfig'

describe('gachaConfig', () => {
  it('validateGachaConfig ผ่านสำหรับ banner ที่มีอยู่', () => {
    expect(validateGachaConfig()).toEqual([])
  })

  it('ทุก pool entry อยู่ใน ROSTER', () => {
    const rosterIds = new Set(ROSTER.map((hero) => hero.id))
    for (const banner of Object.values(GACHA_BANNERS)) {
      for (const entry of banner.pool) {
        expect(rosterIds.has(entry.characterId)).toBe(true)
      }
    }
  })
})
