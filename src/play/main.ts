import { VISUAL } from '../config'
import { attachControls, effectLabel, type ControlState } from '../controls'
import {
  createEffect,
  EFFECT_META,
  nextEffectId,
  type Effect,
  type EffectId,
} from '../effects'
import { paletteFromTime } from '../palette'
import { createVisualParams, setPaletteColors } from '../visualParams'

const canvas = document.querySelector<HTMLCanvasElement>('#stage')
const helpEl = document.querySelector<HTMLElement>('#help')
const debugEl = document.querySelector<HTMLElement>('#debug')
const speedSlider = document.querySelector<HTMLInputElement>('#speed-slider')
const speedValue = document.querySelector<HTMLElement>('#speed-value')
const fadeSlider = document.querySelector<HTMLInputElement>('#fade-slider')
const fadeValue = document.querySelector<HTMLElement>('#fade-value')
const effectValue = document.querySelector<HTMLElement>('#effect-value')
const effectToggle = document.querySelector<HTMLButtonElement>('#effect-toggle')

if (
  !canvas
  || !helpEl
  || !debugEl
  || !speedSlider
  || !speedValue
  || !fadeSlider
  || !fadeValue
  || !effectValue
  || !effectToggle
) {
  throw new Error('Required DOM nodes missing')
}

const stage = canvas
const speedSliderEl = speedSlider
const speedValueEl = speedValue
const fadeSliderEl = fadeSlider
const fadeValueEl = fadeValue
const effectValueEl = effectValue
const effectToggleEl = effectToggle

const params = createVisualParams()
const state: ControlState = {
  // 見た目調整中は固定パレット（時間帯連動は後で戻す）
  paletteMode: 'sunset',
  effectId: 'liquidLight',
  helpVisible: false,
  debugVisible: true,
}
setPaletteColors(params, 'sunset')

let effect: Effect = createEffect(state.effectId, stage)

function syncSpeedUi(speed: number): void {
  speedSliderEl.value = String(speed)
  speedValueEl.textContent = speed.toFixed(2)
}

function syncFadeUi(px: number): void {
  fadeSliderEl.value = String(px)
  fadeValueEl.textContent = String(Math.round(px))
}

function syncEffectUi(id: EffectId): void {
  effectValueEl.textContent = effectLabel(id)
  document.title = `AMBERGLOW — ${EFFECT_META[id].label}`
}

function resize(): void {
  effect.resize(window.innerWidth, window.innerHeight)
}

function setEffect(id: EffectId): void {
  state.effectId = id
  effect = createEffect(id, stage)
  syncEffectUi(id)
  resize()
}

resize()
window.addEventListener('resize', resize)
syncEffectUi(state.effectId)

speedSliderEl.min = String(VISUAL.speedMin)
speedSliderEl.max = String(VISUAL.speedMax)
speedSliderEl.step = String(VISUAL.speedStep)
syncSpeedUi(params.speed)
syncFadeUi(params.edgeFadePx)

speedSliderEl.addEventListener('input', () => {
  params.speed = Number(speedSliderEl.value)
  syncSpeedUi(params.speed)
})

fadeSliderEl.addEventListener('input', () => {
  params.edgeFadePx = Number(fadeSliderEl.value)
  syncFadeUi(params.edgeFadePx)
})

effectToggleEl.addEventListener('click', () => {
  setEffect(nextEffectId(state.effectId))
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
  onEffectChange(id) {
    setEffect(id)
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

  effect.update(dt, params)
  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
