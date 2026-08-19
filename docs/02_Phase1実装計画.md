# じぶんNaviベース Phase 1 実装計画 — 車線データ検証Webアプリ（改訂2）

**目的：完成度の高いナビを作ることではなく、「日本の道路で、次の次まで考えた車線案内が本当に成立するかを測定すること」。**

環境：Windows PCで開発 → GitHubにpush → iPhone Safariで開いて実走テスト

---

## 画面イメージ（横画面）

```
┌──────────────────────────────────────────────┐
│ [目的地を検索   ][ナビ開始][3D][DEBUG][ルート▼]│
├─────────────────────┬────────────────────────┤
│                     │ GPS  39.286xx 141.087xx│
│                     │ 精度 5.0 m  ← 色分け    │
│     地図（3D）       │ 速度 42 km/h           │
│                     │ 道路種別 primary       │
│        🚗           │ 現在道路 ○○通り        │
│                     │ 車線数 4               │
│                     │ 車線  ← ↑ ↑ ↗          │
│                     │ MB推奨 [2]             │
│                     │ SL推奨 [1]  一致:違い  │
│                     │ 次   RIGHT  300m       │
│                     │ 次々 LEFT   500m       │
│                     │ 次の道路 車線数 3      │
│                     │ 信頼度 HIGH            │
│                     │ 取得不可 —             │
├─────────────────────┴────────────────────────┤
│ 300m先 右折 ／ ★右折後は左から2番目がおすすめ │
└──────────────────────────────────────────────┘
```

- GPS精度は色分け（15m以下＝緑／30m以下＝黄／それ超＝赤）
- 「ルート▼」で走行前に `testRouteId` を選ぶ（後述）
- DEBUGボタンで右パネルをON/OFF

---

## 実装手順

### Step 1：土台とトークン設定
- GitHubに新規リポジトリ作成（Public）、GitHub Pages有効化
- `index.html` を作り、Mapbox GL JS と Turf.js をCDNで読み込む
- `js/config.js` にトークンと**各種しきい値定数**を書く
- **Mapbox管理画面で pk トークンにURL制限をかける**（`https://<ユーザー名>.github.io/*`）
- `README.md` にトークン設定手順を記載
- **確認**：iPhoneのSafariで開いて地図が表示される

### Step 2：地図と現在地（3D）
- Standardスタイルで3D建物・3D地形を表示、`pitch` を60前後に
- **3D ON/OFF のトグルを最初から実装**（AIBOXの性能対策で必ず必要になる）
- 昼モード／夜モード（ライティング切替）
- `navigator.geolocation.watchPosition` で現在地追従（`enableHighAccuracy: true`）
- **`position.coords.accuracy` を必ず保持する**（SmartLaneの安全判定に使うため）
- ピンチ拡大縮小・ドラッグ・現在地に戻るボタン
- 地図操作から10秒程度操作がなければ自動で追従に戻る
- **確認**：iPhone実機で現在地とGPS精度が表示される

### Step 3：画面消灯防止と音声の解禁
- `navigator.wakeLock.request('screen')` を実装。`visibilitychange` で再取得
- 「ナビ開始」ボタン内で空の発話を実行して音声を解禁
- **確認**：iPhoneで画面が消えないこと、音声が鳴ることを実機で検証
- **ここが動かないと実走テストが成立しないため、先に確認する**

### Step 4：Core層のデータ型
- `js/core/models.js` に `LaneInfo` `RoadSnapshot` `ManeuverInfo` などのファクトリ関数
- `SmartLaneInput` に **`gpsAccuracy`** を含めること
- **Mapbox・Turf・DOM を一切使わないこと**

### Step 5：Directions API と正規化
- `js/platform/directions.js`
- パラメータ：`steps=true`、`overview=full`、`geometries=geojson`、`language=ja`、`voice_instructions=true`、`banner_instructions=true`
- レスポンスを Core のデータ型に変換
- **`roadClass` を必ず取り出す**（`intersections[].classes` や step の情報から。取れなければ `"unknown"`）
- **次のstepを先読みして「曲がった先の道路・車線・次々の曲がり方」を取り出す**
- **データが無い場合は必ず `null` にする。0や空配列で誤魔化さない**

### Step 6：routeTracker（自前のナビ進行管理）
- `js/nav/routeTracker.js`
- Turf.js の `nearestPointOnLine` で現在地をルート上に吸着
- 進行距離から「今どのstepか」「次の曲がり角まで何m」を算出
- ルートから40m以上離れた状態が3秒続いたら逸脱と判定
- **確認**：地図上で自車位置がルートに沿って動く

### Step 7：SmartLaneRecommendation と比較モジュール
- `js/core/smartLane.js` を `01_SmartLane仕様.md` のとおり実装
- **安全原則8項目を必ず満たすこと**
- **曲がった先の推奨でも `isValid` を必ず先に絞ること**
- **GPS精度による停止・降格を実装すること**
- `js/core/compare.js` に Mapbox推奨との比較（exact / partial / different / unavailable）を実装
- `tests/fixtures/*.json`（**全20ケース**）と `tests/smartLane.test.html` を作る
- **確認**：全20ケースが通る

### Step 8：デバッグ表示と車線描画
- 右パネルに全項目を表示
- 車線は矢印（← ↑ ↗ →）で描画。推奨車線に ★ を付ける
- **`isValid: false` の車線はグレーアウトする**（見た目でも安全原則が分かるように）
- **Mapbox推奨とSmartLane推奨を並べて表示し、一致状況も出す**
- **取得できなかった項目は「取得不可」と赤で明示**

### Step 9：目的地検索と再ルート
- Geocoding APIで住所・施設名検索（**検索ボタンを押した時のみ呼ぶ**）
- 逸脱検知でDirections APIを再呼び出し（**最短10秒間隔の制限を必ず入れる**）
- **確認**：わざとルートを外れて再検索が走ること

### Step 10：走行ログ
- `js/log/driveLog.js`。localStorage に保存し、JSONファイルとしてダウンロード可能に
- **記録頻度：毎秒ではなく「交差点通過時＋10秒ごと」**
- 記録項目（★が今回追加）：

```js
{
  timestamp, testRouteId,            // ★ testRouteId
  lat, lon, gpsAccuracy, speed,      // ★ gpsAccuracy
  roadName, roadClass,               // ★ roadClass
  laneCount, lanesRaw,
  mapboxRecommendedLanes,            // ★
  smartLaneRecommendedLanes,         // ★
  recommendationMatched,             // ★ exact/partial/different/unavailable
  nextManeuver, distanceToNext,
  followingManeuver, distanceToFollowing,
  nextRoadName, nextRoadLaneCount, nextRoadLanesRaw,
  confidence, reason,
  gpsDowngraded,                     // ★ GPS精度でConfidenceを下げたか
  missingFields[]
}
```

- **`testRouteId`** は走行前に画面のプルダウンで選ぶ。値：
  `"kitakami_city"` / `"kitakami_kamaishi"` / `"tohoku_expressway"` / `"morioka_city"` / `"other"`

### Step 11：集計画面（★大幅拡張）

走行後に以下を表示する。

**(A) 全体集計**
- 通過交差点数／車線データ取得数／取得率
- Confidence別（HIGH / MEDIUM / LOW / UNKNOWN）の件数と割合
- GPS精度による案内停止・降格の件数

**(B) 道路種別ごとの集計**

`motorway` / `trunk` / `primary` / `secondary` / `street` / `unknown` の6区分で、それぞれ：

| 項目 |
|---|
| 通過交差点数 |
| 車線データ取得数 |
| 車線データ取得率 |
| Confidence HIGH数 |
| HIGH率 |
| MEDIUM率 |
| LOW率 |
| UNKNOWN率 |

**(C) テストルートごとの集計**

`testRouteId` の5区分で、(B)と同じ項目を集計する。

**(D) Mapbox推奨との一致状況**

| 項目 |
|---|
| 完全一致率（exact） |
| 一部一致率（partial） |
| 不一致率（different） |
| 比較不能率（unavailable） |

道路種別ごとにも出せるようにする。

**(E) 不一致ケースの一覧**

`recommendationMatched` が `"different"` のログを一覧表示し、
「Mapboxは右から2番目、SmartLaneは左端寄り」といったケースを後から個別に確認できるようにする。
最低限、日時・道路名・道路種別・両方の推奨index・SmartLaneの `reason` を表示する。

---

## テスト走行の進め方

**安全のため、記録は自動ログに任せて運転に専念してください。** デバッグ画面を注視しないこと。

| testRouteId | ルート | 見るポイント |
|---|---|---|
| `kitakami_city` | 北上市内の幹線道路 | 地方一般道 |
| `kitakami_kamaishi` | 北上〜釜石（国道283号など） | 郊外の国道 |
| `tohoku_expressway` | 東北自動車道 | 高速のJCT・IC |
| `morioka_city` | 盛岡市内 | 都市部の交差点 |

走行前に必ずプルダウンで `testRouteId` を選んでからナビを開始してください。選び忘れると `"other"` として記録されます。

事前に、自宅周辺で「画面が消えないか」「音声が鳴るか」「電池と発熱が耐えられるか」を短時間で確認してから本走行に出てください。

---

## Phase 1 完了判定（★改訂）

### 完了チェック

- [ ] iPhone Safariで目的地設定→ナビ開始→到着まで動く
- [ ] 画面が消えず、音声が鳴る
- [ ] 車線データの有無・GPS精度が画面で判別できる
- [ ] 走行ログがJSONで取れる（道路種別・testRouteId・比較結果を含む）
- [ ] SmartLane が全20テストケースを通過する
- [ ] 集計画面で全体／道路種別／ルート／一致状況が確認できる
- [ ] 上記4ルートの実走完了

### 参考基準（従来のもの。目安として残す）

- 車線データ取得率 **30%以上**
- そのうち Confidence HIGH 率 **50%以上**

**この数値だけで打ち切り判断はしない。** 地方一般道が低くても、高速・国道で使えるなら価値があるため。

### 最終判定は次の8項目を合わせて行う

1. 全体取得率
2. **道路種別別の取得率**
3. HIGH率
4. **Mapboxとの一致・不一致の傾向**
5. **GPS精度による影響の大きさ**
6. 高速道路での実用性
7. 市街地での実用性
8. 地方一般道での実用性

### 判定結果は3パターン

| パターン | 状況 | 次の方針 |
|---|---|---|
| **A** | 全道路種別で十分に取得できる | **SmartLaneを全面採用**してPhase 2へ |
| **B** | 高速・国道・主要道路では十分、地方道では不足 | **対象道路を限定してSmartLaneを有効化**してPhase 2へ（`roadClass` で有効/無効を切り替える設計にする） |
| **C** | ほぼ取得できない | **SmartLane方式そのものを再検討。** 別データソースの調査、または機能の位置づけ変更を相談する |

**パターンBの場合でも、Phase 2 には進みます。** SmartLaneを主要道路だけで有効化し、それ以外はMapbox標準案内にフォールバックする形にすれば、実用的なナビになるためです。

---

## この段階でやらないこと

- 凝ったUI・アニメーション
- ハイウェイモード
- お気に入り・履歴・経由地
- 渋滞・料金・オービス
- オフライン対応

Phase 1 は測定装置です。作り込みはPhase 2以降。

---

## Phase 2 アイデアメモ（2026-08-19追加）

実走テストの前にUIを大きく作り込むとレイアウト変更のリスクが上がるため、
Phase 1では着手せず、実走結果を見たあとのPhase 2で検討する。

- **全画面地図＋フローティングUI**：実際のカーナビのように地図を全画面表示し、検索バーや操作ボタンを地図の上に浮かせるレイアウトに変更する（現在のトップバー＋固定デバッグパネル構成からの作り直し）
- **設定画面**：GPS精度しきい値・車線変更係数など`js/config.js`の定数や、ナビの基本設定を画面から変更できるようにする
- **音声検索**：目的地入力を音声入力（Web Speech API の SpeechRecognition）でもできるようにする
