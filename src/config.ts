/**
 * AMBERGLOW — 見た目 / 流体パラメータ
 * いまは理想寄せのためパレット固定。
 */

export type RGB = readonly [number, number, number]

export const LOCATION = {
  latitude: 34.7904,
  longitude: 135.5079,
  timezoneOffsetHours: 9,
} as const

/** 理想寄せ固定パレット（時間帯連動は後で戻す） */
export const PALETTES = {
  day: [[210, 45, 20], [240, 140, 35], [90, 150, 215], [255, 230, 150]] as const satisfies readonly RGB[],
  evening: [[210, 45, 20], [240, 140, 35], [90, 150, 215], [255, 230, 150]] as const satisfies readonly RGB[],
  sunset: [[210, 45, 20], [240, 140, 35], [90, 150, 215], [255, 230, 150]] as const satisfies readonly RGB[],
  night: [[210, 45, 20], [240, 140, 35], [90, 150, 215], [255, 230, 150]] as const satisfies readonly RGB[],
} as const

export const PHASE_HOURS = {
  dayEnd: -2.5,
  eveningPeak: -1.0,
  sunsetPeak: 0.0,
  nightStart: 1.2,
} as const

export const VISUAL = {
  baseSpeed: 0.85,
  speedStep: 0.1,
  speedMin: 0.2,
  speedMax: 2.2,

  /** 流体グリッド解像度（大きいほど細かいが重い） */
  fluidSize: 128,
  /** 粘性（高いほどトロトロ） */
  viscosity: 0.00012,
  /** 染料の拡散 */
  diffusion: 0.000018,
  /** 染料の減衰 */
  dissipation: 0.996,
  /** 自動かくはんの強さ */
  stirForce: 28,
  /** 染料滴下の強さ */
  dyeAmount: 0.55,
  /** 表示の明るさ */
  liquidGain: 1.15,
  /** 外周フェード */
  fadeRadius: 0.9,
  floorColor: [14, 12, 10] as RGB,

  layerOpacity: 1,
  blurPx: 0,
  trailFade: 0,
} as const

export type PaletteName = keyof typeof PALETTES
export type PaletteMode = PaletteName | 'auto'
