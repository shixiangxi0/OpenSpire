// @ts-nocheck
/**
 * evt/test/cards/cards.test.js — 卡牌独有行为验证
 *
 * 只保留卡牌自身的组合逻辑、跨事件窗口效果、资源变化和牌区变化。
 * 底层通用语义（纯攻击、纯格挡、状态修饰链）交给 attack/status 测试覆盖。
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  makeEngine, loadState, setStatus, setBlock,
  ep, enemy, pl, st,
} from '../helpers.js';

describe('bash', () => {
  let engine, snap, id;
  beforeAll(async () => {
    ({ engine } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['bash'],
    }));
    snap = engine.getState();
    id   = snap.hand[0];
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); });

  it('造成 8 伤并施加 2 层易伤', () => {
    engine.playCard(id, ep(engine));
    expect(enemy(engine).hp).toBe(32);
    expect(st(enemy(engine), 'vulnerable')).toBe(2);
  });
});

describe('iron_wave', () => {
  let engine, snap, id;
  beforeAll(async () => {
    ({ engine } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['iron_wave'],
    }));
    snap = engine.getState();
    id   = snap.hand[0];
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); });

  it('同时提供格挡和伤害', () => {
    engine.playCard(id, ep(engine));
    expect(st(pl(engine), 'block')).toBe(5);
    expect(enemy(engine).hp).toBe(35);
  });
});

describe('whirlwind', () => {
  let engine, snap, id;
  beforeAll(async () => {
    ({ engine } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['whirlwind'],
    }));
    snap = engine.getState();
    id   = snap.hand[0];
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); });

  it('按当前能量对全体造成 X 次伤害并清空能量', () => {
    engine.playCard(id);
    expect(enemy(engine).hp).toBe(25);
    expect(pl(engine).energy).toBe(0);
  });

  it('能量为 0 时不造成伤害', () => {
    loadState(engine, s => { s.entities.player.energy = 0; });
    engine.playCard(id);
    expect(enemy(engine).hp).toBe(40);
    expect(pl(engine).energy).toBe(0);
  });
});

describe('anger', () => {
  let engine, snap, id;
  beforeAll(async () => {
    ({ engine } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['anger'],
    }));
    snap = engine.getState();
    id   = snap.hand[0];
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); });

  it('造成伤害并生成一张新的 anger 到弃牌堆', () => {
    engine.playCard(id, ep(engine));
    const s = engine.getState();
    const angerCopies = s.discardPile.filter(iid => s.cards[iid]?.cardId === 'anger');
    expect(enemy(engine).hp).toBe(34);
    expect(angerCopies.length).toBe(2);
  });
});

describe('shrug', () => {
  let engine, snap, id;
  beforeAll(async () => {
    ({ engine } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['shrug', 'strike'],
    }));
    snap = engine.getState();
    id   = snap.hand[0];
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); });

  it('获得格挡并抽 1 张牌', () => {
    const before = engine.getState();
    engine.playCard(id);
    const after = engine.getState();
    expect(st(pl(engine), 'block')).toBe(8);
    expect(after.drawPile.length).toBe(before.drawPile.length - 1);
    expect(after.hand.length).toBe(before.hand.length);
  });
});

describe('curiosity', () => {
  it('被摸到时获得 1 层力量', async () => {
    const { engine } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['curiosity'],
    });
    expect(st(pl(engine), 'strength')).toBe(1);
  });

  it('打出时会额外弃掉一张手牌', async () => {
    const { engine } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['curiosity', 'strike'],
    });
    const cid = engine.getState().hand[0];
    loadState(engine, s => { s.hand.push(s.drawPile.shift()); });
    const handBefore = engine.getState().hand.length;
    engine.playCard(cid);
    expect(engine.getState().hand.length).toBe(handBefore - 2);
  });
});

describe('arcane_flux', () => {
  let engine, snap, id;
  beforeAll(async () => {
    ({ engine } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['arcane_flux', 'strike', 'strike', 'strike', 'strike'],
    }));
    snap = engine.getState();
    id   = snap.hand[0];
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); });

  it('赋予额外抽牌并在下回合生效', () => {
    engine.playCard(id);
    expect(st(pl(engine), 'extra_draw')).toBe(1);
    engine.endTurn();
    expect(engine.getState().hand.length).toBe(2);
  });
});

describe('offering', () => {
  let engine, snap, id;
  beforeAll(async () => {
    ({ engine } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['offering', 'strike', 'strike', 'strike', 'strike'],
    }));
    snap = engine.getState();
    id   = snap.hand[0];
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); });

  it('穿透格挡失血，并获得能量与抽牌', () => {
    loadState(engine, s => {
      s.entities.player.energy = 0;
      setBlock(s, 'player', 10);
    });
    const hpBefore = pl(engine).hp;
    const handBefore = engine.getState().hand.length;
    engine.playCard(id);
    expect(pl(engine).hp).toBe(hpBefore - 6);
    expect(st(pl(engine), 'block')).toBe(10);
    expect(pl(engine).energy).toBe(3);
    expect(engine.getState().hand.length).toBe(handBefore - 1 + 3);
  });
});

describe('limit_break', () => {
  let engine, snap;
  beforeAll(async () => {
    ({ engine } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['limit_break', 'strike'],
    }));
    snap = engine.getState();
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); });

  it('将当前力量翻倍', () => {
    loadState(engine, s => setStatus(s, 'player', 'strength', 4));
    const id = engine.getState().hand.find(iid => engine.getState().cards[iid]?.cardId === 'limit_break');
    engine.playCard(id);
    expect(st(pl(engine), 'strength')).toBe(8);
  });
});

describe('body_slam', () => {
  let engine, snap, id;
  beforeAll(async () => {
    ({ engine } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['body_slam'],
    }));
    snap = engine.getState();
    id   = snap.hand[0];
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); });

  it('以当前格挡为基础伤害，并仍受力量加成', () => {
    loadState(engine, s => {
      setBlock(s, 'player', 7);
      setStatus(s, 'player', 'strength', 3);
    });
    engine.playCard(id, ep(engine));
    expect(enemy(engine).hp).toBe(30);
  });
});

describe('shockwave', () => {
  let engine, snap, id;
  beforeAll(async () => {
    ({ engine } = await makeEngine({
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
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); });

  it('对所有敌人造成伤害并施加虚弱', () => {
    engine.playCard(id);
    const s = engine.getState();
    const e1 = s.entities[s.enemies['1']];
    const e2 = s.entities[s.enemies['2']];
    expect(e1.hp).toBe(34);
    expect(e2.hp).toBe(24);
    expect(st(e1, 'weak')).toBe(3);
    expect(st(e2, 'weak')).toBe(3);
  });
});

describe('cleave', () => {
  let engine, snap, id;
  beforeAll(async () => {
    ({ engine } = await makeEngine({
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
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); });

  it('对所有敌人造成伤害', () => {
    engine.playCard(id);
    const s = engine.getState();
    expect(s.entities[s.enemies['1']].hp).toBe(32);
    expect(s.entities[s.enemies['2']].hp).toBe(22);
  });
});

describe('reaper', () => {
  let engine, snap, id;
  beforeAll(async () => {
    ({ engine } = await makeEngine({
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
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); });

  it('按实际总伤害治疗玩家，并在打出后消耗', () => {
    engine.playCard(id);
    const s = engine.getState();
    expect(s.entities[s.enemies['1']].hp).toBe(36);
    expect(s.entities[s.enemies['2']].hp).toBe(26);
    expect(pl(engine).hp).toBe(68);
    expect(s.exhaustPile.some(iid => s.cards[iid]?.cardId === 'reaper')).toBe(true);
  });

  it('敌人有格挡时只按实际伤害治疗', () => {
    loadState(engine, s => {
      setBlock(s, s.enemies['1'], 2);
      setBlock(s, s.enemies['2'], 2);
    });
    engine.playCard(id);
    expect(pl(engine).hp).toBe(64);
  });
});

describe('entrench', () => {
  let engine, snap, id;
  beforeAll(async () => {
    ({ engine } = await makeEngine({
      player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
      enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
      deck:    ['entrench'],
    }));
    snap = engine.getState();
    id   = snap.hand[0];
  });
  beforeEach(() => { engine.loadState(JSON.parse(JSON.stringify(snap))); });

  it('将当前格挡翻倍', () => {
    loadState(engine, s => setBlock(s, 'player', 6));
    engine.playCard(id);
    expect(st(pl(engine), 'block')).toBe(12);
  });
});

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

  it('施加 demon_form 状态并进入消耗堆', () => {
    engine.playCard(id);
    const s = engine.getState();
    expect(st(pl(engine), 'demon_form')).toBe(1);
    expect(s.exhaustPile.some(iid => s.cards[iid]?.cardId === 'demon_form')).toBe(true);
  });
});
