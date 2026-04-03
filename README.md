<div align="center">

<img src="assets/image.png" alt="OpenSpire" />

**A New Paradigm for Game Development**

🎮 Game CLI-ification &nbsp;•&nbsp; 🤖 AI-Native &nbsp;•&nbsp; 🔌 Hot-Pluggable Rules

<p align="center">
  <a href="README_zh.md">中文</a>
  &nbsp;•&nbsp;
  <a href="README_ja.md">日本語</a>
  &nbsp;•&nbsp;
  <a href="README_ko.md">한국어</a>
</p>

<p align="center">

[![Xiaohongshu](https://img.shields.io/badge/Xiaohongshu-FE2C55?style=flat-square&logoColor=white)](https://www.xiaohongshu.com/user/profile/678d1c15000000000e01d5d2)
[![X](https://img.shields.io/badge/-111111?style=flat-square&logo=x&logoColor=white)](https://x.com/devccgame)
[![License: MIT](https://img.shields.io/badge/License-MIT-3DA639?style=flat-square)](LICENSE)

</p>

</div>

---

## What Is This?

OpenSpire is a **generic turn-based card event orchestration engine** with a complete Slay the Spire implementation included as a demo.

Its core philosophy: **Game rules and data are defined entirely through Lua scripts**. Build new gameplay without touching engine code—hot-pluggable and extensible. All actions flow through an event pipeline, naturally supporting CLI control and AI programmatic takeover.

For data-driven games, **AI can dramatically shorten the game design and logic development cycle**—no coding knowledge required. AI can also fix game balance issues, reducing development cycles from months to weeks or even less.

## Why OpenSpire?

| Capability | Description |
|------------|-------------|
| 🎮 **Game CLI-ification** | Built-in JSON/stdio interface—every action can be programmatically controlled |
| 🤖 **AI-Native Friendly** | Supports AI running CLI, built-in skill rules for generating new game data |
| 🔌 **Hot-Pluggable Rules** | Add cards/enemies/statuses with just Lua scripts—no restart needed |
| 📝 **Pure Data-Driven** | Game logic lives in Lua; the engine only orchestrates events |
| 🖥️ **Terminal-Ready** | Built-in Ink UI—playable without any frontend |

## Quick Start

```sh
pnpm install
pnpm sts                         # STS: pick language first, then pick scenario
pnpm sts -- iron_plague          # STS: launch a specific scenario directly
pnpm sts -- --lang en            # STS: skip language picker and start in English
pnpm balatro                     # Balatro: pick language first, then start
pnpm balatro -- --lang zh        # Balatro: skip language picker and start in Chinese
```

### Terminal Display

<img src="assets/STS.en.png" alt="OpenSpire" />


## Project Structure

```
evt/
  core/        # Engine core: event pipeline, Lua runtime, state management
  sts/         # STS rules: cards, enemies, statuses, character definitions
  game/        # Session orchestration, scenario loading, view presentation
  bin/         # CLI entry points (terminal UI + JSON mode)
ui/            # Ink terminal interface
scenarios/     # Battle scenario JSON configs
```

## Extension Guide

- **Add cards/statuses/enemies** → See [doc/en/evt/sts/SKILL.md](doc/en/evt/sts/SKILL.md)
- **Build new rulesets** → See [doc/en/evt/SKILL.md](doc/en/evt/SKILL.md)

Example: Adding a new card only requires defining a Lua script

```js
export const myCard = {
  id: 'my_card',
  cost: 1,
  hooks: {
    'event:card:effect': `State.emit('entity:attack', { target = Event.target, amount = 10 })`
  }
};
```

