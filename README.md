# じぶんNaviベース

「次の次の曲がり角まで考えたおすすめ車線案内」を目指す自分専用カーナビ（Webアプリ）。

アプリ名：**じぶんNaviベース**（画面表示・リポジトリ名・ドキュメントはすべてこの名前で統一します）

現在の進捗：**Phase 1（Step 1〜11）実装・自動テスト完了／Phase 2（全画面UI・設定画面・音声検索）実装済み／Phase 2A（実走用ナビパネル・到着判定・標準音声案内）実装・自動テスト完了／Phase 2A実走フィードバック対応（音声案内の逆戻り防止・SmartLane車線データ修正・UI見やすさ改善）完了／目的地の検索履歴・お気に入り実装済み**。実車での走行確認は今後実施予定。Phase 2B以降（履歴・お気に入り以外）は設計のみ（`docs/04_COCCHi比較・今後の改善計画.md` 参照、未実装・外部API未登録）。

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
jibun-navi-base/
├─ index.html
├─ settings.html     ← 設定画面
├─ stats.html        ← 走行ログ集計画面
├─ manifest.json
├─ css/style.css
├─ js/
│   ├─ config.js     ← トークン・しきい値定数
│   ├─ main.js       ← 起動・全体の配線
│   ├─ core/         ← 依存ゼロ。将来Android移植でそのまま使う（純粋関数のみ）
│   ├─ platform/     ← Mapbox・ブラウザAPI依存
│   ├─ nav/          ← ナビ進行の自前実装（状態管理。DOM非依存）
│   ├─ ui/           ← DOM描画
│   └─ log/          ← 走行ログ・目的地の検索履歴/お気に入り（いずれも端末内保存のみ）
├─ tests/
│   ├─ smartLane.test.html   ← SmartLane本体（全20ケース）
│   └─ appLogic.test.html    ← 設定検証・ナビ状態遷移・Phase2A（ナビパネル・到着判定・音声案内等）
└─ README.md
```

設計方針・仕様は `CLAUDE.md` `docs/00_調査報告.md` `docs/01_SmartLane仕様.md` `docs/02_Phase1実装計画.md` を参照。
COCCHiとの比較・Phase 2B以降の計画（設計のみ・未実装）は `docs/04_COCCHi比較・今後の改善計画.md` を参照。
Phase 2A実走確認チェックリスト（同乗者向け）は `docs/05_Phase2A実走確認チェックリスト.md` を参照。

---

## 外部ライブラリのバージョンについて

Mapbox GL JS・Turf.jsは、意図しない自動更新で挙動が変わることを防ぐため、バージョンを固定しています。

- **Mapbox GL JS 3.28.1**：地図表示・3D地形・言語設定(`language:'ja'`)・Standardスタイルの`setConfigProperty`を使用。固定時点で動作確認済み
  - npm公式レジストリ（`registry.npmjs.org/mapbox-gl`）の`dist-tags.latest`が本バージョンを指していることを確認済み（3.28.0は3.28.1の1つ前のパッチで、差分はESMバンドルでのアイコン描画バグ修正のみ・破壊的変更なし）
  - unpkg CDNのJS/CSSともHTTP 200で取得できることを確認済み
- **Turf.js 7.4.0**：`nearestPointOnLine`（自車位置のルート吸着）で使用。バージョンにより戻り値のプロパティ名が異なる場合があるため固定（新プロパティ名`lineDistance`/`pointDistance`を使用）。CDNから取得できることを確認済み

更新する場合は、地図・3D地形・ルート追跡（Turf.js）の動作を確認してから、`index.html`のCSSとJSのバージョン番号を両方揃えて変更してください。

## PWA対応について

`manifest.json`（アプリ名・アイコン・全画面表示設定）のみ追加しています。**Service Worker（オフラインキャッシュ）は導入していません。**

理由：
- このアプリは地図表示・経路検索・車線案内のすべてでMapboxのAPIを都度呼び出しており、通信が無い状態では実質的に使えません。オフラインキャッシュを入れても「完全なオフラインナビ」にはならず、誤解を招きます
- 開発中はGitHub Pagesへの更新が多く、Service Workerが古いJS/CSSをキャッシュしたままだと「更新したのに反映されない」問題を起こしやすいです

そのため、現時点ではmanifest.jsonによる「ホーム画面に追加した時の見た目・挙動の改善」（アプリ名・全画面表示・アイコン）にとどめています。将来、実装が安定してから、必要であれば「アプリの外枠（HTML/CSS/JS）だけをキャッシュし、地図・API通信はキャッシュしない」設計でService Workerを検討してください。
