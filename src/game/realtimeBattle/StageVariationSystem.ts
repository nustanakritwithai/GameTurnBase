import { createWaveEnemies, type RealtimeBattleState } from './createRealtimeBattle'

/**
 * ตัดสินผลแพ้ชนะของด่านแยกตาม stageType (§17 Stage Variation System, §5.2)
 *
 * นี่คือจุดเดียวในทั้งระบบที่ branch ต่อ stageType — RealtimeBattleRuntime.checkBattleEnd()
 * แค่เรียก resolveStageOutcome() เฉย ๆ ไม่รู้จัก stageType เลย (stageConfig.ts §9: ห้าม
 * hard-code ข้อมูล/ตรรกะด่านไว้ใน Component)
 *
 * null = ยังไม่จบ ต่อสู้ต่อไป — ฟังก์ชันพวกนี้ mutate state ได้ตรง ๆ (เช่น สร้างคลื่นถัดไป
 * ลด hazardHp) ตามสไตล์เดิมของ RealtimeBattleRuntime ที่ตั้งใจเป็น stateful ไม่ใช่ pure
 * (ต่างจาก RewardSystem.ts ที่ตั้งใจ pure) — "no RNG, deterministic" ยังคงจริงเสมอ
 */
export type StageOutcome = 'victory' | 'defeat' | null

/**
 * เคลียร์ทุกคลื่นในด่าน — ตรรกะดั้งเดิมของ stageType 'wave' ย้ายมาจาก
 * RealtimeBattleRuntime.checkBattleEnd() ตรง ๆ (พฤติกรรมเดิมทุกจุด)
 *
 * ใช้ร่วมกับ defend/time-attack (เคลียร์คลื่นได้ = ชนะ เว้นแต่มีเงื่อนไขแพ้เพิ่ม)
 * และ mini-boss/custom (ยืมตรงตัว — ดูฟังก์ชันด้านล่าง)
 */
function resolveWaveOutcome(state: RealtimeBattleState): StageOutcome {
  if (!state.enemies.every((enemy) => enemy.state === 'dead')) return null

  const nextWaveIndex = state.currentWaveIndex + 1
  const nextWaveEnemies = createWaveEnemies(state.stage, nextWaveIndex)
  if (nextWaveEnemies.length > 0) {
    state.currentWaveIndex = nextWaveIndex
    state.enemies = [...state.enemies, ...nextWaveEnemies]
    return null
  }

  return 'victory'
}

/** รอดให้ครบเวลา — ไม่ต้องฆ่าศัตรูให้หมด */
function resolveSurvivalOutcome(state: RealtimeBattleState): StageOutcome {
  const params = state.stage.survival
  if (!params) return null
  return state.elapsedMs >= params.durationMs ? 'victory' : null
}

/** เคลียร์ทุกคลื่นเหมือน wave แต่แพ้ทันทีถ้า objectiveHp หมดก่อน */
function tickDefendObjective(state: RealtimeBattleState, deltaMs: number): void {
  if (state.objectiveHp === null) return
  const alive = state.enemies.filter((enemy) => enemy.state !== 'dead').length
  if (alive <= 0) return
  state.objectiveHp = Math.max(0, state.objectiveHp - alive * 0.05 * (deltaMs / 100))
}

/** เคลียร์ทุกคลื่นเหมือน wave แต่แพ้ทันทีถ้า objectiveHp หมดก่อน */
function resolveDefendOutcome(state: RealtimeBattleState, deltaMs: number): StageOutcome {
  tickDefendObjective(state, deltaMs)
  if (state.objectiveHp !== null && state.objectiveHp <= 0) return 'defeat'
  return resolveWaveOutcome(state)
}

/** เคลียร์ทุกคลื่นเหมือน wave แต่แพ้ทันทีถ้าเวลาเกินงบก่อนเคลียร์เสร็จ */
function resolveTimeAttackOutcome(state: RealtimeBattleState): StageOutcome {
  const params = state.stage.timeAttack
  if (params && state.elapsedMs > params.timeBudgetMs) return 'defeat'
  return resolveWaveOutcome(state)
}

/**
 * mini-boss = เคลียร์ศัตรู Elite-tier ตัวเดียว — กลไกแพ้ชนะเหมือน wave ทุกอย่าง
 * (§3.8.4: "ไม่มี kit พิเศษ ไม่มี phase-transition") ยืม resolveWaveOutcome ตรง ๆ
 * ไม่สร้างตรรกะใหม่ซ้ำ
 */
const resolveMiniBossOutcome = resolveWaveOutcome

/** ไปให้ถึงตำแหน่งเป้าหมายก่อนเวลาหมด */
function resolveChaseOutcome(state: RealtimeBattleState): StageOutcome {
  const params = state.stage.chase
  if (!params) return null
  if (state.elapsedMs > params.timeBudgetMs) return 'defeat'

  const dx = state.player.position.x - params.targetPosition.x
  const dy = state.player.position.y - params.targetPosition.y
  return Math.hypot(dx, dy) <= params.arrivalRadius ? 'victory' : null
}

/**
 * hazardHp ไหลลงตามเวลาจริง (deltaMs) ไม่ใช่ต่อเฟรม — เรียกด้วยก้อนเวลาขนาดไหนก็ได้ผลรวม
 * เท่ากัน (กัน desync ตาม Known-scars "Test-for-us" ของสเปกนี้: ค่าต้องไม่เพี้ยนไปตามว่า
 * step มาเป็นก้อนใหญ่ก้อนเดียวหรือหลายก้อนเล็ก) เคลียร์ทุกคลื่นได้ก่อน hazardHp หมด = ชนะ
 */
function resolveHazardOutcome(state: RealtimeBattleState, deltaMs: number): StageOutcome {
  const params = state.stage.hazard
  if (!params || state.hazardHp === null) return null

  state.hazardHp = Math.max(0, state.hazardHp - (params.decayPerSecond * deltaMs) / 1000)
  if (state.hazardHp <= 0) return 'defeat'

  return resolveWaveOutcome(state)
}

/**
 * custom: §5.2 เปิดเป็นชนิดปลายเปิดไว้เฉย ๆ ยังไม่มีด่านจริงสักด่าน — สร้างระบบ predicate
 * ให้สคริปต์เองตอนนี้เป็น premature abstraction (ยังไม่มีของจริงมาพิสูจน์ shape ที่ต้องการ)
 * ตกไปใช้ตรรกะเคลียร์คลื่นแทนไปก่อน อย่างน้อย status ก็จบได้เสมอ ไม่ค้าง
 */
const resolveCustomOutcome = resolveWaveOutcome

/** จุดเข้าเดียวที่ RealtimeBattleRuntime เรียก — ไม่รู้จัก stageType เจาะจงเลยสักตัว */
export function resolveStageOutcome(state: RealtimeBattleState, deltaMs: number): StageOutcome {
  switch (state.stage.stageType) {
    case 'wave':
      return resolveWaveOutcome(state)
    case 'survival':
      return resolveSurvivalOutcome(state)
    case 'defend':
      return resolveDefendOutcome(state, deltaMs)
    case 'time-attack':
      return resolveTimeAttackOutcome(state)
    case 'mini-boss':
      return resolveMiniBossOutcome(state)
    case 'chase':
      return resolveChaseOutcome(state)
    case 'hazard':
      return resolveHazardOutcome(state, deltaMs)
    case 'custom':
      return resolveCustomOutcome(state)
  }
}
