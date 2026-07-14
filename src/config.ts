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
 * ネオン寄りの高彩度を避け、床に染みた顔料寄りの色にする。
 */
export const PALETTES = {
  day: [
    [168, 188, 196],
    [214, 216, 210],
    [166, 186, 168],
    [198, 188, 150],
  ] as const satisfies readonly RGB[],
  evening: [
    [186, 162, 128],
    [196, 148, 98],
    [168, 118, 68],
    [148, 108, 72],
  ] as const satisfies readonly RGB[],
  sunset: [
    [176, 96, 52],
    [158, 62, 48],
    [168, 88, 102],
    [98, 58, 108],
  ] as const satisfies readonly RGB[],
  night: [
    [28, 36, 58],
    [48, 40, 72],
    [24, 48, 42],
    [72, 32, 36],
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
  baseSpeed: 0.72,
  /** 速度キー操作の刻み */
  speedStep: 0.1,
  /** 速度の下限・上限 */
  speedMin: 0.2,
  speedMax: 2.2,

  /** 光レイヤーの強さ（低いほどコンクリートが残る） */
  layerOpacity: 0.55,
  /** フレーム間の残像（低いほど輪郭が残る／高いほど溶ける） */
  trailFade: 0.028,
  /** 線のにじみブラー（px）。大きすぎると玉っぽくなる */
  blurPx: 10,

  /** 細い流れの本数 */
  flowCount: 7,
  /** にじみ染みの数 */
  stainCount: 5,

  /** 流れの太さ（画面短辺に対する比率） */
  flowThicknessMin: 0.006,
  flowThicknessMax: 0.018,
  /** 染みの長径 */
  stainSizeMin: 0.08,
  stainSizeMax: 0.2,

  /** 流れの速度係数（粘性寄り） */
  flowDrift: 0.085,
  /** 染みの速度係数 */
  stainDrift: 0.035,

  /** 光レイヤーを床へ乗せる強さ */
  lightMix: 0.62,
  /** コンクリートの質感を戻す強さ */
  concreteOpacity: 0.48,
  /** 床のベース色（コンクリート寄り） */
  floorColor: [58, 55, 52] as RGB,
  /** 床の明るさゆらぎ */
  floorNoiseStrength: 0.16,
} as const

export type PaletteName = keyof typeof PALETTES
export type PaletteMode = PaletteName | 'auto'
