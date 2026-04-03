import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { createBalatroSession } from '../evt/balatro/session.js';
import { getRandomBalatroOptions } from '../evt/balatro/builder.js';
import { getLocale } from '../evt/balatro/locale.js';

// ─── 终端尺寸 ────────────────────────────────────────────────────────────────
function readTerminalSize() {
  return {
    columns: process.stdout?.columns ?? 120,
    rows: process.stdout?.rows ?? 40,
  };
}

function useTerminalSize() {
  const [size, setSize] = useState(() => readTerminalSize());
  useEffect(() => {
    const stdout = process.stdout;
    if (!stdout?.on) return undefined;
    const onResize = () => setSize(readTerminalSize());
    stdout.on('resize', onResize);
    return () => {
      if (typeof stdout.off === 'function') stdout.off('resize', onResize);
      else if (typeof stdout.removeListener === 'function') stdout.removeListener('resize', onResize);
    };
  }, []);
  return size;
}

// ─── 短暂闪烁通知（自动 1.4s 后淡出） ───────────────────────────────────────
function useFlash() {
  const [flash, setFlash] = useState(null);
  const timerRef = useRef(null);
  function trigger(msg, kind = 'ok') {
    if (timerRef.current) clearTimeout(timerRef.current);
    setFlash({ msg, kind });
    timerRef.current = setTimeout(() => setFlash(null), 1400);
  }
  return [flash, trigger];
}

// ─── 花色常量 ────────────────────────────────────────────────────────────────
const SUIT_COLOR = {
  hearts:   'redBright',
  diamonds: 'yellowBright',
  clubs:    'greenBright',
  spades:   'cyanBright',
};

const SUIT_ICON = {
  hearts:   '♥',
  diamonds: '♦',
  clubs:    '♣',
  spades:   '♠',
};

// ─── 进度条 ─────────────────────────────────────────────────────────────────
function ProgressBar({ value, max, width = 16, color = 'greenBright', bgColor = 'gray' }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const filled = Math.round(pct * width);
  const empty  = width - filled;
  return (
    <Box>
      <Text color={color}>{'█'.repeat(filled)}</Text>
      <Text color={bgColor} dimColor>{'░'.repeat(empty)}</Text>
    </Box>
  );
}

// ─── 顶部 HUD 条 ─────────────────────────────────────────────────────────────
function HUD({ vs, L }) {
  const phaseColor = vs.run.over
    ? (vs.run.won ? 'greenBright' : 'redBright')
    : 'cyanBright';

  const runStatus = vs.run.over
    ? (vs.run.won ? L.status.victory : L.status.defeat)
    : L.status.playing;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* 游戏标题行 — 对应 STS MetricStrip 里的 L.title */}
      <Box justifyContent="space-between" flexWrap="wrap">
        <Text bold color="magentaBright">B A L A T R O</Text>
        <Text color={phaseColor} bold>{runStatus}</Text>
      </Box>
      {/* 主状态行 */}
      <Box justifyContent="space-between" flexWrap="wrap">
        <Box gap={2} flexWrap="wrap">
          <Box gap={1}>
            <Text color="gray" dimColor>{L.hud.ante}</Text>
            <Text color="yellowBright" bold>{vs.round.ante}</Text>
            <Text color="gray" dimColor>/</Text>
            <Text color="gray">{vs.round.maxAnte}</Text>
          </Box>
          <Box gap={1}>
            <Text color="gray" dimColor>{L.hud.target}</Text>
            <Text color="white">{vs.round.targetScore}</Text>
          </Box>
          <Box gap={1}>
            <Text color="gray" dimColor>{L.hud.score}</Text>
            <Text color="greenBright" bold>{vs.round.score}</Text>
          </Box>
          <Box gap={1}>
            <Text color="gray" dimColor>{L.hud.hands}</Text>
            <Text color={vs.round.handsLeft <= 1 ? 'redBright' : 'white'} bold>{vs.round.handsLeft}</Text>
          </Box>
          <Box gap={1}>
            <Text color="gray" dimColor>{L.hud.discards}</Text>
            <Text color={vs.round.discardsLeft === 0 ? 'redBright' : 'white'}>{vs.round.discardsLeft}</Text>
          </Box>
          <Box gap={1}>
            <Text color="gray" dimColor>💰</Text>
            <Text color="yellowBright">${vs.money}</Text>
          </Box>
          <Box gap={1}>
            <Text color="gray" dimColor>{L.hud.deck}</Text>
            <Text color="cyan">{vs.piles.deck}</Text>
          </Box>
        </Box>
      </Box>
      {/* 得分进度条 */}
      <Box gap={2} marginTop={0}>
        <Text color="gray" dimColor>{L.hud.progress}</Text>
        <ProgressBar value={vs.round.score} max={vs.round.targetScore} width={24} />
        <Text color="gray" dimColor>{Math.min(100, Math.round((vs.round.score / Math.max(1, vs.round.targetScore)) * 100))}%</Text>
      </Box>
    </Box>
  );
}

// ─── 操作提示行 ──────────────────────────────────────────────────────────────
function HintBar({ vs, inputBuffer, L }) {
  if (vs.run.over) {
    return <Text color="gray" dimColor>{L.hint.quit}</Text>;
  }
  if (inputBuffer) {
    return (
      <Box gap={1}>
        <Text color="yellowBright">{L.hint.selectionBuffer}</Text>
        <Text color="yellowBright" bold>{inputBuffer}</Text>
        <Text color="gray" dimColor>{L.hint.controlsSelected}</Text>
      </Box>
    );
  }
  return (
    <Box gap={1} flexWrap="wrap">
      <Text color="gray" dimColor>{L.hint.controlsIdle}</Text>
    </Box>
  );
}

// ─── 单张牌 ──────────────────────────────────────────────────────────────────
function CardTile({ card, compact = false, highlight = false, suits }) {
  const selected = card.selectedOrder != null;
  const color    = SUIT_COLOR[card.suit] ?? 'white';
  const icon     = SUIT_ICON[card.suit]  ?? '?';
  const border   = highlight ? 'magentaBright' : selected ? 'yellowBright' : color;
  const w = compact ? 10 : 12;
  const h = compact ? 3 : 5;

  return (
    <Box
      width={w}
      minHeight={h}
      flexDirection="column"
      borderStyle={selected ? 'double' : 'round'}
      borderColor={border}
      paddingX={1}
    >
      {/* 角标行 */}
      <Box justifyContent="space-between">
        <Text color={selected ? 'yellowBright' : 'gray'} bold>
          {selected ? `#${card.selectedOrder}` : `[${card.displayIndex}]`}
        </Text>
        <Text color={color}>{icon}</Text>
      </Box>
      {/* 牌面值 */}
      <Text color={selected ? 'magentaBright' : color} bold>{card.label}</Text>
      {!compact && (
        <Text color={color} dimColor>{suits[card.suit] ?? ''}</Text>
      )}
    </Box>
  );
}

// ─── 小丑卡 ──────────────────────────────────────────────────────────────────
function JokerTile({ joker }) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="magenta"
      paddingX={1}
      width={18}
      minHeight={7}
      marginRight={1}
      marginBottom={1}
    >
      {/* 左上角标 */}
      <Box justifyContent="space-between">
        <Text color="magenta" dimColor>🃏</Text>
        <Text color="magenta" dimColor>★</Text>
      </Box>
      {/* 牌名（居中风格，截断超长名） */}
      <Box marginTop={1}>
        <Text color="magentaBright" bold wrap="truncate-end">{joker.name}</Text>
      </Box>
      {/* 分隔线 */}
      <Text color="magenta" dimColor>{'─'.repeat(14)}</Text>
      {/* 效果描述（最多两行） */}
      <Text color="gray" wrap="wrap">{joker.desc}</Text>
      {/* 动态加成（如有） */}
      {joker.bonusText && (
        <Box marginTop={1}>
          <Text color="yellowBright" dimColor wrap="truncate-end">{joker.bonusText}</Text>
        </Box>
      )}
    </Box>
  );
}

function JokerStrip({ jokers }) {
  if (jokers.length === 0) return null;
  return (
    <Box borderStyle="round" borderColor="magenta" paddingX={1} marginBottom={1}>
      <Box flexWrap="wrap">
        {jokers.map(joker => <JokerTile key={joker.instanceId} joker={joker} />)}
      </Box>
    </Box>
  );
}

// ─── 手牌扇形展开 ────────────────────────────────────────────────────────────
function HandFan({ hand, suits }) {
  return (
    <Box flexDirection="row" alignItems="flex-end" rowGap={0} flexWrap="nowrap">
      {hand.map((card) => (
        <Box key={card.id} marginRight={1} marginBottom={card.selectedOrder != null ? 2 : 0}>
          <CardTile card={card} suits={suits} />
        </Box>
      ))}
    </Box>
  );
}

// ─── 计分牌（小尺寸横排） ────────────────────────────────────────────────────
function ScoringRow({ scoringCards, handType, total, suits }) {
  if (scoringCards.length === 0) return null;
  return (
    <Box gap={1} flexWrap="wrap" alignItems="center">
      {scoringCards.map((card, i) => (
        <Box key={`sc:${card.id}:${i}`} marginRight={0}>
          <CardTile card={{ ...card, displayIndex: '·', selectedOrder: null }} compact suits={suits} />
        </Box>
      ))}
      <Box flexDirection="column" marginLeft={1}>
        <Text color="greenBright" bold>{handType}</Text>
        <Text color="white" bold>= {total}</Text>
      </Box>
    </Box>
  );
}

// ─── 桌面区 ──────────────────────────────────────────────────────────────────
function TablePanel({ hand, selectedSummary, result, locale }) {
  const L = locale.ui;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1} flexGrow={1}>
      {/* 上次出牌的计分结果 */}
      <Box marginTop={0} marginBottom={1}>
        <ScoringRow
          scoringCards={result.scoringCards}
          handType={result.handType}
          total={result.total}
          suits={locale.suits}
        />
      </Box>
      {/* 手牌展示 */}
      {hand.length === 0
        ? <Text color="gray" dimColor>{L.table.noHand}</Text>
        : <HandFan hand={hand} suits={locale.suits} />
      }
      {/* 已选摘要 */}
      {selectedSummary.length > 0 && (
        <Box gap={1} marginTop={1}>
          <Text color="yellowBright" dimColor>{L.table.selected}</Text>
          {selectedSummary.map((label, i) => (
            <Text key={`sel:${i}`} color="yellowBright" bold>{label}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

// ─── 结算详情面板（双模：预览 / 实际） ─────────────────────────────────────
function ResolutionPanel({ result, preview, L }) {
  const isPreview = preview != null;
  const data = isPreview ? preview : result;
  const hasTriggers = data.cardTriggers.length > 0 || data.jokerTriggers.length > 0;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={isPreview ? 'yellow' : 'green'} paddingX={1} flexGrow={1}>
      <Text color={isPreview ? 'yellowBright' : 'green'} dimColor>
        {isPreview ? L.resolution.preview : L.resolution.result}
      </Text>
      <Box gap={2}>
        <Text color="gray" dimColor>{L.resolution.handType}</Text>
        <Text color={isPreview ? 'yellowBright' : 'greenBright'} bold>{data.handType || '—'}</Text>
      </Box>
      <Box gap={2}>
        <Text color="gray" dimColor>{L.resolution.base}</Text>
        <Text color="cyan">{data.baseChips} {L.resolution.chips}</Text>
        <Text color="gray">×</Text>
        <Text color="yellowBright">{data.baseMult} {L.resolution.mult}</Text>
      </Box>
      {hasTriggers && (
        <Box flexDirection="column" marginTop={1}>
          {data.cardTriggers.map((line, i) => (
            <Text key={`ct:${i}`} color="cyan" dimColor>  {line}</Text>
          ))}
          {data.jokerTriggers.map((line, i) => (
            <Text key={`jt:${i}`} color="magentaBright" dimColor>  ★ {line}</Text>
          ))}
        </Box>
      )}
      <Box gap={2} marginTop={1}>
        <Text color="gray" dimColor>{isPreview ? L.resolution.estimated : L.resolution.total}</Text>
        <Text color={isPreview ? 'yellowBright' : 'greenBright'} bold>{data.total}</Text>
      </Box>
    </Box>
  );
}

// ─── 闪烁通知条 ─────────────────────────────────────────────────────────────
function FlashBar({ flash }) {
  if (!flash) return <Box minHeight={1} />;
  const color = flash.kind === 'err' ? 'redBright' : flash.kind === 'warn' ? 'yellowBright' : 'greenBright';
  const prefix = flash.kind === 'err' ? '✕' : flash.kind === 'warn' ? '⚠' : '✓';
  return (
    <Box minHeight={1}>
      <Text color={color} bold>{prefix} </Text>
      <Text color={color}>{flash.msg}</Text>
    </Box>
  );
}

// ─── 加载界面 ────────────────────────────────────────────────────────────────
function Loading({ L }) {
  return (
    <Box padding={1}>
      <Box flexDirection="column" borderStyle="bold" borderColor="gray" paddingX={1} paddingY={0}>
        <Box flexDirection="row" justifyContent="space-between" gap={1}>
          <Box gap={1}>
            <Text color="redBright">●</Text>
            <Text color="yellowBright">●</Text>
            <Text color="greenBright">●</Text>
          </Box>
          <Text color="gray" dimColor>{L.chromeTitle}</Text>
        </Box>
        <Box flexDirection="column" gap={1} paddingY={1}>
          <Text bold color="magentaBright">B A L A T R O</Text>
          <Text color="yellowBright">{L.loading}</Text>
        </Box>
      </Box>
    </Box>
  );
}

function LanguageSelect({ L }) {
  return (
    <Box padding={1}>
      <Box flexDirection="column" borderStyle="bold" borderColor="gray" paddingX={1} paddingY={0}>
        <Box flexDirection="row" justifyContent="space-between" gap={1}>
          <Box gap={1}>
            <Text color="redBright">●</Text>
            <Text color="yellowBright">●</Text>
            <Text color="greenBright">●</Text>
          </Box>
          <Text color="gray" dimColor>openspire / balatro</Text>
        </Box>
        <Box flexDirection="column" gap={1} paddingY={1}>
          <Text bold color="magentaBright">B A L A T R O</Text>
          <Text color="yellowBright">{L.language.title}</Text>
          <Text color="gray">{L.language.subtitle}</Text>
          <Text color="white">{L.language.zh}</Text>
          <Text color="white">{L.language.en}</Text>
          <Text color="gray" dimColor>{L.language.hint}</Text>
        </Box>
      </Box>
    </Box>
  );
}

// ─── 主应用 ──────────────────────────────────────────────────────────────────
export function BalatroApp({ options = {} }) {
  const { exit } = useApp();
  const { columns } = useTerminalSize();
  const initialLang = options.lang === 'zh' || options.lang === 'en' ? options.lang : null;
  const [lang, setLang] = useState(initialLang);
  const [session, setSession] = useState(null);
  const [state, setState] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [sortMode, setSortMode] = useState('rank');
  const [preview, setPreview] = useState(null);
  const [flash, triggerFlash] = useFlash();
  const selectedIdsRef = useRef([]);
  const stateRef = useRef(null);
  const vsRef = useRef(null);
  const locale = getLocale(lang ?? 'zh');
  const L = locale.ui;

  function commitSelected(next) {
    selectedIdsRef.current = next;
    setSelectedIds(next);
  }

  useEffect(() => {
    if (!lang) return undefined;
    const sessionOptions = {
      ...(Object.keys(options).length ? options : getRandomBalatroOptions()),
      lang,
    };
    let cancelled = false;
    setSession(null);
    setState(null);
    setPreview(null);
    createBalatroSession(sessionOptions).then(next => {
      if (cancelled) return;
      setSession(next);
      setState(next.getState());
    }).catch(error => {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  useEffect(() => {
    if (!session || selectedIds.length === 0) { setPreview(null); return; }
    try { setPreview(session.previewHand(selectedIds)); }
    catch { setPreview(null); }
  }, [selectedIds, session]);

  const vs = session && state ? session.getViewState(selectedIds, sortMode) : null;
  stateRef.current = state;
  vsRef.current = vs;

  useInput((input, key) => {
    if (!lang) {
      if (input === 'q') { exit(); return; }
      if (input === '1' || input.toLowerCase() === 'z') { setLang('zh'); return; }
      if (input === '2' || input.toLowerCase() === 'e') { setLang('en'); return; }
      return;
    }

    const liveState = stateRef.current;
    const liveVs = vsRef.current;
    const liveSelected = selectedIdsRef.current;
    if (input === 'q') { exit(); return; }
    if (!session || !liveState) return;

    // ─ 结束状态
    if (liveVs?.run.over) {
      triggerFlash(liveVs.run.won ? L.flash.gameWonQuit : L.flash.gameLostQuit, liveVs.run.won ? 'ok' : 'err');
      return;
    }

    // ─ 排序
    if (input === 'r') {
      const next = sortMode === 'rank' ? 'suit' : 'rank';
      setSortMode(next);
      triggerFlash(next === 'rank' ? L.flash.sortRank : L.flash.sortSuit);
      return;
    }

    // ─ 选牌
    if (key.backspace || key.delete) {
      commitSelected(liveSelected.slice(0, -1));
      return;
    }
    if (input === 'c') { commitSelected([]); triggerFlash(L.flash.cleared); return; }
    if (input === 'a') {
      const capped = (liveVs?.hand ?? []).slice(0, 5).map(card => card.id);
      commitSelected(capped);
      triggerFlash(L.flash.selectedFirst(capped.length));
      return;
    }
    if (/^[1-8]$/.test(input)) {
      const index = Number(input) - 1;
      const cardId = liveVs?.hand[index]?.id;
      if (!cardId) { triggerFlash(L.flash.noSuchCard(input), 'warn'); return; }
      if (!liveSelected.includes(cardId) && liveSelected.length >= 5) {
        triggerFlash(L.flash.maxSelect, 'warn');
        return;
      }
      const nextSelected = liveSelected.includes(cardId)
        ? liveSelected.filter(id => id !== cardId)
        : [...liveSelected, cardId];
      commitSelected(nextSelected);
      return;
    }

    // ─ 出/弃牌
    if (input === 'e' || input === 'd') {
      if (liveSelected.length === 0) { triggerFlash(L.flash.selectFirst, 'warn'); return; }
      if (input === 'e' && liveSelected.length > 5) { triggerFlash(L.flash.maxSelect, 'warn'); return; }
      try {
        const result = input === 'e'
          ? session.playHand(liveSelected)
          : session.discardCards(liveSelected);
        setState(result.state);
        commitSelected([]);
        if (!result.state.run?.over) {
          const prevAnte = liveState.round?.ante ?? 1;
          if ((result.state.round?.ante ?? 1) > prevAnte) {
            triggerFlash(L.flash.antePassed(prevAnte, result.state.round.ante, result.state.round.targetScore));
            return;
          }
        }
        if (result.state.run?.over) {
          triggerFlash(result.state.run.won ? L.flash.runWon : L.flash.runLost, result.state.run.won ? 'ok' : 'err');
          return;
        }
        const drawnText = L.flash.drawText(result.drawnLabels ?? []);
        triggerFlash(input === 'e' ? L.flash.played(drawnText) : L.flash.discarded(drawnText));
      } catch (error) {
        triggerFlash(error.message, 'err');
      }
    }
  });

  if (!lang) return <LanguageSelect L={L} />;
  if (!state) return <Loading L={L} />;

  const inputBuffer = selectedIds
    .map(id => vs.hand.findIndex(card => card.id === id) + 1)
    .filter(n => n > 0)
    .join('');
  const wide = columns >= 120;

  return (
    <Box padding={1}>
      {/* 外框 — 与 STS CLI 同款 WindowShell：bold 灰边 + ChromeBar */}
      <Box flexDirection="column" borderStyle="bold" borderColor="gray" paddingX={1} paddingY={0}>
        {/* ChromeBar：● ● ● + 右侧项目标题（与 STS 一致） */}
        <Box flexDirection="row" justifyContent="space-between" gap={1} flexWrap="wrap">
          <Box gap={1}>
            <Text color="redBright">●</Text>
            <Text color="yellowBright">●</Text>
            <Text color="greenBright">●</Text>
          </Box>
          <Text color="gray" dimColor>{L.chromeTitle}</Text>
        </Box>

        {/* HUD（内含 B A L A T R O 标题 + 状态 + 进度条） */}
        <HUD vs={vs} L={L} />

        {/* 小丑台 */}
        <JokerStrip jokers={vs.jokers} />

        {/* 主游戏区 */}
        <Box flexDirection={wide ? 'row' : 'column'} gap={1}>
          <TablePanel
            hand={vs.hand}
            selectedSummary={vs.selectedSummary}
            result={vs.result}
            locale={locale}
          />
          <ResolutionPanel result={vs.result} preview={preview} L={L} />
        </Box>

        {/* 操作提示 + 通知 */}
        <Box flexDirection="column" marginTop={1}>
          <HintBar vs={vs} inputBuffer={inputBuffer} L={L} />
          <FlashBar flash={flash} />
        </Box>
      </Box>
    </Box>
  );
}
