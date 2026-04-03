/**
 * evt/balatro/core.js — Balatro rules built as a proper event-driven ruleset
 */

function emptyResultLua() {
  return `{
  handType = nil,
  playedCards = {},
  scoringCards = {},
  baseChips = 0,
  baseMult = 0,
  chips = 0,
  mult = 0,
  xmult = 1,
  total = 0,
  trace = {
    cards = {},
    jokers = {},
  },
}`;
}

export const roundStartCore = {
  id: 'balatro:round:start',
  hooks: { 'event:round:start': `
State.set('played', {})
State.set('evaluation', nil)
State.set('round', 'score', 0)
State.set('round', 'over', false)
State.set('round', 'won', false)
State.set('run', 'phase', 'playing')
State.emit('deck:shuffle', {})
State.emit('hand:draw', {})
` },
};

export const deckShuffleCore = {
  id: 'balatro:deck:shuffle',
  hooks: { 'event:deck:shuffle': `
if State.get('meta', 'shuffleEnabled') == false then
  return
end

local deck = State.get('deck') or {}
if #deck <= 1 then return end

local nextDeck = {}
for _, iid in ipairs(deck) do table.insert(nextDeck, iid) end

local seed = tonumber(State.get('meta', 'shuffleSeed')) or 1
local mod = 2147483648
for i = #nextDeck, 2, -1 do
  seed = (1103515245 * seed + 12345) % mod
  local j = (seed % i) + 1
  nextDeck[i], nextDeck[j] = nextDeck[j], nextDeck[i]
end

State.set('meta', 'shuffleSeed', seed)
State.set('deck', nextDeck)
` },
};

export const handDrawCore = {
  id: 'balatro:hand:draw',
  hooks: { 'event:hand:draw': `
local deck = State.get('deck') or {}
local hand = State.get('hand') or {}
local handSize = State.get('meta', 'handSize') or 8
local want = Event.count or handSize
local room = math.max(0, handSize - #hand)
local draws = math.min(want, room, #deck)
if draws <= 0 then return end

local nextDeck = {}
local nextHand = {}
for _, iid in ipairs(hand) do table.insert(nextHand, iid) end

for i, iid in ipairs(deck) do
  if i <= draws then
    table.insert(nextHand, iid)
  else
    table.insert(nextDeck, iid)
  end
end

State.set('hand', nextHand)
State.set('deck', nextDeck)
` },
};

export const handDiscardCore = {
  id: 'balatro:hand:discard',
  hooks: { 'event:hand:discard': `
if State.get('run', 'phase') ~= 'playing' then
  error('[balatro] cannot discard outside playing phase')
end
if State.get('round', 'over') then
  error('[balatro] cannot discard after round is over')
end

local discardsLeft = State.get('round', 'discardsLeft') or 0
if discardsLeft <= 0 then
  error('[balatro] no discards left')
end

local hand = State.get('hand') or {}
local selected = Event.cards or {}
if #selected == 0 then
  error('[balatro] hand:discard requires at least one card id')
end

local inHand = {}
for _, iid in ipairs(hand) do
  inHand[iid] = true
end

local chosen = {}
for _, iid in ipairs(selected) do
  if not inHand[iid] then
    error('[balatro] card not in hand: ' .. tostring(iid))
  end
  if chosen[iid] then
    error('[balatro] duplicate selected card: ' .. tostring(iid))
  end
  chosen[iid] = true
end

local nextHand = {}
local discard = State.get('discard') or {}
local nextDiscard = {}
for _, iid in ipairs(discard) do table.insert(nextDiscard, iid) end
local discardedCount = 0

for _, iid in ipairs(hand) do
  if chosen[iid] then
    table.insert(nextDiscard, iid)
    discardedCount = discardedCount + 1
  else
    table.insert(nextHand, iid)
  end
end

State.set('hand', nextHand)
State.set('discard', nextDiscard)
State.set('round', 'discardsLeft', discardsLeft - 1)
State.emit('hand:draw', { count = discardedCount })
` },
};

export const handPlayCore = {
  id: 'balatro:hand:play',
  hooks: { 'event:hand:play': `
if State.get('run', 'phase') ~= 'playing' then
  error('[balatro] cannot play outside playing phase')
end
if State.get('round', 'over') then
  error('[balatro] cannot play after round is over')
end

local handsLeft = State.get('round', 'handsLeft') or 0
if handsLeft <= 0 then
  error('[balatro] no hands left')
end

local hand = State.get('hand') or {}
local selected = Event.cards or {}
if #selected == 0 then
  error('[balatro] hand:play requires at least one card id')
end

local inHand = {}
for _, iid in ipairs(hand) do
  inHand[iid] = true
end

local chosen = {}
for _, iid in ipairs(selected) do
  if not inHand[iid] then
    error('[balatro] card not in hand: ' .. tostring(iid))
  end
  if chosen[iid] then
    error('[balatro] duplicate selected card: ' .. tostring(iid))
  end
  chosen[iid] = true
end

local nextHand = {}
local played = {}
for _, iid in ipairs(selected) do
  table.insert(played, iid)
end
for _, iid in ipairs(hand) do
  if not chosen[iid] then
    table.insert(nextHand, iid)
  end
end

State.set('hand', nextHand)
State.set('played', played)
State.set('evaluation', nil)
State.set('lastResult', ${emptyResultLua()})

State.emit('hand:evaluate', { cards = played })

local result = State.get('lastResult') or {}
local handScore = result.total or 0
local roundScore = (State.get('round', 'score') or 0) + handScore

local discard = State.get('discard') or {}
local nextDiscard = {}
for _, iid in ipairs(discard) do table.insert(nextDiscard, iid) end
for _, iid in ipairs(played) do table.insert(nextDiscard, iid) end

State.set('discard', nextDiscard)
State.set('round', 'score', roundScore)
State.set('round', 'handsLeft', handsLeft - 1)
State.emit('round:check', {})
` },
};

export const handEvaluateCore = {
  id: 'balatro:hand:evaluate',
  hooks: { 'event:hand:evaluate': `
local cards = Event.cards or {}
if #cards == 0 then
  error('[balatro] hand:evaluate requires cards')
end
if #cards > 5 then
  error('[balatro] only supports hands up to 5 cards')
end

local entries = {}
local rankCounts = {}
local rankToCards = {}

for _, iid in ipairs(cards) do
  local rank = State.get('cards', iid, 'rank')
  local suit = State.get('cards', iid, 'suit')
  if type(rank) ~= 'number' or type(suit) ~= 'string' then
    error('[balatro] invalid card data for ' .. tostring(iid))
  end
end

State.set('evaluation', {
  handType = nil,
  playedCards = cards,
  scoringCards = {},
  baseChips = 0,
  baseMult = 0,
  chips = 0,
  mult = 0,
  xmult = 1,
  total = 0,
  classify = {
    flushCards = {},
    straightCards = {},
    straightFlushCards = {},
  },
  trace = {
    cards = {},
    jokers = {},
  },
})

State.emit('hand:classify', { cards = cards })
State.emit('hand:resolve', { cards = cards })

local handType = State.get('evaluation', 'handType')
local scoringCards = State.get('evaluation', 'scoringCards') or {}
if type(handType) ~= 'string' or #scoringCards == 0 then
  error('[balatro] hand:resolve must set evaluation.handType and evaluation.scoringCards')
end

State.emit('score:cards', {
  cards = cards,
  handType = handType,
  scoringCards = scoringCards,
})
` },
};

export const handResolveCore = {
  id: 'balatro:hand:resolve',
  hooks: { 'event:hand:resolve': { order: 500, script: `
local cards = Event.cards or {}
local entries = {}
local rankCounts = {}
local rankToCards = {}

for _, iid in ipairs(cards) do
  local rank = State.get('cards', iid, 'rank') or 0
  local suit = State.get('cards', iid, 'suit') or ''
  table.insert(entries, { iid = iid, rank = rank, suit = suit })
  rankCounts[rank] = (rankCounts[rank] or 0) + 1
  rankToCards[rank] = rankToCards[rank] or {}
  table.insert(rankToCards[rank], iid)
end

table.sort(entries, function(a, b)
  if a.rank == b.rank then return a.iid < b.iid end
  return a.rank > b.rank
end)

local groups = {}
for rank, count in pairs(rankCounts) do
  table.insert(groups, { rank = rank, count = count, ids = rankToCards[rank] })
end
table.sort(groups, function(a, b)
  if a.count == b.count then return a.rank > b.rank end
  return a.count > b.count
end)

local sfCards = State.get('evaluation', 'classify', 'straightFlushCards') or {}
local flushCards = State.get('evaluation', 'classify', 'flushCards') or {}
local straightCards = State.get('evaluation', 'classify', 'straightCards') or {}

local function copyCards(src)
  local out = {}
  for _, iid in ipairs(src or {}) do
    table.insert(out, iid)
  end
  return out
end

local function countAt(index, value)
  return groups[index] and groups[index].count == value
end

local resolvers = {
  {
    handType = 'straight_flush',
    when = function()
      return #sfCards > 0
    end,
    cards = function()
      return copyCards(sfCards)
    end,
  },
  {
    handType = 'four_of_a_kind',
    when = function()
      return countAt(1, 4)
    end,
    cards = function()
      return copyCards(groups[1].ids)
    end,
  },
  {
    handType = 'full_house',
    when = function()
      return countAt(1, 3) and countAt(2, 2)
    end,
    cards = function()
      return copyCards(cards)
    end,
  },
  {
    handType = 'flush',
    when = function()
      return #flushCards > 0
    end,
    cards = function()
      return copyCards(flushCards)
    end,
  },
  {
    handType = 'straight',
    when = function()
      return #straightCards > 0
    end,
    cards = function()
      return copyCards(straightCards)
    end,
  },
  {
    handType = 'three_of_a_kind',
    when = function()
      return countAt(1, 3)
    end,
    cards = function()
      return copyCards(groups[1].ids)
    end,
  },
  {
    handType = 'two_pair',
    when = function()
      return countAt(1, 2) and countAt(2, 2)
    end,
    cards = function()
      local out = copyCards(groups[1].ids)
      for _, iid in ipairs(groups[2].ids or {}) do
        table.insert(out, iid)
      end
      return out
    end,
  },
  {
    handType = 'pair',
    when = function()
      return countAt(1, 2)
    end,
    cards = function()
      return copyCards(groups[1].ids)
    end,
  },
  {
    handType = 'high_card',
    when = function()
      return true
    end,
    cards = function()
      return { entries[1].iid }
    end,
  },
}

local handType = nil
local scoringCards = nil
for _, rule in ipairs(resolvers) do
  if rule.when() then
    handType = rule.handType
    scoringCards = rule.cards()
    break
  end
end

State.set('evaluation', 'handType', handType)
State.set('evaluation', 'playedCards', cards)
State.set('evaluation', 'scoringCards', scoringCards)
` } },
};

export const handClassifyCore = {
  id: 'balatro:hand:classify',
  hooks: { 'event:hand:classify': { order: 500, script: `
local cards = Event.cards or {}
local minFlush = 5
local minStraight = 5

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

local existingSf = State.get('evaluation', 'classify', 'straightFlushCards') or {}
if #existingSf == 0 then
  local sfCards = nil
  for _, grp in pairs(suitGroups) do
    if #grp >= minStraight then
      local sr = {}
      local sl = {}
      for _, iid in ipairs(grp) do
        local r = State.get('cards', iid, 'rank') or 0
        if r > 0 and not sr[r] then
          sr[r] = iid
          table.insert(sl, r)
        end
      end
      table.sort(sl, function(a, b) return a > b end)
      for i = 1, #sl - minStraight + 1 do
        local ok = true
        for j = 0, minStraight - 2 do
          if sl[i + j] - sl[i + j + 1] ~= 1 then ok = false; break end
        end
        if ok then
          sfCards = {}
          for j = 0, minStraight - 1 do table.insert(sfCards, sr[sl[i + j]]) end
          break
        end
      end
      if sfCards == nil then sfCards = wheelCards(sr, minStraight) end
      if sfCards then break end
    end
  end
  State.set('evaluation', 'classify', 'straightFlushCards', sfCards or {})
end

local existingFlush = State.get('evaluation', 'classify', 'flushCards') or {}
if #existingFlush == 0 then
  local flushCards = nil
  for _, grp in pairs(suitGroups) do
    if #grp >= minFlush then
      flushCards = {}
      for j = 1, minFlush do table.insert(flushCards, grp[j]) end
      break
    end
  end
  State.set('evaluation', 'classify', 'flushCards', flushCards or {})
end

local existingStraight = State.get('evaluation', 'classify', 'straightCards') or {}
if #existingStraight == 0 then
  local straightCards = nil
  if #rankList >= minStraight then
    for i = 1, #rankList - minStraight + 1 do
      local ok = true
      for j = 0, minStraight - 2 do
        if rankList[i + j] - rankList[i + j + 1] ~= 1 then ok = false; break end
      end
      if ok then
        straightCards = {}
        for j = 0, minStraight - 1 do table.insert(straightCards, rankCards[rankList[i + j]]) end
        break
      end
    end
    if straightCards == nil then straightCards = wheelCards(rankCards, minStraight) end
  end
  State.set('evaluation', 'classify', 'straightCards', straightCards or {})
end
` } },
};

export const scoreCardsCore = {
  id: 'balatro:score:cards',
  hooks: { 'event:score:cards': { order: 500, script: `
local base = {
  high_card =       { chips = 5,   mult = 1 },
  pair =            { chips = 10,  mult = 2 },
  two_pair =        { chips = 20,  mult = 2 },
  three_of_a_kind = { chips = 30,  mult = 3 },
  straight =        { chips = 30,  mult = 4 },
  flush =           { chips = 35,  mult = 4 },
  full_house =      { chips = 40,  mult = 4 },
  four_of_a_kind =  { chips = 60,  mult = 7 },
  straight_flush =  { chips = 100, mult = 8 },
}

local conf = base[Event.handType or 'high_card'] or base.high_card
State.set('evaluation', 'baseChips', conf.chips)
State.set('evaluation', 'baseMult', conf.mult)
State.set('evaluation', 'chips', conf.chips)
State.set('evaluation', 'mult', conf.mult)
State.set('evaluation', 'xmult', 1)

for index, iid in ipairs(Event.scoringCards or {}) do
  State.emit('score:card', {
    card = iid,
    index = index,
    cards = Event.cards or {},
    handType = Event.handType,
    scoringCards = Event.scoringCards or {},
    trigger = 'base',
    retriggerDepth = 0,
  })
end

State.emit('score:jokers', {
  cards = Event.cards or {},
  handType = Event.handType,
  scoringCards = Event.scoringCards or {},
})

State.emit('score:finalize', {
  cards = Event.cards or {},
  handType = Event.handType,
  scoringCards = Event.scoringCards or {},
})
` } },
};

export const scoreCardValueCore = {
  id: 'balatro:score:card:value',
  hooks: { 'event:score:card': { order: 500, script: `
local function cardChips(rank)
  if rank == 14 then return 11 end
  if rank >= 11 and rank <= 13 then return 10 end
  return rank or 0
end

local chips = State.get('evaluation', 'chips') or 0
local rank = State.get('cards', Event.card, 'rank') or 0
local gained = cardChips(rank)
State.set('evaluation', 'chips', chips + gained)

local traces = State.get('evaluation', 'trace', 'cards') or {}
local nextTraces = {}
for _, row in ipairs(traces) do table.insert(nextTraces, row) end
table.insert(nextTraces, {
  source = Event.trigger or 'base',
  retriggerBy = Event.retriggerBy,
  card = Event.card,
  chips = gained,
})
State.set('evaluation', 'trace', 'cards', nextTraces)
` } },
};

export const scoreFinalizeCore = {
  id: 'balatro:score:finalize',
  hooks: { 'event:score:finalize': { order: -9999, script: `
local chips = State.get('evaluation', 'chips') or 0
local mult = State.get('evaluation', 'mult') or 0
local xmult = State.get('evaluation', 'xmult') or 1
local total = math.floor(chips * mult * xmult)

State.set('evaluation', 'total', total)
State.set('lastResult', {
  handType = State.get('evaluation', 'handType'),
  playedCards = State.get('evaluation', 'playedCards') or {},
  scoringCards = State.get('evaluation', 'scoringCards') or {},
  baseChips = State.get('evaluation', 'baseChips') or 0,
  baseMult = State.get('evaluation', 'baseMult') or 0,
  chips = chips,
  mult = mult,
  xmult = xmult,
  total = total,
  trace = {
    cards = State.get('evaluation', 'trace', 'cards') or {},
    jokers = State.get('evaluation', 'trace', 'jokers') or {},
  },
})
State.set('evaluation', nil)
` } },
};

export const roundCheckCore = {
  id: 'balatro:round:check',
  hooks: { 'event:round:check': `
local targetScore = State.get('round', 'targetScore') or 0
local roundScore = State.get('round', 'score') or 0
local handsLeft = State.get('round', 'handsLeft') or 0

State.set('played', {})

if roundScore >= targetScore then
  State.set('round', 'over', true)
  State.set('round', 'won', true)

  local ante = State.get('round', 'ante') or 1
  local maxAnte = State.get('meta', 'maxAnte') or 1
  if ante >= maxAnte then
    State.set('run', 'phase', 'victory')
    State.set('run', 'over', true)
    State.set('run', 'won', true)
    return
  end

  local reward = State.get('meta', 'roundReward') or 0
  local money = State.get('money') or 0
  State.set('money', money + reward)

  local maxHands = State.get('meta', 'maxHands') or 4
  local maxDiscards = State.get('meta', 'maxDiscards') or 3
  local deck = State.get('deck') or {}
  local hand = State.get('hand') or {}
  local discard = State.get('discard') or {}
  local nextDeck = {}
  for _, iid in ipairs(deck) do table.insert(nextDeck, iid) end
  for _, iid in ipairs(hand) do table.insert(nextDeck, iid) end
  for _, iid in ipairs(discard) do table.insert(nextDeck, iid) end

  State.set('deck', nextDeck)
  State.set('hand', {})
  State.set('discard', {})
  State.set('played', {})
  State.set('run', 'phase', 'playing')
  State.set('round', 'ante', ante + 1)
  State.set('round', 'targetScore', math.floor(targetScore * 1.5))
  State.set('round', 'handsLeft', maxHands)
  State.set('round', 'discardsLeft', maxDiscards)
  State.emit('round:start', {})
  return
end

if handsLeft <= 0 then
  State.set('round', 'over', true)
  State.set('round', 'won', false)
  State.set('run', 'phase', 'defeat')
  State.set('run', 'over', true)
  State.set('run', 'won', false)
  return
end

State.emit('hand:draw', {})
` },
};
