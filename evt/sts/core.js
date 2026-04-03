/**
 * evt/sts/core.js — STS 全量规则
 *
 * 包含所有静态规则：通用游戏机制（伤害 / 格挡 / 卡牌 / 回合） +
 * STS 专用规则（敌人死亡 / 敌人 intent 刷新 / 回合总控）。

 */

// — entity ———————————————————————————————————————————

export const attackCore = {
  id: 'core:entity:attack',
  hooks: { 'event:entity:attack': `
State.emit('entity:damage', {
  target      = Event.target,
  amount      = Event.amount,
  source      = Event.source,
  action      = Event.action,
  cardId      = Event.cardId,
  instanceId  = Event.instanceId,
  weakReduced = Event.weakReduced,
  meta        = Event.meta,
})
` },
};

export const lossCore = {
  id: 'core:entity:loss',
  hooks: { 'event:entity:loss': `
local cur     = State.get('entities', Event.target, 'hp') or 0
local loss    = math.min(Event.amount, cur)
local finalHp = cur - loss
State.set('entities', Event.target, 'hp', finalHp)
Event.actualLoss = loss
Event.isFatal    = finalHp <= 0
` },
};

export const damageCore = {
  id: 'core:entity:damage',
  hooks: { 'event:entity:damage': `
local rawBlock = State.get('entities', Event.target, 'statuses', 'block', 'stacks') or 0
local blocked  = math.min(rawBlock, Event.amount)
local net      = Event.amount - blocked

if blocked > 0 then
  State.emit('entity:block', { target = Event.target, amount = -blocked })
end

Event.actualDamage = net
Event.blocked      = blocked
` },
};

export const damageLossCore = {
  id: 'core:entity:damage:loss',
  hooks: { 'event:entity:damage': { order: -9999, script: `
local net = Event.actualDamage or 0
if net > 0 then
  State.emit('entity:loss', {
    target       = Event.target,
    amount       = net,
    actualDamage = Event.actualDamage,
    blocked      = Event.blocked,
    source       = Event.source,
    action       = Event.action,
    cardId       = Event.cardId,
    instanceId   = Event.instanceId,
    direct       = Event.direct,
    weakReduced  = Event.weakReduced,
    meta         = Event.meta,
  })
end
Event.isFatal = (State.get('entities', Event.target, 'hp') or 0) <= 0
` } },
};

// -- entity:damage → damageLossCore(-9999) → entity:loss → lossCore(0) → entityDieEmitterCore(-9999)
export const entityDieEmitterCore = {
  id: 'core:entity:die:emitter',
  hooks: { 'event:entity:loss': { order: -9999, script: `
if Event.isFatal then
  State.emit('entity:die', { target = Event.target })
end
` } },
};

export const healCore = {
  id: 'core:entity:heal',
  hooks: { 'event:entity:heal': `
local cur   = State.get('entities', Event.target, 'hp')    or 0
local maxHp = State.get('entities', Event.target, 'maxHp') or cur
State.set('entities', Event.target, 'hp', math.min(maxHp, cur + Event.amount))
` },
};

export const blockCore = {
  id: 'core:entity:block',
  hooks: { 'event:entity:block': `
State.emit('status:apply', { target = Event.target, typeId = 'block', stacks = Event.amount })
` },
};

// — battle ———————————————————————————————————————————

export const entityDieCore = {
  id: 'core:entity:die',
  hooks: { 'event:entity:die': `
if Event.target == 'player' then
  State.emit('battle:end', { victory = false })
  return
end
State.unbind(Event.target)
State.emit('enemy:die', { target = Event.target })
-- 找到并清除对应 slot
for slot = 1, 10 do
  local eid = State.get('enemies', tostring(slot))
  if eid ~= nil and eid == Event.target then
    State.set('enemies', tostring(slot), nil)
    break
  end
end

-- （清除 slot 后，存活 slot 为空则胜利）
local hasLiving = false
for slot = 1, 10 do
  if State.get('enemies', tostring(slot)) ~= nil then
    hasLiving = true
    break
  end
end
if not hasLiving then
  State.emit('battle:end', { victory = true })
end
` },
};

export const battleStartCore = {
  id: 'core:battle:start',
  hooks: { 'event:battle:start': `
-- 绑定所有敌人并刷新初始 intent
for slot = 1, 10 do
  local eid = State.get('enemies', tostring(slot))
  if eid ~= nil then
    local typeId = State.get('entities', eid, 'typeId')
    if typeId then
      State.bind({ key = eid, kind = 'enemy', id = typeId, ctx = { self = eid } })
      State.emit('enemy:update', { target = eid, cause = 'init' })
    end
  end
end
State.emit('player:turn:start', {})
` },
};

export const battleEndCore = {
  id: 'core:battle:end',
  hooks: { 'event:battle:end': `
State.set('battle', 'over', true)
State.set('battle', 'victory', Event.victory)
` },
};

// ── card:move（底层原语）────────────────────────────────────────────────────

export const cardMoveCore = {
  id: 'core:card:move',
  hooks: { 'event:card:move': `
local iid = Event.instanceId
if not iid then return end  -- card:move 必须携带 instanceId

if Event.from then
  local src = State.get(Event.from) or {}
  local newSrc = {}
  for _, c in ipairs(src) do
    if c ~= iid then table.insert(newSrc, c) end
  end
  State.set(Event.from, newSrc)
end

if Event.to then
  local dst = State.get(Event.to) or {}
  local newDst = {}
  for _, c in ipairs(dst) do table.insert(newDst, c) end
  table.insert(newDst, iid)
  State.set(Event.to, newDst)
end

-- 注册 → 发出语义事件 → 注销（临时窗口，handler 仅在事件期间存在）
local semanticEvt =
  (Event.from == 'drawPile' and Event.to == 'hand' and 'card:drawn') or
  (Event.to   == 'discardPile'                      and 'card:discarded') or
  (Event.to   == 'exhaustPile'                      and 'card:exhausted')
if semanticEvt then
  State.bind({ key = iid, kind = 'card', id = Event.cardId, ctx = { iid = iid } })
  State.emit(semanticEvt, { instanceId = iid, cardId = Event.cardId })
  State.unbind(iid)
end
` },
};

// — card 语义层 ———————————————————————————————————————

export const cardDrawCore = {
  id: 'core:card:draw',
  hooks: { 'event:card:draw': `
local drawPile = State.get('drawPile') or {}
if #drawPile == 0 then
  State.emit('deck:deplete', {})
  drawPile = State.get('drawPile') or {}
  if #drawPile == 0 then return end
end

local iid = drawPile[1]
local cardId = State.get('cards', iid, 'cardId')
State.emit('card:move', {
  from       = 'drawPile',
  to         = 'hand',
  instanceId = iid,
  cardId     = cardId,
})
` },
};

export const cardDiscardCore = {
  id: 'core:card:discard',
  hooks: { 'event:card:discard': `
State.emit('card:move', {
  from       = 'hand',
  to         = 'discardPile',
  instanceId = Event.instanceId,
  cardId     = Event.cardId,
})
` },
};

export const cardExhaustCore = {
  id: 'core:card:exhaust',
  hooks: { 'event:card:exhaust': `
State.emit('card:move', {
  from       = Event.from or 'hand',
  to         = 'exhaustPile',
  instanceId = Event.instanceId,
  cardId     = Event.cardId,
})
` },
};

// — status ———————————————————————————————

export const statusApplyCore = {
  id: 'core:status:apply',
  hooks: { 'event:status:apply': `
if Event.stacks == 0 then return end  -- stacks=0 是 no-op，不触发 remove
local cur   = State.get('entities', Event.target, 'statuses', Event.typeId, 'stacks') or 0
local total = cur + Event.stacks

if total > 0 then
  State.set('entities', Event.target, 'statuses', Event.typeId, 'stacks', total)
  if cur == 0 then
    State.bind({
      key  = Event.target .. ':' .. Event.typeId,
      kind = 'status',
      id   = Event.typeId,
      ctx  = { self = Event.target },
    })
  end
else
  State.emit('status:remove', { target = Event.target, typeId = Event.typeId })
end
` },
};

export const statusRemoveCore = {
  id: 'core:status:remove',
  hooks: { 'event:status:remove': `
State.unbind(Event.target .. ':' .. Event.typeId)
State.set('entities', Event.target, 'statuses', Event.typeId, nil)
` },
};

// — 回合生命周期 ——————————————————————————————————————

export const playerTurnStartCore = {
  id: 'core:player:turn:start',
  hooks: { 'event:player:turn:start': `
State.set('entities', 'player', 'energy', State.get('entities', 'player', 'maxEnergy'))
local n = State.get('entities', 'player', 'drawPerTurn') or 5
for i = 1, n do
  State.emit('card:draw', {})
end
` },
};

export const turnCounterCore = {
  id: 'core:turn:counter',
  hooks: { 'event:player:turn:start': { order: 1000, script: `
State.set('turn', (State.get('turn') or 0) + 1)
` } },
};

export const playerTurnEndCore = {
  id: 'core:player:turn:end',
  hooks: { 'event:player:turn:end': `
for _, iid in ipairs(State.get('hand') or {}) do
  State.emit('card:discard', { instanceId = iid, cardId = State.get('cards', iid, 'cardId') })
end
` },
};

export const cardPlayCore = {
  id: 'core:card:play',
  hooks: { 'event:card:play': `
local cost = Event.cost or State.get('cards', Event.instanceId, 'cost') or 0

if cost >= 0 then
  local energy = State.get('entities', 'player', 'energy')
  if energy < cost then
    Event.cancelled = true
    return
  end
  State.set('entities', 'player', 'energy', energy - cost)
end
-- cost < 0：X 费卡，脚本自管能量

State.bind({ key = Event.instanceId, kind = 'card', id = Event.cardId, ctx = { iid = Event.instanceId } })
State.emit('card:effect', {
  instanceId = Event.instanceId,
  cardId     = Event.cardId,
  target     = Event.target,
})
State.unbind(Event.instanceId)
` },
};

export const cardPlayCleanupCore = {
  id: 'core:card:play:cleanup',
  hooks: { 'event:card:play': { order: -400, script: `
local exhaust  = State.get('cards', Event.instanceId, 'exhaust')
local ethereal = State.get('cards', Event.instanceId, 'ethereal')
if exhaust or ethereal then
  State.emit('card:exhaust', {
    instanceId = Event.instanceId,
    cardId     = Event.cardId,
  })
else
  State.emit('card:discard', {
    instanceId = Event.instanceId,
    cardId     = Event.cardId,
  })
end
` } },
};

// — 回合总控 ——————————————————————————————————————————

// 玩家回合结束 → 敌人依次行动 → 玩家新回合
export const turnSequenceCore = {
  id: 'core:turn:sequence',
  hooks: { 'event:turn:end': `
local function battleOver() return State.get('battle', 'over') == true end
local function getEnemyId(slot)
  return State.get('enemies', tostring(slot))
end
local function enemySlots()
  local slots = {}
  for slot = 1, 10 do
    if State.get('enemies', tostring(slot)) ~= nil then
      table.insert(slots, slot)
    end
  end
  return slots
end

State.emit('player:turn:end', {})
if battleOver() then return end

for _, slot in ipairs(enemySlots()) do
  if battleOver() then return end
  local eid = getEnemyId(slot)
  if eid ~= nil then
    State.emit('actor:turn:start', { target = eid })
    if battleOver() then return end
    local intent = State.get('entities', eid, 'intent')
    if intent then
      State.emit('enemy:action', { target = eid, action = intent })
    end
    if battleOver() then return end
    if getEnemyId(slot) ~= nil then
      State.emit('enemy:update', { target = eid, cause = 'turn' })
      State.emit('actor:turn:end', { target = eid })
    end
  end
end

if battleOver() then return end

State.emit('player:turn:start', {})
` },
};

// — 牌库洗牌 —————————————————————————————————————————

export const reshuffleCore = {
  id: 'core:deck:deplete',
  hooks: { 'event:deck:deplete': `
local src = State.get('discardPile') or {}
if #src == 0 then return end
for i = #src, 2, -1 do
  local j = math.random(1, i)
  src[i], src[j] = src[j], src[i]
end
State.set('discardPile', {})
State.set('drawPile', src)
` },
};

// actor:turn:start/end 桥接：将 player:turn:start/end 转发到通用 actor 事件
export const actorTurnBridgeCore = {
  id: 'core:actor:turn:bridge',
  hooks: {
    'event:player:turn:start': { order: 1000, script: `
State.emit('actor:turn:start', { target = 'player' })
` },
    'event:player:turn:end': { order: 1000, script: `
State.emit('actor:turn:end', { target = 'player' })
` },
  },
};

export const cardCreateCore = {
  id: 'core:card:create',
  hooks: { 'event:card:create': `
local cardId  = Event.cardId
local iid     = cardId .. '_' .. tostring(math.random(100000, 999999))
local cardDef = Defs.card and Defs.card[cardId]
local inst    = { cardId = cardId }
if cardDef then
  local cost       = cardDef.cost
  local exhaust    = cardDef.exhaust
  local targetType = cardDef.targetType
  if cost       ~= nil then inst.cost       = cost       end
  if exhaust         then inst.exhaust    = exhaust    end
  if targetType ~= nil then inst.targetType = targetType end
end
State.set('cards', iid, inst)
State.emit('card:move', { to = Event.destination, instanceId = iid, cardId = cardId })
Event.instanceId = iid
` },
};

// — 全部规则列表 ——————————————————————————————————————

export const ALL_CORE_RULES = [
  attackCore,
  lossCore,
  damageCore,
  damageLossCore,
  entityDieEmitterCore,
  healCore,
  blockCore,
  entityDieCore,
  battleStartCore,
  battleEndCore,
  cardMoveCore,
  cardDrawCore,
  cardDiscardCore,
  cardExhaustCore,
  statusApplyCore,
  statusRemoveCore,
  playerTurnStartCore,
  turnCounterCore,
  playerTurnEndCore,
  cardPlayCore,
  cardPlayCleanupCore,
  reshuffleCore,
  actorTurnBridgeCore,
  turnSequenceCore,
  cardCreateCore,
];
