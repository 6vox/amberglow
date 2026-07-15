import type { RGB } from '../config'

/** リキッドライト専用パラメータ */
export const LIQUID_LIGHT = {
  /** シミュレーション解像度 */
  gridSize: 160,
  /** 1フレームあたりの最大シミュレーション dt */
  maxStepDt: 0.028,
  /** 速度の粘性 */
  viscosity: 0.00012,
  /** フェーズ・染料の拡散 */
  phaseDiffusion: 0.000008,
  dyeDiffusion: 0.000006,
  /** 減衰（非常に弱い） */
  phaseDissipation: 0.99985,
  dyeDissipation: 0.9997,
  thicknessDissipation: 0.9999,
  /** 表面張力（平滑化イテレーション） */
  tensionSmoothIters: 2,
  /** コントラスト強調 */
  phaseSharpen: 1.35,
  /** 油水の分離強度 */
  phaseSeparation: 0.55,
  /** 拡大時ブラー (px) */
  upscaleBlur: 3.5,
  /** 透過光のゲイン */
  lightGain: 1.25,
  /** 境界の明るさ */
  edgeHighlight: 0.22,
  /** 境界の暗い輪郭 */
  edgeDarken: 0.12,
  /** 屈折 RGB ずれ (px at sim resolution) */
  refractionShift: 0.9,
  /** 初期化シード */
  initSeed: 42,
} as const

export type DyeRole = 'oilA' | 'oilB' | 'water' | 'accent'

/** VisualParams.colors を染料役割へ割り当て */
export function paletteRoles(colors: RGB[]): Record<DyeRole, RGB> {
  return {
    oilA: colors[0],
    oilB: colors[1],
    water: colors[2],
    accent: colors[3],
  }
}
