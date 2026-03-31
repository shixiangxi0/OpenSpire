/**
 * registry.test.js
 *
 * 覆盖 Registry 的所有公共方法，完全不涉及 Lua 或事件执行。
 * 所有测试同步运行，无需 beforeAll。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { Registry } from '../core/Registry.js'

let reg

beforeEach(() => { reg = new Registry() })

// ── get / set ────────────────────────────────────────────────────────────────

describe('get / set', () => {
  it('missing path returns undefined', () => {
    expect(reg.get('a.b.c')).toBeUndefined()
  })

  it('set creates nested path', () => {
    reg.set('a.b.c', 42)
    expect(reg.get('a.b.c')).toBe(42)
    expect(reg.get('a.b')).toEqual({ c: 42 })
  })

  it('set null deletes the key', () => {
    reg.set('x', 1)
    reg.set('x', null)
    expect(reg.get('x')).toBeUndefined()
  })

  it('set records a patch with before/after', () => {
    reg.set('hp', 30)
    reg.set('hp', 20)
    const patches = reg.flushPatches()
    expect(patches).toHaveLength(2)
    expect(patches[0]).toEqual({ path: 'hp', before: null, after: 30 })
    expect(patches[1]).toEqual({ path: 'hp', before: 30,   after: 20 })
  })

  it('flushPatches clears the buffer', () => {
    reg.set('z', 1)
    reg.flushPatches()
    expect(reg.flushPatches()).toHaveLength(0)
  })
})

// ── resetState / getState / peekState ────────────────────────────────────────

describe('resetState / getState / peekState', () => {
  it('resetState replaces store and discards pending patches', () => {
    reg.set('old', 1)
    reg.resetState({ new: 99 })
    expect(reg.get('new')).toBe(99)
    expect(reg.get('old')).toBeUndefined()
    expect(reg.flushPatches()).toHaveLength(0)
  })

  it('getState returns a deep clone (mutations do not affect live store)', () => {
    reg.set('arr', [1, 2, 3])
    const snap = reg.getState()
    snap.arr.push(4)
    expect(reg.get('arr')).toHaveLength(3)
  })

  it('peekState returns the live reference', () => {
    reg.set('x', 5)
    const live = reg.peekState()
    live.x = 99
    expect(reg.get('x')).toBe(99)
  })
})

// ── _bindings (setBinding / getBindings) ─────────────────────────────────────

describe('setBinding / getBindings', () => {
  it('setBinding stores descriptor under the literal key', () => {
    reg.setBinding('actors.p1:shield', { kind: 'effect', id: 'shield', ctx: { who: 'actors.p1' } })
    expect(reg.getBindings()['actors.p1:shield']).toMatchObject({ kind: 'effect', id: 'shield' })
  })

  it('setBinding null deletes the key', () => {
    reg.setBinding('k', { kind: 'effect', id: 'x' })
    reg.setBinding('k', null)
    expect(reg.getBindings()['k']).toBeUndefined()
  })

  it('setBinding records a patch for observability', () => {
    reg.setBinding('key', { kind: 'status', id: 'burn', ctx: { self: 'player' } })
    const patches = reg.flushPatches()
    expect(patches.some(p => p.path === '_bindings.key')).toBe(true)
  })

  it('keys with dots are stored as literals, not path-parsed', () => {
    reg.setBinding('a.b.c:effect', { kind: 'effect', id: 'x' })
    // should be stored as a single key '_bindings["a.b.c:effect"]'
    // NOT as _bindings.a.b.c.effect
    expect(reg.getBindings()['a.b.c:effect']).toBeDefined()
    expect(reg.get('_bindings.a')).toBeUndefined()
  })

  it('getState includes _bindings from the store', () => {
    reg.setBinding('k', { kind: 'enemy', id: 'jaw_worm', ctx: { self: 'jaw_worm_1' } })
    const snap = reg.getState()
    expect(snap._bindings?.k?.kind).toBe('enemy')
    expect(snap._bindings?.k?.id).toBe('jaw_worm')
  })
})

// ── pipeline / handler management ────────────────────────────────────────────

describe('definePipeline', () => {
  it('creates a pipeline with default action (uppercased, colon → underscore)', () => {
    reg.definePipeline('actor:damage')
    const p = reg.getPipeline('actor:damage')
    expect(p).not.toBeNull()
    expect(p.action).toBe('ACTOR_DAMAGE')
  })

  it('custom action is preserved', () => {
    reg.definePipeline('card:play', { action: 'CARD_PLAYED' })
    expect(reg.getPipeline('card:play').action).toBe('CARD_PLAYED')
  })

  it('throws on duplicate event declarations', () => {
    reg.definePipeline('e:x', { action: 'FIRST' })
    expect(() => reg.definePipeline('e:x', { action: 'SECOND' })).toThrow(/already declared/)
  })

  it('getPipeline returns null for undeclared event', () => {
    expect(reg.getPipeline('ghost:event')).toBeNull()
  })
})

describe('addHandler', () => {
  beforeEach(() => reg.definePipeline('test:evt'))

  it('throws when event is not declared', () => {
    expect(() => reg.addHandler('ghost', { script: '', registeredBy: 'x' }))
      .toThrow(/undeclared event/)
  })

  it('throws when script is not a string', () => {
    expect(() => reg.addHandler('test:evt', { script: null, registeredBy: 'x' }))
      .toThrow(/script must be a string/)
  })

  it('handlers are ordered descending by order value', () => {
    reg.addHandler('test:evt', { script: 'low',  order: -10, registeredBy: 'a' })
    reg.addHandler('test:evt', { script: 'high', order: 100, registeredBy: 'b' })
    reg.addHandler('test:evt', { script: 'mid',  order: 0,   registeredBy: 'c' })
    const scripts = reg.getPipeline('test:evt').handlers.map(h => h.script)
    expect(scripts).toEqual(['high', 'mid', 'low'])
  })

  it('equal-order handlers are FIFO (stable sort)', () => {
    reg.addHandler('test:evt', { script: 'first',  order: 0, registeredBy: 'a' })
    reg.addHandler('test:evt', { script: 'second', order: 0, registeredBy: 'b' })
    const scripts = reg.getPipeline('test:evt').handlers.map(h => h.script)
    expect(scripts).toEqual(['first', 'second'])
  })
})

describe('register', () => {
  beforeEach(() => reg.definePipeline('test:evt'))

  it('throws when id is missing', () => {
    expect(() => reg.register({ triggers: [] })).toThrow(/id is required/)
  })

  it('registers all triggers with registeredBy default = module id', () => {
    reg.register({
      id: 'mod:a',
      triggers: [{ event: 'test:evt', order: 0, script: 'a' }],
    })
    const h = reg.getPipeline('test:evt').handlers[0]
    expect(h.registeredBy).toBe('mod:a')
  })

  it('provided registeredBy overrides module id', () => {
    reg.register(
      { id: 'mod:a', triggers: [{ event: 'test:evt', order: 0, script: 'x' }] },
      { registeredBy: 'custom-key' },
    )
    expect(reg.getPipeline('test:evt').handlers[0].registeredBy).toBe('custom-key')
  })

  it('ctx is stored on each registered handler', () => {
    reg.register(
      { id: 'mod:a', triggers: [{ event: 'test:evt', order: 0, script: 'body' }] },
      { ctx: { self: 'player' } },
    )
    expect(reg.getPipeline('test:evt').handlers[0].ctx).toEqual({ self: 'player' })
    expect(reg.getPipeline('test:evt').handlers[0].script).toBe('body')
  })
})

describe('unregister', () => {
  beforeEach(() => reg.definePipeline('test:evt'))

  it('removes all handlers with matching registeredBy', () => {
    reg.addHandler('test:evt', { script: 'a', order: 0, registeredBy: 'key1' })
    reg.addHandler('test:evt', { script: 'b', order: 0, registeredBy: 'key2' })
    reg.unregister('key1')
    const scripts = reg.getPipeline('test:evt').handlers.map(h => h.script)
    expect(scripts).toEqual(['b'])
  })

  it('is a no-op for unknown key', () => {
    reg.addHandler('test:evt', { script: 'x', order: 0, registeredBy: 'k' })
    expect(() => reg.unregister('nonexistent')).not.toThrow()
    expect(reg.getPipeline('test:evt').handlers).toHaveLength(1)
  })
})
