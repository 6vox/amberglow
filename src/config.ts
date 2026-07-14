/**
 * AMBERGLOW — 見た目調整用の主要パラメータ
 * 色・速度・ぼかし・透明度などはここを編集する。
 */

export type RGB = readonly [number, number, number]

/** 吹田市付近の緯度経度（日の入り計算用） */
export const LOCATION = {
  latitude: 34.7904,
  longitude: 135.5079,
  timezoneOffsetHours: 9,
} as const

/**
 * 時刻連動パレット（昼 / 夕方前 / 日没 / 夜）
 * 暖色ブロック / 寒色ブロック / ハイライト が分かれやすい並び。
 */
export const PALETTES = {
  day: [
    [90, 170, 195],
    [235, 240, 245],
    [120, 185, 130],
    [220, 200, 110],
  ] as const satisfies readonly RGB[],
  evening: [
    [230, 150, 70],
    [245, 210, 130],
    [200, 90, 45],
    [120, 150, 170],
  ] as const satisfies readonly RGB[],
  sunset: [
    [235, 80, 35],
    [245, 160, 50],
    [70, 110, 190],
    [200, 60, 120],
  ] as const satisfies readonly RGB[],
  night: [
    [40, 60, 130],
    [90, 45, 140],
    [20, 70, 65],
    [130, 35, 50],
  ] as const satisfies readonly RGB[],
} as const

export const PHASE_HOURS = {
  dayEnd: -2.5,
  eveningPeak: -1.0,
  sunsetPeak: 0.0,
  nightStart: 1.2,
} as const

/** 描画・動きのデフォルト */
export const VISUAL = {
  baseSpeed: 0.5,
  speedStep: 0.1,
  speedMin: 0.15,
  speedMax: 2.0,

  /** 模様スケール（大きいほど細かい） */
  patternScale: 2.1,
  /** マーブル歪み */
  warpStrength: 0.42,
  /** 大きめ色面のスケール */
  regionScale: 1.15,
  /** 油泡の密度 */
  bubbleScale: 9.5,
  /** 泡のコントラスト */
  bubbleContrast: 2.4,
  /** 中心付近の発光 */
  coreGain: 0.55,
  /** 液面の明るさ */
  liquidGain: 1.15,
  /**
   * 外周だけ床へ溶かす幅（UV 0–0.5 相当）。
   * ここだけグラデーションし、中央の模様はぼかさない。
   */
  edgeFade: 0.18,
  /** 外周での床の見え方 0–1 */
  floorEdgeMix: 0.92,
  /** 中央でもうっすら床を残す量 */
  floorCenterMix: 0.12,
  /** 床色 */
  floorColor: [56, 53, 50] as RGB,
  floorNoiseStrength: 0.15,

  layerOpacity: 1,
  blurPx: 0,
  trailFade: 0,
} as const

export type PaletteName = keyof typeof PALETTES
export type PaletteMode = PaletteName | 'auto'
