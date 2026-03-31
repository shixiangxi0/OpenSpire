/**
 * evt/game/session.js — 游戏会话
 *
 * createSession(scenario) 返回 session 对象：
 *   play(instanceId, target?)  → { logs, state }
 *   endTurn()                  → { logs, state }
 *   getViewState()             → 当前快照
 *   getCheckpoint()            → 当前回合起点的引擎状态（可序列化存档）
 *   restoreTurn(snapshot?)     → 恢复到回合起点
 *
 * checkpoint 语义：player:turn:start 完成后的状态切面（手牌已摸好，能量已重置）。
 */
import { createEngine }     from '../index.js';
import { stsModule }        from '../sts/index.js';
import { loadModules }      from './loader.js';
import { buildBattleStore } from './builder.js';
import { summarizeBundle }  from './summarize.js';
import { createPresenter }  from './presenter.js';

/**
 * @param {object} scenario  来自 scenarios/*.json
 * @param {object} [extras]  { enemies, cards } 测试夹具（--test 模式）
 * @returns {Promise<object>} session
 */
export async function createSession(scenario, extras = {}) {
  const { cards, character, enemyDisplayMap, statusDisplayMap } = loadModules(extras, scenario.lang ?? 'zh');

  const pendingBundles = [];
  const engine = await createEngine({ onBundle: (b) => { pendingBundles.push(b); } });

  engine.use(stsModule);

  // 注入测试夹具中的额外卡牌 / 敌人定义（不影响正式对局）
  if (extras.cards || extras.enemies) {
    engine.use({
      defs: {
        ...(extras.cards   && { card:  extras.cards }),
        ...(extras.enemies && { enemy: extras.enemies }),
      },
    });
  }

  const presenter = createPresenter({ cards, statusDisplayMap, enemyDisplayMap, lang: scenario.lang ?? 'zh' });
  const ctx = presenter.buildCtx(() => engine.getState());

  const enemiesInit = {};
  (scenario.enemies ?? []).forEach((e, i) => {
    enemiesInit[String(i + 1)] = { typeId: e.typeId, hp: e.hp, maxHp: e.maxHp ?? e.hp };
  });

  const deckInit = (scenario.deck ?? []).map(c =>
    typeof c === 'string' ? { cardId: c } : c
  );

  const store = buildBattleStore({
    initial: { player: scenario.player, enemies: enemiesInit, deck: deckInit },
    cards,
    character,
  });

  // 启动战斗：重置状态 → 触发 battle:start
  engine.load(store);
  engine.state.emit('battle:start', {});

  function collectLogs() {
    const bundles = pendingBundles.splice(0);
    return bundles.flatMap(b => summarizeBundle(b, ctx));
  }

  function getViewState() {
    return presenter.buildViewState(engine.getState());
  }

  // checkpoint: player:turn:start 完成后的状态（手牌已摸好，能量已重置）
  let turnCheckpoint = engine.getState();
  const initialLogs  = collectLogs();

  return {
    initialLogs,

    play(instanceId, target = null) {
      const state = engine.getState();
      if (state.battle?.over)
        return { success: false, reason: 'battle_over',  logs: [], state: getViewState() };
      if (!state.hand?.includes(instanceId))
        return { success: false, reason: 'not_in_hand', logs: [], state: getViewState() };

      const result = engine.state.emit('card:play', {
        instanceId,
        cardId: state.cards?.[instanceId]?.cardId,
        target,
        cost:   state.cards?.[instanceId]?.cost,
      });

      if (result.cancelled)
        return { success: false, reason: 'cancelled', logs: [], state: getViewState() };
      return { success: true, logs: collectLogs(), state: getViewState() };
    },

    endTurn() {
      if (!engine.getState().battle?.over) engine.state.emit('turn:end', {});
      turnCheckpoint = engine.getState();
      return { logs: collectLogs(), state: getViewState() };
    },

    // 返回当前回合起点的完整引擎状态，可直接序列化为存档
    getCheckpoint() { return JSON.parse(JSON.stringify(turnCheckpoint)); },

    // 恢复到指定 snapshot（默认：当前回合起点）
    // 传入外部存档 JSON 时可用于跨会话读档
    restoreTurn(snapshot = turnCheckpoint) {
      engine.load(snapshot);
      pendingBundles.length = 0;
      turnCheckpoint = engine.getState();
      return { logs: [], state: getViewState() };
    },

    getViewState,
    getBattleResult() {
      const b = engine.getState().battle ?? {};
      return { over: b.over ?? false, victory: b.victory ?? false };
    },
    displayMaps: { cards, enemyDisplayMap, statusDisplayMap },
  };
}
