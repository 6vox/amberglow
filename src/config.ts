/**
 * AMBERGLOW — 見た目調整用の主要パラメータ
 * 色・速度・ぼかし・透明度などはここを編集する。
 */

export type RGB = readonly [number, number, number]

export const LOCATION = {
  latitude: 34.7904,
  longitude: 135.5079,
  timezoneOffsetHours: 9,
} as const

/**
 * 時刻連動パレット
 * 宇宙っぽい紫を避け、プロジェクター染料（暖色＋寒色）寄りにする。
 */
export const PALETTES = {
  day: [
    [210, 220, 200],
    [150, 190, 195],
    [190, 200, 140],
    [120, 160, 175],
  ] as const satisfies readonly RGB[],
  evening: [
    [230, 170, 90],
    [220, 120, 55],
    [200, 190, 130],
    [100, 140, 160],
  ] as const satisfies readonly RGB[],
  sunset: [
    [220, 70, 35],
    [235, 140, 45],
    [80, 120, 180],
    [200, 50, 40],
  ] as const satisfies readonly RGB[],
  night: [
    [30, 50, 95],
    [55, 40, 80],
    [25, 70, 60],
    [90, 35, 40],
  ] as const satisfies readonly RGB[],
} as const

export const PHASE_HOURS = {
  dayEnd: -2.5,
  eveningPeak: -1.0,
  sunsetPeak: 0.0,
  nightStart: 1.2,
} as const

export const VISUAL = {
  baseSpeed: 0.42,
  speedStep: 0.08,
  speedMin: 0.12,
  speedMax: 1.8,

  /** 大きな油だまりの数 */
  blobCount: 6,
  /** 油だまりの大きさ（画面短辺比） */
  blobSizeMin: 0.22,
  blobSizeMax: 0.48,
  /** 泡の密度 */
  bubbleDensity: 28,
  /** 液面の明るさ */
  liquidGain: 0.95,
  /** 外周を床へ溶かす幅（大きいほど枠が消える） */
  edgeFade: 0.28,
  /** 外周の床比率 */
  floorEdgeMix: 1,
  /** 中央でも床をわずかに残す */
  floorCenterMix: 0.08,
  floorColor: [42, 40, 38] as RGB,
  floorNoiseStrength: 0.1,

  layerOpacity: 1,
  blurPx: 0,
  trailFade: 0,
} as const

export type PaletteName = keyof typeof PALETTES
export type PaletteMode = PaletteName | 'auto'
