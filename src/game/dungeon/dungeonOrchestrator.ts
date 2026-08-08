import type {
  DungeonDefinition,
  DungeonResult,
  DungeonRunState,
  StageDefinition,
  SurvivalParams,
} from './dungeonSchema'
import { advanceDungeonRun, createDungeonRun, getCurrentStage } from './dungeonRuntime'
import { StageRuntime } from './stageRuntime'
import { createStageBattleBridge } from './stageBattleBridge'
import { createRealtimeBattle } from '../realtimeBattle/createRealtimeBattle'
import { RealtimeBattleRuntime } from '../realtimeBattle/RealtimeBattleRuntime'
import type { Player } from '../../types/player'
import {
  createCombatAccumulator,
  mergeBattleStateIntoAccumulator,
  type CombatAccumulator,
} from '../reward/combatSummary'
import { finalizeDungeonResult } from '../reward/resultFinalizer'

export type DungeonOrchestratorPhase =
  'idle' | 'stage_active' | 'stage_transition' | 'dungeon_complete' | 'dungeon_failed'

export interface DungeonOrchestratorSnapshot {
  phase: DungeonOrchestratorPhase
  run: DungeonRunState
  currentStage: StageDefinition | null
  stageSnapshot: ReturnType<StageRuntime['getSnapshot']> | null
  result: DungeonResult | null
}

/**
 * Non-React dungeon flow controller — used by UI hook and integration tests.
 */
export class DungeonOrchestrator {
  private run: DungeonRunState
  private phase: DungeonOrchestratorPhase = 'idle'
  private runtime: RealtimeBattleRuntime | null = null
  private stageRuntime: StageRuntime | null = null
  private result: DungeonResult | null = null
  private readonly startedAtMs: number
  private dungeon: DungeonDefinition
  private player: Player
  private combatAccumulator: CombatAccumulator = createCombatAccumulator()
  private resultFinalized = false

  constructor(dungeon: DungeonDefinition, player: Player, startedAtMs = Date.now()) {
    this.dungeon = dungeon
    this.player = player
    this.startedAtMs = startedAtMs
    this.run = createDungeonRun(dungeon, startedAtMs)
  }

  start(): boolean {
    const stage = getCurrentStage(this.dungeon, this.run)
    if (!stage) return false
    return this.loadStage(stage)
  }

  loadStage(stage: StageDefinition): boolean {
    const skipInitial = stage.stageType === 'survival'
    const enemyHpScale =
      stage.stageType === 'survival' ? ((stage.params as SurvivalParams).enemyHpScale ?? 1) : 1
    const state = createRealtimeBattle(stage.arenaId, this.player, {
      skipInitialWave: skipInitial,
      enemyHpScale,
    })
    if (!state) return false

    this.runtime?.dispose()
    this.stageRuntime?.cleanup()

    this.runtime = new RealtimeBattleRuntime(state)
    this.runtime.setExternalVictoryBlocked(true)
    const bridge = createStageBattleBridge(this.runtime)
    this.stageRuntime = new StageRuntime(stage, bridge)
    this.stageRuntime.enter()
    this.phase = 'stage_active'
    return true
  }

  tick(deltaMs: number): void {
    if (!this.runtime || !this.stageRuntime || this.phase !== 'stage_active') return

    this.runtime.step(deltaMs)
    const resolution = this.stageRuntime.tick(deltaMs)

    if (resolution === 'win') {
      this.runtime.forceVictory()
      this.finishStage(true)
    } else if (resolution === 'lose') {
      this.runtime.forceDefeat()
      this.finishStage(false)
    } else if (this.runtime.getState().status === 'defeat') {
      this.finishStage(false)
    } else if (this.runtime.getState().status === 'victory') {
      this.finishStage(true)
    }
  }

  private absorbCombatStats(): void {
    if (!this.runtime) return
    this.combatAccumulator = mergeBattleStateIntoAccumulator(
      this.combatAccumulator,
      this.runtime.getState(),
    )
  }

  private finalizeResult(): void {
    if (this.resultFinalized) return
    this.resultFinalized = true
    this.result = finalizeDungeonResult({
      dungeon: this.dungeon,
      run: this.run,
      clearTimeMs: Date.now() - this.startedAtMs,
      combatAccumulator: this.combatAccumulator,
    })
  }

  private finishStage(success: boolean): void {
    if (!this.stageRuntime || this.phase !== 'stage_active') return

    this.absorbCombatStats()
    const stageResult = { ...this.stageRuntime.getResult(), success }
    this.run = advanceDungeonRun(this.run, this.dungeon, success, stageResult)
    this.stageRuntime.cleanup()
    this.stageRuntime = null

    if (!success) {
      this.phase = 'dungeon_failed'
      this.finalizeResult()
      return
    }

    if (this.run.status === 'cleared') {
      this.phase = 'dungeon_complete'
      this.finalizeResult()
      this.runtime?.dispose()
      this.runtime = null
      return
    }

    this.phase = 'stage_transition'
    const next = getCurrentStage(this.dungeon, this.run)
    if (!next) {
      this.phase = 'dungeon_complete'
      this.finalizeResult()
      return
    }
    this.loadStage(next)
  }

  getRuntime(): RealtimeBattleRuntime | null {
    return this.runtime
  }

  getSnapshot(): DungeonOrchestratorSnapshot {
    return {
      phase: this.phase,
      run: this.run,
      currentStage: getCurrentStage(this.dungeon, this.run),
      stageSnapshot: this.stageRuntime?.getSnapshot() ?? null,
      result: this.result,
    }
  }

  dispose(): void {
    this.runtime?.dispose()
    this.stageRuntime?.cleanup()
    this.runtime = null
    this.stageRuntime = null
  }
}
