# CLAUDE.md — じぶんNaviベース（自分専用カーナビ・Webアプリ版）

**アプリ名は「じぶんNaviベース」。** 画面タイトル・README・リポジトリ名・今後追加するドキュメントは、すべてこの名前で統一すること。

このファイルは Claude Code が最初に読む指示書です。作業前に必ず全文を読んでください。

## プロジェクト概要

自分1人で使うカーナビ。最大の特徴は **「次の次の曲がり角まで考えた、おすすめ車線案内」**。

- **開発形態：Webアプリ**（ブラウザで動く。ネイティブアプリではない）
- **開発環境：Windows PC + Claude Code**
- **テスト環境：iPhone の Safari**（ホーム画面に追加して全画面で使用）
- **最終環境：Android AIBOX（車載ディスプレイ・横画面）のブラウザ、将来的にWebViewでAPK化**
- **費用制約：¥0 で運用すること**
- 現在地点：**Phase 1（Step 1〜11）実装・自動テスト完了。Phase 2（全画面UI・設定画面・音声検索）実装済み。Phase 2A（COCCHi等の他社カーナビを参考にした実走用ナビパネル・到着判定・標準音声案内・SmartLane専用表示・通信/GPS状態表示）実装・自動テスト完了。** 実車での走行確認はこれから。Phase 2B以降は設計のみで未実装（`docs/04_COCCHi比較・今後の改善計画.md`参照、外部APIは何も登録・契約していない）。

同梱ドキュメント（必ず全部読むこと）：
- `docs/00_調査報告.md` — 技術調査結果。重要な制約が書いてある
- `docs/01_SmartLane仕様.md` — 中核ロジックの仕様
- `docs/02_Phase1実装計画.md` — Phase 1（Step 1〜11）の詳細手順
- `docs/04_COCCHi比較・今後の改善計画.md` — 他社カーナビ(COCCHi)との比較とPhase 2B以降の設計（未実装）
- `docs/05_Phase2A実走確認チェックリスト.md` — 実走確認チェックリスト（同乗者用）

**他社カーナビ（COCCHi等）の意匠・画像・アイコン・文言はコピーしないこと。** 参考にするのは「情報の優先順位」「操作性」「機能構成」の考え方のみ。アイコンは必ず自作する（`js/ui/maneuverIcon.js`）。

## 開発者について

- 非エンジニア（特別支援学校教員）。Web開発の基礎知識は多くない。
- 「単一HTML + GitHub Pages + Supabase」での個人開発経験は豊富。
- 日本語・です・ます調で説明する。専門用語には短い補足を付ける。
- コード提案時は「なぜこの実装か」を1〜2文添える。
- 結論から先に書く。前置きは不要。

## 作業ルール

1. **推測で埋めない。** Mapboxの仕様が不明なら公式ドキュメントを確認する。古い記事のコードをそのまま使わない。
2. **巨大な1ファイルにしない。** 下記のモジュール構成に従う。
3. **チャットに長いコードを貼らない。** ファイルに書き、修正は差分で説明する。
4. 1回の応答で「編集 → 動作確認 → 結果報告」まで完結させる。
5. 応答が途中で切れたら、続きを書かず**ファイルの現在状態を確認してからやり直す**。
6. 「再開」と言われたら、ファイルの現在状態を確認し未完了作業を特定して続ける。
7. **Mapbox APIの呼び出し回数を増やす実装を勝手に追加しない。** 必要なら理由と想定回数を先に説明する。

## 技術スタック（確定・すべて無料）

| 用途 | 使うもの | 読み込み方法 |
|---|---|---|
| 地図・3D | Mapbox GL JS v3 | CDN |
| 経路・車線 | Mapbox Directions API | fetch |
| 検索 | Mapbox Geocoding API | fetch |
| 幾何計算 | Turf.js | CDN |
| 現在地 | Geolocation API | ブラウザ標準 |
| 音声 | SpeechSynthesis API | ブラウザ標準 |
| 画面消灯防止 | Screen Wake Lock API | ブラウザ標準 |
| 公開 | GitHub Pages | — |

**npm・ビルドツール・バンドラは使わない。** 素の ES Modules（`<script type="module">`）で書く。理由：ビルド不要にすることで、GitHubにpushするだけで即iPhoneで確認でき、開発サイクルが最短になるため。

Mapbox GL JS のバージョンは実装時に最新安定版を確認すること。

## アクセストークンの扱い（厳守）

- **公開トークン（`pk.`）のみ使用。** Mapbox管理画面で **URL制限**を `https://<ユーザー名>.github.io/*` に設定する。
- **`sk.` で始まる秘密トークンは絶対にコードに書かない。**
- トークンは `js/config.js` に1か所だけ書き、README に「自分のトークンに差し替える」手順を記載する。
- リポジトリは Public でよい（URL制限があるため安全）。

## ディレクトリ構成

```
jibun-navi-base/
├─ index.html
├─ settings.html            ← 設定画面（しきい値の変更・保存前後で検証）
├─ stats.html                ← 走行ログ集計画面
├─ manifest.json
├─ css/
│   └─ style.css
├─ js/
│   ├─ config.js            ← トークン・定数（SETTINGS_SCHEMAで範囲・整合性を検証）
│   ├─ main.js              ← 起動・全体の配線
│   ├─ core/                ← ★依存ゼロ。将来Android移植時もそのまま使う（純粋関数のみ）
│   │   ├─ models.js        ← データ型の定義とファクトリ、pickTargetRoad（advice.targetRoadに対応する道路を選ぶ唯一の判定元、Phase2A）
│   │   ├─ smartLane.js     ← 中核ロジック
│   │   ├─ phrase.js        ← 日本語文言の生成
│   │   ├─ compare.js       ← Mapbox推奨との比較
│   │   ├─ formatNavigation.js      ← 距離・時間・ETA・道路名ラベルの表示フォーマット（Phase2A）
│   │   ├─ arrivalJudge.js          ← 到着の瞬間判定（Phase2A）
│   │   ├─ voiceDecision.js         ← 標準音声案内の発話タイミング・文言（Phase2A。しきい値は一番近いものだけ発話し、通過済みの遠い段階はconsumedKeysで無音消費する）
│   │   └─ connectivityMessages.js  ← 通信/GPS/地図エラーの日本語メッセージ（Phase2A）
│   ├─ platform/            ← 外部APIに依存する層
│   │   ├─ directions.js    ← Directions API 呼び出し + 正規化
│   │   ├─ geocoding.js     ← 目的地検索（Search Box API）
│   │   ├─ speechInput.js   ← 音声検索（Web Speech API、非対応時はテキスト検索が独立して動く）
│   │   ├─ location.js      ← Geolocation + Wake Lock
│   │   ├─ mapView.js       ← Mapbox GL JS のラッパ
│   │   └─ voice.js         ← 音声案内（speak/cancelSpeech）
│   ├─ nav/                 ← ナビ進行の自前実装（状態管理。DOM非依存）
│   │   ├─ routeTracker.js  ← 自車位置→ルート上の位置・残距離・現在step
│   │   ├─ rerouter.js      ← 逸脱検知
│   │   ├─ navSession.js    ← ナビ開始の状態遷移（idle/loading/active、二重起動防止）
│   │   ├─ navGuard.js      ← ナビ開始可否の判定
│   │   ├─ arrivalTracker.js       ← 到着継続時間の管理（Phase2A）
│   │   ├─ navigationProgress.js   ← 残り距離・残り時間の管理（Phase2A）
│   │   ├─ voiceScheduler.js       ← 音声案内の発話タイミング管理（Phase2A）
│   │   └─ apiRetryPolicy.js       ← 再ルートAPIの再試行回数制限（Phase2A）
│   ├─ ui/
│   │   ├─ debugPanel.js
│   │   ├─ laneView.js            ← DEBUGパネル用の車線矢印描画
│   │   ├─ destResultsView.js     ← 検索候補一覧の描画（お気に入り★ボタンはonToggleFavorite指定時のみ表示、後方互換）
│   │   ├─ navigationPanel.js     ← 実走用ナビ案内パネルの描画（Phase2A）
│   │   ├─ maneuverIcon.js        ← 自作の方向アイコン（Phase2A、未知の組み合わせはstraightへ安全フォールバック）
│   │   └─ smartLaneGuide.js      ← 実走用パネルのSmartLane表示（Confidenceごとの表示切替、Phase2A）
│   └─ log/
│       ├─ driveLog.js             ← 走行ログの記録とエクスポート
│       └─ destinationHistory.js   ← 目的地の検索履歴・お気に入り（localStorageのみ、外部送信なし）
├─ tests/
│   ├─ fixtures/*.json      ← SmartLaneのテストケース
│   ├─ smartLane.test.html  ← SmartLane本体のテスト（全20ケース）
│   └─ appLogic.test.html   ← 設定検証・ナビ状態遷移・XSS安全性・Phase2A（114ケース）
└─ README.md
```

**設計上の絶対ルール**：`js/core/` の中では Mapbox も Turf も DOM も一切使わない。純粋なJavaScriptの関数だけにする。理由：ここをそのまま Kotlin に写せば、将来ネイティブAndroid版を作るときに同じ挙動を保証できるため。

## SmartLane 安全原則（最上位ルール・厳守）

以下の8原則は他のあらゆる仕様に優先する。実装で迷ったら必ずここに戻ること。

1. **取得できない車線情報を推測で補完しない**
2. **`isValid === false` の車線は絶対に推奨しない**
3. **GPS精度が悪い場合は独自車線案内を抑制する**
4. **直前の無理な車線変更を促さない**
5. **Confidenceが LOW / UNKNOWN の場合は独自車線音声案内を出さない**
6. **Mapbox標準案内を常にフォールバックとして残す**
7. **SmartLaneは「最短ルート」ではなく「安全かつ次の操作につながりやすい車線」を選ぶ**
8. **データ不足時は、案内しないことを正解とする**

補足：日本の道路では `lanes` が存在しない交差点が多い（OSMデータ依存）。データが無い・判断できない場合は Confidence を LOW/UNKNOWN とし、独自案内を抑制して「右折してください」等の標準案内だけを出す。誤った車線案内は事故につながる。

### 特に間違えやすい2点

**(1) 曲がった先の推奨車線でも `isValid` を必ず先に絞る**

「次々が左折だから物理的な一番左（index 0）」という判定は**禁止**。
`nextRoad.lanes` から `isValid === true` の車線を抽出し、**その候補の中で**最も左を選ぶ。左端がルート継続不可なら「左から2番目」が正解になる。

**(2) GPS精度による停止**

`gpsAccuracy`（メートル）で独自案内を制御する。しきい値は `js/config.js` の定数にする。

| gpsAccuracy | 扱い |
|---|---|
| 15m以下 | 通常判定 |
| 15m超〜30m以下 | Confidenceを1段階下げる |
| 30m超 または 取得不可(null) | **独自車線案内を停止**（low / unknown） |

## Mapbox APIの呼び出しルール（課金事故の防止）

Directions API を呼んでよいのは次の場合だけ：

1. ナビ開始時（1回）
2. ルート逸脱を検知した時（**最短10秒間隔の制限を必ず実装する**）

**位置更新のたびに呼ぶ実装は絶対に禁止。** 1秒に1回呼ぶと1時間で3,600回、無料枠を数十時間で使い切ります。

Geocoding（検索）も、入力1文字ごとに呼ばない。検索ボタンを押した時のみ。

## iOS Safari 固有の実装ポイント

1. **音声の解禁**：iOS Safariはユーザー操作起点でないと発話しない。「ナビ開始」ボタンのクリックハンドラ内で、一度空の `SpeechSynthesisUtterance('')` を発話して解禁する。
2. **画面消灯防止**：`navigator.wakeLock.request('screen')` を使う。画面復帰時に再取得する処理も入れる（visibilitychangeイベント）。
3. **HTTPS必須**：GitHub Pagesなら問題なし。ローカル確認は `localhost` なら可。
4. **横画面対応**：AIBOXが横画面のため、最初から横画面レイアウトを主とする。

## Phase 1 の完了条件

`02_Phase1実装計画.md` を参照。要点：

1. iPhoneで目的地を設定してナビが動く
2. 車線データの有無・GPS精度が画面で判別できる
3. 走行ログがJSONで保存・エクスポートできる（`roadClass` `testRouteId` `gpsAccuracy` `mapboxRecommendedLanes` `smartLaneRecommendedLanes` `recommendationMatched` `gpsDowngraded` を含む）
4. SmartLane が Confidence 付きで動作し、**全20テストケース**を通過する
5. 集計画面で「全体／道路種別別／テストルート別／Mapboxとの一致状況」が確認できる

**Phase 2へ進むかの判定はパターンA/B/Cの3段階**で行う（詳細は実装計画を参照）。
取得率30%未満でも即終了ではなく、道路種別を限定してSmartLaneを有効化する道（パターンB）がある。
そのため、**`roadClass` によってSmartLaneの有効/無効を切り替えられる構造**にしておくこと。

**Phase 1 は測定装置であって、使いやすいナビではない。** UIの作り込みに時間をかけないこと。
