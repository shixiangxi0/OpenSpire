/**
 * game/builder.js — 战斗初始 store 构建（纯函数，无副作用）
 *
 * buildBattleStore({ initial, cards, character }) → store
 *
 * 职责：将语义化的战斗参数转换成引擎所需的完整 store 对象。
 * 引擎不应知道这些转换规则——它们属于游戏层。
 *
 * initial 字段：
 *   player  — 覆盖角色基础属性（存档读档时传入当前 hp 等）
 *   enemies — { [slot]: { typeId, hp, maxHp? } }
 *   deck    — [{ cardId, instanceId?, ...overrides }] 或 ['cardId']
 */

/**
 * @param {object} opts
 * @param {object} opts.initial    语义化战斗参数
 * @param {object} opts.cards      卡牌定义字典 id → def
 * @param {object} opts.character  角色定义（含 baseStats）
 * @returns {object} 完整 store 对象，可直接传给 engine.load
 */
export function buildBattleStore({ initial = {}, cards = {}, character = {} }) {
  // ── 牌堆：将语义卡牌列表转为实例字典 + 有序 id 列表 ──────────────────────
  const cardEntities = {};
  const deckIds = [];
  const seenIds = {};
  for (const c of (initial.deck ?? [])) {
    const { cardId, instanceId, ...overrides } =
      typeof c === 'string' ? { cardId: c } : c;
    seenIds[cardId] = (seenIds[cardId] ?? 0) + 1;
    const iid = instanceId ?? `${cardId}_${seenIds[cardId]}`;
    // 只保留运行时数据字段，剥离定义层字段（triggers / display）
    const { triggers: _, display: __, ...baseData } = cards[cardId] ?? {};
    cardEntities[iid] = { cardId, ...baseData, ...overrides };
    deckIds.push(iid);
  }

  // ── 敌人：slot → entityId 映射 + 实体数据 ────────────────────────────────
  const entities = {
    player: {
      statuses: {},
      ...(character.baseStats ?? {}),
      ...(initial.player ?? {}),
    },
  };
  const enemySlots = {};
  for (const [slot, e] of Object.entries(initial.enemies ?? {})) {
    if (!e) { enemySlots[slot] = null; continue; }
    const eid = `${e.typeId}_${slot}`;
    entities[eid] = { typeId: e.typeId, hp: e.hp, maxHp: e.maxHp ?? e.hp, statuses: {} };
    enemySlots[slot] = eid;
  }

  return {
    enemies:     enemySlots,
    entities,
    cards:       cardEntities,
    drawPile:    deckIds,
    hand:        [],
    discardPile: [],
    exhaustPile: [],
    battle: { over: false, victory: false },
  };
}
