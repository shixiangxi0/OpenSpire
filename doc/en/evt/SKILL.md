---
name: evt
description: "Use this skill when designing a new turn-based ruleset on top of evt/core."
---


# Turn-Based Ruleset Design Skill

> This is not a syntax template. It is a design guide. The goal is not to reproduce fixed scripts, but to turn user intent into a runnable ruleset.

---

## When To Use It

Use this skill when the user wants something broader than “add one STS content file”, for example:

- a new turn-based core loop
- a Hearthstone / MTG / JRPG / roguelike combat demo
- a ruleset whose state machine should run on top of `evt/core/`

If the task is only to extend the existing STS ruleset, use [sts/SKILL.md](sts/SKILL.md) instead.

---

## What To Understand First

Read code before designing:

- `evt/core/State.js`
- `evt/core/Scheduler.js`
- `evt/core/Registry.js`
- `evt/core/Runtime.js`
- `evt/game/builder.js`
- `evt/game/session.js`
- `evt/sts/core.js`

The goal is not to copy STS, but to understand the real primitives this host exposes.

---

## What This Host Is Good At

It is good at:

- synchronous, deterministic turn-based rules
- event-driven causal chains
- a state tree as the world model
- `bind/unbind` as the lifecycle mechanism for runtime objects

It is not automatically equivalent to any specific game.

The AI's job is not to force every user request into STS. It should first judge:

- whether the requested game fits a synchronous event pipeline + state tree + binding model
- whether the user needs a full system or only a core demo
- which advanced mechanics should be scoped down into a prototype instead of being modeled in full

---

## Layers That Must Be Designed Explicitly

Before writing modules, at least think through:

- which objects belong in the state tree
- which events are semantic and which are mechanical
- which rules are permanent physics
- which objects are runtime instances that need binding
- who owns lifecycle
- how turn phases advance
- what `order` means in this ruleset

Those questions matter more than any individual script body.

---

## Implicit Constraints To Learn From Code

These should be learned from code, not memorized as isolated facts:

- `rules` hold permanent system rules, `defs` hold instantiable content
- `bind` is not just registration; it also carries instancing, context, and lifecycle
- `Event` means “what happened this time”; `Ctx` means “who this bound instance is”
- `order` behaves like a phase system in practice, not just a priority number
- save/load restores not only numbers but also the active dynamic behavior set
- presentation data and runtime behavior are separate layers
- once a state schema is established, it becomes a de facto contract

These layers may not all be explicit in signatures, but they determine whether the system can evolve cleanly.

---

## Recommended Workflow

Compress the user's request into a minimum runnable loop before implementing:

1. Confirm that the target is a good fit for this host
2. Define the state model, event vocabulary, and lifecycle
3. Write the smallest possible rule skeleton first
4. Add concrete content through `defs`
5. Only then connect CLI / UI expression

If the real requirement is to change lifecycle, turn flow, or state structure, that is usually not “just add one content file”; it is a higher-level orchestration change.

---

## Common Failure Modes

- starting with lots of cards/statuses/abilities before the system skeleton exists
- collapsing identity, storage paths, and context into one string protocol
- letting content own lifecycle that should belong to orchestration
- copying STS event vocabulary by default when the user wants a different game
- treating this skill like a fill-in-the-blank form instead of a design guide

---

## What Good Output Looks Like

The ideal result is not “many scripts”, but:

- a clear state model
- a clear event vocabulary
- a clear set of permanent rules
- a clear set of runtime content templates
- a clear lifecycle ownership chain

If those are not in place first, more code only means the prototype happens to run.
