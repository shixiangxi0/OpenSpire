/**
 * scheduler.test.js
 *
 * 覆盖 Scheduler（事件执行循环）的行为。
 * 使用真实 Registry + 真实 Runtime（Lua VM），但不通过 Engine。
 * 这样可以精确控制管道声明和 handler 注册，隔离引擎装配层的干扰。
 *
 * 测试节奏：VM 慢，全套用 beforeAll 共享一个 VM 实例。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { Registry }        from '../core/Registry.js'
import { Runtime }         from '../core/Runtime.js'
import { createState }     from '../core/State.js'
import { createScheduler } from '../core/Scheduler.js'

// ── shared VM setup ───────────────────────────────────────────────────────────

let runtime

beforeAll(async () => {
  runtime = new Runtime()
  await runtime.init()
})

/**  Minimal test harness: fresh registry + state + fire for each scenario. */
function makeHarness({ onBundle = () => {}, enrich } = {}) {
  const registry = new Registry()
  const fireRef  = { current: null }
  const allDefs  = {}
  const state    = createState({ registry, fireRef, allDefs })
  const fire     = createScheduler({ registry, runtime, onBundle, enrich })
  fireRef.current = fire
  runtime.set('State', state)
  return { registry, state, fire, allDefs }
}

// ── basic execution ───────────────────────────────────────────────────────────

describe('basic handler execution', () => {
  it('runs a handler and produces a bundle', () => {
    const bundles = []
    const { registry, fire } = makeHarness({ onBundle: b => bundles.push(b) })
    registry.definePipeline('test:evt')
    registry.addHandler('test:evt', {
      script: `State.set('ran', true)`,
      order: 0,
      registeredBy: 'h1',
    })

    fire('test:evt', {})
    expect(bundles).toHaveLength(1)
    expect(bundles[0].rootEvent).toBe('test:evt')
    expect(registry.get('ran')).toBe(true)
  })

  it('unknown event throws immediately', () => {
    const { fire } = makeHarness()
    const payload = { x: 1 }
    expect(() => fire('ghost:event', payload)).toThrow(/No pipeline for event/)
  })

  it('handlers execute in order: descending by order value', () => {
    const log = []
    const { registry, fire } = makeHarness()
    registry.definePipeline('order:test')
    registry.addHandler('order:test', { script: `State.set('seq', (State.get('seq') or '') .. 'B')`, order: 50,  registeredBy: 'b' })
    registry.addHandler('order:test', { script: `State.set('seq', (State.get('seq') or '') .. 'A')`, order: 100, registeredBy: 'a' })
    registry.addHandler('order:test', { script: `State.set('seq', (State.get('seq') or '') .. 'C')`, order: 0,   registeredBy: 'c' })

    fire('order:test', {})
    expect(registry.get('seq')).toBe('ABC')
  })
})

// ── Event.cancelled ───────────────────────────────────────────────────────────

describe('Event.cancelled', () => {
  it('setting Event.cancelled = true stops subsequent handlers', () => {
    const { registry, fire } = makeHarness()
    registry.definePipeline('cancel:test')
    registry.addHandler('cancel:test', {
      script: `Event.cancelled = true; State.set('a', 1)`,
      order: 100, registeredBy: 'first',
    })
    registry.addHandler('cancel:test', {
      script: `State.set('b', 1)`,
      order: 0, registeredBy: 'second',
    })

    fire('cancel:test', {})
    expect(registry.get('a')).toBe(1)
    expect(registry.get('b')).toBeUndefined()
  })

  it('cancelled pipeline does NOT emit a timeline entry', () => {
    const bundles = []
    const { registry, fire } = makeHarness({ onBundle: b => bundles.push(b) })
    registry.definePipeline('cancel:evt', { action: 'CANCEL_EVT' })
    registry.addHandler('cancel:evt', {
      script: `Event.cancelled = true`,
      order: 0, registeredBy: 'h',
    })

    fire('cancel:evt', {})
    expect(bundles[0].timeline).toHaveLength(0)
  })
})

// ── handler mutation of Event (payload passing) ───────────────────────────────

describe('payload mutation across handlers', () => {
  it('handler A can modify Event.amount and handler B sees the new value', () => {
    const { registry, fire } = makeHarness()
    registry.definePipeline('mutate:test')
    // handler A: double the amount (order=100, runs first)
    registry.addHandler('mutate:test', {
      script: `Event.amount = Event.amount * 2`,
      order: 100, registeredBy: 'a',
    })
    // handler B: writes final amount to state (order=0, runs second)
    registry.addHandler('mutate:test', {
      script: `State.set('result', Event.amount)`,
      order: 0, registeredBy: 'b',
    })

    fire('mutate:test', { amount: 5 })
    expect(registry.get('result')).toBe(10)
  })
})

// ── binding context (Ctx) ────────────────────────────────────────────────────

describe('binding context', () => {
  it('exposes Ctx without legacy self/iid/owner locals', () => {
    const { registry, fire } = makeHarness()
    registry.definePipeline('ctx:test')
    registry.addHandler('ctx:test', {
      script: `
        State.set('has_self', self ~= nil)
        State.set('has_iid', iid ~= nil)
        State.set('has_owner', owner ~= nil)
        State.set('ctx_self', Ctx.self)
        State.set('ctx_iid', Ctx.iid)
        State.set('ctx_owner', Ctx.owner)
      `,
      order: 0,
      registeredBy: 'ctx-h',
      ctx: { self: 'outer', iid: 'card_1', owner: 'player' },
    })

    fire('ctx:test', {})
    expect(registry.get('has_self')).toBe(false)
    expect(registry.get('has_iid')).toBe(false)
    expect(registry.get('has_owner')).toBe(false)
    expect(registry.get('ctx_self')).toBe('outer')
    expect(registry.get('ctx_iid')).toBe('card_1')
    expect(registry.get('ctx_owner')).toBe('player')
  })
})

describe('match filters', () => {
  it('handlers run only when payload matches the bound ctx', () => {
    const { registry, fire } = makeHarness()
    registry.definePipeline('match:test')
    registry.addHandler('match:test', {
      script: `State.set('hits', (State.get('hits') or 0) + 1)`,
      order: 0,
      registeredBy: 'match-h',
      ctx: { self: 'enemy_1' },
      match: { target: 'self' },
    })

    fire('match:test', { target: 'enemy_2' })
    fire('match:test', { target: 'enemy_1' })

    expect(registry.get('hits')).toBe(1)
  })
})

// ── depth-first recursion ─────────────────────────────────────────────────────

describe('depth-first nested emit', () => {
  it('inner emit completes before outer handler continues', () => {
    const { registry, state, fire } = makeHarness()
    registry.definePipeline('outer')
    registry.definePipeline('inner')

    registry.addHandler('outer', {
      script: `
        State.set('step', 1)
        State.emit('inner', {})
        State.set('step', 3)
      `,
      order: 0, registeredBy: 'outer-h',
    })
    registry.addHandler('inner', {
      script: `State.set('step', 2)`,
      order: 0, registeredBy: 'inner-h',
    })

    fire('outer', {})
    // Final step is 3 because outer resumes AFTER inner completes
    expect(registry.get('step')).toBe(3)
  })

  it('nested bundles are folded into the root bundle', () => {
    const bundles = []
    const { registry, fire } = makeHarness({ onBundle: b => bundles.push(b) })
    registry.definePipeline('root:a', { action: 'ROOT_A' })
    registry.definePipeline('child:b', { action: 'CHILD_B' })

    registry.addHandler('root:a', {
      script: `State.emit('child:b', {})`,
      order: 0, registeredBy: 'root-h',
    })

    fire('root:a', {})
    // Only ONE bundle (the root)
    expect(bundles).toHaveLength(1)
    expect(bundles[0].rootEvent).toBe('root:a')
    // Timeline contains both entries
    const actions = bundles[0].timeline.map(e => e.action)
    expect(actions).toContain('ROOT_A')
    expect(actions).toContain('CHILD_B')
  })

  it('timeline seq: child seq is greater than root seq', () => {
    const bundles = []
    const { registry, fire } = makeHarness({ onBundle: b => bundles.push(b) })
    registry.definePipeline('p:root', { action: 'P_ROOT' })
    registry.definePipeline('p:child', { action: 'P_CHILD' })

    registry.addHandler('p:root', {
      script: `State.emit('p:child', {})`,
      order: 0, registeredBy: 'rh',
    })

    fire('p:root', {})
    const tl = bundles[0].timeline
    const root  = tl.find(e => e.action === 'P_ROOT')
    const child = tl.find(e => e.action === 'P_CHILD')
    expect(root.seq).toBe(0)
    expect(child.seq).toBeGreaterThan(0)
  })

  it('nested emit restores the outer handler Ctx after the child returns', () => {
    const { registry, fire } = makeHarness()
    registry.definePipeline('ctx:outer')
    registry.definePipeline('ctx:inner')

    registry.addHandler('ctx:outer', {
      script: `
        State.set('outer_before', Ctx.self)
        State.emit('ctx:inner', {})
        State.set('outer_after', Ctx.self)
      `,
      order: 0,
      registeredBy: 'outer-h',
      ctx: { self: 'outer' },
    })

    registry.addHandler('ctx:inner', {
      script: `State.set('inner_seen', Ctx.self)`,
      order: 0,
      registeredBy: 'inner-h',
      ctx: { self: 'inner' },
    })

    fire('ctx:outer', {})
    expect(registry.get('outer_before')).toBe('outer')
    expect(registry.get('inner_seen')).toBe('inner')
    expect(registry.get('outer_after')).toBe('outer')
  })
})

// ── anti-recursion ────────────────────────────────────────────────────────────

describe('anti-recursion guard', () => {
  it('a handler cannot recurse into itself on the same event', () => {
    // Without the guard this would blow the call stack.
    const { registry, fire } = makeHarness()
    registry.definePipeline('rec:evt')
    registry.addHandler('rec:evt', {
      script: `
        local n = State.get('n') or 0
        State.set('n', n + 1)
        State.emit('rec:evt', {})   -- re-enter same event
      `,
      order: 0, registeredBy: 'self',
    })

    fire('rec:evt', {})
    // executed exactly once (guard suppressed re-entry of the same handler)
    expect(registry.get('n')).toBe(1)
  })

  it('different handlers on the same re-emitted event ARE allowed to run', () => {
    const { registry, fire } = makeHarness()
    registry.definePipeline('shared:evt')

    // handler A causes the re-emit
    registry.addHandler('shared:evt', {
      script: `
        if not State.get('looped') then
          State.set('looped', true)
          State.emit('shared:evt', {})
        end
      `,
      order: 100, registeredBy: 'hook-A',
    })
    // handler B should run on the re-emitted event
    registry.addHandler('shared:evt', {
      script: `State.set('b_count', (State.get('b_count') or 0) + 1)`,
      order: 0, registeredBy: 'observer-B',
    })

    fire('shared:evt', {})
    // B ran once on the original + once on the re-emit = 2
    expect(registry.get('b_count')).toBe(2)
  })
})

// ── unregister-during-execution ───────────────────────────────────────────────

describe('unregister mid-execution', () => {
  it('a handler unregistered while the pipeline is running is skipped', () => {
    const { registry, state, fire } = makeHarness()
    registry.definePipeline('rm:test')

    // handler A unregisters handler B
    registry.addHandler('rm:test', {
      script: `State.unbind('victim')`,
      order: 100, registeredBy: 'killer',
    })
    // handler B — should be skipped
    registry.addHandler('rm:test', {
      script: `State.set('victim_ran', true)`,
      order: 0, registeredBy: 'victim',
    })

    // The state object needs a bound def for unbind to work cleanly,
    // but we can also just call registry.unregister directly via a custom extension.
    // Simpler: inject a custom method.
    state.unbind = (key) => {
      registry.unregister(key)
      registry.setBinding(key, null)
    }

    fire('rm:test', {})
    expect(registry.get('victim_ran')).toBeUndefined()
  })
})

// ── patches in bundle ────────────────────────────────────────────────────────

describe('patches in bundle', () => {
  it('bundle patches list all state changes in chronological order', () => {
    const bundles = []
    const { registry, fire } = makeHarness({ onBundle: b => bundles.push(b) })
    registry.definePipeline('patch:test')
    registry.addHandler('patch:test', {
      script: `
        State.set('x', 1)
        State.set('x', 2)
        State.set('y', 'hello')
      `,
      order: 0, registeredBy: 'h',
    })

    fire('patch:test', {})
    const patches = bundles[0].patches
    expect(patches).toHaveLength(3)
    expect(patches[0]).toMatchObject({ path: 'x', before: null, after: 1 })
    expect(patches[1]).toMatchObject({ path: 'x', before: 1, after: 2 })
    expect(patches[2]).toMatchObject({ path: 'y', before: null, after: 'hello' })
  })
})

// ── enrich callback ───────────────────────────────────────────────────────────

describe('enrich callback', () => {
  it('enrich receives event name, payload, and getState; result stored in timeline', () => {
    const bundles = []
    const enrich = (event, payload, getState) => ({
      ...payload,
      _snapshot: { hp: getState().hp },
    })
    const { registry, fire } = makeHarness({ onBundle: b => bundles.push(b), enrich })
    registry.definePipeline('enrich:test', { action: 'ENRICH_TEST' })
    registry.addHandler('enrich:test', {
      script: `State.set('hp', 42)`,
      order: 0, registeredBy: 'h',
    })

    fire('enrich:test', {})
    const entry = bundles[0].timeline.find(e => e.action === 'ENRICH_TEST')
    expect(entry.payload._snapshot.hp).toBe(42)
  })
})
