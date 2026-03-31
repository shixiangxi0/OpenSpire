/**
 * modules/statuses/core.js — 核心状态规则
 *
 * \u6bcf\u4e2a\u72b6\u6001\u6a21\u5757\uff0c\u6ce8\u518c\u5230\u5f15\u64ce
 */

// ── strength：力量 ────────────────────────────────────────────────────────────
export const strength = {
  id: 'strength',
  display: {
    name: '力量',
    desc: '攻击额外造成 {stacks} 点伤害。',
  },
  triggers: [{
    event: 'entity:attack', order: 200, script: `
if Event.source ~= Ctx.self then return end
Event.amount = Event.amount + (State.get('entities', Ctx.self, 'statuses', 'strength', 'stacks') or 0)
`,
  }],
};

// ── weak：虚弱 ────────────────────────────────────────────────────────────────
export const weak = {
  id: 'weak',
  display: {
    name: '虚弱',
    desc: '造成的伤害降低 25%。',
  },
  triggers: [
    // 伤害修饰：攻击方处于虚弱时伤害 ×0.75
    { event: 'entity:attack', order: 150, script: `
if Event.source ~= Ctx.self then return end
local orig = Event.amount
Event.amount = math.floor(Event.amount * 0.75)
Event.weakReduced = (Event.weakReduced or 0) + (orig - Event.amount)
` },
    // 回合末衰减（玩家和敌人共用）
    { event: 'actor:turn:end', order: 500, script: `
if Event.target ~= Ctx.self then return end
State.emit('status:apply', { target = Ctx.self, typeId = 'weak', stacks = -1 })
` },
  ],
};

// ── vulnerable：易伤 ──────────────────────────────────────────────────────────
export const vulnerable = {
  id: 'vulnerable',
  display: {
    name: '易伤',
    desc: '受到的伤害增加 50%。',
  },
  triggers: [
    // 伤害修饰：目标处于易伤时受到伤害 ×1.5
    { event: 'entity:attack', order: 100, script: `
if Event.target ~= Ctx.self then return end
Event.amount = math.floor(Event.amount * 1.5)
` },
    // 回合末衰减（玩家和敌人共用）
    { event: 'actor:turn:end', order: 500, script: `
if Event.target ~= Ctx.self then return end
State.emit('status:apply', { target = Ctx.self, typeId = 'vulnerable', stacks = -1 })
` },
  ],
};

// ── ritual：仪式（狂信者专用）────────────────────────────────────────────────
export const ritual = {
  id: 'ritual',
  display: {
    name: '仪式',
    desc: '每回合获得 {stacks} 层力量。',
  },
  triggers: [{
    event: 'actor:turn:end', order: 400, script: `
if Event.target ~= Ctx.self then return end
local stacks = State.get('entities', Ctx.self, 'statuses', 'ritual', 'stacks') or 0
State.emit('status:apply', { target = Ctx.self, typeId = 'strength', stacks = stacks })
`,
  }],
};

// ── card_tax：契约税（每次出牌受到 N 点伤害）────────────────────────────────
export const cardTax = {
  id: 'card_tax',
  display: {
    name: '契约税',
    desc: '每次出牌受到 {stacks} 点伤害。',
  },
  triggers: [{
    event: 'card:play', order: -200, script: `
if Event.cancelled then return end
local stacks = State.get('entities', Ctx.self, 'statuses', 'card_tax', 'stacks') or 0
State.emit('entity:damage', { target = Ctx.self, amount = stacks, source = 'card_tax' })
`,
  }],
};

// ── rupture：撕裂（受到实际 HP 伤害时获得力量）──────────────────────────────
export const rupture = {
  id: 'rupture',
  display: {
    name: '撕裂',
    desc: '每次实际失去 HP 时获得 1 层力量。',
  },
  triggers: [{
    event: 'entity:loss', order: -100, script: `
if Event.target ~= Ctx.self then return end
local loss = Event.actualLoss or 0
if loss <= 0 then return end
local stacks = State.get('entities', Ctx.self, 'statuses', 'rupture', 'stacks') or 0
State.emit('status:apply', { target = Ctx.self, typeId = 'strength', stacks = stacks })
`,
  }],
};

// ── demon_form：恶魔化（每回合开始获得 3 层力量）─────────────────────────────
export const demonForm = {
  id: 'demon_form',
  display: {
    name: '恶魔化',
    desc: '每回合开始获得 3 层力量。',
  },
  triggers: [{
    event: 'player:turn:start', order: -50, script: `
local stacks = State.get('entities', Ctx.self, 'statuses', 'demon_form', 'stacks') or 0
State.emit('status:apply', { target = Ctx.self, typeId = 'strength', stacks = stacks * 3 })
`,
  }],
};

// ── extra_draw：额外抽牌（已打出的奥术通量赋予）──────────────────────────────
export const extraDraw = {
  id: 'extra_draw',
  display: {
    name: '额外抽牌',
    desc: '每回合开始额外抽 {stacks} 张牌。',
  },
  triggers: [{
    event: 'player:turn:start',
    order: -100,   // 主抽(order=0)之后抽额外牌
    script: `
local stacks = State.get('entities', Ctx.self, 'statuses', 'extra_draw', 'stacks') or 0
for i = 1, stacks do
  State.emit('card:draw', {})
end
`,
  }],
};

// ── poison：中毒 ──────────────────────────────────────────────────────────────
// 每回合结束受到等量伤害（受格挡保护），层数 -1。
export const poison = {
  id: 'poison',
  display: {
    name: '中毒',
    desc: '每回合结束受到等同于层数的伤害，然后层数 -1。',
  },
  triggers: [
    // 合并为单一 actor:turn:end（经 actorTurnBridgeCore 转发，玩家和敌人均触发）
    { event: 'actor:turn:end', order: 600, script: `
if Event.target ~= Ctx.self then return end
local stacks = State.get('entities', Ctx.self, 'statuses', 'poison', 'stacks') or 0
State.emit('entity:damage', { target = Ctx.self, amount = stacks, source = 'poison' })
State.emit('status:apply',  { target = Ctx.self, typeId = 'poison', stacks = -1 })
` },
  ],
};

// ── thorns：荆棘 ──────────────────────────────────────────────────────────────
// 受到实体攻击时，对攻击者反弹等量伤害（不穿透格挡，不会再次触发荆棘）。
export const thorns = {
  id: 'thorns',
  display: {
    name: '荆棘',
    desc: '受到实体攻击时，对攻击者造成 {stacks} 点伤害。',
  },
  triggers: [{ event: 'entity:attack', order: -200, script: `
if Event.target ~= Ctx.self then return end
local stacks = State.get('entities', Ctx.self, 'statuses', 'thorns', 'stacks') or 0
State.emit('entity:damage', { target = Event.source, amount = stacks, source = Ctx.self })
` }],
};

// ── frail：脆弱 ──────────────────────────────────────────────────────────────
// 每次获得格挡减少 25%，每回合末层数 -1。
export const frail = {
  id: 'frail',
  display: {
    name: '脆弱',
    desc: '获得的格挡减少 25%。',
  },
  triggers: [
    // 在 blockCore(order=0) 之前修改 amount
    { event: 'entity:block', order: 100, script: `
if Event.target ~= Ctx.self then return end
if Event.amount <= 0 then return end
Event.amount = math.floor(Event.amount * 0.75)
` },
    // 回合末衰减（玩家和敌人共用）
    { event: 'actor:turn:end', order: 500, script: `
if Event.target ~= Ctx.self then return end
State.emit('status:apply', { target = Ctx.self, typeId = 'frail', stacks = -1 })
` },
  ],
};

// ── metallicize：金属化 ───────────────────────────────────────────────────────
// 每回合结束自动获得 N 点格挡（永久回合效果）。
export const metallicize = {
  id: 'metallicize',
  display: {
    name: '金属化',
    desc: '每回合结束获得 {stacks} 点格挡。',
  },
  triggers: [
    // 合并为单一 actor:turn:end（经 actorTurnBridgeCore 转发，玩家和敌人均触发）
    { event: 'actor:turn:end', order: 400, script: `
if Event.target ~= Ctx.self then return end
local stacks = State.get('entities', Ctx.self, 'statuses', 'metallicize', 'stacks') or 0
State.emit('entity:block', { target = Ctx.self, amount = stacks })
` },
  ],
};

// ── block：格挡 ─────────────────────────────────────────────────────────────
export const block = {
  id: 'block',
  display: {
    name: '格挡',
    desc: '抵挡等量伤害，回合开始时清零。',
  },
  triggers: [
    { event: 'actor:turn:start', order: 0, script: `
if Event.target ~= Ctx.self then return end
State.emit('status:remove', { target = Ctx.self, typeId = 'block' })
` },
  ],
};

// ── frenzy：狂热（击杀敌人时抽牌并恢复能量）────────────────────────────────
// 每次击杀敌人：抽 stacks 张牌，获得 1 点能量。
export const frenzy = {
  id: 'frenzy',
  display: {
    name: '狂热',
    desc: '每次击杀敌人时，抽 {stacks} 张牌并获得 1 点能量。',
  },
  triggers: [{
    event: 'enemy:die', order: -100, script: `
local stacks = State.get('entities', Ctx.self, 'statuses', 'frenzy', 'stacks') or 0
for i = 1, stacks do
  State.emit('card:draw', {})
end
local energy = State.get('entities', 'player', 'energy') or 0
State.set('entities', 'player', 'energy', energy + 1)
`,
  }],
};

export const ALL_STATUS_MODULES = [
  block,
  strength,
  weak,
  vulnerable,
  ritual,
  extraDraw,
  cardTax,
  rupture,
  demonForm,
  poison,
  thorns,
  frail,
  metallicize,
  frenzy,
];
