<div align="center">

<img src="assets/image.png" alt="OpenSpire" />

**ゲーム開発の新パラダイム**

🎮 ゲームCLI化 &nbsp;•&nbsp; 🤖 AIネイティブ &nbsp;•&nbsp; 🔌 ホットプラグインルール

<p align="center">
  <a href="README.md"><b>English</b></a>
  &nbsp;•&nbsp;
  <a href="README_zh.md">中文</a>
  &nbsp;•&nbsp;
  <a href="README_ko.md">한국어</a>
</p>

<p align="center">

[![小红书](https://img.shields.io/badge/小红书-FE2C55?style=flat-square&logoColor=white)](https://www.xiaohongshu.com/user/profile/678d1c15000000000e01d5d2)
[![X](https://img.shields.io/badge/-111111?style=flat-square&logo=x&logoColor=white)](https://x.com/devccgame)
[![License: MIT](https://img.shields.io/badge/License-MIT-3DA639?style=flat-square)](LICENSE)

</p>

</div>

---

## これは何？

OpenSpireは**汎用ターンベースカードイベントオーケストレーションエンジン**で、Slay the Spireの完全な実装がデモとして含まれています。

その核心理念：**ゲームルールとデータは完全にLuaスクリプトで定義**され、エンジンコードに触れることなく、ホットプラグインで拡張可能です。すべてのアクションはイベントパイプラインを流れ、自然にCLI制御とAIプログラムによる制御をサポートします。

データ駆動型ゲームでは、**AIがゲームデザインとロジック開発のサイクルを劇的に短縮**できます。コーディング知識は不要です。AIはゲームバランスの修正も行え、開発サイクルを数ヶ月から数週間、さらにはそれ以下に短縮できます。

## なぜOpenSpire？

| 能力 | 説明 |
|------|------|
| 🎮 **ゲームCLI化** | 組み込みのJSON/stdioインターフェースで、あらゆる操作をプログラム制御可能 |
| 🤖 **AIネイティブ対応** | AIによるCLI実行をサポート、スキルルールで新しいゲームデータを生成 |
| 🔌 **ホットプラグインルール** | カード/敵/ステータスの追加はLuaスクリプトを追加するだけ、再起動不要 |
| 📝 **純粋なデータ駆動** | ゲームロジックはLuaで記述、エンジンはイベントのオーケストレーションのみ |
| 🖥️ **ターミナルでプレイ可能** | 組み込みのInk UIで、フロントエンドなしで完全な体験が可能 |

## クイックスタート

```sh
pnpm install
pnpm start              # インタラクティブなシナリオ選択
pnpm start iron_plague  # 特定のシナリオを直接起動
```

### ターミナル表示

<img src="assets/STS.en.png" alt="OpenSpire" />

## プロジェクト構造

```
evt/
  core/        # エンジンコア：イベントパイプライン、Luaランタイム、状態管理
  sts/         # STSルール：カード、敵、ステータス、キャラクター定義
  game/        # セッションオーケストレーション、シナリオ読み込み、表示
  bin/         # CLIエントリポイント（ターミナルUI + JSONモード）
ui/            # Inkターミナルインターフェース
scenarios/     # バトルシナリオJSON設定
```

## 拡張ガイド

- **カード/ステータス/敵の追加** → [doc/en/evt/sts/SKILL.md](doc/en/evt/sts/SKILL.md)を参照
- **新しいルールセットの構築** → [doc/en/evt/SKILL.md](doc/en/evt/SKILL.md)を参照

例：新しいカードの追加はLuaスクリプトを定義するだけ

```js
export const myCard = {
  id: 'my_card',
  cost: 1,
  triggers: [{
    event: 'card:effect',
    script: `State.emit('entity:attack', { target = Event.target, amount = 10 })`
  }]
};
```

