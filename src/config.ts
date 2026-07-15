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
  /** 時間進行の基準速度（デバッグUIでも操作）— リキッドライト寄りにやや遅め */
  baseSpeed: 0.14,
  speedStep: 0.01,
  speedMin: 0.01,
  speedMax: 2.0,

  /** 流体グリッド解像度（大きいほど細かいが重い） */
  fluidSize: 128,
  /** 粘性（高いほどトロトロ）— 本番と同じ（染料はいじらない） */
  viscosity: 0.00018,
  /** 染料の拡散 */
  diffusion: 0.00001,
  /** 染料の減衰 */
  dissipation: 0.9988,
  /** 自動かくはんの強さ */
  stirForce: 12,
  /** 染料滴下の強さ */
  dyeAmount: 1.0,
  /** 表示の明るさ */
  liquidGain: 1.35,
  /** 拡大時のにじみ（px） */
  upscaleBlur: 4,

  /** 飛沫レイヤー（流体染料とは別オブジェクト） */
  splashIntervalMin: 6,
  splashIntervalMax: 14,
  splashDropletMin: 6,
  splashDropletMax: 14,
  /** 正規化座標あたりの初速 */
  splashSpeedMin: 0.04,
  splashSpeedMax: 0.14,
  /** 滴の寿命（秒） */
  splashLifeMin: 2.8,
  splashLifeMax: 5.5,
  /** 滴の半径（画面短辺比） */
  splashRadiusMin: 0.008,
  splashRadiusMax: 0.028,
  /** 泡リングの割合 */
  bubbleChance: 0.3,

  /**
   * 画面端からのフェード幅（px）。
   * 端は透明度100%（投影なし＝黒＝床）、内側へこの距離で不透明になる。
   */
  edgeFadePx: 100,
  /** 投影なしの色（プロジェクタでは黒＝床） */
  floorColor: [0, 0, 0] as RGB,

  layerOpacity: 1,
  blurPx: 0,
  trailFade: 0,
} as const

export type PaletteName = keyof typeof PALETTES
export type PaletteMode = PaletteName | 'auto'
