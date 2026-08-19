/**
 * config.js — トークンと各種しきい値
 *
 * ★このファイルの MAPBOX_TOKEN を自分のトークンに書き換えてください。
 * ★必ず pk. で始まる公開トークンを使い、Mapbox管理画面でURL制限をかけてください。
 *   sk. で始まる秘密トークンは絶対にここへ書かないでください。
 */

// ============================================================
// Mapbox
// ============================================================
export const MAPBOX_TOKEN = 'pk.eyJ1Ijoia29uY2hhbjA1MTkiLCJhIjoiY21zemQ3a21rMDNwOTJ5cHd5MW8yYzBwbCJ9.DvNeszP-qNtMpk0XQqa97w';

export const MAP_STYLE = 'mapbox://styles/mapbox/standard';

export const MAP_DEFAULT = {
  center: [141.113, 39.286],  // 北上市付近（位置情報取得までの仮の中心）
  zoom: 15,
  pitch: 60,                  // 3D表示の傾き
  bearing: 0
};

// ============================================================
// GPS精度による安全判定（01_SmartLane仕様.md 第2章）
// Phase 1 の実走結果を見て調整する前提の値です。
// ============================================================
export const GPS_ACCURACY = {
  GOOD: 15,      // これ以下(m)は通常判定
  DEGRADED: 30   // これを超えたら独自車線案内を停止
};

// ============================================================
// 車線変更に必要な距離の見積り
// ============================================================
export const LANE_CHANGE = {
  SECONDS_PER_CHANGE: 3.0,  // 1回の車線変更にかかる秒数
  CRITICAL_RATIO: 0.5       // 必要距離のこの割合を下回ったら独自案内を出さない
};

// ============================================================
// ルート逸脱と再検索
// APIの呼びすぎ（＝課金事故）を防ぐための制限値です。
// ============================================================
export const REROUTE = {
  OFF_ROUTE_METERS: 40,       // ルートからこれ以上離れたら逸脱候補
  OFF_ROUTE_SECONDS: 3,       // 逸脱状態がこの秒数続いたら再検索
  MIN_INTERVAL_SECONDS: 10    // 再検索の最短間隔（必ず守ること）
};

// ============================================================
// 走行ログ
// ============================================================
export const LOG = {
  INTERVAL_SECONDS: 10,       // 定期記録の間隔（交差点通過時は別途記録）
  STORAGE_KEY: 'jibunnavi_base_drivelog_v1'
};

// ============================================================
// 集計に使う区分
// ============================================================
export const ROAD_CLASSES = [
  'motorway', 'trunk', 'primary', 'secondary', 'street', 'unknown'
];

// ============================================================
// SmartLaneの道路種別ごとの有効/無効（Phase 2判定パターンBへの準備）
// Phase 1の実走結果（stats.htmlの取得率・HIGH率）を見てから値を調整する。
// 例：地方一般道の取得率が低ければ street: false にして、
//     高速・国道だけSmartLaneを有効化しMapbox標準案内にフォールバックする。
// ============================================================
export const SMART_LANE_ENABLED_ROAD_CLASSES = {
  motorway: true,
  trunk: true,
  primary: true,
  secondary: true,
  street: true,
  unknown: true
};

export const TEST_ROUTES = [
  'kitakami_city', 'kitakami_kamaishi', 'tono_city', 'tohoku_expressway', 'morioka_city', 'other'
];

// ============================================================
// 地図追従
// ============================================================
export const MAP_FOLLOW = {
  RESUME_AFTER_SECONDS: 10,   // 地図操作後、この秒数で自動追従に戻る
  ZOOM: 17,
  PITCH_3D: 60,
  PITCH_2D: 0,
  EASE_DURATION_MS: 800
};

// ============================================================
// 3D地形
// ============================================================
export const TERRAIN = {
  EXAGGERATION: 1.2
};

// ============================================================
// 設定画面（settings.html）の上書き値をここで反映する。
// 上のexport constはオブジェクトなので、中身だけをObject.assignで書き換える。
// こうすることで、他のファイルは今まで通り import して使うだけでよく、
// 設定画面のために各ファイルを書き換える必要が無くなる。
// 反映は「ページの読み込み時」のみ（設定画面で保存した後、ナビ画面を再読み込みする必要がある）。
// ============================================================
export const SETTINGS_STORAGE_KEY = 'jibunnavi_base_settings_v1';

export const SETTABLE_GROUPS = {
  GPS_ACCURACY, LANE_CHANGE, REROUTE, MAP_FOLLOW, TERRAIN, SMART_LANE_ENABLED_ROAD_CLASSES
};

// 各設定値の許容範囲。settings.html（保存前チェック）とここ（読み込み時チェック）の
// 両方で同じスキーマを使う。理由：localStorageは開発者ツール等から直接書き換えられる
// 可能性があるため、保存側だけでなく読み込み側でも必ず検証する。
// REROUTE.MIN_INTERVAL_SECONDSは、再ルート（Directions API呼び出し）の最短間隔なので
// 10未満を絶対に許可しない（課金事故防止）。
export const SETTINGS_SCHEMA = {
  GPS_ACCURACY: {
    GOOD: { type: 'number', min: 1 },
    DEGRADED: { type: 'number', min: 1 }
  },
  LANE_CHANGE: {
    SECONDS_PER_CHANGE: { type: 'number', min: 0.5 },
    CRITICAL_RATIO: { type: 'number', min: 0.1, max: 1 }
  },
  REROUTE: {
    OFF_ROUTE_METERS: { type: 'number', min: 5 },
    OFF_ROUTE_SECONDS: { type: 'number', min: 1 },
    MIN_INTERVAL_SECONDS: { type: 'number', min: 10 }
  },
  MAP_FOLLOW: {
    ZOOM: { type: 'number', min: 10, max: 20 },
    PITCH_3D: { type: 'number', min: 0, max: 85 },
    RESUME_AFTER_SECONDS: { type: 'number', min: 1 }
  },
  TERRAIN: {
    EXAGGERATION: { type: 'number', min: 1, max: 3 }
  },
  SMART_LANE_ENABLED_ROAD_CLASSES: {
    motorway: { type: 'boolean' },
    trunk: { type: 'boolean' },
    primary: { type: 'boolean' },
    secondary: { type: 'boolean' },
    street: { type: 'boolean' },
    unknown: { type: 'boolean' }
  }
};

/**
 * @param {string} group
 * @param {string} key
 * @param {unknown} rawValue
 * @returns {{valid:true, value:number|boolean} | {valid:false, error:string}}
 */
export function validateSettingValue(group, key, rawValue) {
  const rule = SETTINGS_SCHEMA[group]?.[key];
  if (!rule) return { valid: false, error: `未知の設定項目です（${group}.${key}）` };

  if (rule.type === 'boolean') {
    if (typeof rawValue !== 'boolean') return { valid: false, error: 'true/falseである必要があります' };
    return { valid: true, value: rawValue };
  }

  if (rawValue === '' || rawValue === null || rawValue === undefined) {
    return { valid: false, error: '未入力です' };
  }
  const num = typeof rawValue === 'number' ? rawValue : Number(rawValue);
  if (!Number.isFinite(num)) {
    return { valid: false, error: '有効な数値ではありません' };
  }
  if (rule.min !== undefined && num < rule.min) {
    return { valid: false, error: `${rule.min}以上にしてください` };
  }
  if (rule.max !== undefined && num > rule.max) {
    return { valid: false, error: `${rule.max}以下にしてください` };
  }
  return { valid: true, value: num };
}

try {
  const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (raw) {
    const overrides = JSON.parse(raw);
    Object.entries(overrides).forEach(([groupName, values]) => {
      if (!SETTABLE_GROUPS[groupName] || typeof values !== 'object' || values === null) return;
      Object.entries(values).forEach(([key, rawValue]) => {
        const result = validateSettingValue(groupName, key, rawValue);
        if (result.valid) {
          SETTABLE_GROUPS[groupName][key] = result.value;
        } else {
          console.warn(`設定値が不正なため無視しました（${groupName}.${key}）: ${result.error}`);
        }
      });
    });
  }
} catch (err) {
  console.warn('設定の読み込みに失敗、初期値を使います:', err.message);
}
