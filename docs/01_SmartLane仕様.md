# じぶんNaviベース SmartLaneRecommendation 仕様（Webアプリ版・改訂2）

このアプリの中核。**「次の次まで考えて、今どの車線を走るべきか」**を決めるモジュール。

`js/core/smartLane.js` に実装する。**Mapbox・Turf・DOM に一切依存しない純粋なJavaScript関数**として書くこと。将来Androidネイティブ版を作るとき、そのままKotlinへ写せるようにするため。

---

## 0. SmartLane 安全原則（最上位ルール）

以下の8原則は、他のあらゆる仕様に優先する。実装で迷ったら必ずこの原則に戻ること。

1. **取得できない車線情報を推測で補完しない**
2. **`isValid === false` の車線は絶対に推奨しない**
3. **GPS精度が悪い場合は独自車線案内を抑制する**
4. **直前の無理な車線変更を促さない**
5. **Confidenceが LOW / UNKNOWN の場合は独自車線音声案内を出さない**
6. **Mapbox標準案内を常にフォールバックとして残す**
7. **SmartLaneは「最短ルート」ではなく「安全かつ次の操作につながりやすい車線」を選ぶ**
8. **データ不足時は、案内しないことを正解とする**

---

## 1. データ型

JavaScriptなのでプレーンなオブジェクトで表現する。`js/core/models.js` にファクトリ関数を置く。

### LaneInfo（1車線ぶん）

```js
{
  indications: ["left", "straight"],  // この車線から行ける方向
  isValid: true,      // この車線でルートを継続できるか（最重要）
  isActive: true      // Mapboxが推奨しているか
}
```

方向の値：`"left" | "slightLeft" | "straight" | "slightRight" | "right" | "uturn" | "none"`

**車線配列は必ず左から右の順。index 0 が一番左。**

### RoadSnapshot（ある道路の状態）

```js
{
  name: "国道4号",
  lanes: [LaneInfo, ...] | null,   // null = 車線データ取得不可
  laneCount: 4 | null,
  roadClass: "motorway" | "trunk" | "primary" | "secondary" | "street" | "unknown"
}
```

### ManeuverInfo

```js
{
  type: "turn" | "fork" | "merge" | "on ramp" | "off ramp" | "roundabout" | "arrive",
  modifier: "left" | "slight left" | "straight" | "slight right" | "right" | "uturn" | null,
  isJunction: false
}
```

### 入力（SmartLaneInput）

```js
{
  currentRoad,          // RoadSnapshot
  currentManeuver,      // ManeuverInfo
  distanceToCurrent,    // 次の曲がり角までの距離(m)
  nextRoad,             // RoadSnapshot | null（曲がった先の道路）
  followingManeuver,    // ManeuverInfo | null（次々の曲がり方）
  distanceToFollowing,  // 曲がってから次の曲がり角までの距離(m) | null
  currentSpeed,         // m/s
  gpsAccuracy           // ★追加：GPS精度(m)。取得不可なら null
}
```

### 出力（SmartLaneAdvice）

```js
{
  recommendedLanes: [1],        // 推奨車線のindex（左から0）。複数可
  phrase: "左から2番目の車線がおすすめです",
  reason: "右折後500mで左折。左端はルート継続不可のため左から2番目",
  confidence: "high" | "medium" | "low" | "unknown",
  targetRoad: "current" | "next",
  gpsDowngraded: false          // ★追加：GPS精度でConfidenceを下げたか
}
```

---

## 2. GPS精度による安全判定（★追加）

トンネル・高架下・GPS飛びで現在位置の信頼性が低いとき、誤った車線変更を促さないための仕組み。

**判定はステップ0の直後、他のどの判定よりも先に行う。**

| gpsAccuracy | 扱い |
|---|---|
| 15m 以下 | 通常判定 |
| 15m 超 〜 30m 以下 | **Confidenceを1段階下げる**（high→medium、medium→low） |
| 30m 超 | **独自車線案内を停止。** `confidence` は `"low"` または `"unknown"`、標準の右左折案内のみ |
| `null`（取得不可） | **安全側に倒す。** 30m超と同じ扱い |

閾値は Phase 1 の実走結果を見て調整するため、**必ず `js/config.js` の定数として分離する**。

```js
// js/config.js
export const GPS_ACCURACY = {
  GOOD: 15,      // これ以下は通常判定
  DEGRADED: 30   // これを超えたら独自案内を停止
};
```

`gpsDowngraded: true` を出力に含め、走行ログで「GPS精度が原因で案内を止めた回数」を後から集計できるようにする。

---

## 3. 判定アルゴリズム

### ステップ0：データ有無の確認（最初に必ず実行）

- `currentRoad.lanes` が `null` または空 → **即座に `confidence: "unknown"` を返して終了**
- 車線数が1 → 案内不要。`"unknown"` を返す

### ステップ0.5：GPS精度チェック（★追加）

上の「2. GPS精度による安全判定」を適用する。30m超・null なら**ここで独自案内を打ち切る**。

### ステップ1：現在道路で実行可能な車線を絞る

`isValid === true` の車線だけを候補にする。候補が0件なら `"unknown"`。

**`isValid === false` の車線は、どんな理由があっても候補に含めない（安全原則2）。**

### ステップ2：次の次を見て、寄せる方向を決める

「曲がった後、次にどちら側へ行きたいか」で、候補のどちら端を選ぶかが決まる。

| 次々の曲がり方 | 寄せる側 |
|---|---|
| left / slight left | 候補の中で**最も左** |
| right / slight right | 候補の中で**最も右** |
| straight / なし | **`isActive` を優先**。なければ中央寄り |
| off ramp（高速出口） | 候補の中で**最も左**（日本は左側通行） |
| on ramp（高速入口） | 候補の中で**最も左** |

**日本は左側通行。** 海外のサンプルコードは右側通行前提のものが多いので流用しないこと。

### ステップ3：曲がった先の推奨車線（★重要な修正）

`nextRoad.lanes` が取得できている場合のみ実行する。

**手順（この順序を厳守）**

1. **まず `nextRoad.lanes` から `isValid === true` の車線だけを抽出する**
2. 抽出できた候補が0件なら、曲がった先の案内は**出さない**（`targetRoad: "current"` のみ）
3. **その候補の中から**、次々の曲がり方に応じて選ぶ
   - left / slight left → 候補の中で**最も左**
   - right / slight right → 候補の中で**最も右**
   - straight / 不明 → **`isActive` を優先**、なければ中央寄り
4. `targetRoad: "next"` として出力する

**禁止事項**：
「次々が左折だから物理的な一番左（index 0）」という判定は**禁止**する。左端がルート継続不可の場合があるため。

**具体例**

```
右折後の道路が4車線
  index 0（左端）  : isValid = false  ← 左折専用だがルート上は通れない
  index 1          : isValid = true
  index 2          : isValid = true
  index 3          : isValid = false
次々のmaneuver = 左折
```

→ 候補は index 1, 2。そのうち最も左は **index 1**
→ 「**右折後は左から2番目の車線がおすすめです**」

`nextRoad.lanes` が `null` の場合は、曲がった先の案内は出さない。

### ステップ4：車線変更の余裕を確認

必要な車線変更数 × 1回あたり所要距離 を見積もり、距離と比較する。

- 目安：1回の車線変更に約 `3秒 × 現在速度` の距離が必要
- 例：時速60km（16.7m/s）で2車線分 → 約100m必要
- **やや不足**：Confidenceを1段階下げる
- **極端に不足**（必要距離の半分未満）：**独自案内を出さない**

この係数も `js/config.js` の定数にする。

```js
export const LANE_CHANGE = {
  SECONDS_PER_CHANGE: 3.0,
  CRITICAL_RATIO: 0.5   // 必要距離のこの割合を下回ったら案内しない
};
```

### ステップ5：Confidence の決定

| Confidence | 条件 | 出力の扱い |
|---|---|---|
| **high** | 現在・次の車線データが揃い、次々の曲がり方も判明、車線変更距離も足り、GPS精度15m以下 | 具体的な1車線を強調表示＋音声 |
| **medium** | 車線データはあるが次々が不明／車線変更距離がやや不足／GPS精度15〜30m | 「左側車線がおすすめ」など**幅のある**案内 |
| **low** | `isActive` はあるが `indications` が乏しい／GPS精度30m超 | **独自案内を出さない。**車線表示のみ |
| **unknown** | 車線データ無し／有効車線0件／GPS精度取得不可 | **独自案内を出さない。**標準案内のみ |

---

## 4. 文言生成（`js/core/phrase.js`）

推奨車線のindexと車線数から日本語を作る。表示・音声で共通に使う。

| 条件 | 文言 |
|---|---|
| 1車線・index 0 | 一番左の車線がおすすめです |
| 1車線・左から2番目 | 左から2番目の車線がおすすめです |
| 1車線・右端 | 一番右の車線がおすすめです |
| 1車線・右から2番目 | 右から2番目の車線がおすすめです |
| 複数・左寄り | 左側2車線がおすすめです |
| 複数・右寄り | 右側2車線がおすすめです |
| 中央のみ | 中央車線がおすすめです |
| 曲がった先の案内 | 先頭に「右折後は」「左折後は」を付ける |
| JCT | この先JCTがあるので左側車線がおすすめです |
| 高速出口 | 2km先の出口に備えて左車線がおすすめです |

「左から2番目」と「右から3番目」のように同じ車線を2通りで言えるときは、**数が小さい方**を使う（人が数えやすいため）。

---

## 5. 音声案内の制御（`js/platform/voice.js`）

- 標準案内と車線案内を**1文にまとめる**：「300メートル先を右折です。右折後は左から2番目の車線がおすすめです」
- 1つの曲がり角につき独自車線案内は**最大2回**（遠方で1回、直前で1回）
- **Confidence が low / unknown のときは車線案内を発話しない**（安全原則5）
- GPS精度による停止時も同様に発話しない
- 高速走行中は距離ではなく**到達秒数**で発話タイミングを判断する
- `SpeechSynthesisUtterance` の `lang` は `"ja-JP"`、`rate` は 1.0〜1.1

**iOS Safari対策**：ナビ開始ボタンのクリックハンドラ内で一度 `speechSynthesis.speak(new SpeechSynthesisUtterance(''))` を実行して音声を解禁する。これをしないと走行中に一切喋りません。

---

## 6. Mapbox推奨との比較（★追加）

Phase 1 で「SmartLaneがMapbox標準とどれだけ違う判断をするか」を測るため、比較結果を毎回算出する。

`js/core/compare.js` に純粋関数として実装する。

**入力**
- `mapboxRecommendedLanes` … `isActive === true` の車線indexの配列
- `smartLaneRecommendedLanes` … SmartLaneの推奨index配列

**出力（`recommendationMatched`）**

| 値 | 条件 |
|---|---|
| `"exact"` | 2つの集合が完全に一致 |
| `"partial"` | 共通要素があるが完全一致ではない |
| `"different"` | 共通要素がまったくない |
| `"unavailable"` | どちらかが空・取得不可（`isActive` が全て false / SmartLaneが案内なし） |

この判定は Confidence とは独立に、比較可能な限り毎回記録する。

---

## 7. テストケース（`tests/smartLane.test.html`）

`tests/fixtures/*.json` に入出力のペアを置き、ブラウザで開くだけで結果が出るテストページを作る。npmもテストフレームワークも使わない。

### 基本ケース（1〜10）

| # | 内容 | 期待結果 |
|---|---|---|
| 1 | 車線データ無し | unknown |
| 2 | 1車線のみ | 案内なし |
| 3 | 右折後すぐ左折・4車線・全車線valid | 一番左を推奨・high |
| 4 | 左折後しばらく直進 | medium（幅のある案内） |
| 5 | 次々の曲がり方が不明 | medium |
| 6 | 曲がった先の車線データのみ無し | 現在道路の案内だけ |
| 7 | 車線変更距離が足りない | Confidence降格 |
| 8 | 高速出口（左側通行） | 左端を推奨 |
| 9 | JCT分岐 | — |
| 10 | Uターン | — |

### 追加ケース（11〜20）★今回追加

| # | 内容 | 期待結果 |
|---|---|---|
| **11** | 右折後4車線、次々が左折。**左端は `isValid: false`** | 左端を除外し、**有効車線の中で最も左**（左から2番目）を推奨 |
| **12** | GPS精度 10m | 通常判定 |
| **13** | GPS精度 20m | Confidenceを1段階下げる（`gpsDowngraded: true`） |
| **14** | GPS精度 40m | 独自案内を停止。low または unknown |
| **15** | 5〜6車線道路で次々が右折 | 有効車線の中で右寄りを選択 |
| **16** | 現在道路に左折専用・直進専用が混在 | `isValid` を最優先し、不可能な車線を候補に含めない |
| **17** | Mapbox `isActive` とSmartLane推奨が一致 | `recommendationMatched: "exact"` |
| **18** | Mapbox `isActive` とSmartLane推奨が異なる | `recommendationMatched: "different"` |
| **19** | Mapbox側の `active` 情報なし | `recommendationMatched: "unavailable"` |
| **20** | 交差点間距離が非常に短く車線変更距離が不足 | Confidence降格。極端に不足する場合は独自案内を出さない |

**追加で確認したい観点**：Case 12〜14 は同じ道路条件で gpsAccuracy だけを変えたケースにすること。GPS精度の影響だけを切り分けて確認できるため。

このJSONは、将来Androidネイティブ版を作るときにもそのまま使えます。同じ入力で同じ出力になれば移植成功と判断できます。
