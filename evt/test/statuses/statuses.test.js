// @ts-nocheck
/**
 * evt/test/statuses/statuses.test.js — 状态效果验证
 *
 * 验证策略：
 *   每个 describe 对应一个 status，通过 setStatus 直接把状态注入初始快照，
 *   再通过 endTurn / playCard 触发对应时机，验证最终状态或 timeline 事件。
 *
 * 已在 attack.test.js 覆盖的状态（跳过）：
 *   strength, weak, vulnerable, rupture, frenzy, thorns, block（清零）
 *
 * 实体路径规范：
 *   setStatus(s, 'player', ...)  — 玩家
 *   setStatus(s, epath, ...)     — 敌人；epath = ep(engine) 返回 'entities.{eid}'
 *   注：不能用字面量 'enemy'，该键在 state 结构中不存在
 *
 * 敌人行动影响：jaw_worm 每次 endTurn 会 bite(11)。
 *   需要断言玩家 HP 时，使用 DUMMY_ENEMY（不攻击）。
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  makeEngine, loadState, setStatus, setBlock,
  ep, enemy, pl, st,
  getTimeline, findEvent, findAllEvents,
  DUMMY_ENEMY,
} from '../helpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// ritual（仪式）— actor:turn:end → 获得 stacks 层力量
// ─────────────────────────────────────────────────────────────────────────────
// 验证策略：
//   1. 敌人有 ritual:2，endTurn actor:turn:end 触发 → 敌人 strength+2
//   2. 玩家有 ritual:3，endTurn actor:turn:end 触发 → 玩家 strength+3
//   3. ritual stacks 不递减（永久性）
describe('ritual', () => {
  let engine, snap, epath;
  beforeAll(async () => {
    ({ engine } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    [],
    }));
    snap  = engine.getState();
    epath = ep(engine);  // 'entities.jaw_worm_1'
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); });

  it('敌人有 ritual:2：回合结束后敌人获得 strength:2', () => {
    loadState(engine, s => setStatus(s, epath, 'ritual', 2));
    engine.endTurn();
    expect(st(enemy(engine), 'strength')).toBe(2);
  });

  it('玩家有 ritual:3：回合结束后玩家获得 strength:3', () => {
    loadState(engine, s => setStatus(s, 'player', 'ritual', 3));
    engine.endTurn();
    expect(st(pl(engine), 'strength')).toBe(3);
  });

  it('ritual stacks 不递减（永久型 buff）', () => {
    loadState(engine, s => setStatus(s, epath, 'ritual', 2));
    engine.endTurn();
    expect(st(enemy(engine), 'ritual')).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// card_tax（契约税）— card:play → 持有者每打出一张牌受 N 点伤害
// ─────────────────────────────────────────────────────────────────────────────
// 验证策略：
//   card_tax 使用 entity:damage（经格挡流程）；玩家无格挡时全额扣 HP。
//   drawPerTurn:2 确保两张 strike 都在手牌中。
describe('card_tax', () => {
  let engine, snap;
  beforeAll(async () => {
    ({ engine } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 2 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['strike', 'strike'],
    }));
    snap = engine.getState();
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); });

  it('card_tax:3：打出 1 张牌后玩家 HP-3', () => {
    loadState(engine, s => setStatus(s, 'player', 'card_tax', 3));
    const hpBefore = pl(engine).hp;
    engine.playCard(engine.getState().hand[0], ep(engine));
    expect(pl(engine).hp).toBe(hpBefore - 3);
  });

  it('card_tax:2：打出 2 张牌后玩家 HP-4（各减 2）', () => {
    loadState(engine, s => setStatus(s, 'player', 'card_tax', 2));
    const hpBefore = pl(engine).hp;
    const [c1, c2] = engine.getState().hand;
    engine.playCard(c1, ep(engine));
    engine.playCard(c2, ep(engine));
    expect(pl(engine).hp).toBe(hpBefore - 4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// demon_form（恶魔化）— player:turn:start → 获得 stacks×3 层力量
// ─────────────────────────────────────────────────────────────────────────────
// 验证策略：
//   demon_form 订阅 player:turn:start order=-50（早于主摸牌 order=0）。
//   endTurn 后 player:turn:start 触发，玩家获得力量。检查 strength 不检查 HP。
describe('demon_form', () => {
  let engine, snap;
  beforeAll(async () => {
    ({ engine } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    [],
    }));
    snap = engine.getState();
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); });

  it('demon_form:1 → 下回合开始时玩家获得 strength:3', () => {
    loadState(engine, s => setStatus(s, 'player', 'demon_form', 1));
    engine.endTurn();
    expect(st(pl(engine), 'strength')).toBe(3);
  });

  it('demon_form:2 → 下回合开始时玩家获得 strength:6', () => {
    loadState(engine, s => setStatus(s, 'player', 'demon_form', 2));
    engine.endTurn();
    expect(st(pl(engine), 'strength')).toBe(6);
  });

  it('demon_form 不影响敌人（敌人无 strength 变化）', () => {
    loadState(engine, s => setStatus(s, 'player', 'demon_form', 1));
    engine.endTurn();
    expect(st(enemy(engine), 'strength')).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extra_draw（额外摸牌）— player:turn:start → 额外摸 N 张牌
// ─────────────────────────────────────────────────────────────────────────────
// 验证策略：drawPerTurn 默认 0，endTurn 后下一回合只摸 extra_draw 张。
describe('extra_draw', () => {
  let engine, snap;
  beforeAll(async () => {
    ({ engine } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['strike', 'strike', 'strike', 'strike', 'strike'],
    }));
    snap = engine.getState();
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); });

  it('extra_draw:1 → 下回合手牌 = 0(drawPerTurn) + 1(extra) = 1', () => {
    loadState(engine, s => setStatus(s, 'player', 'extra_draw', 1));
    engine.endTurn();
    expect(engine.getState().hand.length).toBe(1);
  });

  it('extra_draw:2 → 下回合手牌 = 0 + 2 = 2', () => {
    loadState(engine, s => setStatus(s, 'player', 'extra_draw', 2));
    engine.endTurn();
    expect(engine.getState().hand.length).toBe(2);
  });

  it('extra_draw 状态在下回合后不递减（持久 buff）', () => {
    loadState(engine, s => setStatus(s, 'player', 'extra_draw', 2));
    engine.endTurn();
    expect(st(pl(engine), 'extra_draw')).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// poison（中毒）— actor:turn:end → 受 N 点伤害，且 poison stacks-1
// ─────────────────────────────────────────────────────────────────────────────
// 实现细节：poison 使用 entity:damage（经格挡流程）。
// 关键机制：敌人格挡在 actor:turn:START 清零（早于 actor:turn:END 的中毒触发），
//   故中毒在敌人格挡已清零后才触发，实际上无法被同轮新获得的格挡抵消。
// 使用 DUMMY_ENEMY 避免 jaw_worm bite(11) 干扰 player.hp 断言。
describe('poison', () => {
  let engine, snap, epath;
  beforeAll(async () => {
    ({ engine } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3 },
      enemies: [{ typeId: 'dummy', hp: 40, maxHp: 40 }],
      deck:    [],
    }, { enemies: { dummy: DUMMY_ENEMY } }));
    snap  = engine.getState();
    epath = ep(engine);  // 'entities.dummy_1'
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); });

  it('敌人 poison:3 → 回合结束受 3 伤，poison → 2', () => {
    loadState(engine, s => setStatus(s, epath, 'poison', 3));
    engine.endTurn();
    expect(enemy(engine).hp).toBe(37);
    expect(st(enemy(engine), 'poison')).toBe(2);
  });

  it('敌人 poison:1 → 回合结束受 1 伤，poison → 0（消耗完毕）', () => {
    loadState(engine, s => setStatus(s, epath, 'poison', 1));
    engine.endTurn();
    expect(enemy(engine).hp).toBe(39);
    expect(st(enemy(engine), 'poison')).toBe(0);
  });

  it('敌人格挡对中毒无效：actor:turn:start 先清格挡，actor:turn:end 再触发中毒', () => {
    // 1. actor:turn:start(0)  → status:remove[block] → 格挡=0
    // 2. actor:turn:end(600)  → entity:damage(3)      → 无格挡 → HP-3
    loadState(engine, s => {
      setStatus(s, epath, 'poison', 3);
      setBlock(s, epath, 5);  // 会在 actor:turn:start 被清零
    });
    engine.endTurn();
    expect(enemy(engine).hp).toBe(37);          // 中毒全额命中
    expect(st(enemy(engine), 'block')).toBe(0); // 格挡已在回合开始清零
  });

  it('玩家有 poison:2 → endTurn 玩家受 2 伤，poison → 1（DUMMY 不攻击）', () => {
    loadState(engine, s => setStatus(s, 'player', 'poison', 2));
    engine.endTurn();
    expect(pl(engine).hp).toBe(68);  // 70-2
    expect(st(pl(engine), 'poison')).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// frail（脆弱）— entity:block pipeline → 格挡量 × 0.75（向下取整）
// ─────────────────────────────────────────────────────────────────────────────
// 验证策略：
//   frail handler (order:100) 在 blockCore (order:0) 之前修改 Event.amount。
//   frail 递减时机：actor:turn:end (order:500)，不是 entity:block 时。
describe('frail', () => {
  let engine, snap;
  beforeAll(async () => {
    ({ engine } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['defend'],
    }));
    snap = engine.getState();
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); });

  it('有 frail:1：defend(5 block) → 实际格挡 = 3（5×0.75=3.75 floor=3）', () => {
    loadState(engine, s => setStatus(s, 'player', 'frail', 1));
    engine.playCard(engine.getState().hand[0]);
    expect(st(pl(engine), 'block')).toBe(3);
  });

  it('无 frail：defend → 正常 5 格挡', () => {
    engine.playCard(engine.getState().hand[0]);
    expect(st(pl(engine), 'block')).toBe(5);
  });

  it('frail stacks 在 actor:turn:end 递减（不是在 entity:block 时）', () => {
    // 打出 defend 只触发 entity:block，frail 不减；
    // 调用 endTurn() actor:turn:end → frail -1
    loadState(engine, s => setStatus(s, 'player', 'frail', 2));
    engine.playCard(engine.getState().hand[0]);
    engine.endTurn();
    expect(st(pl(engine), 'frail')).toBe(1);  // 原 2 → 回合结束后 1
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// metallicize（金属化）— actor:turn:end → 获得 N 点格挡
// ─────────────────────────────────────────────────────────────────────────────
// 验证策略：
//   玩家侧：格挡在 player:turn:end 赋予，在随后的 player:turn:start 清零。
//   最终 block=0，通过 timeline 验证 STATUS_APPLY[block] 事件是否存在。
//
//   敌人侧：格挡在敌人 actor:turn:end 赋予，仅在敌人下次 actor:turn:start 清零。
//   endTurn 后（敌人新回合尚未开始）格挡保留，可直接验证最终值。
describe('metallicize', () => {
  let engine, bundles, snap, epath;
  beforeAll(async () => {
    ({ engine, bundles } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    [],
    }));
    snap  = engine.getState();
    epath = ep(engine);  // 'entities.jaw_worm_1'
  });
  beforeEach(() => {
    engine.loadState(JSON.parse(JSON.stringify(snap)));
    bundles.length = 0;
  });

  it('玩家 metallicize:4 → timeline 包含 STATUS_APPLY[block,stacks=4]', () => {
    // player:turn:end → actor:turn:end,target='player' → metallicize order:400
    //   → entity:block(4) → STATUS_APPLY[block,stacks=4]
    // 随后 player:turn:start → actor:turn:start → block 清零（故最终 block=0）
    loadState(engine, s => setStatus(s, 'player', 'metallicize', 4));
    engine.endTurn();
    const tl    = getTimeline(bundles);
    const apply = findEvent(tl, 'STATUS_APPLY', { target: 'player', typeId: 'block', stacks: 4 });
    expect(apply).toBeDefined();
  });

  it('敌人 metallicize:3 → 回合结束后敌人 block=3（持续至敌人下回合开始）', () => {
    loadState(engine, s => setStatus(s, epath, 'metallicize', 3));
    engine.endTurn();
    expect(st(enemy(engine), 'block')).toBe(3);
  });

  it('metallicize 不递减（持久型）', () => {
    loadState(engine, s => setStatus(s, epath, 'metallicize', 3));
    engine.endTurn();
    expect(st(enemy(engine), 'metallicize')).toBe(3);
  });
});
