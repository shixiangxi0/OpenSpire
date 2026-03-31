// @ts-nocheck
/**
 * evt/test/cards/cards.test.js — 卡牌效果验证
 *
 * 验证策略：
 *   1. 每个 describe 对应一张卡牌，用最小 scenario 构造引擎（只含被测卡牌）。
 *   2. 只验证"该卡独有的效果"，不重复 attack.test.js 已覆盖的伤害链细节。
 *   3. 通过 getTimeline → findEvent / findAllEvents 断言"事件树结构"，
 *      通过 engine.getState() 断言"最终状态"，两者互补。
 *
 * 跳过的卡牌（效果太简单，无需单独测试）：
 *   strike  — 6 点攻击，已由 attack.test.js 全面覆盖
 *   defend  — 纯 entity:block，已由 block/frail 等 status 测试覆盖
 *   inflame — 单纯 status:apply[strength]，等价于直接调用 status:apply，无独立逻辑
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  makeEngine, loadState, setStatus, setBlock,
  ep, enemy, pl, st,
  getTimeline, findEvent, findAllEvents,
  DUMMY_ENEMY,
} from '../helpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// bash — 8 伤 + 2 层易伤
// ─────────────────────────────────────────────────────────────────────────────
// 验证策略：
//   1. 打出后敌人 HP 减少 8
//   2. timeline 包含一条 STATUS_APPLY[vulnerable] 且 stacks=2
//   3. bash 先攻击后施加易伤，所以 bash 自己的伤害不被易伤加成（仍为 8 而非 12）
describe('bash', () => {
  let engine, bundles, snap, id;
  beforeAll(async () => {
    ({ engine, bundles } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['bash'],
    }));
    snap = engine.getState();
    id   = snap.hand[0];
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); bundles.length = 0; });

  it('造成 8 点伤害', () => {
    engine.playCard(id, ep(engine));
    expect(enemy(engine).hp).toBe(32);
  });

  it('施加 2 层易伤到目标', () => {
    engine.playCard(id, ep(engine));
    const apply = findEvent(getTimeline(bundles), 'STATUS_APPLY', { typeId: 'vulnerable' });
    expect(apply).toBeDefined();
    expect(apply.payload.stacks).toBe(2);
    expect(st(enemy(engine), 'vulnerable')).toBe(2);
  });

  it('自带易伤：当轮伤害不受易伤增益（先攻击后施加）', () => {
    // bash 先 entity:attack → 再 status:apply[vulnerable]
    // 所以 bash 本身的 8 伤不受自己施加的 vulnerable 加成
    engine.playCard(id, ep(engine));
    const atk = findEvent(getTimeline(bundles), 'ENTITY_ATTACK');
    expect(atk.payload.amount).toBe(8);  // 不是 12
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// iron_wave — 5 格挡 + 5 攻击，顺序：先格挡再攻击
// ─────────────────────────────────────────────────────────────────────────────
// 验证策略：
//   1. 打出后玩家格挡 = 5，敌人 HP = 35
//   2. 格挡先于攻击完成（当轮荆棘若打到玩家会被格挡吸收）
//   3. entity:block 出现在 entity:attack 之前（seq 顺序）
describe('iron_wave', () => {
  let engine, bundles, snap, id;
  beforeAll(async () => {
    ({ engine, bundles } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['iron_wave'],
    }));
    snap = engine.getState();
    id   = snap.hand[0];
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); bundles.length = 0; });

  it('玩家获得 5 点格挡', () => {
    engine.playCard(id, ep(engine));
    expect(st(pl(engine), 'block')).toBe(5);
  });

  it('造成 5 点伤害，敌人 HP=35', () => {
    engine.playCard(id, ep(engine));
    expect(enemy(engine).hp).toBe(35);
  });

  it('entity:block（seq）早于 entity:attack', () => {
    engine.playCard(id, ep(engine));
    const tl    = getTimeline(bundles);
    const block = findEvent(tl, 'ENTITY_BLOCK');
    const atk   = findEvent(tl, 'ENTITY_ATTACK');
    expect(block.seq).toBeLessThan(atk.seq);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// whirlwind — X 费，对所有敌人造成 X×5 伤害
// ─────────────────────────────────────────────────────────────────────────────
// 验证策略：
//   1. energy=3 时：敌人受 3×5=15 伤，打完能量=0
//   2. energy=1 时：敌人受 1×5=5 伤，打完能量=0
//   3. energy=0 时：无任何 ENTITY_ATTACK 产生
describe('whirlwind', () => {
  let engine, bundles, snap, id;
  beforeAll(async () => {
    ({ engine, bundles } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['whirlwind'],
    }));
    snap = engine.getState();
    id   = snap.hand[0];
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); bundles.length = 0; });

  it('energy=3：敌人受 3×5=15 伤，能量归零', () => {
    engine.playCard(id);  // whirlwind 无需 target
    expect(enemy(engine).hp).toBe(25);
    expect(pl(engine).energy).toBe(0);
  });

  it('energy=1：敌人受 1×5=5 伤，能量归零', () => {
    loadState(engine, s => { s.entities.player.energy = 1; });
    engine.playCard(id);
    expect(enemy(engine).hp).toBe(35);
    expect(pl(engine).energy).toBe(0);
  });

  it('energy=0：无任何 ENTITY_ATTACK 产生', () => {
    loadState(engine, s => { s.entities.player.energy = 0; });
    engine.playCard(id);
    const attacks = findAllEvents(getTimeline(bundles), 'ENTITY_ATTACK');
    expect(attacks).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// anger — 6 伤 + 在弃牌堆中新增一张 anger
// ─────────────────────────────────────────────────────────────────────────────
// 验证策略：
//   1. 打出后敌人 HP -6
//   2. 弃牌堆中有 anger 副本（cardId='anger'）
//   3. 打出本身的 anger 也会进弃牌堆，故弃牌堆共 2 张 anger
describe('anger', () => {
  let engine, bundles, snap, id;
  beforeAll(async () => {
    ({ engine, bundles } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['anger'],
    }));
    snap = engine.getState();
    id   = snap.hand[0];
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); bundles.length = 0; });

  it('敌人受 6 伤', () => {
    engine.playCard(id, ep(engine));
    expect(enemy(engine).hp).toBe(34);
  });

  it('弃牌堆共有 2 张 anger（原牌 + 副本）', () => {
    engine.playCard(id, ep(engine));
    const s = engine.getState();
    // 打出 anger 后：anger 本身进弃牌堆 + 新增副本也进弃牌堆 = 共 2 张
    const angerCopies = s.discardPile.filter(iid => s.cards[iid]?.cardId === 'anger');
    expect(angerCopies.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// shrug（耸耸肩）— 8 格挡 + 抽 1 张牌
// ─────────────────────────────────────────────────────────────────────────────
// 验证策略：
//   1. 打出后玩家格挡 = 8
//   2. 有牌可摸时：手牌数比打出前多 0（打出-1 摸牌+1 = 持平）
//   3. 无牌可摸时：格挡仍为 8，不报错（deck:deplete 静默处理）
describe('shrug', () => {
  let engine, bundles, snap, id;
  beforeAll(async () => {
    ({ engine, bundles } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['shrug', 'strike'],  // shrug 在手牌，strike 在摸牌堆供 shrug 摸
    }));
    snap = engine.getState();
    id   = snap.hand[0];  // drawPerTurn:1 → shrug 被摸入手牌
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); bundles.length = 0; });

  it('获得 8 点格挡', () => {
    engine.playCard(id);
    expect(st(pl(engine), 'block')).toBe(8);
  });

  it('摸 1 张牌：摸牌堆减 1，手牌不变（打出 -1 摸入 +1）', () => {
    const before = engine.getState();
    const drawBefore = before.drawPile.length;
    const handBefore = before.hand.length;
    engine.playCard(id);
    const s = engine.getState();
    expect(s.drawPile.length).toBe(drawBefore - 1);
    expect(s.hand.length).toBe(handBefore - 1 + 1);  // 打出 -1，摸入 +1
  });

  it('无牌可摸时格挡仍生效，engine 不抛出异常', () => {
    loadState(engine, s => { s.drawPile = []; });  // 清空摸牌堆
    expect(() => engine.playCard(id)).not.toThrow();
    expect(st(pl(engine), 'block')).toBe(8);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// curiosity — 被摸到时获得 1 层力量；打出时弃掉一张随机手牌
// ─────────────────────────────────────────────────────────────────────────────
// 验证策略：
//   "被摸到"：用 makeEngine 的 battle:start 阶段摸牌触发，验证 strength+1
//   "打出弃牌"：手牌含多张时打出，验证手牌减少 2（打出-1 + 弃掉-1）
describe('curiosity', () => {
  it('被摸到时：玩家获得 1 层力量（drawPerTurn=1 摸一张）', async () => {
    // battle:start → player:turn:start → drew curiosity → card:drawn → strength+1
    const { engine } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['curiosity'],
    });
    expect(st(pl(engine), 'strength')).toBe(1);
  });

  it('打出时：弃掉手牌中另一张牌，手牌净减 2', async () => {
    // drawPerTurn:1 → curiosity 在手牌；通过 loadState 把 strike 也放入手牌
    const { engine } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['curiosity', 'strike'],
    });
    const state = engine.getState();
    const cid = state.hand[0];  // curiosity_1 在手牌
    // 把 strike 也移入手牌（从摸牌堆搬运），使手牌共 2 张
    loadState(engine, s => { s.hand.push(s.drawPile.shift()); });
    const handBefore = engine.getState().hand.length;  // 2
    engine.playCard(cid);
    // 打出 curiosity(-1) + 效果弃掉另一张(-1) = 净 -2
    expect(engine.getState().hand.length).toBe(handBefore - 2);
  });

  it('打出时：手牌只有自己一张，无牌可弃（不报错，手牌=0）', async () => {
    // drawPerTurn:1 → curiosity 在手牌，无其他牌可弃
    const { engine } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['curiosity'],
    });
    const cid = engine.getState().hand[0];
    expect(() => engine.playCard(cid)).not.toThrow();
    expect(engine.getState().hand.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// arcane_flux（奥术通量）— 每回合开始额外抽 1 张牌（Power，消耗）
// ─────────────────────────────────────────────────────────────────────────────
// 验证策略：
//   1. 打出后玩家获得 extra_draw:1 状态
//   2. 下一回合（endTurn 触发 player:turn:start）多摸 1 张牌
describe('arcane_flux', () => {
  let engine, snap, id;
  beforeAll(async () => {
    ({ engine } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['arcane_flux', 'strike', 'strike', 'strike', 'strike'],
    }));
    snap = engine.getState();
    id   = snap.hand[0];  // arcane_flux（drawPerTurn:1 → 被摸入手牌）
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); });

  it('打出后玩家获得 extra_draw:1', () => {
    engine.playCard(id);
    expect(st(pl(engine), 'extra_draw')).toBe(1);
  });

  it('下一回合额外多摸 1 张（drawPerTurn:1 + extra_draw:1 = 共摸 2 张）', () => {
    // 打出 arcane_flux（消耗）→ player 获得 extra_draw:1
    // endTurn → player:turn:start → drawPerTurn(1) + extra_draw(1) = 共摸 2 张
    engine.playCard(id);
    engine.endTurn();
    expect(engine.getState().hand.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// offering（祭品）— 失去 6 HP，+3 能量，抽 3 张牌（消耗）
// ─────────────────────────────────────────────────────────────────────────────
// 验证策略：
//   1. HP 减少 6（穿透格挡）
//   2. 能量 +3（若已满跳过，实际能量值检验）
//   3. 手牌增加 3（从摸牌堆摸，打出 offering 本身 -1 + 摸 3 = 净 +2）
//   4. 格挡不吸收 offering 的失血（因为用 entity:loss，不是 entity:damage）
describe('offering', () => {
  let engine, snap, id;
  beforeAll(async () => {
    ({ engine } = await makeEngine({
      // energy 在 player:turn:start 会被重置为 maxEnergy=3，无论初始值
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['offering', 'strike', 'strike', 'strike', 'strike'],
    }));
    snap = engine.getState();
    id   = snap.hand[0];  // offering
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); });

  it('玩家失去 6 点 HP', () => {
    const hpBefore = pl(engine).hp;
    engine.playCard(id);
    expect(pl(engine).hp).toBe(hpBefore - 6);
  });

  it('能量 +3：先将能量手动设为 0，打出后能量从 0 变为 3', () => {
    // player:turn:start 会将能量重置为 maxEnergy(3)；这里手动覆盖为 0 再打牌
    loadState(engine, s => { s.entities.player.energy = 0; });
    engine.playCard(id);
    expect(pl(engine).energy).toBe(3);  // 0 + 3 = 3
  });

  it('摸 3 张牌（手牌打出 -1 摸入 +3 = 净 +2）', () => {
    const handBefore = engine.getState().hand.length;
    engine.playCard(id);
    expect(engine.getState().hand.length).toBe(handBefore - 1 + 3);
  });

  it('格挡不吸收 offering 的失血（entity:loss 直接扣 HP）', () => {
    loadState(engine, s => setBlock(s, 'player', 10));
    const hpBefore = pl(engine).hp;
    engine.playCard(id);
    expect(pl(engine).hp).toBe(hpBefore - 6);       // HP 减少 6
    expect(st(pl(engine), 'block')).toBe(10);        // 格挡不消耗
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// limit_break（极限突破）— 将力量翻倍（消耗）
// ─────────────────────────────────────────────────────────────────────────────
// 验证策略：
//   1. strength:4 → strength:8（翻倍）
//   2. strength:0 时：无 STATUS_APPLY 产生（脚本 if str>0 保护）
//   3. 翻倍后实际攻击伤害验证（strength:8 打 6 伤 → 14 伤）
describe('limit_break', () => {
  let engine, bundles, snap, id;
  beforeAll(async () => {
    ({ engine, bundles } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['limit_break', 'strike'],
    }));
    snap = engine.getState();
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); bundles.length = 0; });

  it('strength:4 → 翻倍后 strength:8', () => {
    loadState(engine, s => setStatus(s, 'player', 'strength', 4));
    const lbId = engine.getState().hand.find(
      iid => engine.getState().cards[iid]?.cardId === 'limit_break'
    );
    engine.playCard(lbId);
    expect(st(pl(engine), 'strength')).toBe(8);
  });

  it('strength:0 时：打出无效（不报错，无 STATUS_APPLY）', () => {
    const lbId = engine.getState().hand.find(
      iid => engine.getState().cards[iid]?.cardId === 'limit_break'
    );
    engine.playCard(lbId);
    const applies = findAllEvents(getTimeline(bundles), 'STATUS_APPLY', { typeId: 'strength' });
    expect(applies).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// body_slam（肉搏）— 造成等同于玩家当前格挡的伤害
// ─────────────────────────────────────────────────────────────────────────────
// 验证策略：
//   1. block:7 → 敌人受 7 伤
//   2. block:0 → 敌人受 0 伤（不报错）
//   3. 受到力量加成：strength:3 + block:7 → 敌人受 10 伤
describe('body_slam', () => {
  let engine, bundles, snap, id;
  beforeAll(async () => {
    ({ engine, bundles } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['body_slam'],
    }));
    snap = engine.getState();
    id   = snap.hand[0];
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); bundles.length = 0; });

  it('block:7 → 敌人受 7 伤', () => {
    loadState(engine, s => setBlock(s, 'player', 7));
    engine.playCard(id, ep(engine));
    expect(enemy(engine).hp).toBe(33);
  });

  it('block:0 → 敌人受 0 伤', () => {
    engine.playCard(id, ep(engine));
    expect(enemy(engine).hp).toBe(40);
  });

  it('strength:3 + block:7 → 敌人受 10 伤', () => {
    loadState(engine, s => {
      setBlock(s, 'player', 7);
      setStatus(s, 'player', 'strength', 3);
    });
    engine.playCard(id, ep(engine));
    expect(enemy(engine).hp).toBe(30);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// shockwave（冲击波）— 对所有敌人造成 6 伤 + 3 层虚弱（消耗）
// ─────────────────────────────────────────────────────────────────────────────
// 验证策略（两个敌人场景）：
//   1. 两个敌人各受 6 伤
//   2. 两个敌人各获得 weak:3
//   3. timeline 中 ENTITY_ATTACK 出现 2 次，STATUS_APPLY[weak] 出现 2 次
describe('shockwave', () => {
  let engine, bundles, snap, id;
  beforeAll(async () => {
    ({ engine, bundles } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [
        { typeId: 'jaw_worm', hp: 40, maxHp: 40 },
        { typeId: 'jaw_worm', hp: 30, maxHp: 30 },
      ],
      deck: ['shockwave'],
    }));
    snap = engine.getState();
    id   = snap.hand[0];
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); bundles.length = 0; });

  it('两个敌人各受 6 伤', () => {
    engine.playCard(id);
    const s = engine.getState();
    const e1 = s.entities[s.enemies['1']];
    const e2 = s.entities[s.enemies['2']];
    expect(e1.hp).toBe(34);
    expect(e2.hp).toBe(24);
  });

  it('两个敌人各获得 weak:3', () => {
    engine.playCard(id);
    const s = engine.getState();
    const e1 = s.entities[s.enemies['1']];
    const e2 = s.entities[s.enemies['2']];
    expect(st(e1, 'weak')).toBe(3);
    expect(st(e2, 'weak')).toBe(3);
  });

  it('timeline 包含 2 次 ENTITY_ATTACK 和 2 次 STATUS_APPLY[weak]', () => {
    engine.playCard(id);
    const tl      = getTimeline(bundles);
    const attacks = findAllEvents(tl, 'ENTITY_ATTACK');
    const weaks   = findAllEvents(tl, 'STATUS_APPLY', { typeId: 'weak' });
    expect(attacks).toHaveLength(2);
    expect(weaks).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cleave（裂击）— 对所有敌人造成 8 伤
// ─────────────────────────────────────────────────────────────────────────────
// 验证策略（两个敌人场景）：
//   1. 两个敌人各受 8 伤
//   2. timeline 中 ENTITY_ATTACK 出现 2 次
describe('cleave', () => {
  let engine, bundles, snap, id;
  beforeAll(async () => {
    ({ engine, bundles } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [
        { typeId: 'jaw_worm', hp: 40, maxHp: 40 },
        { typeId: 'jaw_worm', hp: 30, maxHp: 30 },
      ],
      deck: ['cleave'],
    }));
    snap = engine.getState();
    id   = snap.hand[0];
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); bundles.length = 0; });

  it('两个敌人各受 8 伤', () => {
    engine.playCard(id);
    const s = engine.getState();
    expect(s.entities[s.enemies['1']].hp).toBe(32);
    expect(s.entities[s.enemies['2']].hp).toBe(22);
  });

  it('timeline 包含 2 次 ENTITY_ATTACK', () => {
    engine.playCard(id);
    expect(findAllEvents(getTimeline(bundles), 'ENTITY_ATTACK')).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// reaper（死神镰）— 对所有敌人造成 4 伤，治疗等同于实际总伤害量（消耗）
// ─────────────────────────────────────────────────────────────────────────────
// 验证策略：
//   1. 两个敌人各受 4 伤
//   2. 玩家 HP 回复 8（两个敌人各实际受 4 伤）
//   3. 敌人有格挡时：仅实际伤害（非原始伤害）计入治疗
//   4. 打出后进入消耗堆（exhaust=true）
describe('reaper', () => {
  let engine, bundles, snap, id;
  beforeAll(async () => {
    ({ engine, bundles } = await makeEngine({
      player:  { hp: 60, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [
        { typeId: 'jaw_worm', hp: 40, maxHp: 40 },
        { typeId: 'jaw_worm', hp: 30, maxHp: 30 },
      ],
      deck: ['reaper'],
    }));
    snap = engine.getState();
    id   = snap.hand[0];
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); bundles.length = 0; });

  it('两个敌人各受 4 伤', () => {
    engine.playCard(id);
    const s = engine.getState();
    expect(s.entities[s.enemies['1']].hp).toBe(36);
    expect(s.entities[s.enemies['2']].hp).toBe(26);
  });

  it('玩家回复 8 HP（两敌各 4 实际伤害）', () => {
    engine.playCard(id);
    expect(pl(engine).hp).toBe(68);  // 60 + 8
  });

  it('敌人有格挡时：仅实际伤害计入治疗', () => {
    // 两个敌人各有 2 格挡，实际各受 2 伤，治疗 4
    loadState(engine, s => {
      setBlock(s, s.enemies['1'], 2);
      setBlock(s, s.enemies['2'], 2);
    });
    engine.playCard(id);
    expect(pl(engine).hp).toBe(64);  // 60 + 4（格挡吸收了各 2 点）
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// entrench（巩固）— 将当前格挡翻倍
// ─────────────────────────────────────────────────────────────────────────────
// 验证策略：
//   1. block:6 → 翻倍后 block:12
//   2. block:0 时：无 entity:block 产生（脚本 if block>0 保护）
describe('entrench', () => {
  let engine, bundles, snap, id;
  beforeAll(async () => {
    ({ engine, bundles } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['entrench'],
    }));
    snap = engine.getState();
    id   = snap.hand[0];
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); bundles.length = 0; });

  it('block:6 → 翻倍后 block:12', () => {
    loadState(engine, s => setBlock(s, 'player', 6));
    engine.playCard(id);
    expect(st(pl(engine), 'block')).toBe(12);
  });

  it('block:0 时无效（无 ENTITY_BLOCK 产生）', () => {
    engine.playCard(id);
    const blockEvents = findAllEvents(getTimeline(bundles), 'ENTITY_BLOCK');
    expect(blockEvents).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// demon_form card（恶魔化）— 获得 demon_form:1 状态（Power，消耗）
// ─────────────────────────────────────────────────────────────────────────────
// 验证策略：
//   只验证卡牌行为（施加状态）。demon_form 状态本身的每回合效果
//   由 statuses.test.js 的 demon_form 章节覆盖。
describe('demon_form (card)', () => {
  let engine, snap, id;
  beforeAll(async () => {
    ({ engine } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['demon_form'],
    }));
    snap = engine.getState();
    id   = snap.hand[0];
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); });

  it('打出后玩家获得 demon_form:1', () => {
    engine.playCard(id);
    expect(st(pl(engine), 'demon_form')).toBe(1);
  });

  it('打出后进入消耗堆', () => {
    engine.playCard(id);
    const s = engine.getState();
    expect(s.exhaustPile.some(iid => s.cards[iid]?.cardId === 'demon_form')).toBe(true);
  });
});
