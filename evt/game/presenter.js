/**
 * game/presenter.js — 展示层（Presenter）
 *
 * 职责：把引擎原始状态（raw store）转换成 UI/CLI 消费的视图对象。
 * 与引擎解耦：不直接访问 engine，只依赖静态模块元数据和外部传入的原始状态。
 *
 * 导出：
 *   createPresenter({ cards, statusDisplayMap, enemyDisplayMap, lang })
 *     → { buildCtx, buildViewState }
 *
 *   formatCompact(viewState, logs) → 紧凑文本行数组（供 REPL 使用）
 */
import { getLocale } from './locale.js';

// ── 工厂：依赖静态模块元数据 ─────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {object} opts.cards           卡牌定义字典  id → def
 * @param {object} opts.statusDisplayMap 状态显示字典  id → { name, desc }
 * @param {object} opts.enemyDisplayMap  敌人显示字典  typeId → { display, actions }
 * @param {string} [opts.lang='zh']     显示语言
 */
export function createPresenter({ cards, statusDisplayMap, enemyDisplayMap, lang = 'zh' }) {
  const locale = getLocale(lang);

  function _getEnemyName(slot, state) {
    const eid    = state.enemies?.[slot];
    const typeId = eid ? state.entities?.[eid]?.typeId : null;
    return enemyDisplayMap[typeId]?.display?.name ?? typeId ?? locale.enemyFallback(slot);
  }

  function _getSourceName(src, state) {
    if (!src) return locale.unknown;
    if (src === 'player') return locale.player;
    if (state.entities?.[src]) {
      const typeId = state.entities?.[src]?.typeId;
      return enemyDisplayMap[typeId]?.display?.name ?? typeId ?? src;
    }
    if (cards[src]?.display?.name) return cards[src].display.name;
    if (statusDisplayMap[src]?.name) return statusDisplayMap[src].name;
    return src;
  }

  /**
   * 构建 summarizeBundle 所需的 ctx 对象。
   * @param {() => object} getState  返回引擎当前原始状态的函数
   */
  function buildCtx(getState) {
    return {
      // 统一名称解析：'player'/enemyId/cardId/statusId → 显示名
      resolveName:   (id)             => _getSourceName(id, getState()),
      getStatusName: (id)             => statusDisplayMap[id]?.name ?? id,
      getCardName:   (id)             => cards[id]?.display?.name ?? id,
      // 给定 entity id 和 actionId，返回该行动的 desc（UI 数据）
      getEnemyActionDesc: (entityId, actionId) => {
        const state  = getState();
        const typeId = state.entities?.[entityId]?.typeId;
        return enemyDisplayMap[typeId]?.actions?.[actionId]?.desc ?? actionId;
      },
      // 日志模板（供 summarize.js 使用）
      log: locale.log,
    };
  }

  /**
   * 为 statuses 对象里每个 status 注入 desc（模板替换后的说明文字）。
   * 原始: { strength: { stacks: 5 } }
   * 输出: { strength: { stacks: 5, desc: "攻击额外造成 5 点伤害" } }
   */
  function enrichStatuses(rawStatuses) {
    if (!rawStatuses || typeof rawStatuses !== 'object') return {};
    const result = {};
    for (const [id, val] of Object.entries(rawStatuses)) {
      const stacks   = typeof val === 'object' ? val.stacks : val;
      const template = statusDisplayMap[id]?.desc ?? null;
      const desc     = template
        ? template.replace(/\{stacks\}/g, stacks ?? 0)
        : null;
      result[id] = desc !== null ? { stacks, desc } : { stacks };
    }
    return result;
  }

  /**
   * 把引擎原始状态转换成 UI 视图对象。
   * @param {object} state  engine.getState() 的返回值
   */
  function buildViewState(state) {
    // 敌方视图（过滤死亡敌人）
    const enemies = [];
    for (const slot of Object.keys(state.enemies ?? {}).sort()) {
      const eid = state.enemies[slot];
      if (!eid) continue;
      const e = state.entities?.[eid];
      if (!e || e.hp <= 0) continue;
      const disp = enemyDisplayMap[e.typeId] ?? {};
      const intentAction = disp.actions?.[e.intent];
      enemies.push({
        slot:         Number(slot),
        typeId:       e.typeId,
        entityId:     eid,
        name:         disp.display?.name ?? e.typeId,
        hp:           e.hp,
        maxHp:        e.maxHp,
        block:        e.statuses?.block?.stacks ?? 0,
        statuses:     enrichStatuses(e.statuses),
        intentType:   intentAction?.type ?? null,
        intentDesc:   intentAction?.desc ?? (e.intent ?? locale.unknown),
      });
    }

    // 手牌
    const hand = (state.hand ?? []).map(iid => {
      const inst = state.cards?.[iid] ?? {};
      const def  = cards[inst.cardId] ?? {};
      const d    = def.display ?? {};
      return {
        instanceId: iid,
        cardId:     inst.cardId,
        display:    d,
        cost:       inst.cost ?? def.cost ?? 0,
        targetType: def.targetType ?? 'none',
        exhaust:    def.exhaust ?? false,
      };
    });

    const player = state.entities?.player ?? {};
    const playerStatuses = enrichStatuses(player.statuses);

    return {
      player: {
        hp:        player.hp        ?? 0,
        maxHp:     player.maxHp     ?? 70,
        energy:    player.energy    ?? 0,
        maxEnergy: player.maxEnergy ?? 3,
        block:     player.statuses?.block?.stacks ?? 0,
        statuses:  playerStatuses,
      },
      enemies,
      hand,
      piles: {
        draw:    (state.drawPile    ?? []).length,
        discard: (state.discardPile ?? []).length,
        exhaust: (state.exhaustPile ?? []).length,
      },
      turn:    state.turn ?? 1,
      over:    state.battle?.over    ?? false,
      victory: state.battle?.victory ?? false,
      // 按源分组的状态列表（供 ink 词典面板使用）
      statusGroups: [
        { title: locale.player, values: playerStatuses },
        ...enemies.map(e => ({ title: e.name, values: e.statuses })),
      ],
    };
  }

  return { buildCtx, buildViewState };
}
