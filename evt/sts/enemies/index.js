/**
 * modules/enemies/index.js — 敌人模块
 *
 * 每个敌人与 card / status 结构完全一致：
 *   - display: { name } 供 UI 渲染名称
 *   - actions: { [actionId]: { type, amount?, desc } } 纯 UI 数据（意图展示）
 *   - triggers: Trigger[]  事件处理器，通过 State.bind 安装进管道
 *     battle:start → battleStartCore 调用
 *       State.bind({ key: eid, kind: 'enemy', id: typeId, ctx: { self: eid } })
 *     响应事件：
 *       enemy:action  payload: { target, action }  — 执行一次行动
 *       enemy:ai      payload: { target, phase }    — AI 生命周期 'init'|'update'|'onLoss'
 */

// ── 颚虫 ──────────────────────────────────────────────────────────────────────
export const jaw_worm = {
  id: 'jaw_worm',
  display: { name: '颚虫' },
  actions: {
    bite:   { type: 'attack', desc: '造成 11 点伤害。' },
    thrash: { type: 'attack', desc: '造成 7 点伤害。施加 3 层力量。' },
    bellow: { type: 'defend', desc: '获得 6 点格挡。施加 3 层力量。' },
  },
  triggers: [
    { event: 'enemy:action', order: 0, script: `
if Event.target ~= Ctx.self then return end
local a = Event.action
if a == 'bite' then
  State.emit('entity:attack', { target='player', amount=11, source=Ctx.self })
elseif a == 'thrash' then
  State.emit('entity:attack', { target='player', amount=7, source=Ctx.self })
  State.emit('status:apply', { target=Ctx.self, typeId='strength', stacks=3 })
elseif a == 'bellow' then
  State.emit('entity:block', { target=Ctx.self, amount=6 })
  State.emit('status:apply', { target=Ctx.self, typeId='strength', stacks=3 })
end
` },
    { event: 'enemy:ai', order: 0, script: `
if Event.target ~= Ctx.self then return end
local phase = Event.phase
if phase == 'init' then
  State.set('entities', Ctx.self, 'intent', 'bite')
elseif phase == 'onLoss' then
  local pct = (State.get('entities', Ctx.self, 'hp') or 0) / (State.get('entities', Ctx.self, 'maxHp') or 1)
  if pct < 0.3 and State.get('entities', Ctx.self, 'phase') ~= 'low' then
    State.set('entities', Ctx.self, 'phase', 'low')
  end
elseif phase == 'update' then
  local p = State.get('entities', Ctx.self, 'phase')
  if p == 'low' then
    State.set('entities', Ctx.self, 'intent', 'bellow')
    return
  end
  local cur = State.get('entities', Ctx.self, 'intent') or 'bite'
  State.set('entities', Ctx.self, 'intent', cur == 'bite' and 'thrash' or 'bite')
end
` },
  ],
};

// ── 狂信者 ────────────────────────────────────────────────────────────────────
export const cultist = {
  id: 'cultist',
  display: { name: '狂信者' },
  actions: {
    incantation: { type: 'buff',   desc: '施加 3 层件式（每回合获得 3 层力量）。' },
    dark_strike: { type: 'attack', desc: '造成 6 点伤害。' },
  },
  triggers: [
    { event: 'enemy:action', order: 0, script: `
if Event.target ~= Ctx.self then return end
local a = Event.action
if a == 'incantation' then
  State.emit('status:apply', { target=Ctx.self, typeId='ritual', stacks=3 })
elseif a == 'dark_strike' then
  State.emit('entity:attack', { target='player', amount=6, source=Ctx.self })
end
` },
    { event: 'enemy:ai', order: 0, script: `
if Event.target ~= Ctx.self then return end
local phase = Event.phase
if phase == 'init' then
  State.set('entities', Ctx.self, 'intent', 'incantation')
elseif phase == 'update' then
  State.set('entities', Ctx.self, 'intent', 'dark_strike')
end
` },
  ],
};

// ── 赤毒蛞蝓 ──────────────────────────────────────────────────────────────────
export const louse_red = {
  id: 'louse_red',
  display: { name: '赤毒蛞蝓' },
  actions: {
    bite: { type: 'attack', desc: '造成 6 点伤害。' },
    grow: { type: 'buff',   desc: '施加 3 层力量。' },
  },
  triggers: [
    { event: 'enemy:action', order: 0, script: `
if Event.target ~= Ctx.self then return end
local a = Event.action
if a == 'bite' then
  State.emit('entity:attack', { target='player', amount=6, source=Ctx.self })
elseif a == 'grow' then
  State.emit('status:apply', { target=Ctx.self, typeId='strength', stacks=3 })
end
` },
    { event: 'enemy:ai', order: 0, script: `
if Event.target ~= Ctx.self then return end
local phase = Event.phase
if phase == 'init' then
  State.set('entities', Ctx.self, 'intent', 'bite')
elseif phase == 'update' then
  local turns = (State.get('entities', Ctx.self, 'turns') or 0) + 1
  State.set('entities', Ctx.self, 'turns', turns)
  State.set('entities', Ctx.self, 'intent', turns % 3 == 0 and 'grow' or 'bite')
end
` },
  ],
};

// ── 绿毒蛞蝓 ──────────────────────────────────────────────────────────────────
export const louse_green = {
  id: 'louse_green',
  display: { name: '绿毒蛞蝓' },
  actions: {
    bite: { type: 'attack', desc: '造成 6 点伤害。' },
    spit: { type: 'debuff', desc: '施加 1 层虚弱。' },
  },
  triggers: [
    { event: 'enemy:action', order: 0, script: `
if Event.target ~= Ctx.self then return end
local a = Event.action
if a == 'bite' then
  State.emit('entity:attack', { target='player', amount=6, source=Ctx.self })
elseif a == 'spit' then
  State.emit('status:apply', { target='player', typeId='weak', stacks=1 })
end
` },
    { event: 'enemy:ai', order: 0, script: `
if Event.target ~= Ctx.self then return end
local phase = Event.phase
if phase == 'init' then
  State.set('entities', Ctx.self, 'intent', 'bite')
elseif phase == 'update' then
  local turns = (State.get('entities', Ctx.self, 'turns') or 0) + 1
  State.set('entities', Ctx.self, 'turns', turns)
  State.set('entities', Ctx.self, 'intent', turns % 2 == 0 and 'spit' or 'bite')
end
` },
  ],
};

// ── 诅咒织者 ──────────────────────────────────────────────────────────────────
// 精英怪，开战立即施加契约税 debuff：每出一张牌受 2 点伤害
// 行动模式（三阶段 AI）：
//   HP > 65%：shadow_strike → voodoo → shadow_strike → rejuvenate（循环）
//   HP 35-65%：slam → voodoo → slam → rejuvenate
//   HP < 35%：curse_nova / slam 交替
export const curse_weaver = {
  id: 'curse_weaver',
  display: { name: '诅咒织者' },
  actions: {
    shadow_strike: { type: 'attack', desc: '造成 18 点伤害。' },
    voodoo:        { type: 'debuff', desc: '施加 2 层易伤和 2 层虚弱。' },
    rejuvenate:    { type: 'defend', desc: '获得 24 点格挡，并强化契约税（+1 层）。' },
    slam:          { type: 'attack', desc: '猛力重击，造成 28 点伤害。' },
    curse_nova:    { type: 'debuff', desc: '契约税 +3 层，并造成 10 点 AOE 伤害（包括玩家）。' },
  },
  triggers: [
    { event: 'enemy:action', order: 0, script: `
if Event.target ~= Ctx.self then return end
local a = Event.action
if a == 'shadow_strike' then
  State.emit('entity:attack', { target='player', amount=18, source=Ctx.self })
elseif a == 'voodoo' then
  State.emit('status:apply', { target='player', typeId='vulnerable', stacks=2 })
  State.emit('status:apply', { target='player', typeId='weak',       stacks=2 })
elseif a == 'rejuvenate' then
  State.emit('entity:block', { target=Ctx.self, amount=24 })
  State.emit('status:apply', { target='player', typeId='card_tax', stacks=1 })
elseif a == 'slam' then
  State.emit('entity:attack', { target='player', amount=28, source=Ctx.self })
elseif a == 'curse_nova' then
  State.emit('status:apply', { target='player', typeId='card_tax', stacks=3 })
  State.emit('entity:attack', { target='player', amount=10, source=Ctx.self })
end
` },
    { event: 'enemy:ai', order: 0, script: `
if Event.target ~= Ctx.self then return end
local phase = Event.phase
if phase == 'init' then
  State.emit('status:apply', { target='player', typeId='card_tax', stacks=2 })
  State.set('entities', Ctx.self, 'intent', 'shadow_strike')
  State.set('entities', Ctx.self, 'turns', 1)
elseif phase == 'onLoss' then
  local pct = (State.get('entities', Ctx.self, 'hp') or 0) / (State.get('entities', Ctx.self, 'maxHp') or 1)
  if pct < 0.35 and State.get('entities', Ctx.self, 'phase') ~= 'burst' then
    State.set('entities', Ctx.self, 'phase', 'burst')
    State.set('entities', Ctx.self, 'turns', 0)
  elseif pct < 0.65 and State.get('entities', Ctx.self, 'phase') == nil then
    State.set('entities', Ctx.self, 'phase', 'mid')
    State.set('entities', Ctx.self, 'turns', 0)
  end
elseif phase == 'update' then
  local p = State.get('entities', Ctx.self, 'phase')
  local turns = (State.get('entities', Ctx.self, 'turns') or 0) + 1
  State.set('entities', Ctx.self, 'turns', turns)
  local next
  if p == 'burst' then
    next = turns % 2 == 1 and 'curse_nova' or 'slam'
  elseif p == 'mid' then
    local t = turns % 4
    if     t == 1 then next = 'slam'
    elseif t == 2 then next = 'voodoo'
    elseif t == 3 then next = 'slam'
    else                next = 'rejuvenate'
    end
  else
    local t = turns % 4
    if     t == 1 then next = 'shadow_strike'
    elseif t == 2 then next = 'voodoo'
    elseif t == 3 then next = 'shadow_strike'
    else                next = 'rejuvenate'
    end
  end
  State.set('entities', Ctx.self, 'intent', next)
end
` },
  ],
};

// ── 铁甲傀儡 ──────────────────────────────────────────────────────────────────
// 精英怪。开战自带荆棘×8 和金属化×5（每回合末自获 5 格挡）。
// AI 三阶段：HP>60% 交替 slam/fortify；30%~60% 交替 slam/rend；<30% 持续 obliterate
export const iron_golem = {
  id: 'iron_golem',
  display: { name: '铁甲傀儡' },
  actions: {
    slam:       { type: 'attack', desc: '大力碾压，造成 20 点伤害。' },
    fortify:    { type: 'buff',   desc: '自我强化：获得 4 层力量。' },
    rend:       { type: 'attack', desc: '撕裂攻击：造成 14 点伤害，施加 2 层易伤。' },
    obliterate: { type: 'attack', desc: '凶猛暴击：造成 30 点伤害！' },
  },
  triggers: [
    { event: 'enemy:action', order: 0, script: `
if Event.target ~= Ctx.self then return end
local a = Event.action
if a == 'slam' then
  State.emit('entity:attack', { target='player', amount=20, source=Ctx.self })
elseif a == 'fortify' then
  State.emit('status:apply', { target=Ctx.self, typeId='strength', stacks=4 })
elseif a == 'rend' then
  State.emit('entity:attack', { target='player', amount=14, source=Ctx.self })
  State.emit('status:apply', { target='player', typeId='vulnerable', stacks=2 })
elseif a == 'obliterate' then
  State.emit('entity:attack', { target='player', amount=30, source=Ctx.self })
end
` },
    { event: 'enemy:ai', order: 0, script: `
if Event.target ~= Ctx.self then return end
local phase = Event.phase
if phase == 'init' then
  State.emit('status:apply', { target=Ctx.self, typeId='thorns',      stacks=8 })
  State.emit('status:apply', { target=Ctx.self, typeId='metallicize', stacks=5 })
  State.set('entities', Ctx.self, 'intent', 'slam')
elseif phase == 'onLoss' then
  local pct = (State.get('entities', Ctx.self, 'hp') or 0) / (State.get('entities', Ctx.self, 'maxHp') or 1)
  if pct < 0.30 and State.get('entities', Ctx.self, 'phase') ~= 'rage' then
    State.set('entities', Ctx.self, 'phase', 'rage')
  elseif pct < 0.60 and State.get('entities', Ctx.self, 'phase') == nil then
    State.set('entities', Ctx.self, 'phase', 'mid')
  end
elseif phase == 'update' then
  local p   = State.get('entities', Ctx.self, 'phase')
  local cur = State.get('entities', Ctx.self, 'intent') or 'slam'
  local next
  if p == 'rage' then
    next = 'obliterate'
  elseif p == 'mid' then
    next = (cur == 'slam') and 'rend' or 'slam'
  else
    next = (cur == 'slam') and 'fortify' or 'slam'
  end
  State.set('entities', Ctx.self, 'intent', next)
end
` },
  ],
};

// ── 瘟疫法师 ──────────────────────────────────────────────────────────────────
// 精英怪。HP≥50% 循环施毒/攻击；HP<50% 进入狂热阶段使用 virulence。
export const plague_mage = {
  id: 'plague_mage',
  display: { name: '瘟疫法师' },
  actions: {
    infect:    { type: 'debuff', desc: '施毒：施加 5 层中毒。' },
    plague:    { type: 'attack', desc: '毒击：造成 10 点伤害，施加 5 层中毒。' },
    virulence: { type: 'debuff', desc: '疫潮：施加 7 层中毒和 2 层脆弱。' },
  },
  triggers: [
    { event: 'enemy:action', order: 0, script: `
if Event.target ~= Ctx.self then return end
local a = Event.action
if a == 'infect' then
  State.emit('status:apply', { target='player', typeId='poison', stacks=5 })
elseif a == 'plague' then
  State.emit('entity:attack', { target='player', amount=10, source=Ctx.self })
  State.emit('status:apply',  { target='player', typeId='poison', stacks=5 })
elseif a == 'virulence' then
  State.emit('status:apply', { target='player', typeId='poison', stacks=7 })
  State.emit('status:apply', { target='player', typeId='frail',  stacks=2 })
end
` },
    { event: 'enemy:ai', order: 0, script: `
if Event.target ~= Ctx.self then return end
local phase = Event.phase
if phase == 'init' then
  State.set('entities', Ctx.self, 'intent', 'infect')
elseif phase == 'onLoss' then
  local pct = (State.get('entities', Ctx.self, 'hp') or 0) / (State.get('entities', Ctx.self, 'maxHp') or 1)
  if pct < 0.50 and State.get('entities', Ctx.self, 'phase') ~= 'frenzy' then
    State.set('entities', Ctx.self, 'phase', 'frenzy')
  end
elseif phase == 'update' then
  local p   = State.get('entities', Ctx.self, 'phase')
  local cur = State.get('entities', Ctx.self, 'intent') or 'infect'
  local next
  if p == 'frenzy' then
    next = (cur == 'virulence') and 'plague' or 'virulence'
  else
    next = (cur == 'infect') and 'plague' or 'infect'
  end
  State.set('entities', Ctx.self, 'intent', next)
end
` },
  ],
};



