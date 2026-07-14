/**
 * AMBERGLOW — 理想リファレンス寄せ（時間帯固定の調整中）
 */

export type RGB = readonly [number, number, number]

export const LOCATION = {
  latitude: 34.7904,
  longitude: 135.5079,
  timezoneOffsetHours: 9,
} as const

export const PALETTES = {
  day: [[210, 55, 25], [235, 140, 35], [85, 145, 205], [255, 235, 170]] as const satisfies readonly RGB[],
  evening: [[210, 55, 25], [235, 140, 35], [85, 145, 205], [255, 235, 170]] as const satisfies readonly RGB[],
  sunset: [[210, 55, 25], [235, 140, 35], [85, 145, 205], [255, 235, 170]] as const satisfies readonly RGB[],
  night: [[210, 55, 25], [235, 140, 35], [85, 145, 205], [255, 235, 170]] as const satisfies readonly RGB[],
} as const

export const PHASE_HOURS = {
  dayEnd: -2.5,
  eveningPeak: -1.0,
  sunsetPeak: 0.0,
  nightStart: 1.2,
} as const

export const VISUAL = {
  baseSpeed: 0.26,
  speedStep: 0.08,
  speedMin: 0.1,
  speedMax: 1.6,

  warmBlobCount: 6,
  coolDiscCount: 2,
  cellCount: 90,
  warmAlpha: 0.78,
  coolAlpha: 0.55,
  cellAlpha: 0.5,
  coreGain: 0.38,
  liquidGain: 1.2,
  fadeRadius: 0.85,
  floorColor: [22, 20, 18] as RGB,
  floorNoiseStrength: 0.025,

  layerOpacity: 1,
  blurPx: 0,
  trailFade: 0,
} as const

export type PaletteName = keyof typeof PALETTES
export type PaletteMode = PaletteName | 'auto'
