/**
 * Engine.js — assembly and public API.
 *
 * createEngine() wires together Registry, Runtime, State, and Scheduler.
 * It exposes four things to the outside world:
 *
 *   use(module)   register a game module (events / rules / defs)
 *   load(store)   restore a saved state and replay dynamic bindings
 *   getState()    snapshot of the current state tree (safe to serialise)
 *   state         the live State object (JS & Lua share the same reference)
 *
 * Notable: startBattle, playCard, endTurn — none of these exist here.
 * Game-specific orchestration lives in the game layer, not the engine.
 */
import { Registry }        from './Registry.js'
import { Runtime }         from './Runtime.js'
import { createState }     from './State.js'
import { createScheduler } from './Scheduler.js'

/**
 * Create and initialise an Engine instance.
 *
 * @param {object}   [opts={}]
 * @param {(bundle: Bundle) => void} [opts.onBundle]
 *   Called synchronously after every root-level event completes.
 *   Receives the Bundle with all state patches and the event timeline.
 *
 * @param {boolean}  [opts.debug=false]
 *   When true, logs a one-line summary of each bundle to the console.
 *
 * @param {EnrichFn} [opts.enrich]
 *   Optional payload transformer invoked after each event pipeline.
 *   Signature: (name, payload, getState) => enrichedPayload
 *
 * @returns {Promise<Engine>}
 */
export async function createEngine({ onBundle = () => {}, debug = false, enrich } = {}) {
  const registry = new Registry()
  const runtime  = new Runtime()
  await runtime.init()

  // fireRef breaks the circular dependency:
  //   State.emit → fire   (State needs fire)
  //   createScheduler     (needs state indirectly via callbacks)
  // We construct State first with unresolved fireRef, then assign fire after.
  const fireRef = { current: null }

  // allDefs is the live lookup table for bind().
  // Engine.use() merges module.defs into it; State.bind reads from it at call time.
  // Passed by reference so later use() calls are immediately visible to bind.
  const allDefs = {}
  const staticRuleIds = new Set()

  const state = createState({ registry, fireRef, allDefs })

  const fire = createScheduler({
    registry,
    runtime,
    enrich,
    onBundle(bundle) {
      if (debug) {
        const { rootEvent, patches, timeline } = bundle
        console.log(`[Engine] ${rootEvent} — ${patches.length} patches, ${timeline.length} actions`)
      }
      onBundle(bundle)
    },
  })

  fireRef.current = fire
  runtime.set('State', state)

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * Unregister all handlers that were installed via bind() and clear _bindings.
   * Called at the start of load() before the state tree is replaced.
   *
   * Reads the live _bindings map (not the incoming store) so that handlers
   * from the PREVIOUS session are removed, not the ones about to be loaded.
   */
  function _clearDynamic() {
    for (const key of Object.keys(registry.getBindings())) {
      registry.unregister(key)
    }
    // _bindings will be wiped by resetState(); nothing more to do here
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Build the Lua-visible def catalog by stripping non-data fields (hooks, display).
   * Injected as the Lua global `Defs` after each use() call that includes defs.
   * Scripts access it as: Defs.card.anger, Defs.enemy.jaw_worm, etc.
   */
  function _buildDefCatalog(defs) {
    const catalog = {}
    for (const [kind, entries] of Object.entries(defs)) {
      catalog[kind] = {}
      for (const [id, def] of Object.entries(entries)) {
        const { hooks: _h, display: _d, ...base } = def
        catalog[kind][id] = base
      }
    }
    return catalog
  }

  /**
   * Register a game module. May be called multiple times in any order, as long
   * as event declarations appear before any rule that references them.
   *
   * Processing order within a single use() call:
   *   1. events  — definePipeline
   *   2. rules   — register static handlers (permanent, never cleared by load)
   *   3. defs    — merge into allDefs; rebuild Lua Defs global
   *
   * @param {Module} module
   */
  function use(module) {
    // 1. Declare event slots
    for (const [event, conf] of Object.entries(module.events ?? {})) {
      registry.definePipeline(event, conf)
    }

    // 2. Register static (permanent) rules
    for (const rule of module.rules ?? []) {
      if (staticRuleIds.has(rule.id)) {
        throw new Error(`[Engine.use] duplicate rule id "${rule.id}"`)
      }
      staticRuleIds.add(rule.id)
      registry.register(rule, { registeredBy: rule.id })
    }

    // 3. Merge definition data (looked up by State.bind).
    //    Re-inject the Defs global so Lua scripts can read def metadata (e.g. card:create).
    if (module.defs) {
      for (const [kind, entries] of Object.entries(module.defs)) {
        allDefs[kind] ??= {}
        for (const [id, def] of Object.entries(entries)) {
          if (allDefs[kind][id]) {
            throw new Error(`[Engine.use] duplicate def "${kind}/${id}"`)
          }
          allDefs[kind][id] = def
        }
      }
      runtime.set('Defs', _buildDefCatalog(allDefs))
    }

    if (typeof module.extensions === 'function') {
      throw new Error('[Engine.use] module.extensions is no longer supported; add explicit APIs in core/game instead')
    }
  }

  /**
   * Load a stored state snapshot.
   *
   * Steps:
   *   1. Clear all current dynamic bindings (handlers installed by bind())
   *   2. Replace the entire state tree with the stored snapshot
   *   3. Replay every binding from store._bindings (restores all dynamic handlers)
   *   4. Discard setup patches — the first game event's bundle is clean
   *
   * After load() returns, the engine is ready to receive events.
   * Static rules (registered via use()) are unaffected by load().
   *
   * @param {object} store  A value previously returned by getState(), or a
   *                        hand-crafted initial state for a new game session.
   *                        store._bindings (if present) will be replayed.
   */
  function load(store) {
    _clearDynamic()
    registry.resetState(store)
    for (const [key, desc] of Object.entries(store._bindings ?? {})) {
      if (!desc?.kind || !desc?.id) {
        throw new Error(`[Engine.load] invalid binding descriptor for "${key}" — expected { kind, id, ctx }`)
      }
      state.bind({ key, kind: desc.kind, id: desc.id, ctx: desc.ctx ?? {}, slot: desc.slot ?? null })
    }
    // Discard patches produced during bind replay — they are setup noise
    registry.flushPatches()
  }

  /**
   * Return a deep-clone snapshot of the current state tree.
   * The returned object is safe to JSON.stringify and use as a save file.
   * It includes _bindings, which load() uses to restore dynamic handlers.
   *
   * @returns {object}
   */
  function getState() {
    return registry.getState()
  }

  return { use, load, getState, state }
}

// ─── Type documentation ───────────────────────────────────────────────────────

/**
 * @typedef {object} Module
 * @property {Record<string, { action?: string }>} [events]
 *   Event slot declarations. Keys are event names; action is the constant stored
 *   in timeline entries (defaults to uppercased event name with ':' → '_').
 *
 * @property {ModuleDef[]} [rules]
 *   Static handlers registered permanently when use() is called.
 *   Each rule must have a globally unique `id`.
 *
 * @property {Record<string, Record<string, ModuleDef>>} [defs]
 *   Definition data keyed by kind and id.
 *   e.g. { effect: { shield: { id:'shield', hooks:{...} } } }
 *   Made available to State.bind({ key, kind: 'effect', id: 'shield', ctx }).
 *
 * @typedef {{ id: string, hooks: Record<string, string | { script: string, order?: number, match?: Record<string, string> }> }} ModuleDef
 *
 * @typedef {object} Bundle
 * @property {string}          rootEvent
 * @property {import('./Registry.js').Patch[]}       patches
 * @property {TimelineEntry[]} timeline
 *
 * @typedef {object} TimelineEntry
 * @property {string} action
 * @property {string} event
 * @property {number} seq
 * @property {object} payload
 *
 * @typedef {(name: string, payload: object, getState: () => object) => object} EnrichFn
 *
 * @typedef {object} Engine
 * @property {(module: Module) => void}    use
 * @property {(store: object) => void}     load
 * @property {() => object}                getState
 * @property {import('./State.js').State}  state
 */
