---
name: sts
description: "Use this skill when extending the current STS ruleset."
---


# STS Ecosystem Skill

> This is not a fixed syntax manual. Its job is to help AI understand both the explicit interfaces and the more important implicit constraints of the current STS ecosystem.

---

## When To Use It

Use this skill when the task is inside the current STS ruleset, for example:

- adding a card
- adding a status
- adding an enemy
- adjusting STS battle rules
- changing STS events, turn flow, or lifecycle orchestration

If the user wants a completely new game ruleset, do not force it into STS. Use [../SKILL.md](../SKILL.md) instead.

---

## Which Code To Read First

This skill only works if it stays grounded in code:

- `evt/sts/events.js`
- `evt/sts/core.js`
- `evt/sts/index.js`
- `evt/sts/cards/`
- `evt/sts/statuses/core.js`
- `evt/sts/enemies/index.js`
- `evt/game/builder.js`
- `evt/game/session.js`
- `evt/sts/cards/`, `evt/sts/statuses/`, `evt/sts/enemies/` for reference implementations

In particular, `evt/sts/core.js` is not “just another rules file”; it is the lifecycle and flow skeleton of the current STS ecosystem.

---

## Basic Mental Model

Inside the current STS ecosystem:

- card / status / enemy are all defs
- defs are templates; they do not become active by themselves
- `core.js` decides when binding and unbinding happen
- content files only describe how something reacts while it exists
- `actions{}` is closer to UI intent data than to behavior execution

So before changing anything, first decide:

- is this a content change
- or a skeleton change

That distinction matters more than the exact field list.

---

## Explicit Surface-Level Interfaces

Only the most useful explicit constraints belong here.

### 1. card

Usually includes:

- `id`
- `cost`
- `targetType`
- `display`
- `hooks`

The main card effect usually hangs off `event:card:effect`.

### 2. status

Usually includes:

- `id`
- `display`
- `hooks`

Statuses use `Ctx.self` as their instance identity. Identity-based filtering is declared via `match` in the hook definition (e.g. `match: { target: 'self' }`) rather than written as a guard at the top of the script.

### 3. enemy

Usually includes:

- `id`
- `display`
- `actions`
- `hooks`

`actions` mostly describes intent display; real behavior still lives in `hooks`.

### 4. Runtime context

There are only two official runtime contexts:

- `Event`: what happened this time
- `Ctx`: who this bound instance is

### 5. State access

`State.get/set` only take path segments, for example:

```js
State.get('entities', target, 'hp')
State.set('entities', target, 'hp', nextHp)
```

Do not use a single dot-path string.

---

## More Important Implicit Constraints

This section matters more than schema trivia.

### 1. Lifecycle is not owned by content files

Enemies, statuses, and cards can all be bound, but their existence is not mainly decided by their own defs. It is mainly decided by `evt/sts/core.js`.

That means:

- content describes reactions
- `core.js` owns lifecycle

### 2. card / status / enemy share a binding mechanism but not the same lifetime model

- enemies are usually battle-long bindings
- statuses usually live for the duration of the status
- cards are usually windowed bindings, not always-on reactors

Do not treat them as fully identical just because they all use binding.

### 3. The main STS combat skeleton lives in `evt/sts/core.js`

This is where the real combat backbone lives:

- attack, damage, loss, die chains
- status application and removal
- turn start and turn end
- enemy initialization and AI flow
- card movement and effect windows

If the user wants to change those flows, that is not “just add content”; it is a skeleton change.

### 4. `order` behaves like a phase system here

Inside the STS ecosystem, `order` is not just a generic ordering number. It decides:

- when modifiers apply
- when main effects resolve
- when cleanup happens
- when chained events land

Changing `order` means changing rule phases.

### 5. Content should prefer semantic events

The current STS ruleset generally prefers content that emits:

- `entity:attack`
- `entity:block`
- `status:apply`

instead of punching through the skeleton and mutating low-level state directly.

### 6. `actions{}` and `hooks` are separate layers

Enemy `actions{}` mostly describe intent display.
Real action logic lives in `event:enemy:action` and `event:enemy:update` hooks.
Loss-threshold reactions and similar behavior usually hang directly on `event:entity:loss`.

Do not merge those mental models.

---

## A Better Workflow

Before writing STS changes, first decide which category the change belongs to:

- pure content extension: mostly `cards/`, `statuses/`, `enemies/`
- skeleton change: read and probably edit `evt/sts/core.js`
- event vocabulary change: read and probably edit `evt/sts/events.js`
- state model change: inspect `evt/game/builder.js`, `evt/game/session.js`, and the presentation layer

If that layer judgment is wrong, the code usually becomes awkward fast.

---

## Questions Worth Answering Before You Edit

Before coding, answer these first:

- who owns the lifecycle of this feature
- should it be a permanent rule or a runtime def
- which semantic event layer should it attach to
- should it be a persistent binding or a windowed one
- does it really require `core.js`
- does it also require state-model or UI changes

If those answers are still unclear, read more code before writing.

---

## What To Observe In Existing Content

If you are adding a card, status, or enemy, study at least:

- where its lifecycle is triggered
- which events its hooks hang from
- how it uses `Ctx` to point at instance identity
- how much it depends on an existing `core.js` chain
- how similar content implements its response logic

That is more useful than memorizing a field table.

---

## A Few Existing Conventions That Matter

You do not need to memorize everything, but it helps to know:

- `target/source` are entity ids
- the player also lives in `entities.player`
- enemy slots are `enemies.<slot> -> enemyId`
- `event:card:effect`, `event:actor:turn:start/end` are common event hooks for cards and statuses
- enemies commonly use `event:enemy:action` and `event:enemy:update`; loss reactions often use `event:entity:loss`
- `entity:attack -> entity:damage -> entity:loss -> entity:die` is the main skeleton chain

---

## Common Mistakes

- putting lifecycle inside content defs when it really belongs to the skeleton
- putting content-specific branching into global skeleton rules
- treating `actions{}` as the execution site for behavior
- bypassing semantic events and mutating low-level state unless you are intentionally changing core rules
- editing after reading only this skill instead of also reading `evt/sts/core.js` and one similar content file
