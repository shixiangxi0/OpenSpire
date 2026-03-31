/**
 * ui/App.jsx — 杀戮尖塔 CLI 主界面（ink）
 *
 * 使用方式：pnpm start [scenarios/xxx.json]
 * 支持双语：pnpm start [场景名] --lang en
 */
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createSession } from '../evt/game/session.js';
import { getLocale } from '../evt/game/locale.js';

const SAVE_FILE = resolve('openspire-save.json');

// ── 常量 ──────────────────────────────────────────────────────────────────

const CARD_TYPE_COLOR = {
  attack: 'red', skill: 'cyan', power: 'yellow',
};
const INTENT_COLOR = {
  attack: 'red', defend: 'blue', buff: 'yellow', debuff: 'magenta',
};

// ── HpBar ──────────────────────────────────────────────────────────────────

function HpBar({ cur, max, width = 10 }) {
  const filled = Math.round((cur / Math.max(1, max)) * width);
  const pct = Math.round((cur / Math.max(1, max)) * 100);
  const color = pct > 50 ? 'green' : pct > 25 ? 'yellow' : 'red';
  return (
    <Text>
      <Text color={color}>{'█'.repeat(filled)}</Text>
      <Text color="gray">{'░'.repeat(width - filled)}</Text>
      <Text color="white"> {cur}</Text>
      <Text color="gray">/{max}</Text>
    </Text>
  );
}

// ── EnergyDots ────────────────────────────────────────────────────────────

function EnergyDots({ cur, max }) {
  return (
    <Text>
      <Text color="yellow">{'◆'.repeat(cur)}</Text>
      <Text color="gray">{'◇'.repeat(Math.max(0, max - cur))}</Text>
      <Text color="gray"> {cur}/{max}</Text>
    </Text>
  );
}


function StatusLine({ statuses, statusDisplayMap }) {
  const items = Object.entries(statuses ?? {}).filter(([, v]) => v?.stacks > 0);
  if (!items.length) return null;
  return (
    <Box gap={1} flexWrap="wrap">
      {items.map(([id, v]) => (
        <Box key={id}>
          <Text color="cyan">[</Text>
          <Text color="cyan">{statusDisplayMap[id]?.name ?? id}</Text>
          <Text color="white" bold>×{v.stacks}</Text>
          <Text color="cyan">]</Text>
        </Box>
      ))}
    </Box>
  );
}

// ── PlayerPanel ────────────────────────────────────────────────────────────

function PlayerPanel({ player, sdm, L }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1} minWidth={28}>
      <Text bold color="greenBright">{L.player}</Text>
      <Box gap={1}>
        <Text color="gray">{L.hp}</Text>
        <HpBar cur={player.hp} max={player.maxHp} width={12} />
      </Box>
      <Box gap={1}>
        <Text color="gray">{L.energy}</Text>
        <EnergyDots cur={player.energy} max={player.maxEnergy} />
        {player.block > 0 && (
          <Text color="blue">  {L.block}<Text bold color="blueBright">{player.block}</Text></Text>
        )}
      </Box>
      <StatusLine statuses={player.statuses} statusDisplayMap={sdm} />
    </Box>
  );
}

// ── EnemyPanel ────────────────────────────────────────────────────────────

function EnemyPanel({ enemy, sdm, highlight, L }) {
  const ic = INTENT_COLOR[enemy.intentType] ?? 'white';
  const ii = L.intentIcon[enemy.intentType] ?? '[?]';
  const borderColor = highlight ? 'yellowBright' : 'red';
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1} minWidth={28}>
      <Box gap={1}>
        <Text bold color="redBright">{enemy.name}</Text>
        <Text color="gray" dimColor>[slot {enemy.slot}]</Text>
      </Box>
      <Box gap={1}>
        <Text color="gray">{L.hp}</Text>
        <HpBar cur={enemy.hp} max={enemy.maxHp} width={12} />
        {enemy.block > 0 && (
          <Text color="blue">  {L.block}<Text bold color="blueBright">{enemy.block}</Text></Text>
        )}
      </Box>
      <Box gap={1}>
        <Text color={ic}>{ii}</Text>
        <Text color={ic}>{enemy.intentDesc}</Text>
      </Box>
      <StatusLine statuses={enemy.statuses} statusDisplayMap={sdm} />
    </Box>
  );
}

// ── CardRow ────────────────────────────────────────────────────────────────
// 手牌纵向列表，每行一张，显示完整描述

function CardRow({ card, index, selected, L }) {
  const d = card.display ?? {};
  const type = d.type ?? 'attack';
  const color = CARD_TYPE_COLOR[type] ?? 'white';
  const label = L.cardType[type] ?? '?';
  const cost = (card.cost ?? 0) < 0 ? 'X' : String(card.cost ?? 0);
  const exhaust = card.exhaust ?? false;

  const fg = selected ? 'yellowBright' : color;

  return (
    <Box gap={1}>
      <Text bold color={fg}>[{index}]</Text>
      <Text color="yellow">({cost})</Text>
      <Text color={color}>{label}</Text>
      <Text bold color={selected ? 'yellowBright' : 'white'}>{d.name ?? card.cardId}</Text>
      <Text color="gray">{d.desc ?? ''}</Text>
      {exhaust && <Text color="magenta">{L.exhaust}</Text>}
    </Box>
  );
}

// ── StatusDict ────────────────────────────────────────────────────────────
// i 键弹出的状态词典面板

function StatusDict({ statuses, sdmFull, L }) {
  const groups = (statuses ?? []).map(group => ({
    title: group.title,
    items: Object.entries(group.values ?? {}).filter(([, v]) => v?.stacks > 0),
  })).filter(group => group.items.length > 0);

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="cyan" paddingX={2} paddingY={0}>
      <Text bold color="cyan"> {L.dictTitle}</Text>
      {groups.length === 0 && <Text color="gray"> {L.dictEmpty}</Text>}
      {groups.map(group => (
        <Box key={group.title} flexDirection="column" marginTop={1}>
          <Text color="yellowBright" bold>{group.title}</Text>
          {group.items.map(([id, v]) => {
            const disp = sdmFull[id] ?? {};
            return (
              <Box key={`${group.title}:${id}`} gap={2} paddingLeft={1}>
                <Text color="cyan" bold>{disp.name ?? id}×{v.stacks}</Text>
                <Text color="gray">{v.desc ?? disp.desc ?? '—'}</Text>
              </Box>
            );
          })}
        </Box>
      ))}
      <Text color="gray" dimColor> {L.dictClose}</Text>
    </Box>
  );
}

// ── LogPanel ──────────────────────────────────────────────────────────────

function LogPanel({ logs, L }) {
  const recent = logs.slice(-12);
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
      <Text color="gray" dimColor>{L.logTitle}</Text>
      {recent.map((l, i) => {
        const isSep = l.startsWith('─');
        const isCard = l.startsWith('▷');
        const isDeath = l.startsWith('☠');
        return (
          <React.Fragment key={i}>
            <Text
              color={isDeath ? 'redBright' : isSep ? 'yellow' : isCard ? 'white' : 'gray'}
              bold={isCard || isDeath}
              dimColor={!isSep && !isCard && !isDeath}
            >{l}</Text>
          </React.Fragment>
        );
      })}
    </Box>
  );
}

// ── HintBar ───────────────────────────────────────────────────────────────

function HintBar({ handLen, awaitTarget, showDict, L }) {
  if (showDict) return (
    <Box paddingX={1}>
      <Text color="cyan">[i]</Text>
      <Text color="gray"> {L.hint.closeDict}</Text>
    </Box>
  );
  if (awaitTarget) return (
    <Box paddingX={1} gap={2}>
      <Text color="yellowBright">{L.hint.selectTarget}</Text>
      <Text color="gray"><Text color="yellow">[q]</Text> {L.hint.cancel}</Text>
    </Box>
  );
  return (
    <Box paddingX={1} gap={3}>
      <Text color="gray"><Text color="yellow">[1-{handLen}]</Text> {L.hint.play}</Text>
      <Text color="gray"><Text color="yellow">[e]</Text> {L.hint.end}</Text>
      <Text color="gray"><Text color="yellow">[u]</Text> {L.hint.undo}</Text>
      <Text color="gray"><Text color="yellow">[s]</Text> {L.hint.save}</Text>
      <Text color="gray"><Text color="yellow">[l]</Text> {L.hint.load}</Text>
      <Text color="gray"><Text color="yellow">[i]</Text> {L.hint.dict}</Text>
      <Text color="gray"><Text color="yellow">[q]</Text> {L.hint.quit}</Text>
    </Box>
  );
}

// ── 主 App ────────────────────────────────────────────────────────────────

export function App({ scenario }) {
  const { exit } = useApp();
  const L = getLocale(scenario?.lang ?? 'zh').ui;
  const [session, setSession] = useState(null);
  const [vs, setVs] = useState(null);
  const [logs, setLogs] = useState([]);
  const [selected, setSelected] = useState(null); // 1-based
  const [awaitTarget, setAwaitTarget] = useState(false);
  const [showDict, setShowDict] = useState(false);
  const [notice, setNotice] = useState(null);  // 一次性提示（存档等非日志操作）

  useEffect(() => {
    createSession(scenario).then((s) => {
      setSession(s);
      setVs(s.getViewState());
      // 修复：消费 startBattle 产生的初始日志
      if (s.initialLogs?.length) setLogs(s.initialLogs);
    }).catch(e => {
      process.stderr.write(getLocale(scenario?.lang ?? 'zh').cli.initFail(e.message) + '\n');
      process.exit(1);
    });
  }, []);

  useInput((input) => {
    if (!session || !vs) return;

    // 战斗结束后只允许 q 退出
    if (vs.over) { if (input === 'q') exit(); return; }

    // 状态词典开关
    if (input === 'i') { setShowDict(v => !v); return; }
    if (showDict) return;

    if (input === 'q') {
      if (awaitTarget) { setSelected(null); setAwaitTarget(false); return; }
      exit(); return;
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
      } catch (e) {
        setNotice(L.notice.saveFail(e.message));
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

    const n = parseInt(input);
    if (isNaN(n) || n < 1) return;

    if (awaitTarget) {
      const enemy = vs.enemies.find(e => e.slot === n);
      if (!enemy) return;  // 无效槽位，静默忽略
      const card = vs.hand[selected - 1];
      const target = enemy.entityId;
      const result = session.play(card.instanceId, target);
      setLogs(prev => [...prev, ...result.logs]);
      setVs(result.state);
      if (result.success !== false) {
        setSelected(null); setAwaitTarget(false); setNotice(null);
      } else {
        setNotice(L.notice.playFailed);
      }
      return;
    }

    if (n > vs.hand.length) return;
    const card = vs.hand[n - 1];
    const tt = card.targetType;

    if (tt === 'enemy' && vs.enemies.length > 1) {
      setSelected(n); setAwaitTarget(true);
    } else {
      const target = tt === 'enemy' ? vs.enemies[0]?.entityId : null;
      const result = session.play(card.instanceId, target);
      setLogs(prev => [...prev, ...result.logs]);
      setVs(result.state);
      if (result.success !== false) {
        setSelected(null); setNotice(null);
      } else {
        setNotice(L.notice.playFailed);
      }
    }
  });

  // ── 加载中 ────────────────────────────────────────────────────────────
  if (!vs) {
    return (
      <Box padding={2} flexDirection="column" gap={1}>
        <Text color="yellowBright" bold>{L.title}</Text>
        <Text color="gray">{L.loading}</Text>
      </Box>
    );
  }

  // ── 战斗结束 ──────────────────────────────────────────────────────────
  if (vs.over) {
    return (
      <Box padding={2} flexDirection="column" gap={1}>
        <Text bold color={vs.victory ? 'greenBright' : 'redBright'}>
          {vs.victory ? L.victory : L.defeat}
        </Text>
        <Text color="gray">{L.pressQuit}</Text>
      </Box>
    );
  }

  const sdm = session?.displayMaps?.statusDisplayMap ?? {};

  // 按源分组的状态列表（已由 presenter.buildViewState 构建，直接使用）
  const statusGroups = vs.statusGroups ?? [];

  // ── 主界面 ────────────────────────────────────────────────────────────
  return (
    <Box flexDirection="column">

      {/* ── 顶栏 */}
      <Box gap={3} paddingX={1} borderStyle="single" borderColor="gray">
        <Text bold color="yellowBright">{L.title}</Text>
        <Text color="white">{L.turn(vs.turn)}</Text>
        <Text color="gray">
          {L.pileLabels.draw}<Text color="white">{vs.piles.draw}</Text>
          {' '}{L.pileLabels.discard}<Text color="white">{vs.piles.discard}</Text>
          {' '}{L.pileLabels.exhaust}<Text color="white">{vs.piles.exhaust}</Text>
        </Text>
      </Box>

      {/* ── 战场：玩家 | 敌人横排 */}
      <Box flexDirection="row" gap={1} paddingX={1}>
        <PlayerPanel player={vs.player} sdm={sdm} L={L} />
        {vs.enemies.map((e) => (
          <EnemyPanel key={e.slot} enemy={e} sdm={sdm} highlight={awaitTarget} L={L} />
        ))}
      </Box>

      {/* ── 手牌纵向列表 */}
      <Box flexDirection="column" paddingX={1} marginTop={1}
        borderStyle="single" borderColor="gray">
        <Text color="gray" dimColor>{L.handCount(vs.hand.length)}</Text>
        {vs.hand.map((c, i) => (
          <CardRow
            key={c.instanceId}
            card={c}
            index={i + 1}
            selected={selected === i + 1}
            L={L}
          />
        ))}
      </Box>

      {/* ── 状态词典覆盖层 或 日志 */}
      <Box paddingX={1} marginTop={1}>
        {showDict
          ? <StatusDict statuses={statusGroups} sdmFull={sdm} L={L} />
          : <LogPanel logs={logs} L={L} />
        }
      </Box>

      {/* ── notice 提示条（存档等非日志操作的一次性反馈） */}
      {notice && (
        <Box paddingX={1}>
          <Text color="greenBright">{notice}</Text>
        </Box>
      )}

      {/* ── 提示栏 */}
      <Box marginTop={0}>
        <HintBar handLen={vs.hand.length} awaitTarget={awaitTarget} showDict={showDict} L={L} />
      </Box>

    </Box>
  );
}

