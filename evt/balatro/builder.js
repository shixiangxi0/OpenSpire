/**
 * evt/balatro/builder.js — build a Balatro run snapshot
 */

const SUIT_MAP = {
  S: 'spades',
  H: 'hearts',
  D: 'diamonds',
  C: 'clubs',
};

const RANK_MAP = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
};

const STANDARD_SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
const STANDARD_RANKS = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

function suitCode(suit) {
  return ({
    spades: 'S',
    hearts: 'H',
    clubs: 'C',
    diamonds: 'D',
  })[suit] ?? '?';
}

function rankCode(rank) {
  return ({
    14: 'A',
    13: 'K',
    12: 'Q',
    11: 'J',
    10: '10',
  })[rank] ?? String(rank);
}

function buildStandardDeckSpecs() {
  const deck = [];
  for (const suit of STANDARD_SUITS) {
    for (const rank of STANDARD_RANKS) {
      deck.push(`${rankCode(rank)}${suitCode(suit)}`);
    }
  }
  return deck;
}

function normalizeSeed(seed) {
  if (seed == null) return Date.now() % 2147483647;
  const n = Number(seed);
  if (!Number.isFinite(n)) {
    throw new Error('[balatro] seed must be a finite number');
  }
  const normalized = Math.abs(Math.trunc(n)) % 2147483647;
  return normalized === 0 ? 1 : normalized;
}

function parseCard(spec) {
  if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
    const { rank, suit, label = null } = spec;
    if (typeof rank !== 'number' || typeof suit !== 'string') {
      throw new Error('[balatro] card objects require numeric rank and string suit');
    }
    return { rank, suit, label: label ?? `${rank}-${suit}` };
  }

  if (typeof spec !== 'string' || spec.length < 2) {
    throw new Error('[balatro] card specs must be objects or strings like "AH" / "10D"');
  }

  const suitCode = spec.slice(-1).toUpperCase();
  const rankCode = spec.slice(0, -1).toUpperCase();
  const suit = SUIT_MAP[suitCode];
  if (!suit) throw new Error(`[balatro] unknown suit code "${suitCode}"`);

  const rank = RANK_MAP[rankCode] ?? Number(rankCode);
  if (!Number.isInteger(rank) || rank < 2 || rank > 14) {
    throw new Error(`[balatro] unknown rank code "${rankCode}"`);
  }

  return { rank, suit, label: spec.toUpperCase() };
}

function normalizeJoker(spec, index) {
  if (typeof spec === 'string') {
    return { instanceId: `joker_${index + 1}`, jokerId: spec, slot: index };
  }
  if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
    const { instanceId = `joker_${index + 1}`, jokerId, slot = index } = spec;
    if (typeof jokerId !== 'string' || jokerId.length === 0) {
      throw new Error('[balatro] joker objects require jokerId');
    }
    if (!Number.isInteger(slot) || slot < 0) {
      throw new Error('[balatro] joker slot must be a non-negative integer');
    }
    return { instanceId, jokerId, slot };
  }
  throw new Error('[balatro] jokers must be ids or { jokerId, instanceId? } objects');
}

function emptyResult() {
  return {
    handType: null,
    playedCards: [],
    scoringCards: [],
    baseChips: 0,
    baseMult: 0,
    chips: 0,
    mult: 0,
    xmult: 1,
    total: 0,
    trace: {
      cards: [],
      jokers: [],
    },
  };
}

const STANDARD_DECK = buildStandardDeckSpecs();

export function buildRoundStore({
  hand = null,
  deck = null,
  jokers = [],
  lang = 'zh',
  handSize = 8,
  targetScore = 300,
  hands = 4,
  discards = 3,
  money = 0,
  roundReward = 5,
  maxAnte = 3,
  shuffle = null,
  seed = null,
} = {}) {
  hand = hand ?? [];
  deck = deck ?? [];
  let shuffleEnabled = shuffle;

  if (hand.length === 0 && deck.length === 0) {
    hand = [];
    deck = STANDARD_DECK;
    shuffleEnabled = shuffleEnabled ?? true;
  }
  shuffleEnabled = shuffleEnabled ?? false;

  const cards = {};
  const handIds = [];
  const deckIds = [];
  const allCards = [
    ...hand,
    ...(deck.length ? deck : []),
  ];

  allCards.forEach((spec, index) => {
    const parsed = parseCard(spec);
    const instanceId = `card_${index + 1}`;
    cards[instanceId] = parsed;
    if (index < hand.length) handIds.push(instanceId);
    else deckIds.push(instanceId);
  });

  const jokerMap = {};
  const bindings = {};

  jokers.forEach((spec, index) => {
    const joker = normalizeJoker(spec, index);
    jokerMap[joker.instanceId] = { jokerId: joker.jokerId, slot: joker.slot };
    bindings[`joker:${joker.instanceId}`] = {
      kind: 'joker',
      id: joker.jokerId,
      ctx: { self: joker.instanceId, slot: joker.slot },
      slot: joker.slot,
    };
  });

  return {
    cards,
    hand: handIds,
    deck: deckIds,
    played: [],
    discard: [],
    jokers: jokerMap,
    money,
    meta: {
      lang,
      handSize,
      maxHands: hands,
      maxDiscards: discards,
      maxAnte,
      shuffleEnabled,
      shuffleSeed: normalizeSeed(seed),
      roundReward,
      nextJokerInstance: Object.keys(jokerMap).length + 1,
    },
    run: {
      phase: 'playing',
      over: false,
      won: false,
    },
    round: {
      ante: 1,
      targetScore,
      score: 0,
      handsLeft: hands,
      discardsLeft: discards,
      over: false,
      won: false,
    },
    lastResult: emptyResult(),
    _bindings: bindings,
  };
}

export function getBalatroDemoOptions() {
  return {
    jokers: ['echo_joker', 'momentum_joker', 'finisher_joker'],
    handSize: 8,
    targetScore: 300,
    hands: 4,
    discards: 3,
    maxAnte: 3,
  };
}

const ALL_RANDOM_JOKERS = [
  'jolly_joker', 'greedy_joker', 'abstract_joker', 'club_joker',
  'square_joker', 'echo_joker', 'momentum_joker', 'second_wind_joker',
  'finisher_joker', 'baron_joker', 'rainbow_joker', 'shortcut_joker',
  'daredevil_joker', 'pyramid_joker', 'wildfire_joker',
];

export function getRandomBalatroOptions() {
  const money = 20 + Math.floor(Math.random() * 101);
  const targetScore = 100000 + Math.floor(Math.random() * 900001);
  const pool = ALL_RANDOM_JOKERS.slice();
  const jokers = [];
  while (jokers.length < 5 && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    jokers.push(pool.splice(idx, 1)[0]);
  }
  return {
    money,
    targetScore,
    jokers,
    handSize: 8,
    hands: 4,
    discards: 3,
    maxAnte: 3,
  };
}
