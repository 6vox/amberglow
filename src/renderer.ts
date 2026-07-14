import { VISUAL, type RGB } from './config'
import { cssRgb } from './palette'
import type { VisualParams } from './visualParams'

interface Flow {
  seed: number
  phase: number
  colorIndex: number
  thickness: number
  speed: number
}

interface Blot {
  seed: number
  phase: number
  colorIndex: number
  size: number
  speed: number
}

/**
 * リキッドライト風のキャンバス描画。
 * VisualParams のみを参照し、音声連動時も同インターフェースで変調可能。
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
  private blots: Blot[] = []
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
    const audioBoost = 1 + params.audioEnergy * 0.35
    this.time += dt * params.speed * audioBoost
    this.paintFrame(params)
  }

  private initEntities(): void {
    this.flows = Array.from({ length: VISUAL.flowCount }, (_, i) => ({
      seed: i * 17.13 + 3.7,
      phase: i * 1.7,
      colorIndex: i % 4,
      thickness: lerp(
        VISUAL.flowThicknessMin,
        VISUAL.flowThicknessMax,
        fract(Math.sin(i * 12.9898) * 43758.5453),
      ),
      speed: 0.7 + fract(Math.sin(i * 78.233) * 43758.5453) * 0.8,
    }))

    this.blots = Array.from({ length: VISUAL.blotCount }, (_, i) => ({
      seed: i * 9.41 + 11.2,
      phase: i * 2.3,
      colorIndex: (i + 1) % 4,
      size: lerp(
        VISUAL.blotSizeMin,
        VISUAL.blotSizeMax,
        fract(Math.sin(i * 45.164) * 43758.5453),
      ),
      speed: 0.5 + fract(Math.sin(i * 19.19) * 43758.5453) * 0.7,
    }))
  }

  private paintFrame(params: VisualParams): void {
    const { ctx, layerCtx, width, height } = this
    const shortSide = Math.min(width, height)

    if (!this.layerReady) {
      layerCtx.fillStyle = '#000'
      layerCtx.fillRect(0, 0, width, height)
      this.layerReady = true
    }

    // 残像をゆっくり溶かす（点滅しない）
    layerCtx.globalCompositeOperation = 'source-over'
    layerCtx.fillStyle = `rgba(0, 0, 0, ${params.trailFade})`
    layerCtx.fillRect(0, 0, width, height)

    const blur = Math.max(0, params.blur * (1 + params.audioMid * 0.2))
    layerCtx.filter = `blur(${blur}px)`
    layerCtx.globalCompositeOperation = 'lighter'

    const opacity = params.opacity * (0.9 + params.audioBass * 0.25)

    for (const flow of this.flows) {
      this.drawFlow(flow, params.colors, shortSide, opacity)
    }
    for (const blot of this.blots) {
      this.drawBlot(blot, params.colors, shortSide, opacity, params.audioHigh)
    }

    layerCtx.filter = 'none'
    layerCtx.globalCompositeOperation = 'source-over'

    // コンクリート床の上に光が染みる合成
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.drawImage(this.concrete, 0, 0, width, height)

    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = 0.85
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
    const scale = VISUAL.noiseScale * 900

    const points = 20
    for (let i = 0; i < points; i++) {
      const u = i / (points - 1)
      const along = u * Math.PI * 2 + flow.seed
      const x = width * (
        0.5
        + 0.42 * Math.sin(along + t * 0.55)
        + 0.12 * Math.sin(along * 2.1 - t * 0.3 + flow.seed)
        + 0.04 * Math.sin(along * scale + t * 0.2)
      )
      const y = height * (
        0.5
        + 0.38 * Math.cos(along * 0.9 - t * 0.4)
        + 0.14 * Math.sin(along * 1.7 + t * 0.25 + flow.seed * 0.5)
        + 0.04 * Math.cos(along * scale * 0.8 - t * 0.15)
      )

      const radius = shortSide * flow.thickness * (0.7 + 0.5 * Math.sin(t + u * 4))
      const edge = 1 - Math.abs(u - 0.5) * 2
      const alpha = opacity * (0.06 + 0.1 * edge)
      this.softDisc(layerCtx, x, y, radius, color, alpha)
    }
  }

  private drawBlot(
    blot: Blot,
    colors: RGB[],
    shortSide: number,
    opacity: number,
    audioHigh: number,
  ): void {
    const { layerCtx, width, height, time } = this
    const t = time * VISUAL.blotDrift * blot.speed + blot.phase
    const color = colors[blot.colorIndex % colors.length]

    const x = width * (
      0.5
      + 0.4 * Math.sin(t * 0.7 + blot.seed)
      + 0.15 * Math.sin(t * 1.3 + blot.seed * 2)
    )
    const y = height * (
      0.5
      + 0.35 * Math.cos(t * 0.55 + blot.seed * 1.4)
      + 0.18 * Math.sin(t * 0.9 - blot.seed)
    )

    const radius = shortSide * blot.size
      * (0.85 + 0.2 * Math.sin(t * 0.8))
      * (1 + audioHigh * 0.15)
    const alpha = opacity * 0.09 * (1 + audioHigh * 0.2)
    this.softDisc(layerCtx, x, y, radius, color, alpha)
  }

  private softDisc(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    color: RGB,
    alpha: number,
  ): void {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, cssRgb(color, alpha))
    gradient.addColorStop(0.45, cssRgb(color, alpha * 0.4))
    gradient.addColorStop(1, cssRgb(color, 0))
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
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

    // putImageData は transform の影響を受けないため、デバイスピクセルで生成する
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const i = (y * pw + x) * 4
        const sx = x / dpr
        const sy = y / dpr
        const n =
          0.55 * hash2(sx * 0.7, sy * 0.7)
          + 0.3 * hash2(sx * 0.15, sy * 0.15)
          + 0.15 * hash2(sx * 0.03, sy * 0.03)
        const speck = hash2(sx * 3.1, sy * 2.7) > 0.97 ? -40 : 0
        const v = (n - 0.5) * 255 * strength + speck
        data[i] = clampByte(br + v)
        data[i + 1] = clampByte(bg + v * 0.95)
        data[i + 2] = clampByte(bb + v * 0.9)
        data[i + 3] = 255
      }
    }

    ctx.putImageData(image, 0, 0)

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.strokeStyle = 'rgba(30, 28, 26, 0.08)'
    ctx.lineWidth = 1
    for (let i = 0; i < 40; i++) {
      const x0 = hash2(i, 1) * width
      const y0 = hash2(i, 2) * height
      const x1 = x0 + (hash2(i, 3) - 0.5) * width * 0.25
      const y1 = y0 + (hash2(i, 4) - 0.5) * height * 0.25
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
