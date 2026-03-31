/**
 * Scheduler.js — the event execution loop.
 *
 * createScheduler() returns a single `fire(event, payload)` function.
 * The scheduler maintains a small amount of per-invocation state (depth counter,
 * current timeline, sequence counter, anti-recursion set) as a closure.
 *
 * Execution rules
 * ───────────────
 * 1. Depth-first synchronous. When a handler calls State.emit(), the nested
 *    fire() runs to completion before the outer handler continues.
 *
 * 2. Handler snapshot. Handlers are snapshotted at the start of each pipeline
 *    run. Handlers registered during execution don't affect the current run;
 *    handlers unregistered during execution are skipped via an includes() check.
 *
 * 3. Anti-recursion. If handler H on event E calls emit(E) which re-enters the
 *    same pipeline, H is suppressed on re-entry (its registeredBy:event key is
 *    in the `executing` set). Other handlers in the pipeline are NOT suppressed.
 *    This prevents a single handler from recursing into itself indefinitely while
 *    allowing the rest of the pipeline to process the re-emitted event normally.
 *
 * 4. Cancellation. handlers can set Event.cancelled = true to stop the remaining
 *    handlers in the current pipeline. Nested events are unaffected.
 *
 * 5. Bundle emission. Exactly one Bundle is produced per root-level fire() call
 *    (depth 0 → depth 0 transition). Nested fire() calls contribute their
 *    timeline entries to the root's bundle; they do not call onBundle themselves.
 *
 * Bundle shape
 * ────────────
 * {
 *   rootEvent: string,
 *   patches:   Patch[],          // all state changes in chronological order
 *   timeline:  TimelineEntry[],  // one entry per non-cancelled pipeline that has an action
 * }
 *
 * TimelineEntry shape
 * ────────────────────
 * {
 *   action:  string,   // the pipeline's action constant (e.g. 'ACTOR_DAMAGE')
 *   event:   string,   // the raw event name
 *   seq:     number,   // 0 = root event, increments per nested event
 *   payload: object,   // result of enrich(event, payload, getState) — or {...payload}
 * }
 */

/**
 * @param {object} opts
 * @param {import('./Registry.js').Registry} opts.registry
 * @param {import('./Runtime.js').Runtime}   opts.runtime
 * @param {(bundle: object) => void}         opts.onBundle
 * @param {((event: string, payload: object, getState: () => object) => object) | undefined}
 *   opts.enrich   Optional payload transformer called after all handlers run.
 *                 Receives the raw payload and a getState() accessor.
 *                 Return value is stored as the timeline entry's payload.
 *                 Use it to attach UI snapshots (e.g. current HP after damage).
 *                 If omitted, a shallow copy of payload is used.
 *
 * @returns {(event: string, payload?: object) => object}
 */
export function createScheduler({ registry, runtime, onBundle, enrich }) {
  let depth      = 0        // nesting depth; 0 = top-level call
  let timeline   = []       // accumulated TimelineEntry[] for current root event
  let seqCounter = 0        // monotonically increasing per root event
  const executing = new Set()  // '<registeredBy>:<event>' anti-recursion guards

  // ─── Internal: run one handler ────────────────────────────────────────────

  function runHandler(handler, event, payload) {
    const guard = `${handler.registeredBy}:${event}`
    if (executing.has(guard)) return   // suppress re-entry of this exact handler
    executing.add(guard)
    try {
      // depth > 1 means we're inside a nested emit; Runtime saves/restores Event/Ctx
      runtime.runScript(handler.script, payload, handler.ctx ?? {}, depth > 1)
    } finally {
      executing.delete(guard)
    }
  }

  // ─── Public: fire an event ────────────────────────────────────────────────

  /**
   * Fire an event synchronously.
   *
   * @param {string} event
   * @param {object} [payload={}]
   * @returns {object}  payload after all handlers have run (may be mutated by handlers)
   */
  return function fire(event, payload = {}) {
    // Strip JS null values — wasmoon will crash if it receives null
    if (payload && typeof payload === 'object') {
      const clean = {}
      for (const [k, v] of Object.entries(payload)) {
        if (v !== null && v !== undefined) clean[k] = v
      }
      payload = clean
    }

    const pipeline = registry.getPipeline(event)
    if (!pipeline) {
      throw new Error(`[Scheduler] No pipeline for event "${event}" — declare it in module.events first`)
    }

    const isRoot = (depth === 0)
    if (isRoot) { timeline = []; seqCounter = 0 }

    depth++
    const mySeq = seqCounter++

    try {
      // Snapshot: isolates this run from handlers added or removed mid-execution
      const snapshot = pipeline.handlers.slice()

      for (const h of snapshot) {
        if (payload.cancelled) break

        // Handler was unregistered after the snapshot was taken — skip it
        if (!pipeline.handlers.includes(h)) continue

        runHandler(h, event, payload)
      }

      // Record a timeline entry if the pipeline has a named action and wasn't cancelled
      if (pipeline.action && !payload.cancelled) {
        const enrichedPayload = enrich
          ? enrich(event, payload, () => registry.peekState())
          : { ...payload }

        timeline.push({
          action:  pipeline.action,
          event,
          seq:     mySeq,
          payload: enrichedPayload,
        })
      }
    } finally {
      depth--

      if (isRoot) {
        // Capture before clearing — onBundle may call fire() itself (unlikely but safe)
        const bundle = {
          rootEvent: event,
          patches:   registry.flushPatches(),
          timeline:  timeline.slice(),
        }
        timeline = []
        onBundle(bundle)
      }
    }

    return payload
  }
}
