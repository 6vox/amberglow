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
 * リキッドライトの染料っぽい彩度。床への染み込みは合成側で抑える。
 */
export const PALETTES = {
  day: [
    [120, 190, 210],
    [230, 235, 240],
    [140, 200, 150],
    [230, 210, 120],
  ] as const satisfies readonly RGB[],
  evening: [
    [220, 190, 140],
    [235, 160, 90],
    [200, 120, 55],
    [170, 100, 50],
  ] as const satisfies readonly RGB[],
  sunset: [
    [240, 110, 40],
    [220, 55, 35],
    [230, 90, 130],
    [130, 50, 160],
  ] as const satisfies readonly RGB[],
  night: [
    [35, 55, 120],
    [80, 50, 140],
    [25, 80, 70],
    [120, 30, 45],
  ] as const satisfies readonly RGB[],
} as const

/**
 * 日没基準のフェーズ境界（時間）。
 * sunsetOffsetHours = 現在時刻 − 日の入り時刻
 */
export const PHASE_HOURS = {
  dayEnd: -2.5,
  eveningPeak: -1.0,
  sunsetPeak: 0.0,
  nightStart: 1.2,
} as const

/** 描画・動きのデフォルト */
export const VISUAL = {
  /** 基本の時間進行速度（1 = 標準） */
  baseSpeed: 0.55,
  speedStep: 0.1,
  speedMin: 0.15,
  speedMax: 2.0,

  /**
   * 液面の見た目（WebGL）。
   * 値を上げると模様が細かく・動きが速くなる。
   */
  /** 全体スケール（大きいほど模様が細かい） */
  patternScale: 2.4,
  /** ドメインワープの強さ（マーブル感） */
  warpStrength: 0.55,
  /** 油滴セルの密度 */
  cellScale: 4.2,
  /** セル縁のシャープさ（高いほど境界が立つ） */
  cellContrast: 1.35,
  /** 色の混ざり幅 */
  blendSoftness: 0.22,
  /** 液面レイヤーの明るさ */
  liquidGain: 1.05,
  /** コンクリートを残す比率 0–1（高いほど床が目立つ） */
  concreteMix: 0.38,
  /** 床のベース色 */
  floorColor: [52, 50, 47] as RGB,
  /** 床ノイズ */
  floorNoiseStrength: 0.14,

  /** visualParams 互換用（WebGL では主に speed / colors / opacity を使用） */
  layerOpacity: 0.9,
  blurPx: 0,
  trailFade: 0,
} as const

export type PaletteName = keyof typeof PALETTES
export type PaletteMode = PaletteName | 'auto'
