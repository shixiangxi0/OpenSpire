/**
 * test/helpers.js — 测试工具层
 *
 * 职责：
 *   - makeEngine()   构造引擎并收集 bundles，绕过 session 层
 *   - loadState()    精确外科手术式状态修改（patch 快照）
 *   - getTimeline()  从 bundles 提取按 seq 排序的事件序列
 *   - 常用状态读取工具：pl / enemy / st / ep
 *
 * bundle 结构（onBundle 收到的）：
 *   { rootEvent, patches: [{path, before, after}], timeline: [{kind, action, seq, payload, ...}] }
 *
 * timeline 说明：
 *   - timeline 数组是后序（子事件先 push），按 seq 排序才是逻辑执行顺序
 *   - seq 是进入事件时的前序编号，代表真实触发顺序
 */
import { createEngine } from '../index.js';
import { stsModule }    from '../sts/index.js';
import { loadModules }  from '../game/loader.js';
import { buildBattleStore } from '../game/builder.js';

// ── 无攻击假敌人：隔离玩家侧效果时使用 ─────────────────────────────────────
export const DUMMY_ENEMY = {
  id: 'dummy',
  display: { name: 'Dummy' },
  actions: { wait: { type: 'buff', desc: 'Does nothing.' } },
  hooks: {
    'event:enemy:action': { match: { target: 'self' }, script: `
return
` },
    'event:enemy:update': { match: { target: 'self' }, script: `
State.set('entities', Ctx.self, 'intent', 'wait')
` },
  },
};

// ── 引擎构造 ─────────────────────────────────────────────────────────────────

/**
 * 构造引擎并启动战斗，返回 { engine, bundles }。
 *
 * @param {object} scenario
 *   player  — 覆盖默认玩家初始属性（hp/maxHp/energy/maxEnergy/drawPerTurn/statuses）
 *   enemies — [{ typeId, hp, maxHp? }]，按 slot 1,2,3 顺序排列
 *   deck    — [{ cardId }] 或 ['cardId']（字符串简写）
 *
 * @param {object} extras
 *   enemies — 注入自定义敌人类型（如 { dummy: DUMMY_ENEMY }）
 *
 * @returns {{ engine: object, bundles: object[] }}
 *   engine  — createEngine 返回对象
 *   bundles — 每次根事件产生的 bundle，顺序追加
 *             调用方可在操作前执行 bundles.length = 0 清空缓冲
 */
export async function makeEngine(scenario = {}, extras = {}) {
  const bundles = [];
  const { cards, character } = loadModules(extras);

  const engine = await createEngine({ onBundle: b => bundles.push(b) });

  engine.use(stsModule);

  // 注入测试夹具中的额外定义（额外卡牌 / 敌人类型）
  if (extras.cards || extras.enemies) {
    engine.use({
      defs: {
        ...(extras.cards   && { card:  extras.cards }),
        ...(extras.enemies && { enemy: extras.enemies }),
      },
    });
  }

  const player = {
    drawPerTurn: 0,
    statuses: {},
    ...(scenario.player ?? {}),
  };

  const enemiesInit = {};
  (scenario.enemies ?? []).forEach((e, i) => {
    enemiesInit[String(i + 1)] = {
      typeId:  e.typeId,
      hp:      e.hp ?? 40,
      maxHp:   e.maxHp ?? e.hp ?? 40,
    };
  });

  const deck = (scenario.deck ?? []).map(c =>
    typeof c === 'string' ? { cardId: c } : c
  );

  const store = buildBattleStore({
    initial: { player, enemies: enemiesInit, deck },
    cards,
    character,
  });

  // 启动战斗：重置状态 → 触发 battle:start
  engine.load(store);
  engine.state.emit('battle:start', {});

  // 清掉 battle:start 期间产生的 bundles，让调用方的断言只看操作本身
  bundles.length = 0;

  // 测试侧便捷包装，直接复用正式 card:play / turn:end / load API
  engine.playCard = (instanceId, target = null) => {
    const state = engine.getState();
    if (state.battle?.over)                return { success: false, reason: 'battle_over' };
    if (!state.hand?.includes(instanceId)) return { success: false, reason: 'not_in_hand' };
    const result = engine.state.emit('card:play', {
      instanceId,
      cardId: state.cards?.[instanceId]?.cardId,
      target,
      cost:   state.cards?.[instanceId]?.cost,
    });
    return { success: !result.cancelled, reason: result.cancelled ? 'cancelled' : null };
  };
  engine.endTurn   = () => { if (!engine.getState().battle?.over) engine.state.emit('turn:end', {}); };
  engine.loadState = (snapshot) => engine.load(snapshot);

  return { engine, bundles };
}

// ── 状态工具 ─────────────────────────────────────────────────────────────────

/**
 * 克隆当前状态，通过 fn 修改，压回引擎。
 * 用于在不触发任何事件的情况下精确设置初始条件。
 *
 * @example
 *   loadState(engine, s => setStatus(s, 'player', 'strength', 3));
 */
export function loadState(engine, fn) {
  const s = JSON.parse(JSON.stringify(engine.getState()));
  fn(s);
  engine.load(s);
}

/**
 * 设置（或清除）任意实体的 status stacks。
 * entityId: 'player' | 'jaw_worm_1'
 *
 * @example
 *   setStatus(state, 'player', 'poison', 5);
 *   setStatus(state, ep(engine), 'vulnerable', 2);
 */
export function setStatus(state, entityId, typeId, stacks) {
  const obj = state.entities?.[entityId];
  if (!obj) throw new Error(`unknown entityId "${entityId}"`);
  if (!obj.statuses) obj.statuses = {};

  const bindKey = entityId + ':' + typeId;
  if (stacks > 0) {
    obj.statuses[typeId] = { stacks };
    // 同步更新 _bindings，确保 engine.load() 重放时触发器能被注册
    if (!state._bindings) state._bindings = {};
    state._bindings[bindKey] = {
      kind: 'status',
      id: typeId,
      ctx: { self: entityId },
    };
  } else {
    delete obj.statuses[typeId];
    if (state._bindings) delete state._bindings[bindKey];
  }
}

/**
 * 设置任意实体的 block（等价于 setStatus，但语义更明确）
 *
 * @example
 *   setBlock(state, 'player', 5);
 */
export function setBlock(state, entityId, stacks) {
  setStatus(state, entityId, 'block', stacks);
}

// ── 状态读取 ─────────────────────────────────────────────────────────────────

/** 返回 slot 1 敌人的 entity id */
export function ep(engine, slot = 1) {
  const eid = engine.getState().enemies[String(slot)];
  return eid ?? null;
}

/** 返回 slot 1 敌人的 entity 对象 */
export function enemy(engine, slot = 1) {
  const s = engine.getState();
  const eid = s.enemies[String(slot)];
  return eid ? s.entities[eid] : null;
}

/** 返回玩家对象 */
export function pl(engine) {
  return engine.getState().entities?.player;
}

/** 读取 entity 的 status stacks，不存在时返回 0 */
export function st(entity, statusId) {
  return entity?.statuses?.[statusId]?.stacks ?? 0;
}

// ── timeline 工具 ─────────────────────────────────────────────────────────────

/**
 * 从 bundles 提取完整的事件序列，按 seq 升序排序（= 逻辑触发顺序）。
 *
 * @param {object[]} bundles
 * @returns {{ action: string, event: string, seq: number, payload: object }[]}
 *
 * @example
 *   engine.playCard(strikeId, enemyPath);
 *   const tl = getTimeline(bundles);
 *   const actions = tl.map(e => e.action);
 *   expect(actions).toContain('ENTITY_ATTACK');
 */
export function getTimeline(bundles) {
  return bundles
    .flatMap(b => b.timeline)
    .sort((a, b) => a.seq - b.seq);
}

/**
 * 从 bundles 提取所有 patches（state diff），顺序与 bundle 顺序一致。
 *
 * @param {object[]} bundles
 * @returns {{ path: string, before: any, after: any }[]}
 */
export function getPatches(bundles) {
  return bundles.flatMap(b => b.patches);
}

/**
 * 在 timeline 中按 action 名查找第一个匹配项（可附加 payload 条件）。
 *
 * @param {object[]} tl       — getTimeline() 的返回值
 * @param {string}   action   — 如 'ENTITY_ATTACK'
 * @param {object}   [where]  — 额外 payload 过滤，如 { target: 'player' }
 *
 * @example
 *   const dmg = findEvent(tl, 'ENTITY_DAMAGE', { target: 'player' });
 *   expect(dmg.payload.amount).toBe(3);
 */
export function findEvent(tl, action, where = {}) {
  return tl.find(e => {
    if (e.action !== action) return false;
    return Object.entries(where).every(([k, v]) => e.payload[k] === v);
  });
}

/**
 * 在 timeline 中按 action 名查找所有匹配项。
 */
export function findAllEvents(tl, action, where = {}) {
  return tl.filter(e => {
    if (e.action !== action) return false;
    return Object.entries(where).every(([k, v]) => e.payload[k] === v);
  });
}
