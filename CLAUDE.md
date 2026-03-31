# CLAUDE.md

`openspire` is not just an STS clone.

It is closer to an AI-facing host for turn-based event orchestration:

- `evt/core/` provides a synchronous, deterministic runtime
- `evt/game/` turns that runtime into a playable session
- `evt/sts/` provides one fully realized STS-style ruleset
- `ui/` is only the current presentation shell for that ruleset

That means AI work in this repo is usually not “add a small script”, but:

- design or extend a ruleset
- break it into state, events, lifecycle, and runtime bindings
- then turn it into runnable content

---

## Project Layers

| Path | Role |
|------|------|
| `evt/core/` | Generic runtime: event pipelines, state access, Lua execution, dynamic binding |
| `evt/game/` | Game orchestration: initial state, flow control, CLI / UI integration |
| `evt/sts/` | Reference ruleset: a complete STS-style combat ecosystem |
| `ui/` | Current frontend shell |

---

## Current Hard Constraints

These are already enforced by code:

- `State.get/set` only accept path segments, not a single dot-path string
- `Event.target/source` represent identity, not storage paths
- `Ctx` is the only official binding-context entry point
- `State.bind` only accepts `{ key, kind, id, ctx }`
- `module.extensions` is disabled
- undeclared events, duplicate events, duplicate rule ids, and duplicate defs all fail fast

If AI is expected to write rules without ambiguity, these constraints must stay explicit.

---

## Which Document To Read

First decide which layer the task belongs to:

- If the goal is to design a new turn-based ruleset on top of `evt/core/`, start with [evt/SKILL.md](doc\en\evt\SKILL.md)
- If the goal is to extend the current STS ecosystem, start with [doc\cn\evt\sts\SKILL.md](doc\en\evt\sts\SKILL.md)

---

## Best Code Entry Points

For either new rulesets or STS extensions, the best starting files are:

- `evt/core/State.js`
- `evt/core/Scheduler.js`
- `evt/core/Registry.js`
- `evt/core/Runtime.js`
- `evt/game/builder.js`
- `evt/game/session.js`
- `evt/sts/core.js`
- `evt/sts/events.js`

These files define the state model, event dispatch, lifecycle ownership, and runtime binding model.
