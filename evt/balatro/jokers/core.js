/**
 * evt/balatro/jokers/core.js — Balatro joker definitions
 */

function pushJokerTraceLua(jokerId, zhNoteExpr, enNoteExpr = zhNoteExpr) {
  return `
local traces = State.get('evaluation', 'trace', 'jokers') or {}
local nextTraces = {}
local lang = State.get('meta', 'lang') or 'zh'
for _, row in ipairs(traces) do table.insert(nextTraces, row) end
table.insert(nextTraces, {
  instanceId = Ctx.self,
  jokerId = '${jokerId}',
  note = (lang == 'en') and (${enNoteExpr}) or (${zhNoteExpr}),
})
State.set('evaluation', 'trace', 'jokers', nextTraces)
`;
}

export const jolly_joker = {
  id: 'jolly_joker',
  display: {
    name: '欢乐小丑',
    desc: '若本手牌型为对子，则额外 +8 倍率。',
  },
  hooks: { 'event:score:jokers': { order: 300, script: `
if Event.handType == 'pair' then
  local mult = State.get('evaluation', 'mult') or 0
  State.set('evaluation', 'mult', mult + 8)
  ${pushJokerTraceLua('jolly_joker', "'对子：倍率 +8'", "'Pair: +8 Mult'")}
end
` } },
};

export const greedy_joker = {
  id: 'greedy_joker',
  display: {
    name: '贪婪小丑',
    desc: '若计分牌中包含方片，则额外 +3 倍率。',
  },
  hooks: { 'event:score:jokers': { order: 300, script: `
for _, iid in ipairs(Event.scoringCards or {}) do
  if State.get('cards', iid, 'suit') == 'diamonds' then
    local mult = State.get('evaluation', 'mult') or 0
    State.set('evaluation', 'mult', mult + 3)
    ${pushJokerTraceLua('greedy_joker', "'计分牌包含方片：倍率 +3'", "'Diamond scored: +3 Mult'")}
    return
  end
end
` } },
};

export const abstract_joker = {
  id: 'abstract_joker',
  display: {
    name: '抽象小丑',
    desc: '按当前拥有的小丑数量计算，每张小丑额外 +2 倍率。',
  },
  hooks: { 'event:score:jokers': { order: 300, script: `
local count = 0
for _ in pairs(State.get('jokers') or {}) do count = count + 1 end
local mult = State.get('evaluation', 'mult') or 0
State.set('evaluation', 'mult', mult + (count * 2))
${pushJokerTraceLua('abstract_joker', "'拥有 ' .. tostring(count) .. ' 张小丑：倍率 +' .. tostring(count * 2)", "'Owned ' .. tostring(count) .. ' Jokers: +' .. tostring(count * 2) .. ' Mult'")}
` } },
};

export const club_joker = {
  id: 'club_joker',
  display: {
    name: '梅花小丑',
    desc: '每张参与计分的梅花牌额外 +3 倍率。',
  },
  hooks: { 'event:score:card': { order: 300, script: `
if State.get('cards', Event.card, 'suit') == 'clubs' then
  local mult = State.get('evaluation', 'mult') or 0
  State.set('evaluation', 'mult', mult + 3)
  ${pushJokerTraceLua('club_joker', "'梅花计分牌：倍率 +3'", "'Club scored: +3 Mult'")}
end
` } },
};

export const square_joker = {
  id: 'square_joker',
  display: {
    name: '方形小丑',
    desc: '每次恰好打出 4 张牌时，此小丑永久 +4 筹码。',
  },
  hooks: {
    'event:hand:play': { order: 200, script: `
if #(Event.cards or {}) == 4 then
  local bonus = State.get('jokers', Ctx.self, 'bonusChips') or 0
  State.set('jokers', Ctx.self, 'bonusChips', bonus + 4)
end
` },
    'event:score:jokers': { order: 300, script: `
local bonus = State.get('jokers', Ctx.self, 'bonusChips') or 0
if bonus > 0 then
  local chips = State.get('evaluation', 'chips') or 0
  State.set('evaluation', 'chips', chips + bonus)
  ${pushJokerTraceLua('square_joker', "'已累计筹码 +' .. tostring(bonus)", "'Stored Chips +' .. tostring(bonus)")}
end
` },
  },
};

export const echo_joker = {
  id: 'echo_joker',
  display: {
    name: '回声小丑',
    desc: '第一张计分牌会额外触发 2 次。',
  },
  hooks: { 'event:score:card': { order: -200, script: `
if (Event.retriggerDepth or 0) > 0 then return end
if Event.index ~= 1 then return end

for _ = 1, 2 do
  State.emit('score:card', {
    card = Event.card,
    index = Event.index,
    cards = Event.cards or {},
    handType = Event.handType,
    scoringCards = Event.scoringCards or {},
    trigger = 'retrigger',
    retriggerDepth = 1,
    retriggerBy = 'echo_joker',
  })
end

${pushJokerTraceLua('echo_joker', "'第一张计分牌额外触发 2 次'", "'First scored card retriggers 2 extra times'")}
` } },
};

export const momentum_joker = {
  id: 'momentum_joker',
  display: {
    name: '动量小丑',
    desc: '本轮每弃掉 1 张牌，之后每次出牌额外 +1 倍率。',
  },
  hooks: {
    'event:round:start': { order: 200, script: `
State.set('jokers', Ctx.self, 'roundMult', 0)
` },
    'event:hand:discard': { order: -100, script: `
local bonus = State.get('jokers', Ctx.self, 'roundMult') or 0
local gained = #(Event.cards or {})
if gained > 0 then
  State.set('jokers', Ctx.self, 'roundMult', bonus + gained)
end
` },
    'event:score:jokers': { order: 300, script: `
local bonus = State.get('jokers', Ctx.self, 'roundMult') or 0
if bonus > 0 then
  local mult = State.get('evaluation', 'mult') or 0
  State.set('evaluation', 'mult', mult + bonus)
  ${pushJokerTraceLua('momentum_joker', "'本轮弃牌累计：倍率 +' .. tostring(bonus)", "'Discards this round: +' .. tostring(bonus) .. ' Mult'")}
end
` },
  },
};

export const second_wind_joker = {
  id: 'second_wind_joker',
  display: {
    name: '再起小丑',
    desc: '每轮第一次弃牌后，返还 1 次弃牌次数。',
  },
  hooks: {
    'event:round:start': { order: 200, script: `
State.set('jokers', Ctx.self, 'refundReady', true)
` },
    'event:hand:discard': { order: -100, script: `
if not State.get('jokers', Ctx.self, 'refundReady') then return end

local discardsLeft = State.get('round', 'discardsLeft') or 0
State.set('round', 'discardsLeft', discardsLeft + 1)
State.set('jokers', Ctx.self, 'refundReady', false)
` },
  },
};

export const baron_joker = {
  id: 'baron_joker',
  display: {
    name: '男爵小丑',
    desc: '每当一张人头牌（J/Q/K）触发时，倍率 ×2；可与重复触发叠加。',
  },
  hooks: { 'event:score:card': { order: 300, script: `
local rank = State.get('cards', Event.card, 'rank') or 0
if rank >= 11 and rank <= 13 then
  local mult = State.get('evaluation', 'mult') or 0
  State.set('evaluation', 'mult', mult * 2)
  local rankLabel = ({ [11] = 'J', [12] = 'Q', [13] = 'K' })[rank] or tostring(rank)
  ${pushJokerTraceLua('baron_joker', "'人头牌 ' .. rankLabel .. ' 触发：倍率 ×2'", "'Face card ' .. rankLabel .. ': Mult x2'")}
end
` } },
};

export const finisher_joker = {
  id: 'finisher_joker',
  display: {
    name: '终结小丑',
    desc: '若本手在最终结算前已达到 60 以上筹码，则最终倍率 ×2。',
  },
  hooks: { 'event:score:finalize': { order: 300, script: `
local chips = State.get('evaluation', 'chips') or 0
if chips >= 60 then
  local xmult = State.get('evaluation', 'xmult') or 1
  State.set('evaluation', 'xmult', xmult * 2)
  ${pushJokerTraceLua('finisher_joker', "'筹码达到 60：最终倍率 ×2'", "'60+ Chips: Final Mult x2'")}
end
` } },
};

export const rainbow_joker = {
  id: 'rainbow_joker',
  display: {
    name: '彩虹小丑',
    desc: '若计分牌包含 3 种花色，则倍率 ×2；包含 4 种花色，则倍率 ×4。',
  },
  hooks: { 'event:score:jokers': { order: 300, script: `
local suitSet = {}
for _, iid in ipairs(Event.scoringCards or {}) do
  local suit = State.get('cards', iid, 'suit')
  if suit then suitSet[suit] = true end
end
local suitCount = 0
for _ in pairs(suitSet) do suitCount = suitCount + 1 end
if suitCount <= 2 then return end

local factor = 1
for _ = 1, suitCount - 2 do factor = factor * 2 end
local mult = State.get('evaluation', 'mult') or 0
State.set('evaluation', 'mult', mult * factor)
${pushJokerTraceLua('rainbow_joker', "'计分牌含 ' .. tostring(suitCount) .. ' 种花色：倍率 ×' .. tostring(factor)", "tostring(suitCount) .. ' suits: Mult x' .. tostring(factor)")}
` } },
};

export const shortcut_joker = {
  id: 'shortcut_joker',
  display: {
    name: '捷径小丑',
    desc: '同花与顺子只需 4 张牌即可成立；若两者同时成立，则也可组成同花顺。',
  },
  hooks: { 'event:hand:classify': { order: 600, script: `
local cards = Event.cards or {}
local required = 4

local suitGroups = {}
local rankCards = {}
local rankList = {}

for _, iid in ipairs(cards) do
  local rank = State.get('cards', iid, 'rank') or 0
  local suit = State.get('cards', iid, 'suit') or ''

  suitGroups[suit] = suitGroups[suit] or {}
  table.insert(suitGroups[suit], iid)

  if rank > 0 and not rankCards[rank] then
    rankCards[rank] = iid
    table.insert(rankList, rank)
  end
end

for _, grp in pairs(suitGroups) do
  table.sort(grp, function(a, b)
    return (State.get('cards', a, 'rank') or 0) > (State.get('cards', b, 'rank') or 0)
  end)
end
table.sort(rankList, function(a, b) return a > b end)

local function wheelCards(src, minN)
  if not src[14] then return nil end
  local result = { src[14] }
  for r = 2, minN do
    if not src[r] then return nil end
    table.insert(result, src[r])
  end
  return result
end

local function findStraight(uniqueRanks, rankToCard, minN)
  if #uniqueRanks < minN then
    return nil
  end

  for i = 1, #uniqueRanks - minN + 1 do
    local ok = true
    for j = 0, minN - 2 do
      if uniqueRanks[i + j] - uniqueRanks[i + j + 1] ~= 1 then
        ok = false
        break
      end
    end
    if ok then
      local result = {}
      for j = 0, minN - 1 do
        table.insert(result, rankToCard[uniqueRanks[i + j]])
      end
      return result
    end
  end

  return wheelCards(rankToCard, minN)
end

local flushCards = nil
for _, grp in pairs(suitGroups) do
  if #grp >= required then
    flushCards = {}
    for i = 1, required do
      table.insert(flushCards, grp[i])
    end
    break
  end
end

local straightCards = findStraight(rankList, rankCards, required)
local straightFlushCards = nil

if flushCards and straightCards then
  local wanted = {}
  for _, iid in ipairs(flushCards) do wanted[iid] = true end
  for _, iid in ipairs(straightCards) do wanted[iid] = true end

  straightFlushCards = {}
  for _, iid in ipairs(cards) do
    if wanted[iid] then
      table.insert(straightFlushCards, iid)
    end
  end
end

State.set('evaluation', 'classify', 'flushCards', flushCards or {})
State.set('evaluation', 'classify', 'straightCards', straightCards or {})
State.set('evaluation', 'classify', 'straightFlushCards', straightFlushCards or {})
` } },
};

export const daredevil_joker = {
  id: 'daredevil_joker',
  display: {
    name: '亡命小丑',
    desc: '打出 1 张牌时额外 +4 最终倍率；打出 2 张时 +3；打出 3 张时 +2。',
  },
  hooks: { 'event:score:jokers': { order: 300, script: `
local playedCount = #(Event.cards or {})
local bonus = 0
if playedCount == 1 then bonus = 4
elseif playedCount == 2 then bonus = 3
elseif playedCount == 3 then bonus = 2
end
if bonus == 0 then return end
local xmult = State.get('evaluation', 'xmult') or 1
State.set('evaluation', 'xmult', xmult + bonus)
${pushJokerTraceLua('daredevil_joker', "'打出 ' .. tostring(playedCount) .. ' 张牌：最终倍率 +' .. tostring(bonus)", "'Played ' .. tostring(playedCount) .. ' cards: Final Mult +' .. tostring(bonus)")}
` } },
};

export const pyramid_joker = {
  id: 'pyramid_joker',
  display: {
    name: '金字塔小丑',
    desc: '第 i 张计分牌额外 +i×6 筹码，例如第五张额外 +30 筹码。',
  },
  hooks: { 'event:score:card': { order: 300, script: `
local bonus = (Event.index or 0) * 6
if bonus == 0 then return end
local chips = State.get('evaluation', 'chips') or 0
State.set('evaluation', 'chips', chips + bonus)
${pushJokerTraceLua('pyramid_joker', "'第 ' .. tostring(Event.index) .. ' 张计分牌：筹码 +' .. tostring(bonus)", "'Scored card #' .. tostring(Event.index) .. ': +' .. tostring(bonus) .. ' Chips'")}
` } },
};

export const wildfire_joker = {
  id: 'wildfire_joker',
  display: {
    name: '野火小丑',
    desc: '本轮第 2 次出牌额外 +2 倍率，第 3 次 +4，第 4 次 +6，依此类推。',
  },
  hooks: {
    'event:round:start': { order: 200, script: `
State.set('jokers', Ctx.self, 'playsThisRound', 0)
` },
    'event:hand:play': { order: -100, script: `
local plays = State.get('jokers', Ctx.self, 'playsThisRound') or 0
State.set('jokers', Ctx.self, 'playsThisRound', plays + 1)
` },
    'event:score:jokers': { order: 300, script: `
local plays = State.get('jokers', Ctx.self, 'playsThisRound') or 0
if plays <= 1 then return end
local bonus = (plays - 1) * 2
local mult = State.get('evaluation', 'mult') or 0
State.set('evaluation', 'mult', mult + bonus)
${pushJokerTraceLua('wildfire_joker', "'本轮第 ' .. tostring(plays) .. ' 次出牌：倍率 +' .. tostring(bonus)", "'Play #' .. tostring(plays) .. ' this round: +' .. tostring(bonus) .. ' Mult'")}
` },
  },
};
