import type { Vec2 } from './types'

/**
 * Movement input abstraction — combat systems read Vec2 internally where
 * `y` is battle depth; UI layers may use this named shape per blueprint #51.
 */
export interface MovementInput {
  x: number
  depth: number
}

/** Full player combat input frame (keyboard + touch map here). */
export interface PlayerInputState {
  moveX: number
  moveDepth: number
  basicAttackPressed: boolean
  skill1Pressed: boolean
  skill2Pressed: boolean
  skill3Pressed: boolean
  ultimatePressed: boolean
}

export function movementInputToVec2(input: MovementInput): Vec2 {
  return { x: input.x, y: input.depth }
}

export function vec2ToMovementInput(vector: Vec2): MovementInput {
  return { x: vector.x, depth: vector.y }
}

export function createEmptyPlayerInputState(): PlayerInputState {
  return {
    moveX: 0,
    moveDepth: 0,
    basicAttackPressed: false,
    skill1Pressed: false,
    skill2Pressed: false,
    skill3Pressed: false,
    ultimatePressed: false,
  }
}
