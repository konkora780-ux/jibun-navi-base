# じぶんNaviベース

「次の次の曲がり角まで考えたおすすめ車線案内」を目指す自分専用カーナビ（Webアプリ）。

アプリ名：**じぶんNaviベース**（画面表示・リポジトリ名・ドキュメントはすべてこの名前で統一します）

現在の進捗：**Phase 1 / Step 1 完了**

---

## セットアップ手順

### 1. Mapboxのトークンを作る

1. https://account.mapbox.com/ にログイン
2. 「Tokens」→「Create a token」
3. **Public scopes はデフォルトのままでOK**（`styles:read` `fonts:read` `datasets:read` など）
4. **URL restrictions（URL制限）** に次を追加する ← **必ず設定してください**
   ```
   https://<自分のGitHubユーザー名>.github.io/*
   ```
   これを設定しないと、他人にトークンを使われて無料枠を使い切られる恐れがあります。
5. できた `pk.` で始まるトークンをコピー

**`sk.` で始まる秘密トークンは絶対に使わないでください。**

### 2. トークンを設定する

`js/config.js` を開き、次の行を書き換えます。

```js
export const MAPBOX_TOKEN = 'pk.ここに自分のトークンを貼る';
```

### 3. GitHub Pages で公開する

1. このフォルダをGitHubリポジトリにpush（**Public**でOK）
2. リポジトリの Settings → Pages → Source を `main` ブランチのルートに設定
3. 数分後、`https://<ユーザー名>.github.io/<リポジトリ名>/` で開けます

### 4. iPhoneで開く

1. Safariで上記URLを開く
2. 共有ボタン →「ホーム画面に追加」
3. ホーム画面のアイコンから起動すると全画面になります（実走テストはこの状態で）

---

## 動作確認（Step 1）

- [ ] 地図が表示される
- [ ] DEBUGパネルの「状態」が「地図OK（Step 1完了）」になる
- [ ] 3Dボタンで傾きが変わる
- [ ] DEBUGボタンでパネルが消える

**地図が真っ白な場合**：DEBUGパネルの「状態」を見てください。トークン未設定・URL制限の設定ミスのどちらかがほとんどです。

---

## 使用量について

無料枠内で運用します。ただしMapboxには支出上限の仕組みがないため、以下を必ず守ってください。

- Directions APIは「ナビ開始時」と「ルート逸脱時（最短10秒間隔）」のみ呼ぶ
- 検索は検索ボタンを押した時のみ呼ぶ
- Mapbox管理画面で**使用量アラート**を設定しておく

---

## ファイル構成

```
carnavi/
├─ index.html
├─ css/style.css
├─ js/
│   ├─ config.js     ← トークン・しきい値定数
│   ├─ main.js       ← 起動・全体の配線
│   ├─ core/         ← 依存ゼロ。将来Android移植でそのまま使う
│   ├─ platform/     ← Mapbox・ブラウザAPI依存
│   ├─ nav/          ← ナビ進行の自前実装
│   ├─ ui/
│   └─ log/
├─ tests/
└─ README.md
```

設計方針・仕様は `CLAUDE.md` `00_調査報告.md` `01_SmartLane仕様.md` `02_Phase1実装計画.md` を参照。
