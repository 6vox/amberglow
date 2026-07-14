import { attachControls, type ControlState } from '../controls'
import { paletteFromTime } from '../palette'
import { AmberglowRenderer } from '../renderer'
import { createVisualParams } from '../visualParams'

const canvas = document.querySelector<HTMLCanvasElement>('#stage')
const helpEl = document.querySelector<HTMLElement>('#help')

if (!canvas || !helpEl) {
  throw new Error('Required DOM nodes missing')
}

const params = createVisualParams()
const state: ControlState = {
  paletteMode: 'auto',
  helpVisible: false,
}

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
