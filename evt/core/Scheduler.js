/**
 * Scheduler.js — the event execution loop.
 *
 * createScheduler() returns the public `fire(event, payload)` function.
 * Nested emits share the same depth counter, sequence counter, timeline buffer,
 * and root bundle emission.
 */

/**
 * @param {object} opts
 * @param {import('./Registry.js').Registry} opts.registry
 * @param {import('./Runtime.js').Runtime}   opts.runtime
 * @param {(bundle: object) => void}         opts.onBundle
 * @param {((name: string, payload: object, getState: () => object) => object) | undefined}
 *   opts.enrich   Optional payload transformer called after all handlers run.
 *
 * @returns {(event: string, payload?: object) => object}
 */
export function createScheduler({ registry, runtime, onBundle, enrich }) {
  let depth      = 0
  let timeline   = []
  let seqCounter = 0
  const executing = new Set()

  function sanitizeTable(value) {
    if (!value || typeof value !== 'object') return value
    const clean = Array.isArray(value) ? [] : {}
    for (const [k, v] of Object.entries(value)) {
      if (v !== null && v !== undefined) clean[k] = v
    }
    return clean
  }

  function withInvocation(rootEvent, execute) {
    const isRoot = (depth === 0)
    if (isRoot) {
      timeline = []
      seqCounter = 0
    }

    depth++
    const mySeq = seqCounter++

    try {
      return execute(mySeq)
    } finally {
      depth--

      if (isRoot) {
        const bundle = {
          rootEvent,
          patches:  registry.flushPatches(),
          timeline: timeline.slice(),
        }
        timeline = []
        onBundle(bundle)
      }
    }
  }

  function enrichPayload(name, payload) {
    return enrich
      ? enrich(name, payload, () => registry.peekState())
      : { ...payload }
  }

  function recordTimelineEntry(entry, name, payload, seq) {
    timeline.push({
      ...entry,
      seq,
      payload: enrichPayload(name, payload),
    })
  }

  function matchesFilter(handler, payload) {
    if (!handler.match) return true
    for (const [payloadKey, ctxKey] of Object.entries(handler.match)) {
      if (payload[payloadKey] !== handler.ctx[ctxKey]) return false
    }
    return true
  }

  function runGuarded(guard, script, payload, ctx) {
    if (executing.has(guard)) return
    executing.add(guard)
    try {
      runtime.runScript(script, payload, ctx ?? {}, depth > 1)
    } finally {
      executing.delete(guard)
    }
  }

  function fire(event, payload = {}) {
    payload = sanitizeTable(payload ?? {})

    const pipeline = registry.getPipeline(event)
    if (!pipeline) {
      throw new Error(`[Scheduler] No pipeline for event "${event}" — declare it in module.events first`)
    }

    return withInvocation(event, (mySeq) => {
      const snapshot = pipeline.handlers.slice()

      for (const h of snapshot) {
        if (payload.cancelled) break
        if (!pipeline.handlers.includes(h)) continue
        if (!matchesFilter(h, payload)) continue

        runGuarded(`${h.registeredBy}:${event}`, h.script, payload, h.ctx ?? {})
      }

      if (pipeline.action && !payload.cancelled) {
        recordTimelineEntry(
          { kind: 'event', action: pipeline.action, event },
          event,
          payload,
          mySeq,
        )
      }

      return payload
    })
  }

  return fire
}
