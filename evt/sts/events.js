/**
 * definitions/events.js — 事件表（空插槽声明）
 *
 * 只声明 event 名 + action 名，不含任何逻辑。
 * payload 字段为约定文档，不参与运行时校验。
 */
export const EVENTS = {
  // ── entity ──────────────────────────────────────────────
  // target/source 统一约定为实体 id：'player' 或敌人实例 id（如 'jaw_worm_1'）
  'entity:attack':     { action: 'ENTITY_ATTACK'      },  // 战斗攻击：走 strength/weak/vulnerable/thorns，最终转 entity:damage
  'entity:damage':     { action: 'ENTITY_DAMAGE'      },  // 固定伤害（会被格挡，不受攻击状态加成）：毒/荆棘反弹等
  'entity:heal':       { action: 'ENTITY_HEAL'        },
  'entity:block':      { action: 'ENTITY_BLOCK'       },
  'entity:loss':       { action: 'ENTITY_LOSS'        },  // 直接扣 HP（穿透格挡，不触发攻击/格挡状态）：主动失血
  'entity:die':        { action: 'ENTITY_DIE'         },
  'enemy:die':         { action: 'ENEMY_DIE'          },  // target 是敌人实体（非玩家）
  'enemy:loss':        { action: 'ENEMY_LOSS'         },  // 敌人受到实际 HP 损失（含 actualLoss）

  // ── card（两层）──────────────────────────────────────────
  // 语义层：status 挂钉此层
  'card:play':         { action: 'CARD_PLAY'          },  // 系统入口（扣能量），只走一次
  'card:effect':       { action: 'CARD_EFFECT'        },  // 纯效果层，可被 double_tap 重触发
  'card:draw':         { action: 'CARD_DRAW'          },  // drawPile → hand
  'card:discard':      { action: 'CARD_DISCARD'       },  // → discardPile
  'card:exhaust':      { action: 'CARD_EXHAUST'       },  // → exhaustPile
  // 原语层：只做区域间移动，外部不应直接 emit
  'card:move':         { action: 'CARD_MOVE'          },
  // 语义事件：cardMoveCore 根据 from/to 自动发出，dispatcher 监听，卡牌脚本在此处响应
  'card:drawn':        { action: 'CARD_DRAWN'         },  // drawPile → hand
  'card:discarded':    { action: 'CARD_DISCARDED'     },  // * → discardPile
  'card:exhausted':    { action: 'CARD_EXHAUSTED'     },  // * → exhaustPile

  // ── status ─────────────────────────────────────────────
  'status:apply':      { action: 'STATUS_APPLY'       },
  'status:remove':     { action: 'STATUS_REMOVE'      },

  // ── 回合生命周期 ─────────────────────────────────────────
  'player:turn:start': { action: 'PLAYER_TURN_START'  },
  'player:turn:end':   { action: 'PLAYER_TURN_END'    },

  // ── 通用实体回合节点（玩家和敌人共用，payload: { target }）────
  'actor:turn:start':  { action: 'ACTOR_TURN_START'   },  // 某实体回合开始（清格挡等）
  'actor:turn:end':    { action: 'ACTOR_TURN_END'     },  // 某实体回合结束（状态衰减等）

  // ── 全局节点 ─────────────────────────────────────────────
  'turn:end':          { action: 'TURN_END'           },
  'battle:start':      { action: 'BATTLE_START'       },
  'battle:end':        { action: 'BATTLE_END'         },  // payload: { victory }

  // ── 牌库 ─────────────────────────────────────────────────
  'deck:deplete':      { action: 'DECK_DEPLETE'       },

  // ── enemy 行动 / AI（enemy def 的 triggers 被路由到此）──────────────────────
  'enemy:action':      { action: 'ENEMY_ACTION'       },  // payload: { target, action }
  'enemy:ai':          { action: 'ENEMY_AI'           },  // payload: { target, phase: 'init'|'update'|'onLoss' }

  // ── 卡牌创建（运行时生成卡牌实例，e.g. anger 复制自身）──────────────────────
  'card:create':       { action: 'CARD_CREATE'        },  // payload: { cardId, destination }
};
