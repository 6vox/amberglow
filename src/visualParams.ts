import type { RGB } from './config'
import { PALETTES, VISUAL, type PaletteName } from './config'

/**
 * 映像パラメータ（描画処理から分離）。
 * 将来 Web Audio API で音量・周波数帯からここを変調する想定。
 */
export interface VisualParams {
  /** 時間進行倍率 */
  speed: number
  /** レイヤー透明度 0–1 */
  opacity: number
  /** ブラー量 (px) */
  blur: number
  /** 残像フェード量 */
  trailFade: number
  /** 端からのフェード幅 (px) */
  edgeFadePx: number
  /** 現在の補間済みパレット色 */
  colors: RGB[]
  /**
   * 将来の音声連動用フック。
   * MVP では常に 0。音量や帯域エネルギーを 0–1 で渡す想定。
   */
  audioEnergy: number
  audioBass: number
  audioMid: number
  audioHigh: number
}

export function createVisualParams(): VisualParams {
  return {
    speed: VISUAL.baseSpeed,
    opacity: VISUAL.layerOpacity,
    blur: VISUAL.blurPx,
    trailFade: VISUAL.trailFade,
    edgeFadePx: VISUAL.edgeFadePx,
    colors: [...PALETTES.day],
    audioEnergy: 0,
    audioBass: 0,
    audioMid: 0,
    audioHigh: 0,
  }
}

export function setPaletteColors(params: VisualParams, name: PaletteName): void {
  params.colors = [...PALETTES[name]]
}

/**
 * 音声連動の将来拡張ポイント。
 * 現状は no-op。AudioAnalyser の出力を渡して speed / opacity / colors を変調する。
 */
export function applyAudioModulation(
  params: VisualParams,
  audio: { energy: number; bass: number; mid: number; high: number },
): void {
  params.audioEnergy = audio.energy
  params.audioBass = audio.bass
  params.audioMid = audio.mid
  params.audioHigh = audio.high
  // MVP: 変調なし。例:
  // params.speed = VISUAL.baseSpeed * (1 + audio.energy * 0.4)
  // params.opacity = VISUAL.layerOpacity * (0.85 + audio.bass * 0.3)
}
