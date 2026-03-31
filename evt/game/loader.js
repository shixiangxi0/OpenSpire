/**
 * evt/game/loader.js — 聚合所有模块，构建 createEngine 所需的 defs 对象
 *
 * 返回：{ cards, statuses, enemyDisplayMap, statusDisplayMap }
 *
 * extras（可选）：{ enemies, cards } 用于注入测试夹具（--test 模式）
 * lang（可选）：显示语言，'zh'（默认）或 'en'；i18n overlay 在 sts/i18n/ 下
 */
import { ALL_STATUS_MODULES } from '../sts/statuses/core.js';
import { stsModule }          from '../sts/index.js';
import { ironclad }           from '../sts/characters/ironclad.js';
import EN_OVERLAY             from '../sts/i18n/en.js';

const OVERLAYS = { en: EN_OVERLAY };

// 模块定义是纯静态数据，单例缓存避免重复构建（extras 注入时跳过缓存）
let _cache = null;

export function loadModules(extras = {}, lang = 'zh') {
  const hasExtras = extras.enemies || extras.cards;
  if (_cache && !hasExtras && lang === 'zh') return _cache;

  const allEnemies = { ...stsModule.defs.enemy, ...(extras.enemies ?? {}) };
  const cards       = { ...stsModule.defs.card,  ...(extras.cards  ?? {}) };

  // UI 专用：typeId → display + actions
  const enemyDisplayMap = {};
  for (const [typeId, mod] of Object.entries(allEnemies)) {
    enemyDisplayMap[typeId] = { display: mod.display, actions: mod.actions };
  }

  // UI 专用：status typeId → display（从模块取，单一来源）
  const statusDisplayMap = {};
  for (const mod of ALL_STATUS_MODULES) {
    if (mod.display) statusDisplayMap[mod.id] = mod.display;
  }

  const result = { cards, character: ironclad, enemyDisplayMap, statusDisplayMap };
  if (!hasExtras) _cache = result;
  return lang === 'zh' ? result : applyOverlay(result, lang);
}

/**
 * 将 i18n overlay 叠加到 displayMap 上，返回新对象（不修改 cache）。
 * 仅覆盖有翻译的条目，缺失项自动回退原始中文。
 */
function applyOverlay(base, lang) {
  const overlay = OVERLAYS[lang];
  if (!overlay) return base;

  // cards：覆盖 display.name / display.desc
  const cards = { ...base.cards };
  for (const [id, ov] of Object.entries(overlay.cards ?? {})) {
    if (cards[id]) cards[id] = { ...cards[id], display: { ...cards[id].display, ...ov } };
  }

  // statusDisplayMap：覆盖 name / desc
  const statusDisplayMap = { ...base.statusDisplayMap };
  for (const [id, ov] of Object.entries(overlay.statuses ?? {})) {
    if (statusDisplayMap[id]) statusDisplayMap[id] = { ...statusDisplayMap[id], ...ov };
  }

  // enemyDisplayMap：覆盖 display.name 和各 action.desc
  const enemyDisplayMap = { ...base.enemyDisplayMap };
  for (const [typeId, ov] of Object.entries(overlay.enemies ?? {})) {
    if (!enemyDisplayMap[typeId]) continue;
    const entry = enemyDisplayMap[typeId];
    const actions = { ...entry.actions };
    for (const [aid, desc] of Object.entries(ov.actions ?? {})) {
      if (actions[aid]) actions[aid] = { ...actions[aid], desc };
    }
    enemyDisplayMap[typeId] = {
      display: ov.name ? { ...entry.display, name: ov.name } : entry.display,
      actions,
    };
  }

  return { ...base, cards, statusDisplayMap, enemyDisplayMap };
}
