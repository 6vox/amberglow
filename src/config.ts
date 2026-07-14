/**
 * AMBERGLOW — 理想寄せ調整中（時間帯固定）
 * 個別の泡円は一旦外し、大きな色面と外周フェードを優先。
 */

export type RGB = readonly [number, number, number]

export const LOCATION = {
  latitude: 34.7904,
  longitude: 135.5079,
  timezoneOffsetHours: 9,
} as const

export const PALETTES = {
  day: [[205, 40, 18], [235, 120, 28], [100, 160, 220], [255, 225, 140]] as const satisfies readonly RGB[],
  evening: [[205, 40, 18], [235, 120, 28], [100, 160, 220], [255, 225, 140]] as const satisfies readonly RGB[],
  sunset: [[205, 40, 18], [235, 120, 28], [100, 160, 220], [255, 225, 140]] as const satisfies readonly RGB[],
  night: [[205, 40, 18], [235, 120, 28], [100, 160, 220], [255, 225, 140]] as const satisfies readonly RGB[],
} as const

export const PHASE_HOURS = {
  dayEnd: -2.5,
  eveningPeak: -1.0,
  sunsetPeak: 0.0,
  nightStart: 1.2,
} as const

export const VISUAL = {
  baseSpeed: 0.24,
  speedStep: 0.08,
  speedMin: 0.1,
  speedMax: 1.6,

  warmAlpha: 0.75,
  coolAlpha: 0.58,
  coreGain: 0.42,
  liquidGain: 1.08,
  /** 暖色内部のごく弱いテクスチャ（円の列にはしない） */
  grainAlpha: 0.12,
  fadeRadius: 0.88,
  floorColor: [16, 14, 12] as RGB,

  layerOpacity: 1,
  blurPx: 0,
  trailFade: 0,
} as const

export type PaletteName = keyof typeof PALETTES
export type PaletteMode = PaletteName | 'auto'
