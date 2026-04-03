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
import { getEventHooks } from './hooks.js'

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
 * Register all event hooks from a module definition into their respective pipelines.
 *
 * @param {{ id: string, hooks?: object }} moduleDef
   * @param {{ registeredBy?: string, ctx?: object, slot?: number | null }} [opts]
   *   registeredBy — key used by unregister(); defaults to moduleDef.id.
   *   ctx          — structured context for this binding instance; exposed to Lua as Ctx.
   */
  register(moduleDef, { registeredBy, ctx = {}, slot = null } = {}) {
    if (!moduleDef?.id) throw new Error('[Registry] register: moduleDef.id is required')
    const owner = registeredBy ?? moduleDef.id
    for (const t of getEventHooks(moduleDef)) {
      this.addHandler(t.name, {
        script:       t.script,
        order:        t.order ?? 0,
        slot,
        registeredBy: owner,
        moduleId:     moduleDef.id,
        ctx,
        match:        t.match ?? null,
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
   * Higher order values execute first.
   * When order is equal and both handlers define `slot`, lower slots execute first.
   * Remaining ties preserve insertion order.
   *
   * Throws if the event has not been declared via definePipeline().
   *
   * @param {string} event
   * @param {{ script: string, order?: number, slot?: number | null, registeredBy: string, moduleId?: string, ctx?: object }} handler
   */
  addHandler(event, { script, order = 0, slot = null, registeredBy, moduleId, ctx = {}, match = null } = {}) {
    const pipeline = this._pipelines.get(event)
    if (!pipeline) {
      const moduleLabel = moduleId ? ` (module: "${moduleId}")` : ''
      throw new Error(`[Registry] addHandler: undeclared event "${event}"${moduleLabel} — call definePipeline first`)
    }
    if (typeof script !== 'string') {
      throw new Error(`[Registry] addHandler: script must be a string (event: "${event}")`)
    }
    if (match != null) {
      if (typeof match !== 'object' || Array.isArray(match)) {
        throw new Error(`[Registry] addHandler: match must be an object (event: "${event}")`)
      }
      const entries = Object.entries(match)
      if (entries.length === 0) {
        throw new Error(`[Registry] addHandler: match must not be empty (event: "${event}")`)
      }
      for (const [payloadKey, ctxKey] of entries) {
        if (typeof payloadKey !== 'string' || payloadKey.length === 0) {
          throw new Error(`[Registry] addHandler: match payload keys must be non-empty strings (event: "${event}")`)
        }
        if (typeof ctxKey !== 'string' || ctxKey.length === 0) {
          throw new Error(`[Registry] addHandler: match ctx keys must be non-empty strings (event: "${event}")`)
        }
        if (ctx?.[ctxKey] == null) {
          throw new Error(`[Registry] addHandler: match for "${event}" references missing ctx.${ctxKey}`)
        }
      }
    }
    this._insertSorted(pipeline.handlers, { script, order, slot, registeredBy, moduleId, ctx, match })
  }

  /**
   * @param {string} event
   * @returns {{ action: string, handlers: Handler[] } | null}
   */
  getPipeline(event) { return this._pipelines.get(event) ?? null }

  // ─── Private ───────────────────────────────────────────────────────────────

  /**
   * Stable insertion by:
   *   1. descending `order`
   *   2. ascending `slot` when both sides define one
   *   3. insertion order for all remaining ties
   *
   * Binary search finds the first index i where the current item should sort ahead
   * of arr[i], while preserving FIFO for equal keys.
   */
  _insertSorted(arr, item) {
    let lo = 0, hi = arr.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      const current = arr[mid]
      const sameOrder = current.order === item.order
      const bothSlotted = sameOrder && current.slot != null && item.slot != null

      if (current.order > item.order) {
        lo = mid + 1
      } else if (current.order < item.order) {
        hi = mid
      } else if (bothSlotted && current.slot < item.slot) {
        lo = mid + 1
      } else if (bothSlotted && current.slot > item.slot) {
        hi = mid
      } else {
        lo = mid + 1
      }
    }
    arr.splice(lo, 0, item)
  }
}

// ─── Type documentation (JSDoc only, no runtime overhead) ──────────────────

/**
 * @typedef {{ path: string, before: any, after: any }} Patch
 * @typedef {{ script: string, order: number, slot?: number | null, registeredBy: string, moduleId?: string, ctx?: object, match?: object | null }} Handler
 * @typedef {{ action: string, handlers: Handler[] }} Pipeline
 */
