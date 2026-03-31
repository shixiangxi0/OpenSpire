/**
 * game/summarize.js — bundle → 日志行
 *
 * summarizeBundle(bundle, ctx) 将一次 fire() 产生的 bundle.timeline 转化为
 * 人类可读的中文日志行列表。
 *
 * ctx 结构（来自 presenter.buildCtx）：
 *   {
 *     resolveName:   (id) => string,      // 'player'/enemyId/cardId/statusId → 显示名
 *     getStatusName: (typeId) => string,
 *     getCardName:   (cardId) => string,
 *     log:           object,             // locale.log 模板函数集
 *   }
 *
 * 格式约定：
 *   ctx.resolveName 统一处理所有实体 id，summarize 本身不关心底层 state schema。
 *   enemy 事件直接使用 enemy entity id，不再用 slot 或 entities.<id> path。
 */

// ── 日志模板表 ────────────────────────────────────────────────────────────────
// 每项：(payload, ctx) => string | null
// 返回 null 时不输出（静默事件）

// ctx.log 由 presenter.buildCtx() 注入，内容来自 locale.js
const LOG_LINES = {
  'entity:damage': (p, ctx) => {
    const L   = ctx.log;
    const net         = p.actualDamage ?? p.amount ?? 0;
    const blocked     = p.blocked ?? 0;
    const weakReduced = p.weakReduced ?? 0;
    const mods = [];
    if (weakReduced > 0) mods.push(L.weakReduced(weakReduced));
    if (blocked > 0)     mods.push(L.blocked(blocked));
    return L.damage(ctx.resolveName(p.source), ctx.resolveName(p.target), net, mods, !!p.isFatal);
  },

  'entity:block':  (p, ctx) => ctx.log.blockGain(ctx.resolveName(p.target), p.amount ?? 0),

  'status:apply': (p, ctx) => {
    if (p.typeId === 'block') return null;  // block 的「获得」已由 entity:block 行输出
    const L      = ctx.log;
    const target = ctx.resolveName(p.target);
    const name   = ctx.getStatusName(p.typeId);
    const stacks = p.stacks ?? 1;
    if (stacks < 0) return L.statusReduce(target, name, Math.abs(stacks));
    return L.statusGain(target, name, stacks);
  },

  'status:remove': (p, ctx) => {
    if (p.typeId === 'block') return null;  // block 自动清除静默（UI 面板已显示）
    return ctx.log.statusRemove(ctx.resolveName(p.target), ctx.getStatusName(p.typeId));
  },

  'card:play':    (p, ctx) => ctx.log.cardPlay(ctx.getCardName(p.cardId)),
  'card:drawn':   (p, ctx) => ctx.log.cardDraw(ctx.getCardName(p.cardId)),
  'card:discard': () => null,
  'card:exhaust': (p, ctx) => ctx.log.cardExhaust(ctx.getCardName(p.cardId)),

  'player:turn:start': (_, ctx) => ctx.log.playerTurnStart,
  'player:turn:end':   (_, ctx) => ctx.log.playerTurnEnd,

  'enemy:action': (p, ctx) => {
    const name = ctx.resolveName(p.target);
    const desc = ctx.getEnemyActionDesc(p.target, p.action);
    return ctx.log.enemyAction(name, desc);
  },

  // 敌人回合由 turnSequenceCore 直接 emit actor:turn:start { target=ep }
  'actor:turn:start': (p, ctx) => {
    if (!p.target || p.target === 'player') return null;
    return ctx.log.enemyActStart(ctx.resolveName(p.target));
  },
  'actor:turn:end':   () => null,

  // 直接扣血（穿透格挡）：仅在发起方显式标记 direct=true 时才输出，
  // 避免与 entity:damage → damageLossCore 的内部链式 entity:loss 重复。
  'entity:loss': (p, ctx) => {
    if (!p.direct) return null;
    const net = p.actualLoss ?? p.amount ?? 0;
    return ctx.log.loss(ctx.resolveName(p.source), ctx.resolveName(p.target), net);
  },

  'entity:die':  (p, ctx) => ctx.log.die(ctx.resolveName(p.target)),
  'entity:heal': (p, ctx) => ctx.log.heal(ctx.resolveName(p.target), p.amount ?? 0),

  'battle:end': (p, ctx) => p.victory ? ctx.log.battleVictory : ctx.log.battleDefeat,
  'turn:end':     () => null,
  'battle:start': (_, ctx) => ctx.log.battleStart,
  'deck:deplete': () => null,
};

// ── 主函数 ────────────────────────────────────────────────────────────────────

/**
 * @param {object} bundle
 * @param {object} ctx  presenter.buildCtx() 的返回值
 * @returns {string[]}
 */
export function summarizeBundle(bundle, ctx) {
  const lines = [];
  // 按 seq（事件开始序号）升序排列，还原正确的时间顺序。
  // fire.js 在所有 handler（含嵌套 emit）跑完后才 push 根事件，
  // 导致根事件物理上排在 timeline 末尾；seq 记录事件"开始"时刻，排序可修复。
  const sorted = [...(bundle.timeline ?? [])].sort((a, b) => a.seq - b.seq);
  for (const entry of sorted) {
    const handler = LOG_LINES[entry.event];
    if (!handler) continue;
    const line = handler(entry.payload ?? {}, ctx);
    if (line != null) lines.push(line);
  }
  return lines;
}
