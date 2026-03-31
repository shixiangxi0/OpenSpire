---
name: sts
description: 在现有 STS 规则生态中扩展卡牌、状态、敌人或调整战斗流程时使用。
---

# STS 规则生态 Skill

> 这份 skill 不是固定语法手册。它的重点是帮助 AI 理解当前 STS 生态已经有哪些显式接口，以及哪些更重要的隐式约束。

---

## 什么时候用

当任务属于下面这些情况时，用这份 skill：

- 新增卡牌
- 新增状态
- 新增敌人
- 调整 STS 战斗规则
- 修改 STS 的事件、回合流转或生命周期编排

如果目标是设计一整套新的游戏规则，不要直接套 STS，改看 [../SKILL.md](../SKILL.md)。

---

## 先读哪些代码

这份 skill 不能脱离代码理解：

- `evt/sts/events.js`
- `evt/sts/core.js`
- `evt/sts/index.js`
- `evt/sts/cards/`
- `evt/sts/statuses/core.js`
- `evt/sts/enemies/index.js`
- `evt/game/builder.js`
- `evt/game/session.js`
- `evt/sts/cards/`、``evt/sts/statuses/`、`evt/sts/enemies/` 示例实现

特别是 `evt/sts/core.js`，它不只是一些规则，而是当前 STS 生态的生命周期和流程骨架。

---

## 先建立的基本认识

当前 STS 生态里：

- card / status / enemy 都是 def
- def 只是模板，不会自己生效
- `core.js` 决定什么时候 bind，什么时候 unbind
- 具体内容文件只描述“存在时如何响应事件”
- `actions{}` 更偏 UI 数据，不是行为执行入口

所以写 STS 内容时，先分清：

- 我是在补内容
- 还是在改骨架

这是最重要的一步。

---

## 当前显式接口

这里只保留最需要知道的表面约束。

### 1. card

通常包含：

- `id`
- `cost`
- `targetType`
- `display`
- `triggers`

卡牌主效果通常挂在 `card:effect`。

### 2. status

通常包含：

- `id`
- `display`
- `triggers`

状态通常依赖 `Ctx.self`，并在 trigger 开头自己做 guard。

### 3. enemy

通常包含：

- `id`
- `display`
- `actions`
- `triggers`

`actions` 主要是意图展示数据；真正行为仍写在 trigger 里。

### 4. 运行时上下文

运行时正式上下文只有两套：

- `Event`：这次发生了什么
- `Ctx`：当前这个绑定实例是谁

### 5. 状态访问

`State.get/set` 只传路径段，例如：

```js
State.get('entities', target, 'hp')
State.set('entities', target, 'hp', nextHp)
```

不要再写单个 dot-path 字符串。

---

## 更重要的隐式约束

这部分比 schema 更重要。

### 1. 生命周期不在内容层手里

敌人、状态、卡牌都可以 bind，但它们什么时候存在，不主要由各自 def 决定，而主要由 `evt/sts/core.js` 决定。

这意味着：

- 内容层描述反应
- `core.js` 拥有生命周期

### 2. card / status / enemy 虽然统一成 bindable def，但寿命模型不同

- 敌人通常在战斗期常驻
- 状态通常在状态存在期常驻
- 卡牌通常是窗口型绑定，不是整局常驻反应器

不要只因为它们都能 bind，就把它们当成完全同一种对象。

### 3. STS 的主流程骨架在 `evt/sts/core.js`

真正的战斗骨架在这里：

- 攻击、伤害、失血、死亡链条
- 状态施加与移除
- 回合开始与结束
- 敌人初始化与 AI 驱动
- 卡牌移动与效果窗口

如果用户要求改的是这些流程，就不是“新增内容”，而是改骨架。

### 4. `order` 在这里承担阶段系统

在 STS 生态里，`order` 不是普通的先后顺序而已。它实际上决定：

- 修饰什么时候生效
- 主效果什么时候结算
- 清理什么时候发生
- 链式事件什么时候落地

所以改 `order` 等于在改规则阶段。

### 5. 内容层应优先发语义事件

当前 STS 生态更鼓励：

- 发 `entity:attack`
- 发 `entity:block`
- 发 `status:apply`

而不是直接穿透骨架去改底层状态。

### 6. `actions{}` 和 trigger 是两层

敌人的 `actions{}` 主要描述 intent 展示；
真正行动逻辑仍在 `enemy:action` trigger。

不要把行为偷偷塞进 `actions{}` 心智里。

---

## 一个更好的工作方式

在写 STS 变更前，先判断这次改动属于哪一类：

- 纯内容扩展：主要改 `cards/`、`statuses/`、`enemies/`
- 规则骨架调整：要看 `evt/sts/core.js`
- 事件词汇变化：要看 `evt/sts/events.js`
- 状态模型变化：要看 `evt/game/builder.js`、`evt/game/session.js`、展示层

如果层次判断错了，后面代码通常会越写越怪。

---

## 写内容时最值得先确认的事

动手前，先回答这些问题：

- 这次需求的生命周期是谁拥有
- 它应该是 permanent rule 还是 runtime def
- 它应当挂在哪个语义事件层
- 它是常驻绑定还是窗口绑定
- 它是否要求改 `core.js`
- 它是否要求改状态模型或 UI 展示

如果这些还没想清楚，先读代码，不要急着写。

---

## 读内容文件时要刻意观察什么

如果你要在 STS 里加一张牌、一个状态、一个敌人，至少要先观察：

- 它们的生命周期由哪里触发
- 它们的 trigger 主要挂在哪些事件上
- 它们是怎么通过 `Ctx` 指向实例身份的
- 它们是否依赖 `core.js` 里已有的骨架链条
- 类似内容是怎么实现其响应逻辑的

这比死记字段表更有用。

---

## 少量非常关键的现成约定

这些不用背全，但最好知道：

- `target/source` 统一是实体 id
- 玩家也在 `entities.player`
- 敌人槽位是 `enemies.<slot> -> enemyId`
- `card:effect`、`enemy:action`、`enemy:ai`、`actor:turn:start/end` 是内容常见挂点
- `entity:attack -> entity:damage -> entity:loss -> entity:die` 是主骨架链条

---

## 典型误区

- 不要把生命周期写进内容 def，除非你非常确定它就属于内容层
- 不要把具体内容判断塞进全局骨架规则里
- 不要把 `actions{}` 当成行为执行位置
- 不要绕过语义事件直接改底层状态，除非你就在改核心规则
- 不要只看这份 skill 就动手，先读 `evt/sts/core.js` 和一个相似内容文件
