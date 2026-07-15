import { VISUAL } from '../config'
import { attachControls, type ControlState } from '../controls'
import { paletteFromTime } from '../palette'
import { AmberglowRenderer } from '../renderer'
import { createVisualParams, setPaletteColors } from '../visualParams'

const canvas = document.querySelector<HTMLCanvasElement>('#stage')
const helpEl = document.querySelector<HTMLElement>('#help')
const debugEl = document.querySelector<HTMLElement>('#debug')
const speedSlider = document.querySelector<HTMLInputElement>('#speed-slider')
const speedValue = document.querySelector<HTMLElement>('#speed-value')

if (!canvas || !helpEl || !debugEl || !speedSlider || !speedValue) {
  throw new Error('Required DOM nodes missing')
}

const speedSliderEl = speedSlider
const speedValueEl = speedValue

const params = createVisualParams()
const state: ControlState = {
  // 見た目調整中は固定パレット（時間帯連動は後で戻す）
  paletteMode: 'sunset',
  helpVisible: false,
  debugVisible: true,
}
setPaletteColors(params, 'sunset')

const renderer = new AmberglowRenderer(canvas)

function syncSpeedUi(speed: number): void {
  speedSliderEl.value = String(speed)
  speedValueEl.textContent = speed.toFixed(2)
}

function resize(): void {
  renderer.resize(window.innerWidth, window.innerHeight)
}

resize()
window.addEventListener('resize', resize)

speedSliderEl.min = String(VISUAL.speedMin)
speedSliderEl.max = String(VISUAL.speedMax)
speedSliderEl.step = String(VISUAL.speedStep)
syncSpeedUi(params.speed)

speedSliderEl.addEventListener('input', () => {
  params.speed = Number(speedSliderEl.value)
  syncSpeedUi(params.speed)
})

attachControls(params, state, {
  onHelpToggle(visible) {
    helpEl.hidden = !visible
  },
  onDebugToggle(visible) {
    debugEl.hidden = !visible
  },
  onSpeedChange(speed) {
    syncSpeedUi(speed)
  },
  onModeChange() {
    // モード表示はヘルプ内の静的説明のみ。通常時は UI なし。
  },
})

helpEl.hidden = true
debugEl.hidden = !state.debugVisible

const POINTER_IDLE_MS = 2500
let pointerIdleTimer = 0

function showPointer(): void {
  document.body.classList.remove('is-pointer-idle')
  window.clearTimeout(pointerIdleTimer)
  pointerIdleTimer = window.setTimeout(() => {
    document.body.classList.add('is-pointer-idle')
  }, POINTER_IDLE_MS)
}

window.addEventListener('pointermove', showPointer, { passive: true })
window.addEventListener('pointerdown', showPointer, { passive: true })
showPointer()

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
