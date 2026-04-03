/**
 * engine.test.js
 *
 * 覆盖 Engine（createEngine）的公共 API：
 *   use()     — 模块注册（events / rules / defs）
 *   load()    — 状态恢复 + _bindings 重放
 *   getState()
 *   state     — bind / unbind 自记录 + 幂等
 *
 * 使用最小的自造 module，不依赖任何 STS 内容。
 * 所有测试共享一个引擎实例（VM 启动慢），用 load() 隔离状态而非重建引擎。
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { createEngine } from '../index.js'

// ── Minimal module fixture ────────────────────────────────────────────────────

/**
 * A self-contained module that declares two events and a handful of rules/defs
 * covering every feature of the engine API.
 */
const testModule = {
  events: {
    'actor:damage': { action: 'ACTOR_DAMAGE' },
    'actor:heal':   { action: 'ACTOR_HEAL'   },
    'game:tick':    { action: 'GAME_TICK'     },
  },

  rules: [
    {
      id: 'rule:actor:damage:apply',
      hooks: { 'event:actor:damage': `
          local hp = State.get('actors', Event.target, 'hp') or 0
          local net = math.max(0, hp - (Event.amount or 0))
          State.set('actors', Event.target, 'hp', net)
        `,
      },
    },
    {
      id: 'rule:actor:heal:apply',
      hooks: { 'event:actor:heal': `
          local hp    = State.get('actors', Event.target, 'hp') or 0
          local maxHp = State.get('actors', Event.target, 'maxHp') or hp
          State.set('actors', Event.target, 'hp', math.min(maxHp, hp + (Event.amount or 0)))
        `,
      },
    },
  ],

  // Bindable effect: a simple "shield" that absorbs damage
  defs: {
    effect: {
      shield: {
        id: 'shield',
        hooks: { 'event:actor:damage': {
          order:  200,              // runs before the damage rule (order 0)
          script: `
            local cur = State.get('actors', Ctx.who, 'shield') or 0
            if cur <= 0 then return end
            local absorbed = math.min(cur, Event.amount or 0)
            Event.amount = Event.amount - absorbed
            State.set('actors', Ctx.who, 'shield', cur - absorbed)
          `,
        } },
      },
    },
    status: {
      marked: {
        id: 'marked',
        hooks: { 'event:game:tick': `return` },
      },
    },
    enemy: {
      slug: {
        id: 'slug',
        hooks: { 'event:game:tick': `return` },
      },
    },
    card: {
      ping: {
        id: 'ping',
        hooks: { 'event:game:tick': `return` },
      },
    },
  },
}

// ── Shared engine (one VM per test run) ──────────────────────────────────────

let engine, bundles

beforeAll(async () => {
  bundles = []
  engine  = await createEngine({ onBundle: b => bundles.push(b), debug: false })
  engine.use(testModule)
})

// Fresh state for each test
beforeEach(() => {
  engine.load({ actors: { p1: { hp: 30, maxHp: 30 } } })
  bundles.length = 0
})

// ── use() — static rules ──────────────────────────────────────────────────────

describe('use() — static rules', () => {
  it('rule fires and mutates state', () => {
    engine.state.emit('actor:damage', { target: 'p1', amount: 10 })
    expect(engine.getState().actors.p1.hp).toBe(20)
  })

  it('bundle patches reflect the change', () => {
    engine.state.emit('actor:damage', { target: 'p1', amount: 5 })
    const p = bundles[0].patches.find(p => p.path === 'actors.p1.hp')
    expect(p).toMatchObject({ before: 30, after: 25 })
  })

  it('bundle timeline contains the action', () => {
    engine.state.emit('actor:heal', { target: 'p1', amount: 0 })
    expect(bundles[0].timeline[0].action).toBe('ACTOR_HEAL')
  })
})

// ── State.bind — self-recording ───────────────────────────────────────────────

describe('State.bind self-recording', () => {
  it('bind writes descriptor into _bindings', () => {
    engine.state.bind({ key: 'p1:shield', kind: 'effect', id: 'shield', ctx: { who: 'p1' } })
    const snap = engine.getState()
    expect(snap._bindings?.['p1:shield']).toMatchObject({
      kind: 'effect',
      id: 'shield',
      ctx: { who: 'p1' },
    })
  })

  it('bind installs handler — effect is applied', () => {
    engine.load({ actors: { p1: { hp: 30, maxHp: 30, shield: 10 } } })
    engine.state.bind({ key: 'p1:shield', kind: 'effect', id: 'shield', ctx: { who: 'p1' } })
    engine.state.emit('actor:damage', { target: 'p1', amount: 6 })
    expect(engine.getState().actors.p1.hp).toBe(30)   // fully absorbed by shield
    expect(engine.getState().actors.p1.shield).toBe(4)
  })

  it('bind is idempotent — repeat call does not double-install handler', () => {
    engine.load({ actors: { p1: { hp: 30, maxHp: 30, shield: 10 } } })
    engine.state.bind({ key: 'p1:shield', kind: 'effect', id: 'shield', ctx: { who: 'p1' } })
    engine.state.bind({ key: 'p1:shield', kind: 'effect', id: 'shield', ctx: { who: 'p1' } }) // second call
    engine.state.emit('actor:damage', { target: 'p1', amount: 6 })
    // shield 10 absorbs 6 → hp still 30, shield 4 (NOT 0 from double-absorption)
    expect(engine.getState().actors.p1.hp).toBe(30)
    expect(engine.getState().actors.p1.shield).toBe(4)
  })

  it('bind for unknown module throws', () => {
    expect(() => engine.state.bind({ key: 'p1:ghost', kind: 'effect', id: 'ghost', ctx: {} })).toThrow(/def not found/)
    expect(engine.getState()._bindings?.['p1:ghost']).toBeUndefined()
  })

  it('card bindings require ctx.iid', () => {
    expect(() => engine.state.bind({ key: 'c1', kind: 'card', id: 'ping', ctx: {} })).toThrow(/ctx\.iid/)
  })

  it('legacy positional bind API is rejected', () => {
    expect(() => engine.state.bind('p1:shield', 'effect/shield')).toThrow(/binding spec object/)
  })

  it('status bindings require ctx.self', () => {
    expect(() => engine.state.bind({ key: 'p1:marked', kind: 'status', id: 'marked', ctx: {} })).toThrow(/ctx\.self/)
  })

  it('enemy bindings require ctx.self', () => {
    expect(() => engine.state.bind({ key: 'e1', kind: 'enemy', id: 'slug', ctx: {} })).toThrow(/ctx\.self/)
  })
})

// ── State.unbind ──────────────────────────────────────────────────────────────

describe('State.unbind', () => {
  it('unbind removes handler — effect no longer applied', () => {
    engine.load({ actors: { p1: { hp: 30, maxHp: 30, shield: 10 } } })
    engine.state.bind({ key: 'p1:shield', kind: 'effect', id: 'shield', ctx: { who: 'p1' } })
    engine.state.unbind('p1:shield')
    engine.state.emit('actor:damage', { target: 'p1', amount: 6 })
    expect(engine.getState().actors.p1.hp).toBe(24)   // no shield, full damage
  })

  it('unbind removes _bindings entry', () => {
    engine.state.bind({ key: 'p1:shield', kind: 'effect', id: 'shield', ctx: { who: 'p1' } })
    engine.state.unbind('p1:shield')
    expect(engine.getState()._bindings?.['p1:shield']).toBeUndefined()
  })

  it('unbind on nonexistent key is a no-op', () => {
    expect(() => engine.state.unbind('nobody:nothing')).not.toThrow()
  })
})

// ── load() — state reset and _bindings replay ────────────────────────────────

describe('load()', () => {
  it('load replaces state tree', () => {
    engine.load({ custom: 42 })
    expect(engine.getState().custom).toBe(42)
    expect(engine.getState().actors).toBeUndefined()
  })

  it('load replays _bindings — handlers are restored', () => {
    // Step 1: establish a binding and capture the save
    engine.load({ actors: { p1: { hp: 30, maxHp: 30, shield: 10 } } })
    engine.state.bind({ key: 'p1:shield', kind: 'effect', id: 'shield', ctx: { who: 'p1' } })
    const save = engine.getState()

    // Step 2: load(save) — binding must be restored
    engine.load(save)
    bundles.length = 0
    engine.state.emit('actor:damage', { target: 'p1', amount: 6 })
    expect(engine.getState().actors.p1.hp).toBe(30)   // shield still works
  })

  it('load discards setup patches — first bundle starts clean', () => {
    const save = engine.getState()
    engine.state.bind({ key: 'x:s', kind: 'effect', id: 'shield', ctx: { who: 'x' } })
    const saveWithBinding = engine.getState()

    // Load the save with a binding; the bind-replay patches must be discarded
    engine.load(saveWithBinding)
    bundles.length = 0

    engine.state.emit('actor:damage', { target: 'p1', amount: 1 })
    // First patch after load should NOT be a _bindings patch
    const firstPatchPath = bundles[0]?.patches[0]?.path
    expect(firstPatchPath).not.toMatch(/^_bindings/)
  })

  it('load clears bindings from the previous session', () => {
    engine.load({ actors: { p1: { hp: 30, maxHp: 30, shield: 5 } } })
    engine.state.bind({ key: 'p1:shield', kind: 'effect', id: 'shield', ctx: { who: 'p1' } })

    // Load a fresh store with NO bindings
    engine.load({ actors: { p1: { hp: 30, maxHp: 30, shield: 5 } } })
    bundles.length = 0

    engine.state.emit('actor:damage', { target: 'p1', amount: 5 })
    // Shield handler from previous session must be gone — full damage applies
    expect(engine.getState().actors.p1.hp).toBe(25)
  })

  it('load rejects legacy binding descriptors', () => {
    expect(() => engine.load({
      actors: { p1: { hp: 30, maxHp: 30 } },
      _bindings: {
        'p1:shield': { moduleId: 'effect/shield', inject: "local who = 'p1'" },
      },
    })).toThrow(/invalid binding descriptor/)
  })
})

describe('use()', () => {
  it('rejects module.extensions', async () => {
    const e = await createEngine()
    expect(() => e.use({ extensions() { return {} } })).toThrow(/module\.extensions is no longer supported/)
  })

  it('rejects duplicate rule ids', async () => {
    const e = await createEngine()
    e.use({ events: { 'x:a': {} }, rules: [{ id: 'dup:rule', hooks: { 'event:x:a': 'return' } }] })
    expect(() => e.use({ rules: [{ id: 'dup:rule', hooks: { 'event:x:a': 'return' } }] }))
      .toThrow(/duplicate rule id/)
  })

  it('rejects duplicate defs', async () => {
    const e = await createEngine()
    e.use({ defs: { effect: { burn: { id: 'burn', hooks: {} } } } })
    expect(() => e.use({ defs: { effect: { burn: { id: 'burn', hooks: {} } } } }))
      .toThrow(/duplicate def/)
  })
})

// ── getState() ────────────────────────────────────────────────────────────────

describe('getState()', () => {
  it('returns a deep clone (external mutations do not affect live state)', () => {
    const snap = engine.getState()
    snap.actors = { injected: true }
    expect(engine.getState().actors?.injected).toBeUndefined()
  })

  it('returned snapshot is JSON-serialisable', () => {
    engine.state.bind({ key: 'p1:shield', kind: 'effect', id: 'shield', ctx: { who: 'p1' } })
    expect(() => JSON.stringify(engine.getState())).not.toThrow()
  })
})

// ── State.get / State.set from JS ─────────────────────────────────────────────

describe('State.get / State.set', () => {
  it('set then get round-trips correctly', () => {
    engine.state.set('foo', 'bar', 99)
    expect(engine.state.get('foo', 'bar')).toBe(99)
  })

  it('variadic path segments round-trip correctly', () => {
    engine.state.set('foo', 'baz', 123)
    expect(engine.state.get('foo', 'baz')).toBe(123)
  })

  it('rejects dot-delimited single-string paths', () => {
    expect(() => engine.state.set('foo.bar', 99)).toThrow(/must not contain "\."/)
    expect(() => engine.state.get('foo.bar')).toThrow(/must not contain "\."/)
  })

  it('set null removes the key', () => {
    engine.state.set('tmp', 'x')
    engine.state.set('tmp', null)
    expect(engine.state.get('tmp')).toBeUndefined()
  })
})
