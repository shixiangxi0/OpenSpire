/**
 * evt/balatro/events.js — Balatro scoring and run lifecycle events
 */
export const EVENTS = {
  'round:start':    { action: 'ROUND_START' },
  'round:check':    { action: 'ROUND_CHECK' },
  'deck:shuffle':   { action: 'DECK_SHUFFLE' },
  'hand:draw':      { action: 'HAND_DRAW' },
  'hand:discard':   { action: 'HAND_DISCARD' },
  'hand:play':      { action: 'HAND_PLAY' },
  'hand:evaluate':  { action: 'HAND_EVALUATE' },
  // Classification mutates the event payload directly; jokers can adjust thresholds
  // or attach extra classification data before the core detector runs.
  'hand:classify':  { action: 'HAND_CLASSIFY' },
  // Resolve the final hand type and scoring cards from classify + rank-group data.
  'hand:resolve':   { action: 'HAND_RESOLVE' },
  // Build the score context, then emit per-card / joker / finalize phases.
  'score:cards':    { action: 'SCORE_CARDS' },
  'score:card':     { action: 'SCORE_CARD' },
  'score:jokers':   { action: 'SCORE_JOKERS' },
  'score:finalize': { action: 'SCORE_FINALIZE' },
};
