import { VISUAL, type PaletteMode, type PaletteName } from './config'
import type { VisualParams } from './visualParams'
import { setPaletteColors } from './visualParams'

export interface ControlState {
  paletteMode: PaletteMode
  helpVisible: boolean
  debugVisible: boolean
}

export type ControlCallbacks = {
  onHelpToggle: (visible: boolean) => void
  onDebugToggle: (visible: boolean) => void
  onSpeedChange: (speed: number) => void
  onModeChange: (mode: PaletteMode) => void
}

/**
 * キーボード操作。
 * F フルスクリーン / 1–4 パレット / 0 自動 / ↑↓ 速度 / D デバッグ / H ヘルプ
 */
export function attachControls(
  params: VisualParams,
  state: ControlState,
  callbacks: ControlCallbacks,
): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.metaKey || event.ctrlKey || event.altKey) return

    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key

    switch (key) {
      case 'f':
        event.preventDefault()
        void toggleFullscreen()
        break
      case '1':
        setManualPalette(params, state, 'day', callbacks)
        break
      case '2':
        setManualPalette(params, state, 'evening', callbacks)
        break
      case '3':
        setManualPalette(params, state, 'sunset', callbacks)
        break
      case '4':
        setManualPalette(params, state, 'night', callbacks)
        break
      case '0':
        state.paletteMode = 'auto'
        callbacks.onModeChange('auto')
        break
      case 'ArrowUp':
        event.preventDefault()
        params.speed = clamp(
          params.speed + VISUAL.speedStep,
          VISUAL.speedMin,
          VISUAL.speedMax,
        )
        callbacks.onSpeedChange(params.speed)
        break
      case 'ArrowDown':
        event.preventDefault()
        params.speed = clamp(
          params.speed - VISUAL.speedStep,
          VISUAL.speedMin,
          VISUAL.speedMax,
        )
        callbacks.onSpeedChange(params.speed)
        break
      case 'd':
        state.debugVisible = !state.debugVisible
        callbacks.onDebugToggle(state.debugVisible)
        break
      case 'h':
        state.helpVisible = !state.helpVisible
        callbacks.onHelpToggle(state.helpVisible)
        break
      default:
        break
    }
  }

  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}

function setManualPalette(
  params: VisualParams,
  state: ControlState,
  name: PaletteName,
  callbacks: ControlCallbacks,
): void {
  state.paletteMode = name
  setPaletteColors(params, name)
  callbacks.onModeChange(name)
}

async function toggleFullscreen(): Promise<void> {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen()
  } else {
    await document.exitFullscreen()
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}
