/**
 * hooks.js — normalize definition hooks into a common runtime shape.
 *
 * Modules express behaviour via unified `hooks{}` keyed by event name:
 *   - 'event:<eventName>'
 *
 * Values may be either:
 *   - a Lua script string
 *   - { script: string, order?: number, match?: Record<string, string> }
 */

const EVENT_PREFIX = 'event:'

function normalizeMatch(key, match) {
  if (match == null) return null
  if (typeof match !== 'object' || Array.isArray(match)) {
    throw new Error(`[hooks] "${key}.match" must be an object mapping payload keys to ctx keys`)
  }

  const entries = Object.entries(match)
  if (entries.length === 0) {
    throw new Error(`[hooks] "${key}.match" must not be empty`)
  }

  const normalized = {}
  for (const [payloadKey, ctxKey] of entries) {
    if (typeof payloadKey !== 'string' || payloadKey.length === 0) {
      throw new Error(`[hooks] "${key}.match" payload keys must be non-empty strings`)
    }
    if (typeof ctxKey !== 'string' || ctxKey.length === 0) {
      throw new Error(`[hooks] "${key}.match.${payloadKey}" must be a non-empty ctx key string`)
    }
    normalized[payloadKey] = ctxKey
  }
  return normalized
}

function normalizeHookValue(key, value) {
  if (typeof value === 'string') return { script: value, order: 0, match: null }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`[hooks] "${key}" must be a script string or { script, order?, match? }`)
  }
  if (typeof value.script !== 'string') {
    throw new Error(`[hooks] "${key}.script" must be a string`)
  }
  if (value.order != null && !Number.isFinite(value.order)) {
    throw new Error(`[hooks] "${key}.order" must be a finite number`)
  }
  return {
    script: value.script,
    order:  value.order ?? 0,
    match:  normalizeMatch(key, value.match),
  }
}

export function getEventHooks(def) {
  const hooks = []
  const map = def?.hooks
  if (!map) return hooks
  if (typeof map !== 'object' || Array.isArray(map)) {
    throw new Error('[hooks] def.hooks must be an object')
  }

  for (const [key, raw] of Object.entries(map)) {
    const base = normalizeHookValue(key, raw)
    if (!key.startsWith(EVENT_PREFIX)) {
      throw new Error(`[hooks] unsupported hook key "${key}" — expected "event:<name>"`)
    }

    const name = key.slice(EVENT_PREFIX.length)
    if (!name) throw new Error(`[hooks] "${key}" must include an event name after "event:"`)
    hooks.push({
      name,
      order:  base.order,
      script: base.script,
      match:  base.match,
    })
  }

  return hooks
}
