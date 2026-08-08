import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  COMBAT_BUTTON_SIZES,
  DEFAULT_COMBAT_UI_LAYOUT,
  MIN_BUTTON_GAP_PX,
  layoutCssVars,
  resolveCombatClusterMetrics,
} from './combatUILayout'

describe('combatUILayout Blueprint §3.3 row cluster', () => {
  it('uses rendered touch-target sizes in the layout geometry', () => {
    const metrics = resolveCombatClusterMetrics()

    expect(metrics.attackSize).toBeGreaterThan(metrics.skillSize)
    expect(metrics.skillSize).toBeGreaterThanOrEqual(COMBAT_BUTTON_SIZES.minTouchTarget)
    expect(metrics.ultimateSize).toBeGreaterThanOrEqual(COMBAT_BUTTON_SIZES.minTouchTarget)
    expect(metrics.gap).toBeGreaterThanOrEqual(MIN_BUTTON_GAP_PX)
  })

  it('fits exactly four skill buttons in one row above Attack', () => {
    const metrics = resolveCombatClusterMetrics()
    const expectedWidth = metrics.skillSize * 3 + metrics.ultimateSize + metrics.gap * 3
    const expectedHeight =
      Math.max(metrics.skillSize, metrics.ultimateSize) + metrics.gap + metrics.attackSize

    expect(metrics.width).toBeCloseTo(expectedWidth, 8)
    expect(metrics.height).toBeCloseTo(expectedHeight, 8)
  })

  it('emits row geometry and no legacy polar offsets', () => {
    const vars = layoutCssVars()

    expect(vars['--combat-cluster-width']).toMatch(/px$/)
    expect(vars['--combat-cluster-height']).toMatch(/px$/)
    expect(vars['--combat-cluster-gap']).toMatch(/px$/)
    expect(Object.keys(vars).some((key) => key.includes('polar'))).toBe(false)
  })

  it('keeps the rendered stylesheet on row layout instead of polar positioning', () => {
    const cssPath = resolve(process.cwd(), 'src/components/BattleScene/BattleScene.module.css')
    const css = readFileSync(cssPath, 'utf8')

    expect(css).toContain('.combatSkillsRow')
    expect(css).toContain('.combatAttackRow')
    expect(css).not.toContain('--combat-polar-')
    expect(css).not.toContain('.combatSlotS1')
  })

  it('keeps the joystick clear of the bottom edge on short landscape screens', () => {
    expect(DEFAULT_COMBAT_UI_LAYOUT.joystickAnchorYPercent).toBeLessThanOrEqual(76)
  })
})
