import { VISUAL, type RGB } from './config'
import { cssRgb } from './palette'
import type { VisualParams } from './visualParams'

interface Flow {
  seed: number
  phase: number
  colorIndex: number
  thickness: number
  speed: number
  /** 画面内の基準位置 0–1 */
  originX: number
  originY: number
  spanX: number
  spanY: number
}

interface Stain {
  seed: number
  phase: number
  colorIndex: number
  size: number
  speed: number
  aspect: number
  angle: number
  originX: number
  originY: number
}

/**
 * リキッドライト風のキャンバス描画。
 * 光玉の加算グローではなく、細い流れと床へのにじみを中心にする。
 */
export class AmberglowRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly layer: HTMLCanvasElement
  private readonly layerCtx: CanvasRenderingContext2D
  private readonly concrete: HTMLCanvasElement
  private width = 0
  private height = 0
  private flows: Flow[] = []
  private stains: Stain[] = []
  private time = 0
  private layerReady = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D not available')
    this.ctx = ctx

    this.layer = document.createElement('canvas')
    const layerCtx = this.layer.getContext('2d')
    if (!layerCtx) throw new Error('Offscreen canvas failed')
    this.layerCtx = layerCtx

    this.concrete = document.createElement('canvas')
    this.initEntities()
  }

  resize(width: number, height: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.width = width
    this.height = height

    this.canvas.width = Math.floor(width * dpr)
    this.canvas.height = Math.floor(height * dpr)
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    this.layer.width = Math.floor(width * dpr)
    this.layer.height = Math.floor(height * dpr)
    this.layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.layerReady = false

    this.buildConcreteTexture(width, height, dpr)
  }

  update(dt: number, params: VisualParams): void {
    const audioBoost = 1 + params.audioEnergy * 0.25
    this.time += dt * params.speed * audioBoost
    this.paintFrame(params)
  }

  private initEntities(): void {
    this.flows = Array.from({ length: VISUAL.flowCount }, (_, i) => {
      const r = (n: number) => fract(Math.sin((i + 1) * n) * 43758.5453)
      return {
        seed: i * 13.7 + 2.1,
        phase: r(12.9898) * Math.PI * 2,
        colorIndex: i % 4,
        thickness: lerp(VISUAL.flowThicknessMin, VISUAL.flowThicknessMax, r(78.233)),
        speed: 0.55 + r(39.17) * 0.7,
        originX: 0.12 + r(4.1) * 0.76,
        originY: 0.14 + r(8.3) * 0.72,
        spanX: 0.18 + r(15.2) * 0.35,
        spanY: 0.16 + r(21.7) * 0.34,
      }
    })

    this.stains = Array.from({ length: VISUAL.stainCount }, (_, i) => {
      const r = (n: number) => fract(Math.sin((i + 3) * n) * 24634.917)
      return {
        seed: i * 7.9 + 5.4,
        phase: r(3.1) * Math.PI * 2,
        colorIndex: (i + 2) % 4,
        size: lerp(VISUAL.stainSizeMin, VISUAL.stainSizeMax, r(9.2)),
        speed: 0.35 + r(6.4) * 0.5,
        aspect: 0.28 + r(11.5) * 0.45,
        angle: r(2.7) * Math.PI,
        originX: 0.18 + r(5.5) * 0.64,
        originY: 0.2 + r(7.8) * 0.58,
      }
    })
  }

  private paintFrame(params: VisualParams): void {
    const { ctx, layerCtx, width, height } = this
    const shortSide = Math.min(width, height)

    if (!this.layerReady) {
      layerCtx.fillStyle = '#000'
      layerCtx.fillRect(0, 0, width, height)
      this.layerReady = true
    }

    layerCtx.globalCompositeOperation = 'source-over'
    layerCtx.fillStyle = `rgba(0, 0, 0, ${params.trailFade})`
    layerCtx.fillRect(0, 0, width, height)

    const blur = Math.max(0, params.blur * (1 + params.audioMid * 0.15))
    const opacity = params.opacity * (0.92 + params.audioBass * 0.2)

    // 染みは先に薄く、流れは後から線で乗せる
    layerCtx.filter = `blur(${blur * 1.6}px)`
    layerCtx.globalCompositeOperation = 'source-over'
    for (const stain of this.stains) {
      this.drawStain(stain, params.colors, shortSide, opacity * 0.55)
    }

    layerCtx.filter = `blur(${blur}px)`
    for (const flow of this.flows) {
      this.drawFlow(flow, params.colors, shortSide, opacity)
    }

    layerCtx.filter = 'none'
    layerCtx.globalCompositeOperation = 'source-over'

    // 床に染みる合成：加算グローを使わない
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.drawImage(this.concrete, 0, 0, width, height)

    ctx.globalCompositeOperation = 'soft-light'
    ctx.globalAlpha = VISUAL.lightMix
    ctx.drawImage(this.layer, 0, 0, width, height)

    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = 0.22
    ctx.drawImage(this.layer, 0, 0, width, height)

    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = VISUAL.concreteOpacity
    ctx.drawImage(this.concrete, 0, 0, width, height)

    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  private drawFlow(
    flow: Flow,
    colors: RGB[],
    shortSide: number,
    opacity: number,
  ): void {
    const { layerCtx, width, height, time } = this
    const t = time * VISUAL.flowDrift * flow.speed + flow.phase
    const color = colors[flow.colorIndex % colors.length]
    const points = 36
    const path: Array<{ x: number; y: number }> = []

    for (let i = 0; i < points; i++) {
      const u = i / (points - 1)
      const wobble =
        0.55 * Math.sin(u * Math.PI * 2 + t + flow.seed)
        + 0.28 * Math.sin(u * Math.PI * 5 - t * 0.7 + flow.seed * 1.3)
        + 0.12 * Math.sin(u * Math.PI * 9 + t * 0.35)
      const drift = Math.sin(t * 0.35 + flow.seed) * 0.08

      const x = width * (
        flow.originX
        + (u - 0.5) * flow.spanX
        + wobble * flow.spanY * 0.55
        + drift
      )
      const y = height * (
        flow.originY
        + Math.sin(u * Math.PI) * flow.spanY
        + Math.cos(u * Math.PI * 2 - t * 0.4) * flow.spanX * 0.25
        + Math.sin(t * 0.22 + flow.seed * 0.5) * 0.06
      )
      path.push({ x, y })
    }

    const baseWidth = shortSide * flow.thickness
    // 外側のにじみ
    this.strokePath(layerCtx, path, baseWidth * 3.2, color, opacity * 0.045)
    // 本体の細い流れ
    this.strokePath(layerCtx, path, baseWidth, color, opacity * 0.22)
    // 芯のハイライトをごく弱く
    this.strokePath(layerCtx, path, baseWidth * 0.35, color, opacity * 0.12)
  }

  private drawStain(
    stain: Stain,
    colors: RGB[],
    shortSide: number,
    opacity: number,
  ): void {
    const { layerCtx, width, height, time } = this
    const t = time * VISUAL.stainDrift * stain.speed + stain.phase
    const color = colors[stain.colorIndex % colors.length]

    const x = width * (
      stain.originX
      + 0.06 * Math.sin(t * 0.5 + stain.seed)
      + 0.03 * Math.sin(t * 0.9 + stain.seed * 2)
    )
    const y = height * (
      stain.originY
      + 0.05 * Math.cos(t * 0.4 + stain.seed * 1.2)
      + 0.025 * Math.sin(t * 0.7 - stain.seed)
    )

    const rx = shortSide * stain.size * (0.9 + 0.1 * Math.sin(t * 0.6))
    const ry = rx * stain.aspect
    const angle = stain.angle + Math.sin(t * 0.25) * 0.15

    layerCtx.save()
    layerCtx.translate(x, y)
    layerCtx.rotate(angle)
    layerCtx.scale(1, ry / rx)

    const gradient = layerCtx.createRadialGradient(0, 0, 0, 0, 0, rx)
    gradient.addColorStop(0, cssRgb(color, opacity * 0.18))
    gradient.addColorStop(0.55, cssRgb(color, opacity * 0.07))
    gradient.addColorStop(1, cssRgb(color, 0))
    layerCtx.fillStyle = gradient
    layerCtx.beginPath()
    layerCtx.arc(0, 0, rx, 0, Math.PI * 2)
    layerCtx.fill()
    layerCtx.restore()
  }

  private strokePath(
    ctx: CanvasRenderingContext2D,
    path: Array<{ x: number; y: number }>,
    lineWidth: number,
    color: RGB,
    alpha: number,
  ): void {
    if (path.length < 2 || alpha <= 0) return
    ctx.beginPath()
    ctx.moveTo(path[0].x, path[0].y)
    for (let i = 1; i < path.length - 1; i++) {
      const midX = (path[i].x + path[i + 1].x) * 0.5
      const midY = (path[i].y + path[i + 1].y) * 0.5
      ctx.quadraticCurveTo(path[i].x, path[i].y, midX, midY)
    }
    const last = path[path.length - 1]
    ctx.lineTo(last.x, last.y)
    ctx.strokeStyle = cssRgb(color, alpha)
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
  }

  private buildConcreteTexture(width: number, height: number, dpr: number): void {
    const pw = Math.floor(width * dpr)
    const ph = Math.floor(height * dpr)
    this.concrete.width = pw
    this.concrete.height = ph
    const ctx = this.concrete.getContext('2d')
    if (!ctx) return

    const [br, bg, bb] = VISUAL.floorColor
    const image = ctx.createImageData(pw, ph)
    const data = image.data
    const strength = VISUAL.floorNoiseStrength

    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const i = (y * pw + x) * 4
        const sx = x / dpr
        const sy = y / dpr
        const n =
          0.5 * hash2(sx * 0.55, sy * 0.55)
          + 0.3 * hash2(sx * 0.12, sy * 0.12)
          + 0.2 * hash2(sx * 0.03, sy * 0.028)
        const grain = (hash2(sx * 4.2, sy * 3.8) - 0.5) * 18
        const speck = hash2(sx * 2.8, sy * 2.4) > 0.985 ? -28 : 0
        const v = (n - 0.5) * 255 * strength + grain + speck
        data[i] = clampByte(br + v)
        data[i + 1] = clampByte(bg + v * 0.96)
        data[i + 2] = clampByte(bb + v * 0.9)
        data[i + 3] = 255
      }
    }

    ctx.putImageData(image, 0, 0)

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.strokeStyle = 'rgba(28, 26, 24, 0.07)'
    ctx.lineWidth = 1
    for (let i = 0; i < 28; i++) {
      const x0 = hash2(i, 1) * width
      const y0 = hash2(i, 2) * height
      const x1 = x0 + (hash2(i, 3) - 0.5) * width * 0.2
      const y1 = y0 + (hash2(i, 4) - 0.5) * height * 0.2
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()
    }
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function fract(n: number): number {
  return n - Math.floor(n)
}

function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return fract(n)
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}
