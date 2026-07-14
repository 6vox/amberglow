/**
 * AMBERGLOW — 見た目調整用の主要パラメータ
 * いまは理想リファレンス寄せの固定パレットで調整中。
 */

export type RGB = readonly [number, number, number]

export const LOCATION = {
  latitude: 34.7904,
  longitude: 135.5079,
  timezoneOffsetHours: 9,
} as const

/**
 * 理想リファレンス寄せ（暖色油膜 + 寒色ディスク + 明るい核）
 * 時間帯連動は後で戻す。
 */
export const PALETTES = {
  day: [
    [230, 90, 35],
    [240, 170, 55],
    [70, 130, 200],
    [245, 230, 160],
  ] as const satisfies readonly RGB[],
  evening: [
    [230, 90, 35],
    [240, 170, 55],
    [70, 130, 200],
    [245, 230, 160],
  ] as const satisfies readonly RGB[],
  sunset: [
    [230, 90, 35],
    [240, 170, 55],
    [70, 130, 200],
    [245, 230, 160],
  ] as const satisfies readonly RGB[],
  night: [
    [230, 90, 35],
    [240, 170, 55],
    [70, 130, 200],
    [245, 230, 160],
  ] as const satisfies readonly RGB[],
} as const

export const PHASE_HOURS = {
  dayEnd: -2.5,
  eveningPeak: -1.0,
  sunsetPeak: 0.0,
  nightStart: 1.2,
} as const

export const VISUAL = {
  baseSpeed: 0.32,
  speedStep: 0.08,
  speedMin: 0.1,
  speedMax: 1.6,

  /** 暖色の大きな油だまり */
  warmBlobCount: 4,
  /** 寒色の半透明ディスク */
  coolDiscCount: 2,
  /** 油の中の暗いセル（泡）数 */
  cellCount: 120,
  warmAlpha: 0.62,
  coolAlpha: 0.42,
  cellAlpha: 0.55,
  coreGain: 0.7,
  liquidGain: 1.1,
  fadeRadius: 0.78,
  floorColor: [18, 16, 14] as RGB,
  floorNoiseStrength: 0.035,

  layerOpacity: 1,
  blurPx: 0,
  trailFade: 0,
} as const

export type PaletteName = keyof typeof PALETTES
export type PaletteMode = PaletteName | 'auto'
