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
  /** 時間進行の基準速度（デバッグUIでも操作） */
  baseSpeed: 0.20,
  speedStep: 0.01,
  speedMin: 0.01,
  speedMax: 2.0,

  /** 流体グリッド解像度（大きいほど細かいが重い） */
  fluidSize: 128,
  /** 粘性（高いほどトロトロ） */
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

/**
 * リキッドライト専用（光の煙の VISUAL とは独立）。
 * 油膜の厚み・セル穴・透過光で、煙とは別系統の表現にする。
 */
export const LIQUID_LIGHT = {
  /** 内部グリッド（粗いほどブラウン管／アナログ寄り、細かすぎるとデジタル） */
  gridSize: 160,
  /** 大きな油域の数 */
  lobeCount: 6,
  /** 常時いるセル穴の数 */
  cellCount: 34,
  /** 光の吸収（厚いほど色が沈む） */
  absorb: 2.4,
  /** 薄いところのハイライト混ざり（抑えめ＝AIデモ感を減らす） */
  thinGlow: 0.38,
  /** 表示ゲイン */
  gain: 1.15,
  /** 拡大にじみ — セル穴を潰さないよう弱め */
  upscaleBlur: 1,
  /** 飛沫（小さな滴）の間隔秒 */
  dripIntervalMin: 5,
  dripIntervalMax: 12,
  /**
   * リキッドライト専用色（光の煙パレットとは独立）。
   * 濁りのある暖色／ワイン／くすんだ緑青＋弱い暖色ハイライト。
   */
  palette: [
    [150, 48, 42],
    [186, 118, 48],
    [62, 98, 92],
    [236, 198, 132],
  ] as const satisfies readonly RGB[],
} as const

export type PaletteName = keyof typeof PALETTES
export type PaletteMode = PaletteName | 'auto'
