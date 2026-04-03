/**
 * State.js — the State API shared by JS game code and Lua handler scripts.
 *
 * createState() assembles the runtime State primitives into a plain object.
 * Engine.js injects this object into the Lua VM as the global `State`, and also
 * returns it as `engine.state` for JS callers.
 *
 * bind / unbind — dynamic binding protocol
 * ─────────────────────────────────────────
 * A "dynamic binding" is how an entity acquires a behaviour at runtime.
 * Example: when 'shield' status is applied to actor 'p1', the game calls
 *   State.bind({ key: 'p1:shield', kind: 'effect', id: 'shield', ctx: { who: 'p1' } })
 * This:
 *   1. Looks up allDefs['effect']['shield'] (the module definition object)
 *   2. Registers its event hooks into the relevant pipelines under key 'p1:shield'
 *   3. Writes the binding descriptor into _store._bindings['p1:shield']
 *      (via Registry.setBinding, which avoids dot-path parsing issues with
 *       keys that themselves contain dots)
 *
 * The self-recording in step 3 is what makes load() automatic: engine.load(store)
 * iterates store._bindings and replays every bind call without any game-layer help.
 */
import { luaSafe } from './util.js'
import { getEventHooks } from './hooks.js'

/**
 * @param {object} opts
 * @param {import('./Registry.js').Registry}       opts.registry
 * @param {{ current: (event: string, payload: object) => object }} opts.fireRef
 *   Indirection avoids a circular dependency (Engine creates both State and
 *   Scheduler, then wires them via fireRef after both are constructed).
 * @param {Record<string, Record<string, object>>}  opts.allDefs
 *   Live reference; Engine.use() mutates this object as modules are loaded.
 *   State.bind reads from it at call time, so modules registered after engine
 *   creation are visible to subsequent bind calls.
 *
 * @returns {State}
 */
export function createState({ registry, fireRef, allDefs }) {
  const REQUIRED_CTX_BY_KIND = {
    card:   ['iid'],
    enemy:  ['self'],
    status: ['self'],
  }

  function _toPath(parts) {
    if (parts.length === 0) throw new Error('[State] path is required')
    return parts.map((part, idx) => {
      if (part == null) throw new Error(`[State] path segment ${idx} is ${part}`)
      const segment = String(part)
      if (segment.length === 0) {
        throw new Error(`[State] path segment ${idx} must be a non-empty string`)
      }
      if (segment.includes('.')) {
        throw new Error(`[State] path segment ${idx} must not contain "."; pass path segments separately`)
      }
      return segment
    }).join('.')
  }

  function _normalizeBinding(spec) {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      throw new Error('[State.bind] expected a binding spec object: { key, kind, id, ctx }')
    }

    const { key, kind, id, ctx = {}, slot = null } = spec
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error('[State.bind] key must be a non-empty string')
    }
    if (typeof kind !== 'string' || kind.length === 0) {
      throw new Error('[State.bind] kind must be a non-empty string')
    }
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('[State.bind] id must be a non-empty string')
    }
    if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) {
      throw new Error('[State.bind] ctx must be an object')
    }
    if (slot != null && (!Number.isInteger(slot) || slot < 0)) {
      throw new Error('[State.bind] slot must be a non-negative integer when provided')
    }
    return {
      key,
      kind,
      id,
      slot,
      moduleId: `${kind}/${id}`,
      ctx,
      descriptor: { kind, id, ctx, slot },
    }
  }

  function _validateContext(kind, ctx, caller) {
    const requiredKeys = REQUIRED_CTX_BY_KIND[kind]
    if (!requiredKeys) return
    for (const ctxKey of requiredKeys) {
      if (typeof ctx?.[ctxKey] !== 'string' || ctx[ctxKey].length === 0) {
        throw new Error(`[State.${caller}] "${kind}" requires ctx.${ctxKey} to be a non-empty string`)
      }
    }
  }

  const State = {
    /**
     * Read a value from the state tree.
     * Returns undefined when the path does not exist (null-safe).
     * Object values are deep-stripped of nulls before returning to Lua
     * (wasmoon crashes if it receives a JS null).
     *
     * @param {...string} parts
     * @returns {any}
     */
    get(...parts) {
      const path = _toPath(parts)
      const v = registry.get(path)
      if (v == null) return undefined
      return typeof v === 'object' ? luaSafe(v) : v
    },

    /**
     * Write a value to the state tree.
     * null/undefined deletes the key.
     *
     * Normalisation: wasmoon converts an empty Lua table ({}) to an empty JS
     * plain object ({}). If the current value at `path` is an array, we treat
     * the incoming {} as an empty array [] to preserve array semantics.
     *
     * @param {...any} partsAndValue
     */
    set(...partsAndValue) {
      if (partsAndValue.length < 2) {
        throw new Error('[State.set] expected path plus value')
      }
      let value = partsAndValue.pop()
      const path = _toPath(partsAndValue)
      if (
        value != null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).length === 0 &&
        Array.isArray(registry.get(path))
      ) {
        value = []
      }
      registry.set(path, value ?? null)
    },

    /**
     * Trigger an event. Execution is synchronous and depth-first.
     * Returns the (possibly mutated) payload after all handlers have run.
     *
     * @param {string} event
     * @param {object} [payload={}]
     * @returns {object}
     */
    emit(event, payload) {
      return fireRef.current(event, payload ?? {})
    },

    /**
     * Dynamically bind a module definition to the event pipeline.
     *
     * Idempotent: calling bind() with the same key again first removes the
     * previous registration, then registers fresh — no duplicate handlers.
     *
     * Self-recording: writes the bind descriptor into _bindings so that
     * engine.load() can replay this exact call without any game-layer help.
     *
     * @param {{ key: string, kind: string, id: string, ctx?: object, slot?: number | null }} spec
     */
    bind(spec) {
      const binding = _normalizeBinding(spec)
      const { key, kind, id, moduleId: normalizedModuleId, ctx, slot } = binding
      const def  = allDefs[kind]?.[id]
      if (!def) {
        throw new Error(`[State.bind] def not found: "${normalizedModuleId}" — did you call engine.use() before bind?`)
      }
      if (ctx) _validateContext(kind, ctx, 'bind')

      // Validate all referenced hook events are declared before making any state changes.
      // This ensures bind() is atomic: either fully succeeds or leaves state untouched.
      for (const t of getEventHooks(def)) {
        if (!registry.getPipeline(t.name)) {
          throw new Error(`[State.bind] "${normalizedModuleId}" references undeclared event "${t.name}" — declare it in module.events before calling bind()`)
        }
      }

      registry.unregister(key)                                       // idempotent clear
      registry.register(def, { registeredBy: key, ctx, slot })       // install handlers
      registry.setBinding(key, binding.descriptor)                   // self-record
    },

    /**
     * Remove a dynamic binding and delete its self-record.
     * Safe to call for a key that was never bound (no-op).
     *
     * @param {string} key
     */
    unbind(key) {
      registry.unregister(key)
      registry.setBinding(key, null)
    },
  }

  return State
}

/**
 * @typedef {ReturnType<typeof createState>} State
 */
