/**
 * AMBERGLOW — 見た目調整用の主要パラメータ
 */

export type RGB = readonly [number, number, number]

export const LOCATION = {
  latitude: 34.7904,
  longitude: 135.5079,
  timezoneOffsetHours: 9,
} as const

/** 染料っぽいパレット（どの時間帯も投影として読める明るさ） */
export const PALETTES = {
  day: [
    [170, 205, 210],
    [235, 235, 230],
    [160, 195, 155],
    [220, 205, 140],
  ] as const satisfies readonly RGB[],
  evening: [
    [235, 175, 95],
    [230, 125, 55],
    [210, 195, 130],
    [110, 150, 170],
  ] as const satisfies readonly RGB[],
  sunset: [
    [230, 75, 35],
    [240, 150, 50],
    [70, 125, 195],
    [210, 55, 70],
  ] as const satisfies readonly RGB[],
  night: [
    [50, 80, 160],
    [120, 60, 150],
    [40, 110, 95],
    [160, 45, 60],
  ] as const satisfies readonly RGB[],
} as const

export const PHASE_HOURS = {
  dayEnd: -2.5,
  eveningPeak: -1.0,
  sunsetPeak: 0.0,
  nightStart: 1.2,
} as const

export const VISUAL = {
  baseSpeed: 0.38,
  speedStep: 0.08,
  speedMin: 0.12,
  speedMax: 1.8,

  blobCount: 7,
  blobSizeMin: 0.28,
  blobSizeMax: 0.55,
  bubbleDensity: 40,
  /** 油の不透明度（高いほど色面が立つ） */
  oilAlpha: 0.55,
  /** 投影全体のゲイン */
  liquidGain: 1.05,
  /** 床へ溶ける楕円の広さ */
  fadeRadius: 0.72,
  floorColor: [36, 34, 32] as RGB,
  floorNoiseStrength: 0.06,

  layerOpacity: 1,
  blurPx: 0,
  trailFade: 0,
} as const

export type PaletteName = keyof typeof PALETTES
export type PaletteMode = PaletteName | 'auto'
