import { attachControls, type ControlState } from '../controls'
import { paletteFromTime } from '../palette'
import { AmberglowRenderer } from '../renderer'
import { createVisualParams, setPaletteColors } from '../visualParams'

const canvas = document.querySelector<HTMLCanvasElement>('#stage')
const helpEl = document.querySelector<HTMLElement>('#help')

if (!canvas || !helpEl) {
  throw new Error('Required DOM nodes missing')
}

const params = createVisualParams()
const state: ControlState = {
  // 見た目調整中は固定パレット（時間帯連動は後で戻す）
  paletteMode: 'sunset',
  helpVisible: false,
}
setPaletteColors(params, 'sunset')

const renderer = new AmberglowRenderer(canvas)

function resize(): void {
  renderer.resize(window.innerWidth, window.innerHeight)
}

resize()
window.addEventListener('resize', resize)

attachControls(params, state, {
  onHelpToggle(visible) {
    helpEl.hidden = !visible
  },
  onModeChange() {
    // モード表示はヘルプ内の静的説明のみ。通常時は UI なし。
  },
})

helpEl.hidden = true

let last = performance.now()

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now

  if (state.paletteMode === 'auto') {
    params.colors = paletteFromTime(new Date())
  }

  renderer.update(dt, params)
  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
