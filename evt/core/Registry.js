/**
 * Registry.js — state tree + event pipeline storage.
 *
 * Single responsibility: pure data structure.
 * No business logic, no game concepts, no side-effects beyond mutations of its
 * own fields.
 *
 * Two independent storage areas:
 *   _store     — the application state tree, exposed via getState()
 *   _bindings  — a flat map nested inside _store._bindings (part of the state,
 *                persisted in saves). Managed via setBinding/getBindings so that
 *                bind keys containing dots ('actors.e1:shield') are handled safely
 *                without conflicting with the dot-path parser used by set/get.
 */
import { setPath, deepClone } from './util.js'

export class Registry {
  constructor() {
    this._store     = {}              // application state tree
    this._patches   = []             // pending Patch[] since last flushPatches()
    this._pipelines = new Map()      // event → Pipeline
  }

  // ─── State tree ────────────────────────────────────────────────────────────

  /**
   * Read a value at a dot-delimited path.
   * Returns undefined (not null) when the path does not exist.
   *
   * @param {string} path
   * @returns {any}
   */
  get(path) {
    return path.split('.').reduce((o, k) => (o != null ? o[k] : undefined), this._store)
  }

  /**
   * Write a value at a dot-delimited path and record a Patch.
   * value === null deletes the key (records after: null).
   *
   * @param {string} path
   * @param {any}    value
   */
  set(path, value) {
    const before = this.get(path) ?? null
    const after  = value ?? null
    if (before === after) return
    setPath(this._store, path, after)
    this._patches.push({ path, before, after })
  }

  /**
   * Drain all accumulated patches since the last call to flushPatches().
   * Resets the internal buffer.
   *
   * @returns {Patch[]}
   */
  flushPatches() {
    const result = this._patches.slice()
    this._patches.length = 0
    return result
  }

  /**
   * Internal mutable reference to the live state tree.
   * Only the Scheduler and Engine should call this — never external consumers.
   *
   * @returns {object}
   */
  peekState() { return this._store }

  /**
   * Deep-clone snapshot of the state tree for external consumers.
   * Includes _bindings (necessary for save files).
   *
   * @returns {object}
   */
  getState() { return deepClone(this._store) }

  /**
   * Replace the entire state tree and discard all pending patches.
   * Called by Engine.load() to install a restored save.
   *
   * @param {object} [nextStore={}]
   */
  resetState(nextStore = {}) {
    this._store = deepClone(nextStore)
    this._patches.length = 0
  }

  // ─── _bindings (direct map, key-safe) ─────────────────────────────────────

  /**
   * Write or delete a single binding descriptor.
   * Uses direct object mutation on _store._bindings (not setPath) so that bind
   * keys containing '.' characters are stored as literal map keys.
   * Records a Patch for observability (filtered by game renderers if unwanted).
   *
   * @param {string}                          key
   * @param {{ kind?: string, id?: string, ctx?: object } | null} descriptor  null → delete
   */
  setBinding(key, descriptor) {
    if (!this._store._bindings) this._store._bindings = {}
    const before = this._store._bindings[key] ?? null
    const after  = descriptor ?? null
    if (after === null) {
      delete this._store._bindings[key]
    } else {
      this._store._bindings[key] = after
    }
    this._patches.push({ path: `_bindings.${key}`, before, after })
  }

  /**
   * Return the current _bindings map (the live internal reference).
   * Read-only from the caller's perspective.
   *
   * @returns {Record<string, { kind?: string, id?: string, ctx?: object }>}
   */
  getBindings() { return this._store._bindings ?? {} }

  // ─── Pipelines ─────────────────────────────────────────────────────────────

  /**
   * Declare an event slot.
   * Must be called before addHandler/register for this event.
   * Duplicate declarations throw.
   *
   * @param {string} event
   * @param {{ action?: string }} [opts]
   *   action — the ACTION constant emitted in timeline entries.
   *             Defaults to uppercased event name with ':' replaced by '_'.
   */
  definePipeline(event, { action } = {}) {
    if (this._pipelines.has(event)) {
      throw new Error(`[Registry] definePipeline: event "${event}" is already declared`)
    }
    this._pipelines.set(event, {
      action:   action ?? event.toUpperCase().replace(/:/g, '_'),
      handlers: [],
    })
  }

  /**
   * Register all triggers from a module definition into their respective pipelines.
   *
   * @param {{ id: string, triggers?: Trigger[] }} moduleDef
   * @param {{ registeredBy?: string, ctx?: object }} [opts]
   *   registeredBy — key used by unregister(); defaults to moduleDef.id.
   *   ctx          — structured context for this binding instance; exposed to Lua as Ctx.
   */
  register(moduleDef, { registeredBy, ctx = {} } = {}) {
    if (!moduleDef?.id) throw new Error('[Registry] register: moduleDef.id is required')
    const owner = registeredBy ?? moduleDef.id
    for (const t of moduleDef.triggers ?? []) {
      this.addHandler(t.event, {
        script:       t.script,
        order:        t.order ?? 0,
        registeredBy: owner,
        moduleId:     moduleDef.id,
        ctx,
      })
    }
  }

  /**
   * Remove all handlers whose registeredBy === key from every pipeline.
   * Safe to call for a key that has no registered handlers (no-op).
   *
   * @param {string} key
   */
  unregister(key) {
    for (const p of this._pipelines.values())
      p.handlers = p.handlers.filter(h => h.registeredBy !== key)
  }

  /**
   * Insert a single handler into a pipeline, sorted by order descending (stable).
   * Higher order values execute first; equal-order handlers execute in registration order.
   *
   * Throws if the event has not been declared via definePipeline().
   *
   * @param {string} event
   * @param {{ script: string, order?: number, registeredBy: string, moduleId?: string, ctx?: object }} handler
   */
  addHandler(event, { script, order = 0, registeredBy, moduleId, ctx = {} } = {}) {
    const pipeline = this._pipelines.get(event)
    if (!pipeline) {
      const moduleLabel = moduleId ? ` (module: "${moduleId}")` : ''
      throw new Error(`[Registry] addHandler: undeclared event "${event}"${moduleLabel} — call definePipeline first`)
    }
    if (typeof script !== 'string') {
      throw new Error(`[Registry] addHandler: script must be a string (event: "${event}")`)
    }
    this._insertSorted(pipeline.handlers, { script, order, registeredBy, moduleId, ctx })
  }

  /**
   * @param {string} event
   * @returns {{ action: string, handlers: Handler[] } | null}
   */
  getPipeline(event) { return this._pipelines.get(event) ?? null }

  // ─── Private ───────────────────────────────────────────────────────────────

  /**
   * Stable descending insertion by `order`.
   * "Stable" means equal-order items preserve insertion order (FIFO).
   *
   * Binary search finds the first index i where arr[i].order < item.order
   * (i.e., item goes before arr[i], after all items with the same or higher order).
   */
  _insertSorted(arr, item) {
    let lo = 0, hi = arr.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      // Move past items with strictly greater OR equal order → stable
      arr[mid].order >= item.order ? (lo = mid + 1) : (hi = mid)
    }
    arr.splice(lo, 0, item)
  }
}

// ─── Type documentation (JSDoc only, no runtime overhead) ──────────────────

/**
 * @typedef {{ path: string, before: any, after: any }} Patch
 * @typedef {{ event: string, order?: number, script: string }} Trigger
 * @typedef {{ script: string, order: number, registeredBy: string, moduleId?: string, ctx?: object }} Handler
 * @typedef {{ action: string, handlers: Handler[] }} Pipeline
 */
