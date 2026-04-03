/**
 * evt/game/locale.js — Bilingual text definitions (zh / en)
 *
 * Contains four categories of strings:
 *   presenter  — Entity name fallback (used by presenter.js)
 *   log        — Battle log templates (used by summarize.js)
 *   ui         — UI text (used by App.jsx)
 *   cli        — CLI prompts (used by slay.js)
 *
 * Usage:
 *   import { getLocale } from './locale.js';
 *   const L = getLocale('en'); // or 'zh' (default is 'en')
 */

export const LOCALES = {
  // ── 中文 ──────────────────────────────────────────────────────────────
  zh: {
    // 实体名称回退
    unknown:       '未知',
    player:        '玩家',
    enemyFallback: (slot) => `敌人${slot}`,

    // 战斗日志模板
    log: {
      damage: (src, tgt, net, mods, fatal) => {
        let line = `${src} 对 ${tgt} 造成 ${net} 点伤害`;
        if (mods.length)  line += `（${mods.join('，')}）`;
        if (fatal)        line += '，击败！';
        return line;
      },
      weakReduced:  (n)        => `虚弱 -${n} 点`,
      blocked:      (n)        => `格挡 ${n} 点`,
      blockGain:    (tgt, n)   => `  └ ${tgt} 获得 ${n} 点格挡`,
      statusGain:   (tgt, name, n) => `  └ ${tgt} 获得 ${n} 层${name}`,
      statusReduce: (tgt, name, n) => `  └ ${tgt} 的${name}减少 ${n} 层`,
      statusRemove: (tgt, name)    => `  └ ${tgt} 的${name}消除`,
      cardPlay:     (name)     => `▷ 出牌：${name}`,
      cardExhaust:  (name)     => `  └ 消耗：${name}`,
      playerTurnStart: '─── 玩家回合开始 ───',
      playerTurnEnd:   '─── 玩家回合结束 ───',
      enemyActStart:     (name)       => `▶ ${name} 行动开始`,
      enemyAction:       (name, desc) => `  └ ${name} 使用 ${desc}`,
      cardDraw:          (name)       => `  └ 摸牌：${name}`,
      loss:    (src, tgt, n)   => `${src} 令 ${tgt} 直接失去 ${n} 点 HP`,
      die:     (tgt)           => `☠ ${tgt} 被击败！`,
      heal:    (tgt, n)        => `  └ ${tgt} 恢复 ${n} 点 HP`,
      battleStart:   '─── 战斗开始 ───',
      battleVictory: '─── 战斗胜利！───',
      battleDefeat:  '─── 战斗失败。───',
    },

    // UI 界面文字
    ui: {
      title:      '== 杀戮尖塔 ==',
      chromeTitle:'OpenSpire CLI',
      shellTitle: 'STS 参考战斗',
      player:     '玩家',
      hp:         'HP',
      energy:     '能量',
      block:      '格挡',
      // 卡牌类型标签（手牌列表每行左侧缩写）
      cardType:   { attack: '攻击', skill: '技能', power: '能力' },
      // 敌人意图图标
      intentIcon: { attack: '[攻]', defend: '[防]', buff: '[增益]', debuff: '[减益]' },
      // 牌堆标签
      pileLabels: { draw: '抽牌', discard: '弃牌', exhaust: '消耗' },
      handCount:  (n) => `手牌（${n}张）`,
      exhaust:    '[消耗]',
      turn:       (n) => `第 ${n} 回合`,
      loading:    '正在初始化 Lua 引擎...',
      victory:    '== 战斗胜利！==',
      defeat:     '== 你被击败了。==',
      pressQuit:  '按 q 退出',
      mode: {
        battle: '战斗中',
        target: '目标选择',
        dict:   '词典展开',
      },
      section: {
        battlefield: '战场',
        hand:        '出牌区',
        controls:    '操作',
        notice:      '提示',
      },
      empty: {
        log:  '等待新的事件...',
        hand: '当前没有手牌',
      },
      dictTitle:  '状态词典（当前生效）',
      dictEmpty:  '无生效状态',
      dictClose:  '按 [i] 关闭',
      logTitle:   '战斗日志',
      hint: {
        play:         '出牌',
        end:          '回合结束',
        undo:         '撤销',
        save:         '存档',
        load:         '读档',
        dict:         '状态词典',
        quit:         '退出',
        closeDict:    '关闭状态词典',
        selectTarget: '选目标敌人编号',
        selectTargetCard: (name) => `为 ${name} 选择目标敌人编号`,
        cancel:       '取消',
      },
      notice: {
        saved:    (n) => `💾 存档成功（第 ${n} 回合起点）`,
        saveFail: (e) => `存档失败：${e}`,
        loaded:   '📂 读档成功',
        loadFail: '读档失败：找不到存档或文件损坏',
        undone:    '↩ 已恢复到本回合起点',
        playFailed: '出牌失败',
      },
    },

    // CLI 提示（slay.js）
    cli: {
      title:             '== 杀戮尖塔 ==',
      selectScene:       '选择场景：',
      sceneNotFound:     (name, list) => `\n找不到场景"${name}"。\n可用场景：${list}\n`,
      jsonUsage:         '用法: node evt/bin/slay.js json <场景名>',
      jsonSceneNotFound: (name)       => `找不到场景: ${name}`,
      invalidJson:       '输入必须是合法 JSON',
      unknownCmd:        (cmd)        => `未知命令: ${cmd}，支持: play / end / state / quit`,
      playNeedId:        'play 需要 instanceId 字段',
      initFail:          (e)          => `引擎初始化失败: ${e}`,
    },
  },

  // ── English ────────────────────────────────────────────────────────────
  en: {
    unknown:       'unknown',
    player:        'Player',
    enemyFallback: (slot) => `Enemy ${slot}`,

    log: {
      damage: (src, tgt, net, mods, fatal) => {
        let line = `${src} deals ${net} damage to ${tgt}`;
        if (mods.length)  line += ` (${mods.join(', ')})`;
        if (fatal)        line += ', defeated!';
        return line;
      },
      weakReduced:  (n)        => `weak -${n}`,
      blocked:      (n)        => `blocked ${n}`,
      blockGain:    (tgt, n)   => `  └ ${tgt} gains ${n} block`,
      statusGain:   (tgt, name, n) => `  └ ${tgt} gains ${n} ${name}`,
      statusReduce: (tgt, name, n) => `  └ ${tgt}'s ${name} -${n}`,
      statusRemove: (tgt, name)    => `  └ ${tgt}'s ${name} removed`,
      cardPlay:     (name)     => `▷ Play: ${name}`,
      cardExhaust:  (name)     => `  └ Exhaust: ${name}`,
      playerTurnStart: '─── Player Turn Start ───',
      playerTurnEnd:   '─── Player Turn End ───',
      enemyActStart:     (name)       => `▶ ${name} acts`,
      enemyAction:       (name, desc) => `  └ ${name} uses ${desc}`,
      cardDraw:          (name)       => `  └ Draw: ${name}`,
      loss:    (src, tgt, n)   => `${src} causes ${tgt} to lose ${n} HP directly`,
      die:     (tgt)           => `☠ ${tgt} defeated!`,
      heal:    (tgt, n)        => `  └ ${tgt} heals ${n} HP`,
      battleStart:   '─── Battle Start ───',
      battleVictory: '─── Victory! ───',
      battleDefeat:  '─── Defeat. ───',
    },

    ui: {
      title:      '== Slay the Spire ==',
      chromeTitle:'OpenSpire CLI',
      shellTitle: 'STS Reference Battle',
      player:     'Player',
      hp:         'HP',
      energy:     'Energy',
      block:      'Block',
      cardType:   { attack: 'ATK', skill: 'SKL', power: 'PWR' },
      intentIcon: { attack: '[ATK]', defend: '[DEF]', buff: '[BUFF]', debuff: '[DEB]' },
      pileLabels: { draw: 'Draw', discard: 'Disc', exhaust: 'Exh' },
      handCount:  (n) => `Hand (${n})`,
      exhaust:    '[Exhaust]',
      turn:       (n) => `Turn ${n}`,
      loading:    'Initializing Lua engine...',
      victory:    '== Victory! ==',
      defeat:     '== Defeated. ==',
      pressQuit:  'Press q to quit',
      mode: {
        battle: 'Battle',
        target: 'Targeting',
        dict:   'Dictionary',
      },
      section: {
        battlefield: 'Battlefield',
        hand:        'Action Panel',
        controls:    'Controls',
        notice:      'Notice',
      },
      empty: {
        log:  'Awaiting new events...',
        hand: 'No cards in hand',
      },
      dictTitle:  'Status Dictionary (Active)',
      dictEmpty:  'No active statuses',
      dictClose:  'Press [i] to close',
      logTitle:   'Battle Log',
      hint: {
        play:         'Play',
        end:          'End Turn',
        undo:         'Undo',
        save:         'Save',
        load:         'Load',
        dict:         'Status Dict',
        quit:         'Quit',
        closeDict:    'Close Status Dict',
        selectTarget: 'Select enemy slot #',
        selectTargetCard: (name) => `Select enemy slot for ${name}`,
        cancel:       'Cancel',
      },
      notice: {
        saved:    (n) => `💾 Saved (Turn ${n} checkpoint)`,
        saveFail: (e) => `Save failed: ${e}`,
        loaded:   '📂 Load successful',
        loadFail: 'Load failed: save not found or corrupted',
        undone:     '↩ Restored to turn start',
        playFailed: 'Play failed',
      },
    },

    cli: {
      title:             '== Slay the Spire ==',
      selectScene:       'Select scenario:',
      sceneNotFound:     (name, list) => `\nScenario "${name}" not found.\nAvailable: ${list}\n`,
      jsonUsage:         'Usage: node evt/bin/slay.js json <scenario>',
      jsonSceneNotFound: (name)       => `Scenario not found: ${name}`,
      invalidJson:       'Input must be valid JSON',
      unknownCmd:        (cmd)        => `Unknown command: ${cmd}. Supported: play / end / state / quit`,
      playNeedId:        'play requires instanceId field',
      initFail:          (e)          => `Engine init failed: ${e}`,
    },
  },
};

/**
 * @param {'zh'|'en'} [lang='en']
 * @returns {typeof LOCALES.zh}
 */
export function getLocale(lang = 'en') {
  return LOCALES[lang] ?? LOCALES.en;
}
