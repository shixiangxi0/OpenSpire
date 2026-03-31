/**
 * test/events/attack.test.js
 *
 * 覆盖 entity:attack 完整事件树的所有分支路径。
 * 通过 playCard / endTurn 触发，绝不直接调用 engine 内部方法。
 *
 * 链路来源（node bin/slay.js --events）：
 *
 *   entity:attack  [entry]
 *   ├── [+200]  strength           — 攻击方力量加伤
 *   ├── [+150]  weak               — 攻击方虚弱减伤
 *   ├── [+100]  vulnerable         — 目标易伤加伤
 *   ├─┬ [  +0]  core:entity:attack → entity:damage
 *   │   ├─┬ [  +0]  core:entity:damage
 *   │   │ └─┬ status:remove[block]（格挡完全吸收时）
 *   │   └─┬ [-9999] → entity:loss
 *   │       ├── [  +0]  core:entity:loss（扣 HP）
 *   │       ├─┬ [-100]  rupture → status:apply[strength]
 *   │       └─┬ [-9999] → entity:die → battle:end
 *   │                              └── frenzy → card:draw（击杀时抽牌回能）
 *   └─┬ [-200]  thorns → entity:damage（反弹给攻击方）
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  makeEngine, loadState, setStatus, setBlock,
  ep, enemy, pl, st,
  getTimeline, getPatches, findEvent, findAllEvents,
  DUMMY_ENEMY,
} from '../helpers.js';

// ── 共享引擎：玩家出打击（基础 6 伤）打颚虫 ─────────────────────────────────

let engine, bundles, snap, enemyPath, strikeId;

beforeAll(async () => {
  ({ engine, bundles } = await makeEngine({
    player:  { hp: 70, maxHp: 70, energy: 3, maxEnergy: 3, drawPerTurn: 1 },
    enemies: [{ typeId: 'jaw_worm', hp: 40, maxHp: 40 }],
    deck:    [{ cardId: 'strike' }],
  }));
  snap      = engine.getState();
  enemyPath = ep(engine);
  strikeId  = snap.hand[0];
});

beforeEach(() => {
  engine.loadState(JSON.parse(JSON.stringify(snap)));
  bundles.length = 0;
});

// ── 伤害量修饰符：verifying ENTITY_ATTACK payload.amount ─────────────────────

describe('amount modifiers', () => {
  it('无修饰符：基础 6 伤，ENTITY_ATTACK.amount=6', () => {
    engine.playCard(strikeId, enemyPath);
    const tl     = getTimeline(bundles);
    const attack = findEvent(tl, 'ENTITY_ATTACK');
    expect(attack.payload.amount).toBe(6);
    expect(enemy(engine).hp).toBe(34);
  });

  it('strength:2 → amount=8', () => {
    loadState(engine, s => setStatus(s, 'player', 'strength', 2));
    engine.playCard(strikeId, enemyPath);
    const attack = findEvent(getTimeline(bundles), 'ENTITY_ATTACK');
    expect(attack.payload.amount).toBe(8);
    expect(enemy(engine).hp).toBe(32);
  });

  it('weak:1 → amount=floor(6×0.75)=4，并记录 weakReduced=2', () => {
    loadState(engine, s => setStatus(s, 'player', 'weak', 1));
    engine.playCard(strikeId, enemyPath);
    const attack = findEvent(getTimeline(bundles), 'ENTITY_ATTACK');
    expect(attack.payload.amount).toBe(4);
    expect(attack.payload.weakReduced).toBe(2);
    expect(enemy(engine).hp).toBe(36);
  });

  it('vulnerable:1（目标）→ amount=floor(6×1.5)=9', () => {
    loadState(engine, s => setStatus(s, ep(engine), 'vulnerable', 1));
    engine.playCard(strikeId, enemyPath);
    const attack = findEvent(getTimeline(bundles), 'ENTITY_ATTACK');
    expect(attack.payload.amount).toBe(9);
    expect(enemy(engine).hp).toBe(31);
  });

  it('strength:2 + weak:1 → floor((6+2)×0.75)=6', () => {
    loadState(engine, s => {
      setStatus(s, 'player', 'strength', 2);
      setStatus(s, 'player', 'weak', 1);
    });
    engine.playCard(strikeId, enemyPath);
    const attack = findEvent(getTimeline(bundles), 'ENTITY_ATTACK');
    expect(attack.payload.amount).toBe(6);
  });

  it('strength:2 + vulnerable:1 → floor((6+2)×1.5)=12', () => {
    loadState(engine, s => {
      setStatus(s, 'player', 'strength', 2);
      setStatus(s, ep(engine), 'vulnerable', 1);
    });
    engine.playCard(strikeId, enemyPath);
    const attack = findEvent(getTimeline(bundles), 'ENTITY_ATTACK');
    expect(attack.payload.amount).toBe(12);
    expect(enemy(engine).hp).toBe(28);
  });

  it('strength:4 + weak:1 + vulnerable:1 → floor(floor((6+4)×0.75)×1.5)=10', () => {
    // 引擎在 weak(order=150) 处 floor 一次，vulnerable(order=100) 再 floor 一次
    // floor(floor(10 × 0.75) × 1.5) = floor(7 × 1.5) = floor(10.5) = 10
    loadState(engine, s => {
      setStatus(s, 'player', 'strength', 4);
      setStatus(s, 'player', 'weak', 1);
      setStatus(s, ep(engine), 'vulnerable', 1);
    });
    engine.playCard(strikeId, enemyPath);
    const attack = findEvent(getTimeline(bundles), 'ENTITY_ATTACK');
    expect(attack.payload.amount).toBe(10);
  });
});

// ── entity:damage 衍生链：格挡吸收 ──────────────────────────────────────────

describe('entity:damage — 格挡吸收', () => {
  it('block:4 吸收 4，溢出 2 → enemy.hp=38，block 被移除', () => {
    loadState(engine, s => setBlock(s, ep(engine), 4));
    engine.playCard(strikeId, enemyPath);
    const tl  = getTimeline(bundles);
    const dmg = findEvent(tl, 'ENTITY_DAMAGE');
    expect(dmg.payload.blocked).toBe(4);
    expect(dmg.payload.actualDamage).toBe(2);
    // 格挡完全消耗时衍生 STATUS_REMOVE[block]
    const rem = findEvent(tl, 'STATUS_REMOVE');
    expect(rem).toBeDefined();
    expect(rem.payload.typeId).toBe('block');
    expect(enemy(engine).hp).toBe(38);
    expect(st(enemy(engine), 'block')).toBe(0);
  });

  it('block:10 完全吸收 6 伤 → enemy.hp 不变，剩余 block=4', () => {
    loadState(engine, s => setBlock(s, ep(engine), 10));
    engine.playCard(strikeId, enemyPath);
    const tl  = getTimeline(bundles);
    const dmg = findEvent(tl, 'ENTITY_DAMAGE');
    expect(dmg.payload.blocked).toBe(6);
    expect(dmg.payload.actualDamage).toBe(0);
    // 格挡未耗尽时不发 STATUS_REMOVE
    const rem = findEvent(tl, 'STATUS_REMOVE');
    expect(rem).toBeUndefined();
    expect(enemy(engine).hp).toBe(40);
    expect(st(enemy(engine), 'block')).toBe(4);
  });

  it('block:6 精确吸收全部 → enemy.hp 不变，block 被移除', () => {
    loadState(engine, s => setBlock(s, ep(engine), 6));
    engine.playCard(strikeId, enemyPath);
    const tl  = getTimeline(bundles);
    const dmg = findEvent(tl, 'ENTITY_DAMAGE');
    expect(dmg.payload.blocked).toBe(6);
    expect(dmg.payload.actualDamage).toBe(0);
    const rem = findEvent(tl, 'STATUS_REMOVE');
    expect(rem).toBeDefined();
    expect(enemy(engine).hp).toBe(40);
    expect(st(enemy(engine), 'block')).toBe(0);
  });

  it('玩家 block:5 吸收颚虫 11 伤（endTurn），溢出 6 → player.hp=64', () => {
    loadState(engine, s => setBlock(s, 'player', 5));
    engine.endTurn();
    const tl  = getTimeline(bundles);
    const dmg = findEvent(tl, 'ENTITY_DAMAGE', { target: 'player' });
    expect(dmg.payload.blocked).toBe(5);
    expect(dmg.payload.actualDamage).toBe(6);
    expect(pl(engine).hp).toBe(64);
  });
});

// ── entity:loss 衍生：rupture ────────────────────────────────────────────────

describe('rupture — 受到实际 HP 伤害时获得力量', () => {
  it('rupture:1 + 颚虫攻击（endTurn）→ timeline 含 STATUS_APPLY[strength]', () => {
    loadState(engine, s => setStatus(s, 'player', 'rupture', 1));
    engine.endTurn();
    const tl   = getTimeline(bundles);
    const apply = findEvent(tl, 'STATUS_APPLY', { target: 'player', typeId: 'strength' });
    expect(apply).toBeDefined();
    expect(st(pl(engine), 'strength')).toBe(1);
  });

  it('rupture:2 → 获得 2 层力量', () => {
    loadState(engine, s => setStatus(s, 'player', 'rupture', 2));
    engine.endTurn();
    expect(st(pl(engine), 'strength')).toBe(2);
  });

  it('rupture 不触发：格挡完全吸收伤害时', () => {
    loadState(engine, s => {
      setStatus(s, 'player', 'rupture', 1);
      setBlock(s, 'player', 20);
    });
    engine.endTurn();
    const tl    = getTimeline(bundles);
    const apply = findEvent(tl, 'STATUS_APPLY', { target: 'player', typeId: 'strength' });
    expect(apply).toBeUndefined();
    expect(st(pl(engine), 'strength')).toBe(0);
  });

  it('rupture 不触发：玩家攻击敌人时（敌人受伤，不是玩家）', () => {
    loadState(engine, s => setStatus(s, 'player', 'rupture', 1));
    engine.playCard(strikeId, enemyPath);
    const tl    = getTimeline(bundles);
    const apply = findEvent(tl, 'STATUS_APPLY', { target: 'player', typeId: 'strength' });
    expect(apply).toBeUndefined();
  });
});

// ── entity:die → battle:end ──────────────────────────────────────────────────

describe('kill chain — 致死触发 entity:die → battle:end', () => {
  it('打击致死（hp=6，6 伤精确消灭）→ timeline: ENTITY_DIE + BATTLE_END(victory=true)', () => {
    loadState(engine, s => { s.entities[s.enemies['1']].hp = 6; });
    engine.playCard(strikeId, enemyPath);
    const tl   = getTimeline(bundles);
    const die  = findEvent(tl, 'ENTITY_DIE');
    const end  = findEvent(tl, 'BATTLE_END');
    expect(die).toBeDefined();
    expect(end).toBeDefined();
    expect(end.payload.victory).toBe(true);
    expect(engine.getState().battle.over).toBe(true);
    expect(engine.getState().battle.victory).toBe(true);
  });

  it('敌人致死玩家（hp=6，颚虫 11 伤 endTurn）→ BATTLE_END(victory=false)', () => {
    loadState(engine, s => { s.entities.player.hp = 6; });
    engine.endTurn();
    const tl  = getTimeline(bundles);
    const end = findEvent(tl, 'BATTLE_END');
    expect(end).toBeDefined();
    expect(end.payload.victory).toBe(false);
    expect(engine.getState().battle.over).toBe(true);
    expect(engine.getState().battle.victory).toBe(false);
  });

  it('过量伤害：enemy.hp 保持为 0（不变为负数）', () => {
    loadState(engine, s => { s.entities[s.enemies['1']].hp = 2; });
    engine.playCard(strikeId, enemyPath);
    const tl   = getTimeline(bundles);
    const loss = findEvent(tl, 'ENTITY_LOSS');
    expect(loss.payload.actualLoss).toBe(2);  // cap 到剩余 HP
    // 敌人死亡后 enemies.1 slot 被清除，需直接从 entities 读取数据
    expect(engine.getState().entities[enemyPath].hp).toBe(0);
  });
});

// ── thorns 反弹链：enemy.thorns → entity:damage 给攻击方 ────────────────────

describe('thorns — 攻击方受到反弹伤害', () => {
  it('敌人 thorns:3 → 玩家打击后受 3 点反弹伤害', () => {
    loadState(engine, s => setStatus(s, ep(engine), 'thorns', 3));
    engine.playCard(strikeId, enemyPath);
    const tl = getTimeline(bundles);

    // 主伤：player → enemy
    const mainDmg = findEvent(tl, 'ENTITY_DAMAGE', { source: 'player' });
    expect(mainDmg).toBeDefined();
    expect(mainDmg.payload.actualDamage).toBe(6);

    // 反弹：thorns → player（source 为 thorns，不是 player）
    const thornsDmg = findAllEvents(tl, 'ENTITY_DAMAGE')
      .find(e => e.payload.target === 'player');
    expect(thornsDmg).toBeDefined();
    expect(thornsDmg.payload.amount).toBe(3);
    expect(pl(engine).hp).toBe(67);
  });

  it('thorns 反弹使用 entity:damage（不走 entity:attack），不触发二次荆棘递归', () => {
    // 双方都有 thorns，验证不会无限递归
    loadState(engine, s => {
      setStatus(s, ep(engine), 'thorns', 3);
      setStatus(s, 'player', 'thorns', 99);
    });
    engine.playCard(strikeId, enemyPath);
    const tl = getTimeline(bundles);

    // ENTITY_ATTACK 只应出现一次（玩家打出打击）
    const attacks = findAllEvents(tl, 'ENTITY_ATTACK');
    expect(attacks).toHaveLength(1);

    // 只有 thorns 反弹的那一次 ENTITY_DAMAGE 打玩家，不会继续触发玩家 thorns
    const playerDmgs = findAllEvents(tl, 'ENTITY_DAMAGE')
      .filter(e => e.payload.target === 'player');
    expect(playerDmgs).toHaveLength(1);
    expect(pl(engine).hp).toBe(67);
  });

  it('玩家 block:3 恰好吸收 thorns:3 反弹 → player.hp 不变，block 被移除', () => {
    loadState(engine, s => {
      setStatus(s, ep(engine), 'thorns', 3);
      setBlock(s, 'player', 3);
    });
    engine.playCard(strikeId, enemyPath);
    const tl = getTimeline(bundles);

    const thornsDmg = findAllEvents(tl, 'ENTITY_DAMAGE')
      .find(e => e.payload.target === 'player');
    expect(thornsDmg.payload.blocked).toBe(3);
    expect(thornsDmg.payload.actualDamage).toBe(0);
    expect(pl(engine).hp).toBe(70);
    expect(st(pl(engine), 'block')).toBe(0);
  });

  it('玩家 thorns:3 → 颚虫 endTurn 攻击后受 3 点反弹伤害', () => {
    loadState(engine, s => setStatus(s, 'player', 'thorns', 3));
    engine.endTurn();
    const tl = getTimeline(bundles);

    // 反弹打到颚虫
    const thornsDmg = findAllEvents(tl, 'ENTITY_DAMAGE')
      .find(e => e.payload.target === enemyPath);
    expect(thornsDmg).toBeDefined();
    expect(thornsDmg.payload.amount).toBe(3);
    expect(enemy(engine).hp).toBe(37);
  });
});

// ── frenzy — 击杀时抽牌回能 ─────────────────────────────────────────────────

describe('frenzy — 击杀时抽牌并回能', () => {
  it('frenzy:2 + 打击致死 → timeline 含 2 个 CARD_DRAW，能量回 1', () => {
    // frenzy 在 entity:die 上挂 handler：抽 stacks 张牌，回 1 能量
    loadState(engine, s => {
      s.entities[s.enemies['1']].hp = 6;
      setStatus(s, 'player', 'frenzy', 2);
      // 补充 2 张牌到摸牌堆，防 deck:deplete
      s.drawPile = ['defend_1', 'defend_2'];
      s.cards['defend_1'] = { cardId: 'defend' };
      s.cards['defend_2'] = { cardId: 'defend' };
    });
    const energyBefore = pl(engine).energy;
    engine.playCard(strikeId, enemyPath);
    const tl    = getTimeline(bundles);
    const draws = findAllEvents(tl, 'CARD_DRAW');
    expect(draws).toHaveLength(2);
    expect(pl(engine).energy).toBe(energyBefore - 1 + 1); // 出牌-1，frenzy+1
  });

  it('frenzy 不触发：敌人存活时', () => {
    loadState(engine, s => setStatus(s, 'player', 'frenzy', 2));
    engine.playCard(strikeId, enemyPath);
    const tl    = getTimeline(bundles);
    const draws = findAllEvents(tl, 'CARD_DRAW');
    expect(draws).toHaveLength(0);
  });
});
