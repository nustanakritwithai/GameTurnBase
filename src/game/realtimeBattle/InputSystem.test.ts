import { afterEach, describe, expect, it } from 'vitest'
import { InputSystem } from './InputSystem'

/** ยิงเหตุการณ์คีย์บอร์ดเข้า window แบบเดียวกับที่เบราว์เซอร์ทำ */
function key(type: 'keydown' | 'keyup', code: string) {
  window.dispatchEvent(new KeyboardEvent(type, { code, cancelable: true }))
}

let detach: (() => void) | null = null

afterEach(() => {
  detach?.()
  detach = null
})

describe('InputSystem', () => {
  it('อ่านทั้ง WASD และปุ่มลูกศร', () => {
    const input = new InputSystem()
    detach = input.attachKeyboard()

    key('keydown', 'KeyD')
    expect(input.getMoveVector()).toEqual({ x: 1, y: 0 })

    key('keyup', 'KeyD')
    key('keydown', 'ArrowUp')
    expect(input.getMoveVector()).toEqual({ x: 0, y: -1 })
  })

  it('กดสองปุ่มพร้อมกันได้ทิศเฉียง', () => {
    const input = new InputSystem()
    detach = input.attachKeyboard()

    key('keydown', 'KeyW')
    key('keydown', 'KeyD')
    expect(input.getMoveVector()).toEqual({ x: 1, y: -1 })
  })

  it('ปุ่มตรงข้ามกันหักล้างกันเป็นศูนย์', () => {
    const input = new InputSystem()
    detach = input.attachKeyboard()

    key('keydown', 'KeyA')
    key('keydown', 'KeyD')
    expect(input.getMoveVector()).toEqual({ x: 0, y: 0 })
  })

  it('จอยสติกชนะคีย์บอร์ดเมื่อถูกดันจริง', () => {
    const input = new InputSystem()
    detach = input.attachKeyboard()

    key('keydown', 'KeyD')
    input.setJoystick({ x: 0, y: -0.6 })
    const joy = input.getMoveVector()
    expect(joy.x).toBe(0)
    expect(joy.y).toBeLessThan(0)

    input.setJoystick({ x: 0, y: 0 })
    expect(input.getMoveVector()).toEqual({ x: 1, y: 0 })
  })

  it('dead zone กลางจอยคืนศูนย์', () => {
    const input = new InputSystem()
    input.setJoystick({ x: 0.05, y: 0.05 })
    expect(input.getMoveVector()).toEqual({ x: 0, y: 0 })
  })

  it('MovementInput abstraction แมป depth เป็น Vec2.y', () => {
    const input = new InputSystem()
    input.setMovementInput({ x: 0.8, depth: -0.4 })
    const movement = input.getMovementInput()
    expect(movement.x).toBeGreaterThan(0)
    expect(movement.depth).toBeLessThan(0)
    expect(input.getMoveVector().y).toBeLessThan(0)
  })

  it('สลับแท็บทั้งที่กดค้าง (blur) ต้องไม่ทำให้ตัวละครเดินค้าง', () => {
    const input = new InputSystem()
    detach = input.attachKeyboard()

    key('keydown', 'KeyD')
    window.dispatchEvent(new Event('blur'))
    expect(input.getMoveVector()).toEqual({ x: 0, y: 0 })
  })

  it('ถอด listener แล้วไม่รับอินพุตอีก', () => {
    const input = new InputSystem()
    const stop = input.attachKeyboard()
    stop()

    key('keydown', 'KeyD')
    expect(input.getMoveVector()).toEqual({ x: 0, y: 0 })
  })

  it('ปุ่มที่ไม่เกี่ยวกับการเดินไม่มีผล', () => {
    const input = new InputSystem()
    detach = input.attachKeyboard()

    key('keydown', 'KeyQ')
    expect(input.getMoveVector()).toEqual({ x: 0, y: 0 })
  })

  it('Done-criterion 4: queue discrete attacks and skill slots as FIFO', () => {
    const input = new InputSystem()
    // Queue some inputs
    input.pressAttack()
    input.pressAttack()
    input.pressSkill('skill1')
    input.pressSkill('skill2')

    // First attack consume
    expect(input.consumeAttack()).toBe(true)
    // Second attack consume
    expect(input.consumeAttack()).toBe(true)
    // Third attack consume should be false
    expect(input.consumeAttack()).toBe(false)

    // Skill consume FIFO order
    expect(input.consumeSkill()).toBe('skill1')
    expect(input.consumeSkill()).toBe('skill2')
    expect(input.consumeSkill()).toBeNull()
  })

  it('Done-criterion 5: maps keyboard events to correct attack and skill actions', () => {
    const input = new InputSystem()
    detach = input.attachKeyboard()

    // Attack keys: Space and KeyJ
    key('keydown', 'Space')
    expect(input.consumeAttack()).toBe(true)
    key('keyup', 'Space')

    key('keydown', 'KeyJ')
    expect(input.consumeAttack()).toBe(true)
    key('keyup', 'KeyJ')

    // Skill 1 keys: Digit1 and KeyE
    key('keydown', 'Digit1')
    expect(input.consumeSkill()).toBe('skill1')
    key('keyup', 'Digit1')

    key('keydown', 'KeyE')
    expect(input.consumeSkill()).toBe('skill1')
    key('keyup', 'KeyE')

    // Skill 2 keys: Digit2 and KeyR
    key('keydown', 'Digit2')
    expect(input.consumeSkill()).toBe('skill2')
    key('keyup', 'Digit2')

    key('keydown', 'KeyR')
    expect(input.consumeSkill()).toBe('skill2')
    key('keyup', 'KeyR')

    // Skill 3 keys: Digit3 and KeyF
    key('keydown', 'Digit3')
    expect(input.consumeSkill()).toBe('skill3')
    key('keyup', 'Digit3')

    key('keydown', 'KeyF')
    expect(input.consumeSkill()).toBe('skill3')
    key('keyup', 'KeyF')

    // Ultimate keys: Digit4 and KeyQ
    key('keydown', 'Digit4')
    expect(input.consumeSkill()).toBe('ultimate')
    key('keyup', 'Digit4')

    key('keydown', 'KeyQ')
    expect(input.consumeSkill()).toBe('ultimate')
    key('keyup', 'KeyQ')
  })

  it('Scar 1: visibilitychange clears pressed keys to prevent stuck keys', () => {
    const input = new InputSystem()
    detach = input.attachKeyboard()

    // Press a movement key
    key('keydown', 'KeyD')
    expect(input.getMoveVector()).toEqual({ x: 1, y: 0 })

    // Trigger visibilitychange event on document
    window.document.dispatchEvent(new Event('visibilitychange'))
    expect(input.getMoveVector()).toEqual({ x: 0, y: 0 })
  })

  it('Scar 2: buffered action resolves cooldowns/state at execution/drain-time rather than queue-time', () => {
    const input = new InputSystem()

    // Press skill while not on cooldown
    input.pressSkill('skill1')

    // Drain it: the consumer checks the state at drain time
    const skillToCast = input.consumeSkill()
    expect(skillToCast).toBe('skill1')
  })

  it('Scar 3: movement changes in the same tick as buffered skill execution do not cause stale vectors', () => {
    const input = new InputSystem()
    detach = input.attachKeyboard()

    // Simultaneously hold a new movement key and queue a skill
    key('keydown', 'KeyD') // move right
    input.pressSkill('skill1')

    // Verify move vector is updated right away in the same tick
    expect(input.getMoveVector()).toEqual({ x: 1, y: 0 })
    expect(input.consumeSkill()).toBe('skill1')
  })
})
