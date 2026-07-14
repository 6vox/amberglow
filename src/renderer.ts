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
  seed: number
  parent: number
  radius: number
  ox: number
  oy: number
  speed: number
  phase: number
}

/**
 * クラシックなリキッドライト：大きな油だまり + 小さな泡。
 * 放射状の光線・宇宙ネビュラっぽいノイズは使わない。
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
        ox: 0.22 + r(3.1) * 0.56,
        oy: 0.24 + r(7.7) * 0.52,
        ampX: 0.04 + r(5.2) * 0.08,
        ampY: 0.03 + r(9.4) * 0.07,
        speed: 0.25 + r(2.6) * 0.35,
        phase: r(1.7) * Math.PI * 2,
        aspect: 0.7 + r(4.4) * 0.55,
      }
    })

    this.bubbles = Array.from({ length: VISUAL.bubbleDensity }, (_, i) => {
      const r = (n: number) => fract(Math.sin((i + 9) * n) * 24634.917)
      return {
        seed: i * 3.7,
        parent: i % VISUAL.blobCount,
        radius: 0.008 + r(8.1) * 0.028,
        ox: (r(2.2) - 0.5) * 0.7,
        oy: (r(6.5) - 0.5) * 0.7,
        speed: 0.15 + r(4.8) * 0.25,
        phase: r(1.1) * Math.PI * 2,
      }
    })
  }

  private paint(params: VisualParams): void {
    const { ctx, liquidCtx, width, height } = this
    const shortSide = Math.min(width, height)
    const colors = params.colors

    // 床
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.drawImage(this.floor, 0, 0, width, height)

    // 液面レイヤーをクリア
    liquidCtx.clearRect(0, 0, width, height)
    liquidCtx.globalCompositeOperation = 'lighter'

    for (const blob of this.blobs) {
      const t = this.time * blob.speed + blob.phase
      const x = width * (blob.ox + Math.sin(t) * blob.ampX)
      const y = height * (blob.oy + Math.cos(t * 0.85 + blob.seed) * blob.ampY)
      const radius = shortSide * blob.radius * (0.92 + 0.08 * Math.sin(t * 0.7))
      const color = colors[blob.colorIndex % colors.length]
      const alpha = 0.28 * params.opacity * (0.9 + params.audioBass * 0.15)

      this.paintOilBlob(liquidCtx, x, y, radius, blob.aspect, color, alpha, t)
    }

    // 泡（暗めの縁を持つ小さな円）
    liquidCtx.globalCompositeOperation = 'source-atop'
    for (const bubble of this.bubbles) {
      const parent = this.blobs[bubble.parent]
      if (!parent) continue
      const t = this.time * parent.speed + parent.phase
      const bx = width * (parent.ox + Math.sin(t) * parent.ampX)
      const by = height * (parent.oy + Math.cos(t * 0.85 + parent.seed) * parent.ampY)
      const parentR = shortSide * parent.radius
      const bt = this.time * bubble.speed + bubble.phase
      const x = bx + parentR * (bubble.ox + 0.08 * Math.sin(bt))
      const y = by + parentR * parent.aspect * (bubble.oy + 0.08 * Math.cos(bt * 0.9))
      const r = shortSide * bubble.radius * (0.85 + 0.15 * Math.sin(bt))
      this.paintBubble(liquidCtx, x, y, r)
    }

    // 外周だけ床へ溶かすマスク（中央はシャープ）
    liquidCtx.globalCompositeOperation = 'destination-in'
    const mask = liquidCtx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      shortSide * 0.15,
      width * 0.5,
      height * 0.5,
      shortSide * (0.55 + VISUAL.edgeFade),
    )
    mask.addColorStop(0, 'rgba(0,0,0,1)')
    mask.addColorStop(0.55, 'rgba(0,0,0,0.92)')
    mask.addColorStop(0.82, 'rgba(0,0,0,0.35)')
    mask.addColorStop(1, 'rgba(0,0,0,0)')
    liquidCtx.fillStyle = mask
    // 楕円マスクで「枠」っぽさを消す
    liquidCtx.save()
    liquidCtx.translate(width * 0.5, height * 0.5)
    liquidCtx.scale(1.15, 0.85)
    liquidCtx.translate(-width * 0.5, -height * 0.5)
    liquidCtx.fillRect(0, 0, width, height)
    liquidCtx.restore()

    // 床の上に液面をのせる（加算は弱く）
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = 0.85 * VISUAL.liquidGain
    ctx.drawImage(this.liquid, 0, 0, width, height)

    ctx.globalCompositeOperation = 'soft-light'
    ctx.globalAlpha = 0.35
    ctx.drawImage(this.liquid, 0, 0, width, height)

    // 中央以外は床を戻す
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = VISUAL.floorCenterMix
    ctx.drawImage(this.floor, 0, 0, width, height)
    ctx.globalAlpha = 1
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
    ctx.rotate(Math.sin(t * 0.3) * 0.2)
    ctx.scale(1, aspect)

    // 外側のにじみ
    let g = ctx.createRadialGradient(0, 0, radius * 0.15, 0, 0, radius)
    g.addColorStop(0, cssRgb(color, alpha))
    g.addColorStop(0.45, cssRgb(color, alpha * 0.55))
    g.addColorStop(0.75, cssRgb(color, alpha * 0.18))
    g.addColorStop(1, cssRgb(color, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.fill()

    // 内側の少し明るい核（点光源っぽくしない程度）
    g = ctx.createRadialGradient(
      -radius * 0.15,
      -radius * 0.1,
      0,
      -radius * 0.15,
      -radius * 0.1,
      radius * 0.45,
    )
    g.addColorStop(0, cssRgb(lighten(color, 0.25), alpha * 0.35))
    g.addColorStop(1, cssRgb(color, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(-radius * 0.15, -radius * 0.1, radius * 0.45, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
  }

  private paintBubble(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
  ): void {
    // 油泡：中が少し透け、縁が暗い
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r)
    g.addColorStop(0, 'rgba(20, 16, 12, 0.05)')
    g.addColorStop(0.65, 'rgba(20, 16, 12, 0.12)')
    g.addColorStop(0.85, 'rgba(10, 8, 6, 0.28)')
    g.addColorStop(1, 'rgba(10, 8, 6, 0)')
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
    const image = ctx.createImageData(pw, ph)
    const data = image.data
    const strength = VISUAL.floorNoiseStrength

    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const i = (y * pw + x) * 4
        const sx = x / dpr
        const sy = y / dpr
        const n =
          0.55 * hash2(sx * 0.4, sy * 0.4)
          + 0.3 * hash2(sx * 0.1, sy * 0.1)
          + 0.15 * hash2(sx * 0.025, sy * 0.025)
        const grain = (hash2(sx * 2.5, sy * 2.3) - 0.5) * 10
        const v = (n - 0.5) * 255 * strength + grain
        data[i] = clampByte(br + v)
        data[i + 1] = clampByte(bg + v * 0.96)
        data[i + 2] = clampByte(bb + v * 0.9)
        data[i + 3] = 255
      }
    }
    ctx.putImageData(image, 0, 0)
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
