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

/** 時刻連動パレット（昼 / 夕方前 / 日没 / 夜） */
export const PALETTES = {
  day: [
    [180, 215, 230],
    [240, 245, 248],
    [190, 220, 195],
    [235, 225, 180],
  ] as const satisfies readonly RGB[],
  evening: [
    [220, 200, 170],
    [235, 185, 140],
    [210, 150, 80],
    [190, 130, 70],
  ] as const satisfies readonly RGB[],
  sunset: [
    [230, 120, 50],
    [210, 70, 45],
    [220, 110, 140],
    [140, 70, 160],
  ] as const satisfies readonly RGB[],
  night: [
    [25, 35, 70],
    [55, 40, 95],
    [20, 55, 45],
    [90, 25, 35],
  ] as const satisfies readonly RGB[],
} as const

/**
 * 日没基準のフェーズ境界（時間）。
 * sunsetOffsetHours = 現在時刻 − 日の入り時刻
 */
export const PHASE_HOURS = {
  /** これより前は昼 */
  dayEnd: -2.5,
  /** 夕方前の中心寄り */
  eveningPeak: -1.0,
  /** 日没ピーク */
  sunsetPeak: 0.0,
  /** 夜への移行完了 */
  nightStart: 1.2,
} as const

/** 描画・動きのデフォルト */
export const VISUAL = {
  /** 基本の時間進行速度（1 = 標準） */
  baseSpeed: 1,
  /** 速度キー操作の刻み */
  speedStep: 0.12,
  /** 速度の下限・上限 */
  speedMin: 0.25,
  speedMax: 2.5,

  /** レイヤー全体の透明度（コンクリート質感を残す） */
  layerOpacity: 0.42,
  /** フレーム間の残像（高いほどにじみやすい） */
  trailFade: 0.045,
  /** ソフトブラーの強さ（px） */
  blurPx: 28,

  /** 流れの本数 */
  flowCount: 9,
  /** にじみ斑点の数 */
  blotCount: 14,

  /** 流れの太さ（画面短辺に対する比率） */
  flowThicknessMin: 0.018,
  flowThicknessMax: 0.055,
  /** 斑点の大きさ */
  blotSizeMin: 0.04,
  blotSizeMax: 0.14,

  /** 動きの空間スケール */
  noiseScale: 0.0011,
  /** 流れの速度係数 */
  flowDrift: 0.18,
  /** 斑点の速度係数 */
  blotDrift: 0.09,

  /** コンクリートオーバーレイの強さ */
  concreteOpacity: 0.28,
  /** 床のベース色（コンクリート寄り） */
  floorColor: [48, 46, 44] as RGB,
  /** 床の明るさゆらぎ */
  floorNoiseStrength: 0.12,
} as const

export type PaletteName = keyof typeof PALETTES
export type PaletteMode = PaletteName | 'auto'
