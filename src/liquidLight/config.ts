import type { RGB } from '../config'

/** リキッドライト専用パラメータ */
export const LIQUID_LIGHT = {
  /** シミュレーション解像度 */
  gridSize: 160,
  /** 1フレームあたりの最大シミュレーション dt */
  maxStepDt: 0.024,
  /** 速度の粘性（高め＝トロトロで境界が残りやすい） */
  viscosity: 0.00028,
  /** フェーズ・染料の拡散（極小＝混ざりにくい） */
  phaseDiffusion: 0.0000015,
  dyeDiffusion: 0.0000012,
  /** 減衰（ほぼなし） */
  phaseDissipation: 0.99995,
  dyeDissipation: 0.99992,
  thicknessDissipation: 0.99996,
  /** 表面張力（平滑化イテレーション） */
  tensionSmoothIters: 1,
  /** コントラスト強調（高いほどセルが丸く残る） */
  phaseSharpen: 1.85,
  /** 油水の分離強度 */
  phaseSeparation: 0.85,
  /** 染料のコントラスト維持 */
  dyeSharpen: 1.25,
  /** 拡大時ブラー (px) — 小さめで形を残す */
  upscaleBlur: 2.2,
  /** 透過光のゲイン */
  lightGain: 1.55,
  /** 彩度ブースト */
  saturationBoost: 1.35,
  /** 境界の明るさ */
  edgeHighlight: 0.28,
  /** 境界の暗い輪郭 */
  edgeDarken: 0.18,
  /** 屈折 RGB ずれ (px at sim resolution) */
  refractionShift: 1.1,
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
