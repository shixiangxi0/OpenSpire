/**
 * evt/sts/index.js — STS game module
 *
 * Assembles all STS content into a single Module object that can be passed to
 * engine.use(). The evt/ engine has no knowledge of STS; everything STS
 * "knows" lives here.
 *
 * Usage:
 *   import { createEngine } from '../evt/index.js'
 *   import { stsModule }    from '../evt/sts/index.js'
 *
 *   const engine = await createEngine({ onBundle })
 *   engine.use(stsModule)
 *   engine.load(buildBattleStore(scenario))
 *   engine.state.emit('battle:start', {})
 *
 * Module structure:
 *   events      — every event slot STS uses (from engine/definitions/events.js)
 *   rules       — all static rules: universal game mechanics + STS-specific rules
 *   defs        — card / status / enemy definition objects (looked up by State.bind)
 *
 * Nothing in this file creates engine instances or knows how the engine works
 * internally. It only describes WHAT the game needs.
 */

// ── Event declarations ───────────────────────────────────────────────────────
import { EVENTS } from './events.js'

// ── Rules ────────────────────────────────────────────────────────────────────
import {
  attackCore,
  lossCore,
  damageCore,
  damageLossCore,
  entityDieEmitterCore,
  healCore,
  blockCore,
  entityDieCore,
  enemyLossAiCore,
  battleStartCore,
  battleEndCore,
  cardMoveCore,
  cardDrawCore,
  cardDiscardCore,
  cardExhaustCore,
  statusApplyCore,
  statusRemoveCore,
  playerTurnStartCore,
  turnCounterCore,
  playerTurnEndCore,
  cardPlayCore,
  cardPlayCleanupCore,
  reshuffleCore,
  actorTurnBridgeCore,
  turnSequenceCore,
  cardCreateCore,
} from './core.js'

// ── Definition data ──────────────────────────────────────────────────────────
import * as ironcladCards from './cards/ironclad.js'
import * as statusDefs    from './statuses/core.js'
import * as enemyDefs     from './enemies/index.js'

// ── Assemble the module ───────────────────────────────────────────────────────

/**
 * Helper: convert an array of definition objects keyed by `id` into a lookup map.
 * e.g. [{ id: 'strike', ... }, { id: 'defend', ... }]  →  { strike: {...}, defend: {...} }
 *
 * @param {object[]} arr
 * @returns {Record<string, object>}
 */
function byId(arr) {
  return Object.fromEntries(
    arr
      .filter(d => d !== null && typeof d === 'object' && !Array.isArray(d) && typeof d.id === 'string')
      .map(d => [d.id, d])
  )
}

export const stsModule = {
  // Every event that STS rules or scripts may emit must be declared here.
  events: EVENTS,

  // Static rules are registered once at engine.use() time and never cleared.
  // Order within this array doesn't affect execution order — only trigger.order does.
  rules: [
    // ── Entity mechanics ──────────────────────────────────────────────────
    attackCore,          // entity:attack  → entity:damage
    damageCore,          // entity:damage  → blocked absorbed, actualDamage set
    damageLossCore,      // entity:damage  → entity:loss (after block)
    lossCore,            // entity:loss    → HP reduction, actualLoss set
    entityDieEmitterCore,// entity:loss    → entity:die (when fatal)
    healCore,            // entity:heal    → HP increase (capped at maxHp)
    blockCore,           // entity:block   → status:apply { block }

    // ── STS-specific entity rules ─────────────────────────────────────────
    entityDieCore,       // entity:die     → enemy:die + slot cleanup + victory check
    enemyLossAiCore,     // entity:loss    → enemy:ai { phase='onLoss' }

    // ── Battle lifecycle ──────────────────────────────────────────────────
    battleStartCore,     // battle:start   → player:turn:start
    battleEndCore,       // battle:end     → set battle.over + battle.victory

    // ── Card pipeline ─────────────────────────────────────────────────────
    cardPlayCore,        // card:play      → deduct energy, bind card, emit card:effect, unbind
    cardPlayCleanupCore, // card:play      → discard or exhaust after effect
    cardMoveCore,        // card:move      → move between piles, emit card:drawn/discarded/exhausted
    cardDrawCore,        // card:draw      → drawPile[0] → card:move(→ hand)
    cardDiscardCore,     // card:discard   → card:move(→ discardPile)
    cardExhaustCore,     // card:exhaust   → card:move(→ exhaustPile)
    reshuffleCore,       // deck:deplete   → shuffle discardPile → drawPile

    // ── Status system ─────────────────────────────────────────────────────
    statusApplyCore,     // status:apply   → accumulate stacks, bind on first apply
    statusRemoveCore,    // status:remove  → unbind, clear stacks

    // ── Turn lifecycle ────────────────────────────────────────────────────
    playerTurnStartCore, // player:turn:start → restore energy, draw cards
    turnCounterCore,     // player:turn:start → increment turn counter
    playerTurnEndCore,   // player:turn:end   → discard hand
    actorTurnBridgeCore, // player:turn:start/end → actor:turn:start/end (for statuses)
    turnSequenceCore,    // turn:end       → enemy actions → player:turn:start
    cardCreateCore,      // card:create    → instantiate card, emit card:move
  ],

  // Definition data, keyed by kind then id.
  // All three kinds share the same schema: `triggers[]` consumed via State.bind.
  // Enemies additionally carry `actions{}` (pure UI data — intent display only, no script fields).
  defs: {
    card:   byId(Object.values(ironcladCards)),
    status: byId(Object.values(statusDefs)),
    enemy:  byId(Object.values(enemyDefs)),
  },
}
