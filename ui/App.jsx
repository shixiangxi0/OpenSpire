/**
 * ui/App.jsx — 杀戮尖塔 CLI 主界面（ink）
 *
 * 使用方式：pnpm sts [scenarios/xxx.json]
 * 支持双语：pnpm sts [场景名] --lang en
 */
import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createSession } from '../evt/game/session.js';
import { getLocale } from '../evt/game/locale.js';

const SAVE_FILE = resolve('openspire-save.json');

const CARD_TYPE_COLOR = {
  attack: 'red',
  skill: 'cyan',
  power: 'yellow',
};

const INTENT_COLOR = {
  attack: 'red',
  defend: 'blue',
  buff: 'yellow',
  debuff: 'magenta',
};

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

function KeyHint({ keyLabel, text, color = 'yellow' }) {
  return (
    <Box gap={1} flexWrap="nowrap">
      <Text color={color} bold>[{keyLabel}]</Text>
      <Text color="gray" dimColor>{text}</Text>
    </Box>
  );
}

function PanelShell({ borderColor = 'gray', minWidth, flexGrow = 0, children }) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      paddingY={0}
      minWidth={minWidth}
      flexGrow={flexGrow}
    >
      {children}
    </Box>
  );
}

function MutedFrame({ label, aside = null, borderColor = 'gray', flexGrow = 0, children }) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      paddingY={0}
      flexGrow={flexGrow}
    >
      <Box flexDirection="row" justifyContent="space-between" gap={1} flexWrap="wrap">
        <Text color="gray" dimColor>{label}</Text>
        {aside ? <Text color="gray" dimColor>{aside}</Text> : null}
      </Box>
      {children}
    </Box>
  );
}

function ChromeBar({ shellTitle, compact }) {
  return (
    <Box
      flexDirection={compact ? 'column' : 'row'}
      justifyContent="space-between"
      gap={1}
      flexWrap="wrap"
    >
      <Box gap={1}>
        <Text color="redBright">●</Text>
        <Text color="yellowBright">●</Text>
        <Text color="greenBright">●</Text>
      </Box>

      <Text color="gray" dimColor>{shellTitle}</Text>
    </Box>
  );
}

function WindowShell({ shellTitle, compact, children }) {
  return (
    <Box flexDirection="column" borderStyle="bold" borderColor="gray" paddingX={1} paddingY={0}>
      <ChromeBar shellTitle={shellTitle} compact={compact} />
      <Box flexDirection="column">
        {children}
      </Box>
    </Box>
  );
}

function MetricStrip({ vs, L, compact, focusLine, modeLabel, modeColor }) {
  return (
    <Box flexDirection="column" paddingX={0}>
      <Box
        flexDirection={compact ? 'column' : 'row'}
        justifyContent="space-between"
        gap={2}
        flexWrap="wrap"
      >
        <Box gap={2} flexWrap="wrap">
          <Text bold color="yellowBright">{L.title}</Text>
          <Text color="white">{L.turn(vs.turn)}</Text>
          <Box gap={0}>
            <Text color="gray" dimColor>{L.pileLabels.draw}</Text>
            <Text color="white">{vs.piles.draw}</Text>
            <Text color="gray" dimColor>{'  '}{L.pileLabels.discard}</Text>
            <Text color="white">{vs.piles.discard}</Text>
            <Text color="gray" dimColor>{'  '}{L.pileLabels.exhaust}</Text>
            <Text color="white">{vs.piles.exhaust}</Text>
          </Box>
        </Box>
        <Text color={modeColor} dimColor={modeColor === 'gray'}>{modeLabel}</Text>
      </Box>
      {focusLine ? <Text color="yellowBright">{focusLine}</Text> : null}
    </Box>
  );
}

function HpBar({ cur, max, width = 12 }) {
  const safeMax = Math.max(1, max ?? 0);
  const safeCur = Math.max(0, Math.min(cur ?? 0, safeMax));
  const ratio = safeCur / safeMax;
  const filled = safeCur > 0
    ? Math.max(1, Math.min(width, Math.round(ratio * width)))
    : 0;
  // HP 百分比决定颜色：> 50% 绿，> 25% 黄，≤ 25% 红
  const fullColor = ratio > 0.50 ? 'green' : ratio > 0.25 ? 'yellow' : 'red';

  return (
    <Box gap={0} flexWrap="nowrap">
      <Text color="gray" dimColor>{'['}</Text>
      {Array.from({ length: width }, (_, slot) => {
        const active = slot < filled;
        return (
          <Text key={slot} color={active ? fullColor : 'gray'} dimColor={!active}>{'■'}</Text>
        );
      })}
      <Text color="gray" dimColor>{']'}</Text>
    </Box>
  );
}

function EnergyStat({ cur, max }) {
  return (
    <Box gap={0} flexWrap="nowrap">
      <Text color={cur > 0 ? 'yellow' : 'gray'} bold={cur > 0}>{cur}</Text>
      <Text color="gray">/{max}</Text>
    </Box>
  );
}

function StatusLine({ statuses, statusDisplayMap }) {
  const items = Object.entries(statuses ?? {}).filter(
    ([id, value]) => id !== 'block' && value?.stacks > 0,
  );

  if (!items.length) return null;

  return (
    <Box gap={1} flexWrap="wrap" marginTop={1}>
      {items.map(([id, value]) => (
        <Box key={id} gap={0}>
          <Text color="cyan">[</Text>
          <Text color="cyan">{statusDisplayMap[id]?.name ?? id}</Text>
          <Text color="white" bold>×{value.stacks}</Text>
          <Text color="cyan">]</Text>
        </Box>
      ))}
    </Box>
  );
}

function PlayerPanel({ player, statusDisplayMap, L, dense }) {
  return (
    <PanelShell borderColor="green" minWidth={dense ? 29 : 32}>
      <Text bold color="greenBright">{L.player}</Text>

      <Box gap={1} flexWrap="nowrap">
        <Text color="gray">{L.hp}</Text>
        <HpBar cur={player.hp} max={player.maxHp} width={12} />
        <Text color="white" bold>{String(player.hp).padStart(3, ' ')}</Text>
        <Text color="gray">/{player.maxHp}</Text>
      </Box>

      <Box gap={1} flexWrap="wrap">
        <Text color="gray">{L.energy}</Text>
        <EnergyStat cur={player.energy} max={player.maxEnergy} />
        {player.block > 0 && (
          <>
            <Text color="gray"> </Text>
            <Text color="blue">{L.block}</Text>
            <Text color="blueBright" bold>{player.block}</Text>
          </>
        )}
      </Box>

      <StatusLine statuses={player.statuses} statusDisplayMap={statusDisplayMap} />
    </PanelShell>
  );
}

function EnemyPanel({ enemy, statusDisplayMap, highlight, L, dense }) {
  const intentColor = INTENT_COLOR[enemy.intentType] ?? 'white';
  const intentIcon = L.intentIcon[enemy.intentType] ?? '[?]';
  const borderColor = highlight ? 'yellowBright' : 'red';

  return (
    <PanelShell borderColor={borderColor} minWidth={dense ? 29 : 30} flexGrow={1}>
      <Box justifyContent="space-between" gap={1} flexWrap="wrap">
        <Text bold color={highlight ? 'yellowBright' : 'redBright'}>{enemy.name}</Text>
        <Text color={highlight ? 'yellowBright' : 'gray'}>[slot {enemy.slot}]</Text>
      </Box>

      <Box gap={1} flexWrap="nowrap">
        <Text color="gray">{L.hp}</Text>
        <HpBar cur={enemy.hp} max={enemy.maxHp} width={12} />
        <Text color="white" bold>{String(enemy.hp).padStart(3, ' ')}</Text>
        <Text color="gray">/{enemy.maxHp}</Text>
        {enemy.block > 0 && <Text color="blueBright">{L.block} {enemy.block}</Text>}
      </Box>

      <Box gap={1} flexWrap="wrap">
        <Text color={intentColor}>{intentIcon}</Text>
        <Text color={intentColor}>{enemy.intentDesc}</Text>
      </Box>

      <StatusLine statuses={enemy.statuses} statusDisplayMap={statusDisplayMap} />
    </PanelShell>
  );
}

function CardRow({ card, index, selected, L }) {
  const display = card.display ?? {};
  const type = display.type ?? 'attack';
  const color = CARD_TYPE_COLOR[type] ?? 'white';
  const label = L.cardType[type] ?? '?';
  const cost = (card.cost ?? 0) < 0 ? 'X' : String(card.cost ?? 0);

  return (
    <Box gap={1} flexWrap="wrap">
      <Text color={selected ? 'yellowBright' : 'gray'}>{selected ? '>' : ' '}</Text>
      <Text bold color={selected ? 'yellowBright' : color}>[{index}]</Text>
      <Text color="yellow">({cost})</Text>
      <Text color={color}>{label}</Text>
      <Text bold color={selected ? 'yellowBright' : 'white'}>{display.name ?? card.cardId}</Text>
      {display.desc && (
        <Text color="gray" dimColor>{display.desc}</Text>
      )}
      {card.exhaust && <Text color="magenta">{L.exhaust}</Text>}
    </Box>
  );
}

function HandPanel({ hand, selected, L }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
      <Text color="gray" dimColor>{L.handCount(hand.length)}</Text>
      {hand.length === 0 && <Text color="gray">{L.empty.hand}</Text>}
      {hand.map((card, index) => (
        <CardRow
          key={card.instanceId}
          card={card}
          index={index + 1}
          selected={selected === index + 1}
          L={L}
        />
      ))}
    </Box>
  );
}

function StatusDict({ statuses, statusDisplayMap, L }) {
  const groups = (statuses ?? [])
    .map(group => ({
      title: group.title,
      items: Object.entries(group.values ?? {}).filter(([, value]) => value?.stacks > 0),
    }))
    .filter(group => group.items.length > 0);

  return (
    <MutedFrame label={L.dictTitle} borderColor="gray" aside={L.dictClose}>
      {groups.length === 0 && <Text color="gray">{L.dictEmpty}</Text>}

      {groups.map((group, groupIndex) => (
        <Box key={group.title} flexDirection="column" marginTop={groupIndex === 0 ? 0 : 1}>
          <Text color="yellowBright" bold>{group.title}</Text>

          {group.items.map(([id, value], itemIndex) => {
            const display = statusDisplayMap[id] ?? {};
            return (
              <Box
                key={`${group.title}:${id}`}
                flexDirection="column"
                marginTop={itemIndex === 0 ? 0 : 1}
                paddingLeft={1}
              >
                <Box gap={1} flexWrap="wrap">
                  <Text color="cyan">[{(display.name ?? id) + ` ×${value.stacks}`}]</Text>
                </Box>
                <Text color="gray">{value.desc ?? display.desc ?? '—'}</Text>
              </Box>
            );
          })}
        </Box>
      ))}
    </MutedFrame>
  );
}

function LogPanel({ logs, L, limit = 20 }) {
  const recent = logs.slice(-limit);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} flexGrow={1}>
      <Text color="gray" dimColor>{L.logTitle}</Text>
      {recent.length === 0 && <Text color="gray">{L.empty.log}</Text>}
      {recent.map((line, index) => {
        const isSeparator = line.startsWith('─');
        const isCard = line.startsWith('▷');
        const isDeath = line.startsWith('☠');
        const isAction = line.startsWith('▶');
        return (
          <Text
            key={index}
            color={isDeath ? 'redBright' : isSeparator ? 'yellow' : isCard ? 'white' : isAction ? 'cyan' : 'gray'}
            bold={isCard || isDeath || isAction}
            dimColor={!isSeparator && !isCard && !isDeath && !isAction}
          >{line}</Text>
        );
      })}
    </Box>
  );
}

function NoticeLine({ notice }) {
  if (!notice) return null;

  return (
    <Box gap={1} flexWrap="wrap">
      <Text color="greenBright" bold>{'>'}</Text>
      <Text color="greenBright">{notice}</Text>
    </Box>
  );
}

function ControlsPanel({ handLen, enemyCount, awaitTarget, showDict, L }) {
  if (showDict) {
    return (
      <Box gap={3} flexWrap="wrap">
        <KeyHint keyLabel="i" text={L.hint.closeDict} color="cyan" />
      </Box>
    );
  }

  if (awaitTarget) {
    return (
      <Box gap={3} flexWrap="wrap">
        {enemyCount > 0 ? (
          <KeyHint keyLabel={`1-${enemyCount}`} text={L.hint.selectTarget} color="yellowBright" />
        ) : null}
        <Box>
          <KeyHint keyLabel="q" text={L.hint.cancel} />
        </Box>
      </Box>
    );
  }

  return (
    <Box gap={3} flexWrap="wrap">
      {handLen > 0 ? <KeyHint keyLabel={`1-${handLen}`} text={L.hint.play} /> : null}
      <KeyHint keyLabel="e" text={L.hint.end} />
      <KeyHint keyLabel="u" text={L.hint.undo} />
      <KeyHint keyLabel="s" text={L.hint.save} />
      <KeyHint keyLabel="l" text={L.hint.load} />
      <KeyHint keyLabel="i" text={L.hint.dict} />
      <KeyHint keyLabel="q" text={L.hint.quit} />
    </Box>
  );
}

function LoadingView({ L, shellTitle }) {
  return (
    <Box padding={1}>
      <WindowShell
        shellTitle={shellTitle}
        compact={false}
      >
        <MutedFrame label={L.chromeTitle} borderColor="gray">
          <Text bold color="yellowBright">{L.loading}</Text>
        </MutedFrame>
      </WindowShell>
    </Box>
  );
}

function EndView({ victory, L, shellTitle }) {
  const accent = victory ? 'green' : 'red';
  const messageColor = victory ? 'greenBright' : 'redBright';

  return (
    <Box padding={1}>
      <WindowShell
        shellTitle={shellTitle}
        compact={false}
      >
        <MutedFrame label={L.chromeTitle} borderColor={accent}>
          <Text bold color={messageColor}>{victory ? L.victory : L.defeat}</Text>
          <Box marginTop={1}>
            <KeyHint keyLabel="q" text={L.pressQuit} />
          </Box>
        </MutedFrame>
      </WindowShell>
    </Box>
  );
}

export function App({ scenario }) {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const L = getLocale(scenario?.lang ?? 'zh').ui;
  const shellTitle = `openspire / ${scenario?.id ?? 'scenario'}`;

  const [session, setSession] = useState(null);
  const [vs, setVs] = useState(null);
  const [logs, setLogs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [awaitTarget, setAwaitTarget] = useState(false);
  const [showDict, setShowDict] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    createSession(scenario).then((nextSession) => {
      setSession(nextSession);
      setVs(nextSession.getViewState());
      if (nextSession.initialLogs?.length) setLogs(nextSession.initialLogs);
    }).catch(error => {
      process.stderr.write(getLocale(scenario?.lang ?? 'zh').cli.initFail(error.message) + '\n');
      process.exit(1);
    });
  }, []);

  useInput((input) => {
    if (!session || !vs) return;

    if (vs.over) {
      if (input === 'q') exit();
      return;
    }

    if (input === 'i') {
      setShowDict(value => !value);
      return;
    }

    if (showDict) return;

    if (input === 'q') {
      if (awaitTarget) {
        setSelected(null);
        setAwaitTarget(false);
        return;
      }
      exit();
      return;
    }

    if (input === 'u' && !awaitTarget) {
      const { logs: newLogs, state } = session.restoreTurn();
      setLogs(prev => [...prev, ...newLogs, L.notice.undone]);
      setVs(state);
      setSelected(null);
      setNotice(null);
      return;
    }

    if (input === 's' && !awaitTarget) {
      try {
        writeFileSync(SAVE_FILE, JSON.stringify(session.getCheckpoint()));
        setNotice(L.notice.saved(vs.turn));
      } catch (error) {
        setNotice(L.notice.saveFail(error.message));
      }
      return;
    }

    if (input === 'l' && !awaitTarget) {
      try {
        const snapshot = JSON.parse(readFileSync(SAVE_FILE, 'utf-8'));
        if (
          snapshot === null || typeof snapshot !== 'object' ||
          typeof snapshot.cards !== 'object' || snapshot.cards === null ||
          !Array.isArray(snapshot.hand) ||
          !(
            typeof snapshot.entities === 'object' && snapshot.entities !== null &&
            typeof snapshot.entities.player === 'object' && snapshot.entities.player !== null
          )
        ) throw new Error('invalid save structure');

        const { logs: newLogs, state } = session.restoreTurn(snapshot);
        setLogs(prev => [...prev, ...newLogs, L.notice.loaded]);
        setVs(state);
        setSelected(null);
        setNotice(null);
      } catch {
        setNotice(L.notice.loadFail);
      }
      return;
    }

    if (input === 'e' && !awaitTarget) {
      const { logs: newLogs, state } = session.endTurn();
      setLogs(prev => [...prev, ...newLogs]);
      setVs(state);
      setSelected(null);
      setNotice(null);
      return;
    }

    const index = parseInt(input, 10);
    if (Number.isNaN(index) || index < 1) return;

    if (awaitTarget) {
      const enemy = vs.enemies.find(item => item.slot === index);
      if (!enemy) return;

      const card = vs.hand[selected - 1];
      const result = session.play(card.instanceId, enemy.entityId);
      setLogs(prev => [...prev, ...result.logs]);
      setVs(result.state);

      if (result.success !== false) {
        setSelected(null);
        setAwaitTarget(false);
        setNotice(null);
      } else {
        setNotice(L.notice.playFailed);
      }
      return;
    }

    if (index > vs.hand.length) return;

    const card = vs.hand[index - 1];
    if (card.targetType === 'enemy' && vs.enemies.length > 1) {
      setSelected(index);
      setAwaitTarget(true);
      return;
    }

    const target = card.targetType === 'enemy' ? vs.enemies[0]?.entityId : null;
    const result = session.play(card.instanceId, target);
    setLogs(prev => [...prev, ...result.logs]);
    setVs(result.state);

    if (result.success !== false) {
      setSelected(null);
      setNotice(null);
    } else {
      setNotice(L.notice.playFailed);
    }
  });

  if (!vs) return <LoadingView L={L} shellTitle={shellTitle} />;
  if (vs.over) return <EndView victory={vs.victory} L={L} shellTitle={shellTitle} />;

  const statusDisplayMap = session?.displayMaps?.statusDisplayMap ?? {};
  const statusGroups = vs.statusGroups ?? [];

  const dense = columns < 110;
  const battlefieldWide = columns >= 118;
  // Chrome(1) + MetricStrip(2) + Battlefield(~6) + Hand(3+N) + Controls(1) ≈ 13+N
  const logLimit = Math.max(5, rows - 13 - (vs.hand?.length ?? 3));
  const modeLabel = showDict ? L.mode.dict : awaitTarget ? L.mode.target : L.mode.battle;
  const modeColor = showDict ? 'cyan' : awaitTarget ? 'yellowBright' : 'gray';

  const selectedCard = selected ? vs.hand[selected - 1] : null;
  const selectedCardName = selectedCard?.display?.name ?? selectedCard?.cardId ?? null;
  const focusLine = awaitTarget
    ? (selectedCardName && typeof L.hint.selectTargetCard === 'function'
      ? L.hint.selectTargetCard(selectedCardName)
      : L.hint.selectTarget)
    : null;

  return (
    <Box padding={1}>
      <WindowShell shellTitle={shellTitle} compact={!battlefieldWide}>

        {/* ── 顶部信息条（无边框）── */}
        <MetricStrip
          vs={vs}
          L={L}
          compact={!battlefieldWide}
          focusLine={focusLine}
          modeLabel={modeLabel}
          modeColor={modeColor}
        />

        {/* ── 战场面板（横排）── */}
        <Box flexDirection={battlefieldWide ? 'row' : 'column'} gap={0}>
          <PlayerPanel
            player={vs.player}
            statusDisplayMap={statusDisplayMap}
            L={L}
            dense={dense}
          />
          <Box flexDirection="row" flexWrap="wrap" gap={0} flexGrow={1}>
            {vs.enemies.map(enemy => (
              <EnemyPanel
                key={enemy.slot}
                enemy={enemy}
                statusDisplayMap={statusDisplayMap}
                highlight={awaitTarget}
                L={L}
                dense={dense}
              />
            ))}
          </Box>
        </Box>

        {/* ── 手牌（全宽）── */}
        <HandPanel hand={vs.hand} selected={selected} L={L} />

        {/* ── 日志 / 词典（全宽，撑满剩余行）── */}
        {showDict ? (
          <StatusDict
            statuses={statusGroups}
            statusDisplayMap={statusDisplayMap}
            L={L}
          />
        ) : (
          <LogPanel logs={logs} L={L} limit={logLimit} />
        )}

        {/* ── 底部：通知 + 操控提示（无边框）── */}
        {notice && <NoticeLine notice={notice} />}
        <ControlsPanel
          handLen={vs.hand.length}
          enemyCount={vs.enemies.length}
          awaitTarget={awaitTarget}
          showDict={showDict}
          L={L}
        />

      </WindowShell>
    </Box>
  );
}
