/**
 * evt/balatro/index.js — Balatro module assembly
 */
import { EVENTS } from './events.js';
import {
  roundStartCore,
  deckShuffleCore,
  handDrawCore,
  handDiscardCore,
  handPlayCore,
  handEvaluateCore,
  handResolveCore,
  handClassifyCore,
  scoreCardsCore,
  scoreCardValueCore,
  scoreFinalizeCore,
  roundCheckCore,
} from './core.js';
import * as builtinJokerModules from './jokers/core.js';
import { localizeJokerDisplay } from './locale.js';

function byId(values) {
  return Object.fromEntries(
    Object.values(values)
      .filter(d => d !== null && typeof d === 'object' && !Array.isArray(d) && typeof d.id === 'string')
      .map(d => [d.id, d]),
  );
}

export const builtinJokerDefs = byId(builtinJokerModules);

export function createJokerDisplayMap(defs = builtinJokerDefs, lang = 'zh') {
  return localizeJokerDisplay(defs, lang);
}

export const jokerDisplayMap = createJokerDisplayMap();

export const balatroModule = {
  events: EVENTS,
  rules: [
    roundStartCore,
    deckShuffleCore,
    handDrawCore,
    handDiscardCore,
    handPlayCore,
    handEvaluateCore,
    handResolveCore,
    handClassifyCore,
    scoreCardsCore,
    scoreCardValueCore,
    scoreFinalizeCore,
    roundCheckCore,
  ],
  defs: {
    joker: builtinJokerDefs,
  },
};
