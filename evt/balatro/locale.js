/**
 * evt/balatro/locale.js — Balatro bilingual text definitions
 */

export const LOCALES = {
  zh: {
    handTypes: {
      high_card: '高牌',
      pair: '对子',
      two_pair: '两对',
      three_of_a_kind: '三条',
      straight: '顺子',
      flush: '同花',
      full_house: '葫芦',
      four_of_a_kind: '四条',
      straight_flush: '同花顺',
    },
    phases: {
      playing: '出牌阶段',
      victory: '通关',
      defeat: '失败',
    },
    suits: {
      hearts: '红桃',
      diamonds: '方块',
      clubs: '梅花',
      spades: '黑桃',
    },
    presenter: {
      unresolvedHand: '未结算',
      cardGainChips: (label, chips) => `${label} +${chips} 筹码`,
      cardGainChipsRetrigger: (label, chips, by) => `${label} +${chips} 筹码${by ? `，由 ${by} 额外触发` : ''}`,
      storedChips: (chips) => `已累计 +${chips} 筹码`,
      roundMult: (mult) => `本轮累计 +${mult} 倍率`,
      discardRefundReady: '本轮弃牌返还可用',
      discardRefundSpent: '本轮弃牌返还已用',
    },
    ui: {
      chromeTitle: 'openspire / balatro',
      loading: '正在初始化运行时…',
      status: {
        playing: '▶ 对局中',
        victory: '✦ 通 关 ✦',
        defeat: '✕ 失 败 ✕',
      },
      hud: {
        ante: 'ANTE',
        target: '目标',
        score: '得分',
        hands: '出牌',
        discards: '弃牌',
        deck: '牌堆',
        progress: '进度',
      },
      hint: {
        quit: '[q] 退出',
        selectionBuffer: '▸ 选牌缓冲:',
        controlsSelected: '  [e] 出牌  [d] 弃牌  [Backspace] 撤销  [c] 清空',
        controlsIdle: '[1-8] 选牌  [e] 出牌  [d] 弃牌  [a] 全选  [c] 清空  [r] 排序  [q] 退出',
      },
      table: {
        noHand: '当前没有手牌',
        selected: '已选',
      },
      resolution: {
        preview: '▸ 出牌预览',
        result: '▸ 结算详情',
        handType: '牌型',
        base: '基础',
        chips: '筹码',
        mult: '倍率',
        estimated: '预计',
        total: '合计',
      },
      flash: {
        gameWonQuit: '整局已通关，按 q 退出',
        gameLostQuit: '本局已失败，按 q 退出',
        sortRank: '排序: 按点数',
        sortSuit: '排序: 按花色',
        cleared: '已清空选择',
        selectedFirst: (count) => `已选前 ${count} 张`,
        noSuchCard: (n) => `当前没有第 ${n} 张手牌`,
        maxSelect: '最多只能选 5 张',
        selectFirst: '先输入数字选择手牌',
        antePassed: (prevAnte, nextAnte, target) => `Ante ${prevAnte} 通过！▶ 第 ${nextAnte} 轮，目标 ${target}`,
        runWon: '✦ 整局通关！',
        runLost: '✕ 本局失败',
        drawText: (labels) => labels.length ? `  补牌: ${labels.join(' ')}` : '',
        played: (drawText) => `已出牌${drawText}`,
        discarded: (drawText) => `已弃牌${drawText}`,
      },
      language: {
        title: '选择语言',
        subtitle: 'Select Language',
        zh: '1. 中文',
        en: '2. English',
        hint: '[1] 中文  [2] English  [q] 退出',
      },
    },
    jokers: {},
  },

  en: {
    handTypes: {
      high_card: 'High Card',
      pair: 'Pair',
      two_pair: 'Two Pair',
      three_of_a_kind: 'Three of a Kind',
      straight: 'Straight',
      flush: 'Flush',
      full_house: 'Full House',
      four_of_a_kind: 'Four of a Kind',
      straight_flush: 'Straight Flush',
    },
    phases: {
      playing: 'Playing',
      victory: 'Victory',
      defeat: 'Defeat',
    },
    suits: {
      hearts: 'Hearts',
      diamonds: 'Diamonds',
      clubs: 'Clubs',
      spades: 'Spades',
    },
    presenter: {
      unresolvedHand: 'Unresolved',
      cardGainChips: (label, chips) => `${label} +${chips} Chips`,
      cardGainChipsRetrigger: (label, chips, by) => `${label} +${chips} Chips${by ? `, retriggered by ${by}` : ''}`,
      storedChips: (chips) => `Stored +${chips} Chips`,
      roundMult: (mult) => `Round +${mult} Mult`,
      discardRefundReady: 'Discard refund ready',
      discardRefundSpent: 'Discard refund spent',
    },
    ui: {
      chromeTitle: 'openspire / balatro',
      loading: 'Initializing runtime…',
      status: {
        playing: '▶ RUNNING',
        victory: '✦ VICTORY ✦',
        defeat: '✕ DEFEAT ✕',
      },
      hud: {
        ante: 'ANTE',
        target: 'Target',
        score: 'Score',
        hands: 'Hands',
        discards: 'Discards',
        deck: 'Deck',
        progress: 'Progress',
      },
      hint: {
        quit: '[q] Quit',
        selectionBuffer: '▸ Selection:',
        controlsSelected: '  [e] Play  [d] Discard  [Backspace] Undo  [c] Clear',
        controlsIdle: '[1-8] Select  [e] Play  [d] Discard  [a] Pick 5  [c] Clear  [r] Sort  [q] Quit',
      },
      table: {
        noHand: 'No cards in hand',
        selected: 'Selected',
      },
      resolution: {
        preview: '▸ Hand Preview',
        result: '▸ Resolution',
        handType: 'Hand',
        base: 'Base',
        chips: 'Chips',
        mult: 'Mult',
        estimated: 'Preview',
        total: 'Total',
      },
      flash: {
        gameWonQuit: 'Run cleared. Press q to quit',
        gameLostQuit: 'Run lost. Press q to quit',
        sortRank: 'Sort: rank',
        sortSuit: 'Sort: suit',
        cleared: 'Selection cleared',
        selectedFirst: (count) => `Selected the first ${count} cards`,
        noSuchCard: (n) => `There is no card ${n} in hand`,
        maxSelect: 'You can select at most 5 cards',
        selectFirst: 'Select cards first',
        antePassed: (prevAnte, nextAnte, target) => `Ante ${prevAnte} cleared! ▶ Round ${nextAnte}, target ${target}`,
        runWon: '✦ Run cleared!',
        runLost: '✕ Run failed',
        drawText: (labels) => labels.length ? `  Draw: ${labels.join(' ')}` : '',
        played: (drawText) => `Played${drawText}`,
        discarded: (drawText) => `Discarded${drawText}`,
      },
      language: {
        title: 'Select Language',
        subtitle: '选择语言',
        zh: '1. 中文',
        en: '2. English',
        hint: '[1] 中文  [2] English  [q] Quit',
      },
    },
    jokers: {
      jolly_joker: { name: 'Jolly Joker', desc: 'If the hand is a Pair, gain +8 Mult.' },
      greedy_joker: { name: 'Greedy Joker', desc: 'If any scored card is a Diamond, gain +3 Mult.' },
      abstract_joker: { name: 'Abstract Joker', desc: 'Gain +2 Mult for each Joker you currently own.' },
      club_joker: { name: 'Club Joker', desc: 'Each scored Club card gives +3 Mult.' },
      square_joker: { name: 'Square Joker', desc: 'Whenever you play exactly 4 cards, this Joker permanently gains +4 Chips.' },
      echo_joker: { name: 'Echo Joker', desc: 'The first scored card retriggers 2 extra times.' },
      momentum_joker: { name: 'Momentum Joker', desc: 'Each discarded card this round gives future hands +1 Mult.' },
      second_wind_joker: { name: 'Second Wind Joker', desc: 'The first discard each round refunds 1 discard.' },
      baron_joker: { name: 'Baron Joker', desc: 'Whenever a face card (J/Q/K) triggers, Mult ×2. Stacks with retriggers.' },
      finisher_joker: { name: 'Finisher Joker', desc: 'If this hand has at least 60 Chips before final scoring, final Mult ×2.' },
      rainbow_joker: { name: 'Rainbow Joker', desc: 'If scored cards contain 3 suits, Mult ×2; if they contain 4 suits, Mult ×4.' },
      shortcut_joker: { name: 'Shortcut Joker', desc: 'Flushes and Straights need only 4 cards; if both apply, Straight Flush can also form.' },
      daredevil_joker: { name: 'Daredevil Joker', desc: 'Playing 1 card gives +4 Final Mult, 2 cards gives +3, and 3 cards gives +2.' },
      pyramid_joker: { name: 'Pyramid Joker', desc: 'The i-th scored card gains +i×6 Chips; the fifth gains +30 Chips.' },
      wildfire_joker: { name: 'Wildfire Joker', desc: 'Your 2nd hand this round gains +2 Mult, the 3rd gains +4, the 4th gains +6, and so on.' },
    },
  },
};

export function getLocale(lang = 'zh') {
  return LOCALES[lang] ?? LOCALES.zh;
}

export function localizeJokerDisplay(defs = {}, lang = 'zh') {
  const overlay = getLocale(lang).jokers ?? {};
  return Object.fromEntries(
    Object.values(defs)
      .filter(d => d !== null && typeof d === 'object' && !Array.isArray(d) && typeof d.id === 'string')
      .map(d => [d.id, overlay[d.id] ?? d.display ?? { name: d.id, desc: '' }]),
  );
}
