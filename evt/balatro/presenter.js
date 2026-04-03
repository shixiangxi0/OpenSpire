/**
 * evt/balatro/presenter.js — transform raw Balatro state into TUI-friendly data
 */
import { getLocale } from './locale.js';

const SUIT_SYMBOL = {
  spades: 'S',
  hearts: 'H',
  diamonds: 'D',
  clubs: 'C',
};

const SUIT_SYMBOL_PRETTY = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

const RANK_LABEL = {
  14: 'A',
  13: 'K',
  12: 'Q',
  11: 'J',
  10: '10',
};

const SUIT_ORDER = {
  spades: 0,
  hearts: 1,
  clubs: 2,
  diamonds: 3,
};

function rankLabel(rank) {
  return RANK_LABEL[rank] ?? String(rank ?? '?');
}

export function cardLabelForId(id, cards) {
  return cardLabel(cards?.[id] ?? {});
}

function cardLabel(card) {
  return `${rankLabel(card?.rank)}${SUIT_SYMBOL_PRETTY[card?.suit] ?? '?'}`;
}

function handTypeLabel(type, locale) {
  return locale.handTypes[type] ?? (type || locale.presenter.unresolvedHand);
}

function phaseLabel(phase, locale) {
  return locale.phases[phase] ?? phase;
}

function triggerLabel(row, cards, jokerDefs, locale) {
  if (row.source === 'base') {
    return locale.presenter.cardGainChips(cardLabel(cards[row.card]), row.chips);
  }
  if (row.source === 'retrigger') {
    const retriggerName = row.retriggerBy ? (jokerDefs[row.retriggerBy]?.name ?? row.retriggerBy) : null;
    return locale.presenter.cardGainChipsRetrigger(cardLabel(cards[row.card]), row.chips, retriggerName);
  }
  return JSON.stringify(row);
}

function toSequence(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];

  return Object.keys(value)
    .filter(key => /^\d+$/.test(key))
    .sort((a, b) => Number(a) - Number(b))
    .map(key => value[key]);
}

function sortHand(cards, sortMode) {
  const next = cards.slice();
  next.sort((a, b) => {
    if (sortMode === 'suit') {
      const suitDiff = (SUIT_ORDER[a.suit] ?? 99) - (SUIT_ORDER[b.suit] ?? 99);
      if (suitDiff !== 0) return suitDiff;
      if ((b.rank ?? 0) !== (a.rank ?? 0)) return (b.rank ?? 0) - (a.rank ?? 0);
      return a.index - b.index;
    }

    if ((b.rank ?? 0) !== (a.rank ?? 0)) return (b.rank ?? 0) - (a.rank ?? 0);
    const suitDiff = (SUIT_ORDER[a.suit] ?? 99) - (SUIT_ORDER[b.suit] ?? 99);
    if (suitDiff !== 0) return suitDiff;
    return a.index - b.index;
  });
  return next.map((card, index) => ({ ...card, displayIndex: index + 1 }));
}

export function createBalatroPresenter({ jokerDefs = {}, lang = 'zh' } = {}) {
  const locale = getLocale(lang);

  function buildResultView(result = {}, cards = {}) {
    const playedCards = toSequence(result.playedCards).map(id => ({
      id,
      label: cardLabel(cards[id] ?? {}),
      suit: cards[id]?.suit,
    }));
    const scoringCards = toSequence(result.scoringCards).map(id => ({
      id,
      label: cardLabel(cards[id] ?? {}),
      suit: cards[id]?.suit,
    }));
    const trace = result.trace ?? {};

    return {
      handType: handTypeLabel(result.handType, locale),
      playedCards,
      scoringCards,
      baseChips: result.baseChips ?? 0,
      baseMult: result.baseMult ?? 0,
      chips: result.chips ?? 0,
      mult: result.mult ?? 0,
      xmult: result.xmult ?? 1,
      cardTriggers: toSequence(trace.cards).map(row => triggerLabel(row, cards, jokerDefs, locale)),
      jokerTriggers: toSequence(trace.jokers).map(row => {
        const meta = jokerDefs[row.jokerId] ?? { name: row.jokerId };
        return `${meta.name}: ${row.note}`;
      }),
      total: result.total ?? 0,
    };
  }

  function buildViewState(state, selectedIds = [], sortMode = 'rank') {
    const selectedOrder = Object.fromEntries(selectedIds.map((id, index) => [id, index + 1]));
    const cards = state.cards ?? {};
    const rawHand = toSequence(state.hand).map((id, index) => {
      const card = cards[id] ?? {};
      return {
        id,
        index: index + 1,
        rank: card.rank,
        suit: card.suit,
        label: cardLabel(card),
        compactSuit: SUIT_SYMBOL[card.suit] ?? '?',
        selectedOrder: selectedOrder[id] ?? null,
      };
    });
    const hand = sortHand(rawHand, sortMode);

    const jokers = Object.entries(state.jokers ?? {})
      .map(([instanceId, row]) => ({
        instanceId,
        jokerId: row.jokerId,
        slot: row.slot ?? Number.MAX_SAFE_INTEGER,
        bonusText: [
          row.bonusChips ? locale.presenter.storedChips(row.bonusChips) : null,
          row.roundMult ? locale.presenter.roundMult(row.roundMult) : null,
          typeof row.refundReady === 'boolean'
            ? (row.refundReady ? locale.presenter.discardRefundReady : locale.presenter.discardRefundSpent)
            : null,
        ].filter(Boolean).join(' / ') || null,
        ...(jokerDefs[row.jokerId] ?? { name: row.jokerId, desc: row.jokerId }),
      }))
      .sort((a, b) => {
        if (a.slot !== b.slot) return a.slot - b.slot;
        return a.instanceId.localeCompare(b.instanceId);
      });

    return {
      run: {
        phase: state.run?.phase ?? 'playing',
        phaseLabel: phaseLabel(state.run?.phase ?? 'playing', locale),
        over: state.run?.over ?? false,
        won: state.run?.won ?? false,
      },
      round: {
        ante: state.round?.ante ?? 1,
        maxAnte: state.meta?.maxAnte ?? 1,
        targetScore: state.round?.targetScore ?? 0,
        score: state.round?.score ?? 0,
        handsLeft: state.round?.handsLeft ?? 0,
        discardsLeft: state.round?.discardsLeft ?? 0,
        over: state.round?.over ?? false,
        won: state.round?.won ?? false,
      },
      money: state.money ?? 0,
      piles: {
        deck: (state.deck ?? []).length,
        hand: rawHand.length,
        discard: (state.discard ?? []).length,
      },
      hand,
      sortMode,
      jokers,
      selectedSummary: selectedIds.map(id => cardLabel(cards[id] ?? {})),
      result: buildResultView(state.lastResult ?? {}, cards),
    };
  }

  return { buildViewState, buildResultView };
}
