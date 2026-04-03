/**
 * evt/balatro/session.js — Balatro session wrapper
 */
import { createEngine } from '../index.js';
import { balatroModule, builtinJokerDefs, createJokerDisplayMap } from './index.js';
import { buildRoundStore } from './builder.js';
import { createBalatroPresenter, cardLabelForId } from './presenter.js';

async function createBalatroEngine(extraJokers = {}, onBundle = () => {}) {
  const engine = await createEngine({ onBundle });
  engine.use(balatroModule);
  if (Object.keys(extraJokers).length > 0) {
    engine.use({ defs: { joker: extraJokers } });
  }
  return engine;
}

export async function createBalatroSession(opts = {}, extras = {}) {
  const lang = opts.lang ?? 'zh';
  const extraJokers = extras.jokers ?? {};
  const allJokerDefs = { ...builtinJokerDefs, ...extraJokers };
  const jokerDisplayMap = createJokerDisplayMap(allJokerDefs, lang);

  const engine = await createBalatroEngine(extraJokers);
  const previewEngine = await createBalatroEngine(extraJokers);
  engine.load(buildRoundStore(opts));
  engine.state.emit('round:start', {});

  const presenter = createBalatroPresenter({ jokerDefs: jokerDisplayMap, lang });

  function diffDrawnCards(before, after) {
    const beforeHand = new Set(before.hand ?? []);
    return (after.hand ?? []).filter(id => !beforeHand.has(id));
  }

  function toResponse(before, after) {
    const drawn = diffDrawnCards(before, after);
    return {
      state: after,
      result: after.lastResult,
      viewState: presenter.buildViewState(after),
      drawn,
      drawnLabels: drawn.map(id => cardLabelForId(id, after.cards)),
    };
  }

  return {
    playHand(cardIds = engine.getState().hand.slice()) {
      const before = engine.getState();
      engine.state.emit('hand:play', { cards: cardIds });
      return toResponse(before, engine.getState());
    },

    discardCards(cardIds) {
      const before = engine.getState();
      engine.state.emit('hand:discard', { cards: cardIds });
      return toResponse(before, engine.getState());
    },

    getState() {
      return engine.getState();
    },

    getViewState(selectedIds = [], sortMode = 'rank') {
      return presenter.buildViewState(engine.getState(), selectedIds, sortMode);
    },

    previewHand(cardIds) {
      if (!Array.isArray(cardIds) || cardIds.length === 0) return null;
      previewEngine.load(engine.getState());
      previewEngine.state.emit('hand:evaluate', { cards: cardIds });
      const previewState = previewEngine.getState();
      return presenter.buildResultView(previewState.lastResult, previewState.cards);
    },
  };
}
