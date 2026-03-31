#!/usr/bin/env node
/**
 * evt/bin/openspire.js — OpenSpire CLI 入口
 *
 * 用法：
 *   node evt/bin/openspire.js [场景名]          → ink 渲染模式（人类玩家）
 *   node evt/bin/openspire.js json <场景名>     → JSON 模式（AI / 程序对接）
 *
 * JSON 模式命令（stdin，每行一条 JSON）：
 *   {"cmd":"play","instanceId":"strike_1","target":"entities.jaw_worm_1"}
 *   {"cmd":"end"}
 *   {"cmd":"state"}
 *   {"cmd":"quit"}
 *
 * JSON 模式响应（stdout，每条一行 JSON）：
 *   { "ok": true,  "cmd": "...", "logs": [...], "state": {...} }
 *   { "ok": false, "cmd": "...", "error": "..." }
 *   { "ok": true,  "cmd": "over", "victory": true|false }
 *
 * 开发工具：
 *   node evt/bin/dev-events.js             → 打印静态事件链树
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname }          from 'node:path';
import { fileURLToPath }             from 'node:url';
import { createInterface }           from 'node:readline';
import { createSession }             from '../game/session.js';
import { getLocale }                 from '../game/locale.js';

const SCENARIOS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../scenarios');

// ── 场景工具 ──────────────────────────────────────────────────────────────────

function listScenarios() {
  return readdirSync(SCENARIOS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => f.replace('.json', ''));
}

function loadScenario(name) {
  const candidates = [name, resolve(SCENARIOS_DIR, `${name}.json`)];
  for (const p of candidates) {
    try { return JSON.parse(readFileSync(p, 'utf-8')); } catch {}
  }
  return null;
}

// ── Main Entry ───────────────────────────────────────────────────────────────

// Parse --lang argument (supports both --lang en and --lang=en formats)
const rawArgs = process.argv.slice(2);
let lang = 'en';
const filteredArgs = [];
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a.startsWith('--lang='))        { lang = a.slice(7); }
  else if (a === '--lang' && rawArgs[i + 1]) { lang = rawArgs[++i]; }
  else filteredArgs.push(a);
}
const [sub, scenarioArg] = filteredArgs;

if (sub === 'json') {
  await runJsonMode(scenarioArg);
} else {
  await runInkMode(sub);  // sub 此时是场景名（或 undefined）
}

// ── ink 渲染模式 ──────────────────────────────────────────────────────────────

async function runInkMode(scenarioArg) {
  const CLI    = getLocale(lang).cli;
  let scenario = loadScenario(scenarioArg);

  if (!scenario && scenarioArg) {
    process.stderr.write(CLI.sceneNotFound(scenarioArg, listScenarios().join(', ')));
    process.exit(1);
  }

  if (!scenario) scenario = await pickScenarioInteractive();
  scenario.lang = scenario.lang ?? lang;

  const React      = (await import('react')).default;
  const { render } = await import('ink');
  const { App }    = await import('../../ui/App.jsx');
  render(React.createElement(App, { scenario }));
}

async function pickScenarioInteractive() {
  const CLI  = getLocale(lang).cli;
  const list = listScenarios();
  const Y = '\x1b[33m', B = '\x1b[1m', R = '\x1b[0m';
  process.stdout.write(`\n${B}${Y}${CLI.title}${R}\n\n${CLI.selectScene}\n\n`);
  list.forEach((n, i) => process.stdout.write(`  ${Y}[${i + 1}]${R} ${n}\n`));
  process.stdout.write('\n');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => {
    rl.question('> ', answer => {
      rl.close();
      const n    = parseInt(answer.trim(), 10);
      const name = (n >= 1 && n <= list.length) ? list[n - 1] : list[0];
      res(JSON.parse(readFileSync(resolve(SCENARIOS_DIR, `${name}.json`), 'utf-8')));
    });
  });
}

// ── JSON 模式 ─────────────────────────────────────────────────────────────────

async function runJsonMode(scenarioArg) {
  const CLI = getLocale(lang).cli;
  const out = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');

  if (!scenarioArg) {
    out({ ok: false, error: CLI.jsonUsage, scenarios: listScenarios() });
    process.exit(1);
  }

  const scenario = loadScenario(scenarioArg);
  if (!scenario) {
    out({ ok: false, error: CLI.jsonSceneNotFound(scenarioArg), scenarios: listScenarios() });
    process.exit(1);
  }
  scenario.lang = scenario.lang ?? lang;

  // readline 必须在 createSession（Lua 初始化）之前创建，否则管道输入会被丢弃
  const rl = createInterface({ input: process.stdin });
  const lines = [];
  let notify;
  rl.on('line',  line => { lines.push(line); notify?.(); notify = null; });
  rl.on('close', ()   => { notify?.(); notify = null; });
  async function* readLines() {
    while (true) {
      if (lines.length) { yield lines.shift(); continue; }
      if (rl.closed)    break;
      await new Promise(r => { notify = r; });
    }
    while (lines.length) yield lines.shift();
  }

  const session = await createSession(scenario);
  out({ ok: true, cmd: 'init', logs: session.initialLogs, state: session.getViewState() });

  const COMMANDS = {
    state: () => ({ ok: true, logs: [], state: session.getViewState() }),

    play: ({ instanceId, target = null }) => {
      if (!instanceId) return { ok: false, error: CLI.playNeedId };
      const r = session.play(instanceId, target);
      return {
        ok: r.success !== false,
        logs: r.logs,
        state: r.state,
        ...(r.success === false ? { error: r.reason } : {}),
      };
    },

    end: () => {
      const r = session.endTurn();
      return { ok: true, logs: r.logs, state: r.state };
    },
  };

  for await (const line of readLines()) {
    const raw = line.trim();
    if (!raw) continue;
    let req;
    try { req = JSON.parse(raw); } catch {
      out({ ok: false, cmd: null, error: CLI.invalidJson }); continue;
    }

    const { cmd } = req;
    if (cmd === 'quit') break;

    const handler = COMMANDS[cmd];
    if (!handler) {
      out({ ok: false, cmd, error: CLI.unknownCmd(cmd) }); continue;
    }

    const result = handler(req);
    out({ ...result, cmd });

    if (result.ok) {
      const battle = session.getBattleResult();
      if (battle.over) {
        out({ ok: true, cmd: 'over', victory: battle.victory, logs: [], state: result.state });
        break;
      }
    }
  }
}
