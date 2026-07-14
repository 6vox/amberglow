import { VISUAL, type RGB } from './config'
import { cssRgb } from './palette'
import type { VisualParams } from './visualParams'

interface Blob {
  seed: number
  colorIndex: number
  radius: number
  ox: number
  oy: number
  ampX: number
  ampY: number
  speed: number
  phase: number
  aspect: number
}

interface Bubble {
  parent: number
  radius: number
  ox: number
  oy: number
  speed: number
  phase: number
  darkness: number
}

/**
 * 油だまり＋泡のリキッドライト。
 * 放射状ギザギザやネビュラノイズは使わない。
 */
export class AmberglowRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly liquid: HTMLCanvasElement
  private readonly liquidCtx: CanvasRenderingContext2D
  private readonly floor: HTMLCanvasElement
  private width = 0
  private height = 0
  private time = 0
  private blobs: Blob[] = []
  private bubbles: Bubble[] = []

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D not available')
    this.ctx = ctx

    this.liquid = document.createElement('canvas')
    const liquidCtx = this.liquid.getContext('2d')
    if (!liquidCtx) throw new Error('liquid canvas failed')
    this.liquidCtx = liquidCtx

    this.floor = document.createElement('canvas')
    this.initEntities()
  }

  resize(width: number, height: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.width = width
    this.height = height

    for (const surface of [this.canvas, this.liquid]) {
      surface.width = Math.floor(width * dpr)
      surface.height = Math.floor(height * dpr)
      surface.style.width = `${width}px`
      surface.style.height = `${height}px`
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.liquidCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.buildFloor(width, height, dpr)
  }

  update(dt: number, params: VisualParams): void {
    this.time += dt * params.speed * (1 + params.audioEnergy * 0.2)
    this.paint(params)
  }

  private initEntities(): void {
    this.blobs = Array.from({ length: VISUAL.blobCount }, (_, i) => {
      const r = (n: number) => fract(Math.sin((i + 1) * n) * 43758.5453)
      return {
        seed: i * 11.3,
        colorIndex: i % 4,
        radius: lerp(VISUAL.blobSizeMin, VISUAL.blobSizeMax, r(12.9)),
        ox: 0.2 + r(3.1) * 0.6,
        oy: 0.22 + r(7.7) * 0.56,
        ampX: 0.035 + r(5.2) * 0.06,
        ampY: 0.03 + r(9.4) * 0.05,
        speed: 0.2 + r(2.6) * 0.28,
        phase: r(1.7) * Math.PI * 2,
        aspect: 0.65 + r(4.4) * 0.5,
      }
    })

    this.bubbles = Array.from({ length: VISUAL.bubbleDensity }, (_, i) => {
      const r = (n: number) => fract(Math.sin((i + 9) * n) * 24634.917)
      return {
        parent: i % VISUAL.blobCount,
        radius: 0.01 + r(8.1) * 0.035,
        ox: (r(2.2) - 0.5) * 0.75,
        oy: (r(6.5) - 0.5) * 0.75,
        speed: 0.12 + r(4.8) * 0.2,
        phase: r(1.1) * Math.PI * 2,
        darkness: 0.35 + r(3.3) * 0.45,
      }
    })
  }

  private paint(params: VisualParams): void {
    const { ctx, liquidCtx, width, height } = this
    const shortSide = Math.min(width, height)
    const colors = params.colors
    const oilAlpha = VISUAL.oilAlpha * params.opacity

    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.drawImage(this.floor, 0, 0, width, height)

    liquidCtx.setTransform(1, 0, 0, 1, 0, 0)
    liquidCtx.clearRect(0, 0, this.liquid.width, this.liquid.height)
    const dpr = this.liquid.width / width
    liquidCtx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // 油だまり：重ねて混色（lighter で染料が重なる感じ）
    liquidCtx.globalCompositeOperation = 'lighter'
    for (const blob of this.blobs) {
      const t = this.time * blob.speed + blob.phase
      const x = width * (blob.ox + Math.sin(t) * blob.ampX)
      const y = height * (blob.oy + Math.cos(t * 0.85 + blob.seed) * blob.ampY)
      const radius = shortSide * blob.radius * (0.94 + 0.06 * Math.sin(t * 0.6))
      const color = colors[blob.colorIndex % colors.length]
      this.paintOilBlob(liquidCtx, x, y, radius, blob.aspect, color, oilAlpha, t)
    }

    // 泡は油の上に暗い斑点として乗せる
    liquidCtx.globalCompositeOperation = 'source-atop'
    for (const bubble of this.bubbles) {
      const parent = this.blobs[bubble.parent]
      if (!parent) continue
      const t = this.time * parent.speed + parent.phase
      const bx = width * (parent.ox + Math.sin(t) * parent.ampX)
      const by = height * (parent.oy + Math.cos(t * 0.85 + parent.seed) * parent.ampY)
      const parentR = shortSide * parent.radius
      const bt = this.time * bubble.speed + bubble.phase
      const x = bx + parentR * (bubble.ox + 0.06 * Math.sin(bt))
      const y = by + parentR * parent.aspect * (bubble.oy + 0.06 * Math.cos(bt * 0.9))
      const r = shortSide * bubble.radius
      this.paintBubble(liquidCtx, x, y, r, bubble.darkness)
    }

    // 楕円マスクで外周だけ透明に（中央はくっきり）
    liquidCtx.globalCompositeOperation = 'destination-in'
    liquidCtx.save()
    liquidCtx.translate(width * 0.5, height * 0.48)
    liquidCtx.scale(1.25, 0.82)
    const fade = liquidCtx.createRadialGradient(
      0,
      0,
      shortSide * 0.12,
      0,
      0,
      shortSide * VISUAL.fadeRadius,
    )
    fade.addColorStop(0, 'rgba(0,0,0,1)')
    fade.addColorStop(0.6, 'rgba(0,0,0,0.95)')
    fade.addColorStop(0.85, 'rgba(0,0,0,0.4)')
    fade.addColorStop(1, 'rgba(0,0,0,0)')
    liquidCtx.fillStyle = fade
    liquidCtx.beginPath()
    liquidCtx.arc(0, 0, shortSide * VISUAL.fadeRadius, 0, Math.PI * 2)
    liquidCtx.fill()
    liquidCtx.restore()

    // 床の上へ投影
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = VISUAL.liquidGain
    ctx.drawImage(this.liquid, 0, 0, width, height)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  private paintOilBlob(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    aspect: number,
    color: RGB,
    alpha: number,
    t: number,
  ): void {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(Math.sin(t * 0.25) * 0.18)
    ctx.scale(1 + 0.08 * Math.sin(t * 0.4), aspect)

    const g = ctx.createRadialGradient(0, 0, radius * 0.08, 0, 0, radius)
    g.addColorStop(0, cssRgb(lighten(color, 0.2), alpha))
    g.addColorStop(0.35, cssRgb(color, alpha * 0.85))
    g.addColorStop(0.7, cssRgb(color, alpha * 0.35))
    g.addColorStop(1, cssRgb(color, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private paintBubble(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    darkness: number,
  ): void {
    const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.1, x, y, r)
    g.addColorStop(0, `rgba(255,255,255,${0.08 * darkness})`)
    g.addColorStop(0.45, `rgba(30,20,15,${0.15 * darkness})`)
    g.addColorStop(0.8, `rgba(10,8,6,${0.45 * darkness})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  private buildFloor(width: number, height: number, dpr: number): void {
    const pw = Math.floor(width * dpr)
    const ph = Math.floor(height * dpr)
    this.floor.width = pw
    this.floor.height = ph
    const ctx = this.floor.getContext('2d')
    if (!ctx) return

    const [br, bg, bb] = VISUAL.floorColor
    // 低解像度ノイズを拡大して粒々感を抑える
    const scale = 3
    const sw = Math.ceil(width / scale)
    const sh = Math.ceil(height / scale)
    const small = document.createElement('canvas')
    small.width = sw
    small.height = sh
    const sctx = small.getContext('2d')
    if (!sctx) return
    const image = sctx.createImageData(sw, sh)
    const data = image.data
    const strength = VISUAL.floorNoiseStrength

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4
        const n = 0.6 * hash2(x * 0.7, y * 0.7) + 0.4 * hash2(x * 0.15, y * 0.15)
        const v = (n - 0.5) * 255 * strength
        data[i] = clampByte(br + v)
        data[i + 1] = clampByte(bg + v * 0.96)
        data[i + 2] = clampByte(bb + v * 0.9)
        data[i + 3] = 255
      }
    }
    sctx.putImageData(image, 0, 0)

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(small, 0, 0, pw, ph)
  }
}

function lighten(color: RGB, amount: number): RGB {
  return [
    Math.min(255, Math.round(color[0] + (255 - color[0]) * amount)),
    Math.min(255, Math.round(color[1] + (255 - color[1]) * amount)),
    Math.min(255, Math.round(color[2] + (255 - color[2]) * amount)),
  ]
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function fract(n: number): number {
  return n - Math.floor(n)
}

function hash2(x: number, y: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453)
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}
