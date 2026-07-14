/**
 * AMBERGLOW — 見た目調整（理想リファレンス寄せ中・時間帯固定）
 */

export type RGB = readonly [number, number, number]

export const LOCATION = {
  latitude: 34.7904,
  longitude: 135.5079,
  timezoneOffsetHours: 9,
} as const

export const PALETTES = {
  day: [
    [220, 70, 30],
    [235, 150, 40],
    [90, 150, 210],
    [250, 235, 150],
  ] as const satisfies readonly RGB[],
  evening: [
    [220, 70, 30],
    [235, 150, 40],
    [90, 150, 210],
    [250, 235, 150],
  ] as const satisfies readonly RGB[],
  sunset: [
    [220, 70, 30],
    [235, 150, 40],
    [90, 150, 210],
    [250, 235, 150],
  ] as const satisfies readonly RGB[],
  night: [
    [220, 70, 30],
    [235, 150, 40],
    [90, 150, 210],
    [250, 235, 150],
  ] as const satisfies readonly RGB[],
} as const

export const PHASE_HOURS = {
  dayEnd: -2.5,
  eveningPeak: -1.0,
  sunsetPeak: 0.0,
  nightStart: 1.2,
} as const

export const VISUAL = {
  baseSpeed: 0.28,
  speedStep: 0.08,
  speedMin: 0.1,
  speedMax: 1.6,

  warmBlobCount: 5,
  coolDiscCount: 2,
  /** 油膜上の暗い斑点。多すぎると不快なので控えめ */
  cellCount: 70,
  warmAlpha: 0.72,
  coolAlpha: 0.5,
  cellAlpha: 0.4,
  coreGain: 0.45,
  liquidGain: 1.15,
  fadeRadius: 0.82,
  floorColor: [12, 11, 10] as RGB,
  floorNoiseStrength: 0.02,

  layerOpacity: 1,
  blurPx: 0,
  trailFade: 0,
} as const

export type PaletteName = keyof typeof PALETTES
export type PaletteMode = PaletteName | 'auto'
