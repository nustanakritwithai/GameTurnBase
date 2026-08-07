import { isActiveWindow } from './attacks'
import { createWaveEnemies, type RealtimeBattleState } from './createRealtimeBattle'
import { combatFacingFromVector } from './combatFacing'
import { GET_UP_ANIMATION_MS, GET_UP_INVULNERABLE_MS } from './combatBaselines'
import { applyDamage, type RandomFn } from './DamageSystem'
import { createEnemyBrain, stepEnemyAI, type EnemyBrain } from './EnemyAISystem'
import { findHitTargets } from './HitboxSystem'
import { clampToArena, resolveCircleOverlap, stepMovement } from './MovementSystem'
import {
  applyHitStop,
  cancelCombo,
  createComboState,
  isAttacking,
  pressAttack,
  stepCombo,
  type ComboState,
} from './ComboSystem'
import { getSkillFromKit, getRealtimeSkillKit, type SkillSlot } from './skills'
import {
  canStartSkill,
  createSkillState,
  isCastingSkill,
  startSkill,
  stepSkill,
  type SkillState,
} from './SkillSystem'
import type {
  BattleEffectEvent,
  DamageEvent,
  RealtimeBattleEntity,
  RealtimeBattleSnapshot,
  Vec2,
} from './types'
import { addUltimateGauge, ULTIMATE_GAUGE_CONFIG } from './ultimateGauge'

/**
 * หัวใจของห้องต่อสู้ real-time — ถือสถานะทั้งหมดไว้ "นอก React state"
 *
 * ทำไมต้องนอก React: สเปกข้อ 8 ห้ามอัปเดตตำแหน่งตัวละครผ่าน setState ทุกเฟรม
 * (60 ครั้งต่อวินาที × ทุกหน่วย = re-render ถล่มทลาย) React จึงได้เห็นเฉพาะ snapshot
 * ที่ publish เป็นช่วง ๆ สำหรับ HUD ส่วนตำแหน่งที่ต้องลื่นทุกเฟรม ให้ชั้นวาดอ่าน
 * entity ตรงจาก runtime ผ่าน ref แทน (ดู BattleArena.tsx)
 *
 * ตัวคลาสนี้ไม่รู้จัก React, ไม่รู้จัก DOM และไม่เรียก requestAnimationFrame เอง —
 * ตัวขับเวลาอยู่ที่ RealtimeBattleLoop.ts ทำให้เทสต์เรียก step() ตรง ๆ ได้แบบ deterministic
 */

/** ระยะเวลาฉากเปิดก่อนเริ่มควบคุมได้จริง */
const INTRO_MS = 700

/** ความถี่ในการ publish snapshot ให้ React (HUD ไม่ต้องการ 60 Hz) */
const PUBLISH_INTERVAL_MS = 100

/** อายุของ event ที่ค้างไว้ให้ชั้นวาดหยิบไปใช้ก่อนถูกทิ้ง */
const EVENT_TTL_MS = 900

type Listener = () => void

export class RealtimeBattleRuntime {
  private state: RealtimeBattleState
  private listeners = new Set<Listener>()
  private damageEvents: DamageEvent[] = []
  private effectEvents: BattleEffectEvent[] = []
  private publishTimerMs = 0
  private snapshot: RealtimeBattleSnapshot
  private disposed = false
  /** เวกเตอร์เดินล่าสุดจากผู้เล่น — ป้อนเข้ามาจากชั้น React ทุกเฟรม */
  private moveInput: Vec2 = { x: 0, y: 0 }
  /**
   * สมองของศัตรูแยกตาม id
   *
   * ไม่เก็บไว้ใน entity เพราะ entity เป็นข้อมูลกลางที่ทั้งผู้เล่นและศัตรูใช้ร่วมกัน
   * และมันถูกคัดลอกลง snapshot ทุกครั้งที่ publish — สถานะ AI ไม่ควรไหลไปถึง React
   */
  private brains = new Map<string, EnemyBrain>()
  /** สถานะคอมโบของผู้เล่น */
  private playerCombat: ComboState = createComboState()
  /** สถานะสกิลของผู้เล่น */
  private playerSkill: SkillState = createSkillState()
  private attackRequested = false
  private skillSlotRequested: SkillSlot | null = null
  /** ตัวสุ่มที่ระบบดาเมจใช้ — เทสต์ป้อนค่าคงที่เข้ามาแทนได้ */
  private random: RandomFn
  private eventCounter = 0

  constructor(state: RealtimeBattleState, random: RandomFn = Math.random) {
    this.state = state
    this.random = random
    this.snapshot = this.buildSnapshot()
  }

  /** เดินเวลาจำลองไปข้างหน้าหนึ่งก้าวคงที่ — เรียกจาก RealtimeBattleLoop หรือจากเทสต์ */
  step(deltaMs: number): void {
    if (this.disposed) return
    const state = this.state
    if (state.status === 'exiting') return

    state.elapsedMs += deltaMs

    if (state.status === 'intro') {
      if (state.elapsedMs >= INTRO_MS) {
        state.status = 'running'
        this.publish()
      }
      return
    }

    if (state.status !== 'running') return

    this.tickTimers(state.player, deltaMs)
    for (const enemy of state.enemies) this.tickTimers(enemy, deltaMs)

    const castingSkill = isCastingSkill(this.playerSkill)

    if (this.skillSlotRequested) {
      const slot = this.skillSlotRequested
      this.skillSlotRequested = null
      this.tryStartPlayerSkill(slot)
    }

    this.stepPlayerSkill(deltaMs)

    if (!castingSkill && !isCastingSkill(this.playerSkill)) {
      this.stepPlayerAttack(deltaMs)

      const moved = isAttacking(this.playerCombat)
        ? false
        : stepMovement(state.player, this.moveInput, deltaMs, {
            stage: state.stage,
            blockers: state.enemies,
          })

      // สถานะเดิน/ยืน คุมจากผลของระบบเดินจุดเดียว ไม่ให้ component เดาเอง
      if (state.player.state === 'idle' && moved) state.player.state = 'walk'
      else if (state.player.state === 'walk' && !moved) state.player.state = 'idle'
    }

    this.stepEnemies(deltaMs)
    this.separateEnemies()
    this.checkBattleEnd()

    this.pruneEvents()

    this.publishTimerMs += deltaMs
    if (this.publishTimerMs >= PUBLISH_INTERVAL_MS) {
      this.publishTimerMs = 0
      this.publish()
    }
  }

  /**
   * เดินท่าโจมตีของผู้เล่น แล้วลงดาเมจถ้าอยู่ใน active frame
   *
   * คำสั่งโจมตีถูกเก็บเป็นธงไว้ก่อน (`attackRequested`) แล้วค่อยหยิบใช้ในเฟรมจำลอง
   * ไม่ลงมือทันทีตอนกดปุ่ม — เพราะการกดปุ่มเกิดใน event ของเบราว์เซอร์ซึ่งไม่ตรงกับ
   * จังหวะ fixed-step ถ้าลงมือทันทีผลจะต่างกันไปตามเฟรมเรตของแต่ละเครื่อง
   */
  private stepPlayerAttack(deltaMs: number): void {
    const state = this.state

    if (this.attackRequested) {
      this.attackRequested = false
      state.player.combatFacing = combatFacingFromVector(this.moveInput, state.player.combatFacing)
      pressAttack(state.player, this.playerCombat)
    }

    const tick = stepCombo(state.player, this.playerCombat, deltaMs)
    if (!tick.hitboxActive || !tick.attack) return

    const targets = findHitTargets(state.enemies, {
      attacker: state.player,
      attack: tick.attack,
      alreadyHit: this.playerCombat.hitTargets,
      elapsedMs: state.elapsedMs,
    })

    for (const target of targets) {
      this.playerCombat.hitTargets.add(target.id)
      const outcome = applyDamage({
        attacker: state.player,
        target,
        attack: tick.attack,
        elapsedMs: state.elapsedMs,
        random: this.random,
      })

      state.damageDealt += outcome.amount
      // การกระเด็นดันเป้าหมายออกไปได้ไกล ต้องดึงกลับเข้าห้องเสมอ
      target.position = clampToArena(target.position, target.collisionRadius, state.stage)

      if (outcome.defeated && !state.defeatedEnemyIds.includes(target.id)) {
        state.defeatedEnemyIds.push(target.id)
      }

      this.pushDamageEvent(target, outcome.amount, outcome.critical)
      this.grantUltimateGaugeOnHit(outcome.defeated, 'basic')
      this.publish()
    }

    // หมัดเข้าเป้าแล้วหยุดเวลาแวบหนึ่ง ให้รู้สึกถึงน้ำหนักของการปะทะ (§14)
    if (targets.length > 0) applyHitStop(this.playerCombat)
  }

  private grantUltimateGaugeOnHit(defeated: boolean, source: 'basic' | 'skill'): void {
    const player = this.state.player
    const gain =
      source === 'basic'
        ? ULTIMATE_GAUGE_CONFIG.gainOnBasicHit
        : ULTIMATE_GAUGE_CONFIG.gainOnSkillHit
    player.ultimateGauge = addUltimateGauge(player.ultimateGauge, gain)
    if (defeated) {
      player.ultimateGauge = addUltimateGauge(
        player.ultimateGauge,
        ULTIMATE_GAUGE_CONFIG.gainOnKill,
      )
    }
  }

  private tryStartPlayerSkill(slot: SkillSlot): void {
    const state = this.state
    const kit = getRealtimeSkillKit(state.player.characterId)
    if (!kit) return

    const definition = getSkillFromKit(kit, slot)

    if (
      !canStartSkill(state.player, this.playerSkill, definition, isAttacking(this.playerCombat))
    ) {
      return
    }

    cancelCombo(state.player, this.playerCombat)
    startSkill(state.player, this.playerSkill, definition, state.elapsedMs)
    this.pushEffectEvent('skill-spin', state.player.position, 700)
    this.publish()
  }

  /** เดินท่าสกิลของผู้เล่น แล้วลงดาเมจถ้าอยู่ใน active frame */
  private stepPlayerSkill(deltaMs: number): void {
    const state = this.state
    const tick = stepSkill(state.player, this.playerSkill, deltaMs)
    if (!tick.hitboxActive || !tick.attack) return

    const targets = findHitTargets(state.enemies, {
      attacker: state.player,
      attack: tick.attack,
      alreadyHit: this.playerSkill.hitTargets,
      elapsedMs: state.elapsedMs,
    })

    for (const target of targets) {
      this.playerSkill.hitTargets.add(target.id)
      const outcome = applyDamage({
        attacker: state.player,
        target,
        attack: tick.attack,
        elapsedMs: state.elapsedMs,
        random: this.random,
      })

      state.damageDealt += outcome.amount
      target.position = clampToArena(target.position, target.collisionRadius, state.stage)

      if (outcome.defeated && !state.defeatedEnemyIds.includes(target.id)) {
        state.defeatedEnemyIds.push(target.id)
      }

      this.pushDamageEvent(target, outcome.amount, outcome.critical)
      this.grantUltimateGaugeOnHit(outcome.defeated, 'skill')
      this.publish()
    }
  }

  private pushEffectEvent(
    kind: BattleEffectEvent['kind'],
    position: Vec2,
    durationMs: number,
  ): void {
    this.eventCounter += 1
    this.effectEvents = [
      ...this.effectEvents,
      {
        id: `fx-${this.eventCounter}`,
        kind,
        position: { ...position },
        createdAtMs: this.state.elapsedMs,
        durationMs,
      },
    ]
  }

  /** ศัตรูลงดาเมจใส่ผู้เล่นเมื่อท่าของมันเข้าสู่ active frame */
  private resolveEnemyAttack(enemy: RealtimeBattleEntity, brain: EnemyBrain): void {
    const state = this.state
    const attack = brain.currentAttack

    if (brain.state !== 'attack') {
      brain.hitTargets.clear()
      return
    }

    if (!isActiveWindow(attack, brain.stateElapsedMs)) return

    const targets = findHitTargets([state.player], {
      attacker: enemy,
      attack,
      alreadyHit: brain.hitTargets,
      elapsedMs: state.elapsedMs,
    })

    for (const target of targets) {
      brain.hitTargets.add(target.id)
      const outcome = applyDamage({
        attacker: enemy,
        target,
        attack,
        elapsedMs: state.elapsedMs,
        random: this.random,
      })

      state.damageTaken += outcome.amount
      target.position = clampToArena(target.position, target.collisionRadius, state.stage)
      this.pushDamageEvent(target, outcome.amount, outcome.critical)
      this.publish()
    }
  }

  private pushDamageEvent(target: RealtimeBattleEntity, amount: number, critical: boolean): void {
    this.eventCounter += 1
    this.damageEvents = [
      ...this.damageEvents,
      {
        id: `dmg-${this.eventCounter}`,
        targetId: target.id,
        amount,
        critical,
        position: { ...target.position },
        createdAtMs: this.state.elapsedMs,
      },
    ]
  }

  /** สั่งให้ผู้เล่นโจมตีในเฟรมจำลองถัดไป */
  requestAttack(): void {
    this.attackRequested = true
  }

  /** สั่งให้ผู้เล่นใช้สกิลช่องที่ระบุในเฟรมจำลองถัดไป */
  requestSkill(slot: SkillSlot): void {
    this.skillSlotRequested = slot
  }

  /**
   * เดินสมองศัตรูทุกตัว แล้วส่งทิศที่มันอยากไปให้ระบบเดินตัวเดียวกับผู้เล่น
   *
   * ศัตรูกันทางกันเองและกันผู้เล่นด้วย จึงใส่ทั้งกองเป็น blockers ยกเว้นตัวที่กำลังเดินอยู่
   * (stepMovement ข้ามตัวเองให้อยู่แล้วจาก id)
   */
  private stepEnemies(deltaMs: number): void {
    const state = this.state

    for (const enemy of state.enemies) {
      const brain = this.brainFor(enemy.id)
      const decision = stepEnemyAI(enemy, brain, state.player, deltaMs)
      this.resolveEnemyAttack(enemy, brain)

      if (decision.move.x === 0 && decision.move.y === 0) {
        enemy.velocity = { x: 0, y: 0 }
        continue
      }

      stepMovement(enemy, decision.move, deltaMs, {
        stage: state.stage,
        blockers: [state.player, ...state.enemies],
      })
    }
  }

  /**
   * ดันศัตรูที่ซ้อนกันให้แยกออก
   *
   * ทำแยกจากตอนเดิน เพราะศัตรูหลายตัวมุ่งหน้าจุดเดียวกัน (ตัวผู้เล่น) ทำให้ทุกตัวไปกอง
   * ทับกันเป็นตัวเดียวได้ ทั้งที่แต่ละตัวเดินถูกกฎ — สเปกข้อ 19 ห้ามอาการนี้ตรง ๆ
   */
  private separateEnemies(): void {
    const state = this.state
    const alive = state.enemies.filter((enemy) => enemy.state !== 'dead')

    for (let i = 0; i < alive.length; i += 1) {
      for (let j = i + 1; j < alive.length; j += 1) {
        const a = alive[i]
        const b = alive[j]
        // ดันเฉพาะตัวหลังออกจากตัวหน้า ทำให้ผลลัพธ์ไม่ขึ้นกับลำดับที่วนเจอ
        b.position = resolveCircleOverlap(
          b.position,
          b.collisionRadius,
          a.position,
          a.collisionRadius,
        )
      }
    }
  }

  /**
   * เช็คว่าจบการต่อสู้หรือยัง — ต้องเรียกทุกเฟรมหลังลงดาเมจ ไม่ใช่แค่ตอน publish
   *
   * ผู้เล่นตาย = แพ้ทันที ไม่ต้องรอศัตรู
   * ศัตรูตายหมดในคลื่นปัจจุบัน + มีคลื่นถัดไป = สร้างศัตรูคลื่นใหม่ต่อ (ask-CB retroactive
   * audit, 2026-08-06: เจอว่า currentWaveIndex ไม่เคยขยับเลย ตอนแรก merge มามีแต่คลื่นเดียว
   * ใช้งานจริง แต่ trial-02 นิยามไว้ 2 คลื่นแล้วไม่มีทางไปถึงคลื่นที่สอง)
   * ศัตรูตายหมด + ไม่มีคลื่นถัดไปแล้ว = ชนะ
   *
   * ก่อนแก้ไฟล์นี้ status ไม่เคยกลายเป็น 'victory'/'defeat' เลยสักที่ในทั้งระบบ —
   * การต่อสู้จบเองไม่ได้ ค้างวนไปเรื่อย ๆ (เจอจาก ask-CB retroactive audit ของระบบทั้งชุด
   * ที่ cherry-pick มาจาก fork โดยไม่ผ่าน ask-CB ก่อน)
   */
  private checkBattleEnd(): void {
    const state = this.state
    if (state.status !== 'running') return

    if (state.player.state === 'dead') {
      state.status = 'defeat'
      this.publish()
      return
    }

    /*
      รายการว่างต้องไหลต่อไปหาคลื่นถัดไป ไม่ใช่ return ทิ้ง

      createWaveEnemies ข้ามศัตรูที่หา template หรือจุดเกิดไม่เจอแบบเงียบ ๆ (ดู codes.ts)
      ถ้าทั้งคลื่นข้ามหมดจะได้รายการว่าง แล้วเงื่อนไขเดิมทำให้ที่นี่ return ทุกเฟรมตลอดไป
      ห้องนั้นจึงชนะไม่ได้ แพ้ก็ไม่ได้ ค้างอยู่อย่างนั้นโดยไม่มีข้อผิดพลาดใด ๆ ขึ้นมาบอก
      (every() บนรายการว่างคืน true อยู่แล้ว จึงตกไปเข้าตรรกะขึ้นคลื่นถัดไปได้ตามปกติ)
    */
    if (!state.enemies.every((enemy) => enemy.state === 'dead')) return

    const nextWaveIndex = state.currentWaveIndex + 1
    const nextWaveEnemies = createWaveEnemies(state.stage, nextWaveIndex)
    if (nextWaveEnemies.length > 0) {
      state.currentWaveIndex = nextWaveIndex
      state.enemies = [...state.enemies, ...nextWaveEnemies]
      this.publish()
      return
    }

    state.status = 'victory'
    this.publish()
  }

  private brainFor(enemyId: string): EnemyBrain {
    let brain = this.brains.get(enemyId)
    if (!brain) {
      brain = createEnemyBrain()
      this.brains.set(enemyId, brain)
    }
    return brain
  }

  /** นับถอยหลังคูลดาวน์และสถานะที่อิงเวลาของหน่วยหนึ่งตัว */
  private tickTimers(entity: RealtimeBattleEntity, deltaMs: number): void {
    if (entity.state === 'dead') return
    entity.attackCooldownRemainingMs = Math.max(0, entity.attackCooldownRemainingMs - deltaMs)
    entity.skillCooldownsMs.skill1 = Math.max(0, entity.skillCooldownsMs.skill1 - deltaMs)
    entity.skillCooldownsMs.skill2 = Math.max(0, entity.skillCooldownsMs.skill2 - deltaMs)
    entity.skillCooldownsMs.skill3 = Math.max(0, entity.skillCooldownsMs.skill3 - deltaMs)
    entity.hitStunRemainingMs = Math.max(0, entity.hitStunRemainingMs - deltaMs)

    if (entity.knockdownRemainingMs > 0) {
      entity.knockdownRemainingMs = Math.max(0, entity.knockdownRemainingMs - deltaMs)
      if (entity.knockdownRemainingMs <= 0) {
        entity.state = 'getUp'
        entity.getUpRemainingMs = GET_UP_ANIMATION_MS
        entity.invulnerableUntilMs = this.state.elapsedMs + GET_UP_INVULNERABLE_MS
      }
      return
    }

    if (entity.getUpRemainingMs > 0) {
      entity.getUpRemainingMs = Math.max(0, entity.getUpRemainingMs - deltaMs)
      if (entity.getUpRemainingMs <= 0) {
        entity.state = 'idle'
      }
    }
  }

  private pruneEvents(): void {
    const cutoff = this.state.elapsedMs - EVENT_TTL_MS
    if (this.damageEvents.length > 0 && this.damageEvents[0].createdAtMs < cutoff) {
      this.damageEvents = this.damageEvents.filter((event) => event.createdAtMs >= cutoff)
    }
    if (this.effectEvents.length > 0 && this.effectEvents[0].createdAtMs < cutoff) {
      this.effectEvents = this.effectEvents.filter((event) => event.createdAtMs >= cutoff)
    }
  }

  /**
   * ป้อนเวกเตอร์เดินของผู้เล่น
   *
   * แยกจาก InputSystem โดยตั้งใจ: runtime ไม่ควรรู้ว่าอินพุตมาจากคีย์บอร์ด จอยสติก
   * หรือเทสต์ที่ป้อนค่าตรง ๆ — มันรู้แค่ "ตอนนี้ผู้เล่นอยากเดินไปทางไหน"
   */
  setMoveInput(vector: Vec2): void {
    this.moveInput = vector
  }

  /**
   * ขอออกจากห้องต่อสู้ — หยุดจำลองทันที ไม่ให้ระบบใดเดินต่อ
   *
   * ถ้าผลการต่อสู้ตัดสินแล้ว ('victory'/'defeat') ห้ามทับด้วย 'exiting' — ปุ่มออกยังกดได้
   * อยู่ระหว่างเฟรมที่ onComplete (useRealtimeBattle) กำลังจะยิง ถ้าทับสถานะตอนนั้น
   * โค้ดปลายทางที่อ่าน getState().status ซ้ำ (ไม่ใช่แค่ค่าที่ onComplete ส่งไปตอนแรก)
   * จะเห็น 'exiting' แทนผลจริง
   */
  requestExit(): void {
    if (
      this.state.status === 'exiting' ||
      this.state.status === 'victory' ||
      this.state.status === 'defeat'
    ) {
      return
    }
    this.state.status = 'exiting'
    this.publish()
  }

  /** อ่านสถานะภายในตรง ๆ สำหรับชั้นวาดที่ต้องอัปเดตทุกเฟรมผ่าน ref (ห้ามแก้ค่า) */
  getState(): Readonly<RealtimeBattleState> {
    return this.state
  }

  getSnapshot = (): RealtimeBattleSnapshot => this.snapshot

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** สร้าง snapshot ใหม่แล้วแจ้ง React — เรียกเมื่อมีอะไรที่ HUD ต้องเห็นเปลี่ยนไป */
  publish(): void {
    if (this.disposed) return
    this.snapshot = this.buildSnapshot()
    for (const listener of this.listeners) listener()
  }

  private buildSnapshot(): RealtimeBattleSnapshot {
    const state = this.state
    return {
      stageId: state.stage.id,
      stageName: state.stage.name,
      status: state.status,
      elapsedMs: state.elapsedMs,
      player: {
        ...state.player,
        position: { ...state.player.position },
        velocity: { ...state.player.velocity },
        skillCooldownsMs: { ...state.player.skillCooldownsMs },
      },
      enemies: state.enemies.map((enemy) => ({
        ...enemy,
        position: { ...enemy.position },
        velocity: { ...enemy.velocity },
      })),
      currentWave: state.currentWaveIndex + 1,
      totalWaves: state.stage.waves.length,
      damageEvents: this.damageEvents,
      effectEvents: this.effectEvents,
    }
  }

  dispose(): void {
    this.disposed = true
    this.listeners.clear()
    this.brains.clear()
    this.damageEvents = []
    this.effectEvents = []
  }
}
