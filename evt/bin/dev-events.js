/**
 * evt/bin/dev-events.js — 打印静态事件链树（开发分析工具）
 *
 * 用法：
 *   node evt/bin/dev-events.js
 *
 * 从所有已注册的 core rules 和 status modules 中静态分析 State.emit() 调用，
 * 构建事件衍生树并以 archy 格式输出到 stdout。
 * 注意：仅包含 core/statuses 模块，不含 enemies/cards（其触发器是动态分派的）。
 */
import { ALL_STATUS_MODULES } from '../sts/statuses/core.js';
import { ALL_CORE_RULES }     from '../sts/core.js';
import { EVENTS }             from '../sts/events.js';
import { getEventHooks }      from '../core/hooks.js';
import archy                  from 'archy';

// ── emit 提取 ──────────────────────────────────────────────────────────────

/**
 * 从 Lua 脚本文本中提取 State.emit('event', {...}) 调用。
 * 返回带标注字符串，如 "status:remove[block]"，用于在树中显示 typeId。
 */
function extractEmits(script) {
  const found = new Map();
  const re  = /State\.emit\(\s*['"]([^'"]+)['"]\s*,\s*\{([^}]*)\}/gs;
  const re2 = /State\.emit\(\s*['"]([^'"]+)['"]\s*,\s*\{\s*\}/g;
  let m;
  while ((m = re.exec(script))  !== null) {
    const event = m[1];
    const tid   = m[2].match(/typeId\s*=\s*['"]([^'"]+)['"]/);
    const label = tid ? `${event}[${tid[1]}]` : event;
    if (!found.has(label)) found.set(label, label);
  }
  while ((m = re2.exec(script)) !== null) {
    if (!found.has(m[1])) found.set(m[1], m[1]);
  }
  return [...found.values()];
}

// ── 构建 event → handlers 映射 ─────────────────────────────────────────────

const map = new Map();
for (const event of Object.keys(EVENTS)) map.set(event, []);

function addTriggers(mod) {
  for (const t of getEventHooks(mod)) {
    const bucket = map.get(t.name);
    if (!bucket) continue;
    bucket.push({ registeredBy: mod.id, order: t.order ?? 0, emits: extractEmits(t.script) });
  }
}
for (const rule of ALL_CORE_RULES)     addTriggers(rule);
for (const mod  of ALL_STATUS_MODULES) addTriggers(mod);
for (const arr  of map.values()) arr.sort((a, b) => b.order - a.order);

// ── 判断入口事件 ────────────────────────────────────────────────────────────

const emittedByHandlers = new Set();
for (const hs of map.values())
  for (const h of hs)
    for (const label of h.emits)
      emittedByHandlers.add(label.replace(/\[.*\]$/, ''));

// ── 递归构建 archy 节点 ─────────────────────────────────────────────────────

const pad   = (n) => String(n >= 0 ? '+' + n : n).padStart(5);
const shown = new Set();
const shownEvents = new Set();

function buildNode(emitLabel, visited = new Set()) {
  const event = emitLabel.replace(/\[.*\]$/, '');
  const hs    = map.get(event) ?? [];

  if (shown.has(emitLabel)) return emitLabel;
  shown.add(emitLabel);
  shownEvents.add(event);

  const isRoot    = !emittedByHandlers.has(event);
  const nodeLabel = isRoot ? `${emitLabel}  [entry]` : emitLabel;
  const next      = new Set([...visited, event]);

  const nodes = hs.map(h => {
    const label = `[${pad(h.order)}]  ${h.registeredBy}`;
    if (!h.emits.length) return label;
    const children = h.emits.map(child => {
      if (next.has(child.replace(/\[.*\]$/, ''))) return `${child}  (circular)`;
      const node = buildNode(child, next);
      return typeof node === 'string' ? `${child}  (see above)` : node;
    });
    return { label, nodes: children };
  });

  return { label: nodeLabel, nodes };
}

// ── 输出 ────────────────────────────────────────────────────────────────────

const totalHandlers = [...map.values()].reduce((s, a) => s + a.length, 0);
process.stdout.write(`\nSlay the Spire  Event Chain\n`);
process.stdout.write(`${map.size} events, ${totalHandlers} handlers\n\n`);

// 根事件（未被任何 handler emit 的）
const roots = [...map.keys()].filter(
  e => !emittedByHandlers.has(e) && (map.get(e)?.length ?? 0) > 0
);
for (const root of roots) process.stdout.write(archy(buildNode(root)));

// 孤立事件（有 handler 但未被根树覆盖）
for (const [event, hs] of map) {
  if (shownEvents.has(event) || !hs.length) continue;
  process.stdout.write(archy(buildNode(event)));
}
