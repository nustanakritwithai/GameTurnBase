import { ENEMY_ATTACK_MELEE } from './attacks'
import { applyCombatReaction, tickKnockdownState } from './combatReaction'
import { createWaveEnemies, type RealtimeBattleState } from './createRealtimeBattle'
import { resolveStageOutcome } from './StageVariationSystem'
import { combatFacingFromVector } from './combatFacing'
import type { RandomFn } from './DamageSystem'
import {
  createEnemyBrain,
  getEnemySelectedAttack,
  isEnemyAttackDamageWindow,
  isEnemyTelegraphing,
  stepEnemyAI,
  type EnemyBrain,
} from './EnemyAISystem'
import { findHitTargets } from './HitboxSystem'
import { clampToArena, resolveCircleOverlap, stepMovement } from './MovementSystem'
import { assistCombatFacing, findNearestLivingEnemy, resolveLockedTarget } from './softTarget'
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
  /** When false, Stage Runtime owns wave advance and victory (P5 dungeon orchestration). */
  private autoWaveAdvance = true
  private externalVictoryBlocked = false

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
    this.checkBattleEnd(deltaMs)

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
      assistCombatFacing(state.player, state.enemies)
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
      const outcome = applyCombatReaction({
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

    let lockedTargetId: string | null = null
    if (definition.targetLock === 'nearest') {
      const nearest = findNearestLivingEnemy(state.player.position, state.enemies)
      lockedTargetId = nearest?.id ?? null
      if (nearest) {
        state.player.combatFacing = nearest.position.x >= state.player.position.x ? 'right' : 'left'
      }
    }

    startSkill(state.player, this.playerSkill, definition, state.elapsedMs, lockedTargetId)
    this.pushEffectEvent('skill-spin', state.player.position, 700)
    this.publish()
  }

  /** เดินท่าสกิลของผู้เล่น แล้วลงดาเมจถ้าอยู่ใน active frame */
  private stepPlayerSkill(deltaMs: number): void {
    const state = this.state
    const tick = stepSkill(state.player, this.playerSkill, deltaMs)
    if (!tick.hitboxActive || !tick.attack) return

    let candidateTargets = state.enemies
    const locked = resolveLockedTarget(this.playerSkill.lockedTargetId, state.enemies)
    if (locked) candidateTargets = [locked]

    const alreadyHit =
      tick.strikeIndex >= 0 ? this.playerSkill.strikeHits : this.playerSkill.hitTargets

    const targets = findHitTargets(candidateTargets, {
      attacker: state.player,
      attack: tick.attack,
      alreadyHit,
      elapsedMs: state.elapsedMs,
      lockedTargetId: this.playerSkill.lockedTargetId ?? undefined,
    })

    for (const target of targets) {
      if (tick.strikeIndex >= 0) {
        const strikeKey = `${target.id}:${tick.strikeIndex}`
        if (this.playerSkill.strikeHits.has(strikeKey)) continue
        this.playerSkill.strikeHits.add(strikeKey)
      } else {
        this.playerSkill.hitTargets.add(target.id)
      }

      const outcome = applyCombatReaction({
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

  /**
   * ศัตรูลงดาเมจใส่ผู้เล่นเมื่อท่าของมันเข้าสู่ active frame
   *
   * บอส (brain.selectedAttack ไม่ null) ใช้ท่าที่ล็อกไว้ตอน Telegraph แทน ENEMY_ATTACK ทั่วไป
   * นี่คือ "attack-set swap ตามเฟส" (#11) ที่ใช้งานจริง — พูลถูกเลือกใน EnemyAISystem แล้ว
   * ที่นี่แค่หยิบท่าที่เลือกไว้มาลงดาเมจ ไม่ตัดสินใจเลือกเองอีกชั้น
   */
  private resolveEnemyAttack(enemy: RealtimeBattleEntity, brain: EnemyBrain): void {
    const state = this.state
    const attack = getEnemySelectedAttack(brain) ?? ENEMY_ATTACK_MELEE

    if (brain.state === 'telegraph' || !isEnemyAttackDamageWindow(brain)) {
      if (brain.state !== 'attack' && brain.state !== 'telegraph') {
        brain.hitTargets.clear()
      }
      return
    }

    const targets = findHitTargets([state.player], {
      attacker: enemy,
      attack,
      alreadyHit: brain.hitTargets,
      elapsedMs: state.elapsedMs,
    })

    for (const target of targets) {
      brain.hitTargets.add(target.id)
      const outcome = applyCombatReaction({
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
      const decision = stepEnemyAI(enemy, brain, state.player, deltaMs, state.elapsedMs)
      if (decision.telegraph) {
        // ground marker ต้องยิงก่อน AttackActive เสมอ (§3.6.8 telegraph feedback layer)
        this.pushEffectEvent(
          'ground-marker',
          decision.telegraph.position,
          decision.telegraph.durationMs,
        )
      }
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
   * ผู้เล่นตาย = แพ้ทันที ไม่ต้องรอศัตรู — กฎนี้เหมือนกันทุก stageType จึงอยู่ตรงนี้ตรง ๆ
   * ไม่ใช่ branch ต่อประเภทด่าน ส่วนเงื่อนไขแพ้ชนะที่ต่างกันไปตาม stageType ทั้งหมด (รวมตรรกะ
   * เคลียร์คลื่น/สร้างคลื่นถัดไปของ 'wave' เดิม) ย้ายไป resolveStageOutcome() ใน
   * StageVariationSystem.ts แล้ว — ที่นี่ไม่รู้จัก stageType เลยสักตัว (§17, §9)
   *
   * ก่อนแก้ไฟล์นี้ (ask-CB retroactive audit, 2026-08-06) status ไม่เคยกลายเป็น
   * 'victory'/'defeat' เลยสักที่ในทั้งระบบ — การต่อสู้จบเองไม่ได้ ค้างวนไปเรื่อย ๆ
   */
  private checkBattleEnd(deltaMs: number = 0): void {
    const state = this.state
    if (state.status !== 'running') return

    if (state.player.state === 'dead') {
      state.status = 'defeat'
      this.publish()
      return
    }

    // P5 dungeon orchestrator (Stage Runtime) ตัดสินแพ้ชนะเองผ่านสคีมาของตัวเอง
    // (dungeonConfig.ts/dungeonOrchestrator.ts) — ปิดเส้นทาง auto-wave-clear ปกติทิ้งไป
    if (!this.autoWaveAdvance || this.externalVictoryBlocked) return

    const enemiesBefore = state.enemies
    const outcome = resolveStageOutcome(state, deltaMs)

    if (outcome === 'victory' || outcome === 'defeat') {
      state.status = outcome
      this.publish()
      return
    }

    // ยังไม่จบ แต่ resolveStageOutcome อาจ mutate รายชื่อศัตรู (เช่นสร้างคลื่นถัดไป) — publish
    // ทันทีถ้าเปลี่ยนจริง ไม่ต้องรอรอบ publish ตามช่วงเวลา (เทียบ reference พอ ไม่ต้อง deep-equal)
    if (state.enemies !== enemiesBefore) this.publish()
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
    tickKnockdownState(entity, deltaMs, this.state.elapsedMs)

    if (entity.hitStunRemainingMs <= 0 && entity.state === 'hit') {
      entity.state = 'idle'
    }
  }

  /** Telegraph markers for presentation layer */
  getTelegraphMarkers(): Array<{
    enemyId: string
    position: Vec2
    attackId: string
  }> {
    const markers: Array<{ enemyId: string; position: Vec2; attackId: string }> = []
    for (const enemy of this.state.enemies) {
      const brain = this.brains.get(enemy.id)
      if (!brain || !isEnemyTelegraphing(brain)) continue
      const attack = getEnemySelectedAttack(brain)
      markers.push({
        enemyId: enemy.id,
        position: { ...enemy.position },
        attackId: attack?.id ?? ENEMY_ATTACK_MELEE.id,
      })
    }
    return markers
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

  /** P5 — Stage Runtime controls wave advance instead of auto checkBattleEnd */
  setAutoWaveAdvance(enabled: boolean): void {
    this.autoWaveAdvance = enabled
  }

  setExternalVictoryBlocked(blocked: boolean): void {
    this.externalVictoryBlocked = blocked
  }

  /** Spawn a wave by index; returns count spawned. Used by Stage Runtime (survival etc.). */
  spawnWaveAt(waveIndex: number): number {
    const state = this.state
    if (state.status !== 'running' && state.status !== 'intro') return 0
    const spawned = createWaveEnemies(state.stage, waveIndex, state.enemyHpScale ?? 1)
    if (spawned.length === 0) return 0
    state.currentWaveIndex = waveIndex
    state.enemies = [...state.enemies, ...spawned]
    for (const enemy of spawned) {
      this.brains.set(enemy.id, createEnemyBrain())
    }
    this.publish()
    return spawned.length
  }

  forceVictory(): void {
    if (this.state.status !== 'running') return
    this.state.status = 'victory'
    this.publish()
  }

  forceDefeat(): void {
    if (this.state.status !== 'running') return
    this.state.status = 'defeat'
    this.publish()
  }

  /** Environmental hazard damage — goes through HP, not UI */
  applyEnvironmentalDamage(amount: number): void {
    const player = this.state.player
    if (player.state === 'dead') return
    player.hp = Math.max(0, player.hp - amount)
    this.state.damageTaken += amount
    if (player.hp <= 0) {
      player.state = 'dead'
      this.checkBattleEnd()
    }
  }

  moveEntityTo(entityId: string, x: number, y: number): void {
    const entity =
      entityId === 'player' ? this.state.player : this.state.enemies.find((e) => e.id === entityId)
    if (!entity || entity.state === 'dead') return
    entity.position.x = x
    entity.position.y = y
  }

  /** อ่านสถานะภายในตรง ๆ สำหรับชั้นวาดที่ต้องอัปเดตทุกเฟรมผ่าน ref (ห้ามแก้ค่า) */
  getState(): Readonly<RealtimeBattleState> {
    return this.state
  }

  /** สถานะคอมโบผู้เล่น — UI อ่านเพื่อแสดง attack/casting (ห้ามแก้ค่า) */
  getPlayerComboState(): Readonly<ComboState> {
    return this.playerCombat
  }

  /** ช่องสกิลที่กำลังร่าย — null เมื่อไม่ได้ร่าย */
  getCastingSkillSlot(): SkillSlot | null {
    return this.playerSkill.definition?.slot ?? null
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
      castingSkillSlot: this.playerSkill.definition?.slot ?? null,
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
