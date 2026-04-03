# Balatro Joker Trigger Spec

This file records the intended trigger model for Balatro jokers in this repo.

## Goals

- Preserve Balatro's event-driven scoring flow.
- Make joker timing explicit instead of relying on incidental handler registration order.
- Separate rule-changing jokers from scoring jokers and stateful jokers.
- Give future refactors a stable contract to target.

## Event Pipeline

The current core flow is:

1. `round:start`
2. `hand:discard`
3. `hand:play`
4. `hand:evaluate`
5. `hand:classify`
6. `hand:resolve`
7. `score:cards`
8. `score:card` for each scoring card
9. `score:jokers`
10. `score:finalize`
11. `round:check`

In practice, the scoring path is:

1. `hand:play`
2. `hand:evaluate`
3. `hand:classify`
4. `hand:resolve`
5. `score:cards`
6. repeated `score:card`
7. `score:jokers`
8. `score:finalize`

This is the first ordering dimension: phase order always wins over joker slot order.

## Ordering Rules

The intended Balatro semantics are:

- Different phases are ordered by the event pipeline.
- Jokers attached to the same phase should resolve from left to right.
- Joker slot order is a gameplay rule, not an implementation accident.
- Handler `order` should only separate core timing layers inside one event, not replace left-to-right joker order.

That means:

- `hand:classify` runs before any score construction.
- `hand:resolve` converts classify output into the final hand type and scoring cards.
- `score:card` effects run during per-card scoring.
- `score:jokers` runs after card scoring is complete.
- `score:finalize` is the final multiplier and snapshot stage.

Current implementation status:

- Equal-order handlers are currently stable in registration order.
- Joker instances are currently bound in the same order as the `jokers` array in the round builder.
- This makes many same-phase jokers behave like left-to-right today.
- But this is still an implicit property of the engine, not a Balatro-specific slot model.

## Joker Categories

### 1. Rule takeover jokers

These do not mainly "add score". They modify how the hand itself is recognized.

- `shortcut_joker`
  Mounted on `event:hand:classify`
  Responsibility: override `flush`, `straight`, and `straight_flush` recognition for 4-card logic.

Design rule:

- Rule takeover jokers should only mutate classification context.
- Core hand evaluation should consume a clear classify result.
- Final hand ranking should happen in `hand:resolve`, not be embedded back inside `hand:evaluate`.
- They should not scatter ad hoc scoring fixes into later phases.
- Classification uses one canonical result surface:
  `evaluation.classify.flushCards`, `straightCards`, and `straightFlushCards`.
- Rule jokers may write these canonical fields directly.
- Core classify should only fill missing values, not maintain a parallel override channel.

### 2. Per-card scoring jokers

These react while scoring cards one by one.

- `club_joker`
  Mounted on `event:score:card`
- `echo_joker`
  Mounted on `event:score:card`
- `baron_joker`
  Mounted on `event:score:card`
- `pyramid_joker`
  Mounted on `event:score:card`

Design rule:

- These should only depend on the current scored card and the current evaluation context.
- Retrigger effects also belong here, because they operate on card trigger structure.

### 3. Whole-hand scoring jokers

These evaluate after card scoring is complete and modify the hand total.

- `jolly_joker`
  Mounted on `event:score:jokers`
- `greedy_joker`
  Mounted on `event:score:jokers`
- `abstract_joker`
  Mounted on `event:score:jokers`
- `square_joker`
  Mounted on `event:score:jokers`
- `momentum_joker`
  Mounted on `event:score:jokers`
- `rainbow_joker`
  Mounted on `event:score:jokers`
- `daredevil_joker`
  Mounted on `event:score:jokers`
- `wildfire_joker`
  Mounted on `event:score:jokers`

Design rule:

- These should read finished hand information, not re-derive classification.
- Same-phase whole-hand jokers should resolve left to right.

### 4. Finalize jokers

These modify the last multiplier layer immediately before result snapshot.

- `finisher_joker`
  Mounted on `event:score:finalize`

Design rule:

- Finalize effects belong in the last multiplier or final total layer.
- This phase should stay narrow and predictable.

### 5. Round-state jokers

These maintain persistent or round-local state outside direct scoring.

- `square_joker`
  Mounted on `event:hand:play` and `event:score:jokers`
- `momentum_joker`
  Mounted on `event:round:start`, `event:hand:discard`, `event:score:jokers`
- `second_wind_joker`
  Mounted on `event:round:start`, `event:hand:discard`
- `wildfire_joker`
  Mounted on `event:round:start`, `event:hand:play`, `event:score:jokers`

Design rule:

- Cross-event jokers are normal when the effect itself spans multiple phases.
- Permanent or round-local data should live under `jokers.<instanceId>.*`.
- Cross-event logic is acceptable when each phase owns a clean responsibility.

## What Counts As Good Cross-Event Design

This is acceptable:

- `square_joker` checks "did the player play exactly 4 cards?" during `hand:play`
- Then adds its stored permanent chip bonus during `score:jokers`

Why it is acceptable:

- The effect naturally has an observation phase and an application phase.
- Persistent state is explicit.
- The scoring phase does not need to reconstruct past logic.

This is the model to keep for stateful jokers.

## What Counts As Bad Semantic Leakage

This is what the refactor should avoid:

- A joker mutates hidden fields that only one specific core rule knows how to interpret.
- Core rules and joker rules share private conventions that are not documented as part of the model.
- The same gameplay rule is half implemented in classify and half patched later in scoring.
- Slot order depends on registration accidents instead of explicit joker positioning.

`shortcut_joker` is currently the clearest example of a joker that must be treated as a formal rule-layer override, not just "another score modifier".

## State Ownership

Balatro state should be split by responsibility:

- `evaluation`
  Transient context for the current hand only
- `lastResult`
  Finalized snapshot for UI and preview
- `jokers.<instanceId>`
  Persistent joker-local state
- `round`
  Round resources and round outcome
- `run`
  Run-level progression state

Design rule:

- Joker scripts should not write UI-facing snapshot data directly.
- Joker scripts should mutate `evaluation` or their own local state.
- Only finalize should produce `lastResult`.

## Refactor Target

The target model for Balatro joker execution is:

- Phase order comes from events.
- In the same phase, jokers resolve by slot from left to right.
- Core rules define the phase boundaries.
- Jokers may keep state across phases, but each phase must have one clear responsibility.
- Rule-changing jokers should hook the rule layer, not patch the result layer after the fact.
- `hand:classify` finds pattern candidates; `hand:resolve` chooses the winning hand type.

## Current Joker Mount Table

- `event:hand:classify`
  `shortcut_joker`
- `event:hand:resolve`
  none today
- `event:hand:play`
  `square_joker`, `wildfire_joker`
- `event:hand:discard`
  `momentum_joker`, `second_wind_joker`
- `event:round:start`
  `momentum_joker`, `second_wind_joker`, `wildfire_joker`
- `event:score:card`
  `club_joker`, `echo_joker`, `baron_joker`, `pyramid_joker`
- `event:score:jokers`
  `jolly_joker`, `greedy_joker`, `abstract_joker`, `square_joker`, `momentum_joker`, `rainbow_joker`, `daredevil_joker`, `wildfire_joker`
- `event:score:finalize`
  `finisher_joker`
