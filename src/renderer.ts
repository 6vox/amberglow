import { VISUAL, type RGB } from './config'
import { cssRgb } from './palette'
import type { VisualParams } from './visualParams'

interface WarmBlob {
  ox: number
  oy: number
  radius: number
  aspect: number
  ampX: number
  ampY: number
  speed: number
  phase: number
  colorIndex: number
  seed: number
}

interface CoolDisc {
  ox: number
  oy: number
  radius: number
  ampX: number
  ampY: number
  speed: number
  phase: number
}

interface OilCell {
  parent: number
  ox: number
  oy: number
  radius: number
  speed: number
  phase: number
  depth: number
}

/**
 * 理想リファレンス寄せ:
 * - 暖色の油膜色面
 * - その上の暗い油セル（真円ハイライト泡ではない）
 * - 寒色の半透明ディスク
 * - 中心の柔らかい発光（幾何学的な放射は避ける）
 * - 外周だけ床へフェード
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
  private warms: WarmBlob[] = []
  private cools: CoolDisc[] = []
  private cells: OilCell[] = []

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
    this.time += dt * params.speed
    this.paint(params)
  }

  private initEntities(): void {
    this.warms = Array.from({ length: VISUAL.warmBlobCount }, (_, i) => {
      const r = rand(i, 1)
      return {
        ox: 0.28 + r(2) * 0.28,
        oy: 0.35 + r(3) * 0.3,
        radius: 0.34 + r(4) * 0.22,
        aspect: 0.7 + r(5) * 0.45,
        ampX: 0.03 + r(6) * 0.04,
        ampY: 0.025 + r(7) * 0.035,
        speed: 0.16 + r(8) * 0.18,
        phase: r(9) * Math.PI * 2,
        colorIndex: i % 2,
        seed: i * 13.1,
      }
    })

    this.cools = Array.from({ length: VISUAL.coolDiscCount }, (_, i) => {
      const r = rand(i + 20, 2)
      return {
        ox: 0.62 + r(2) * 0.2,
        oy: 0.4 + r(3) * 0.25,
        radius: 0.28 + r(4) * 0.18,
        ampX: 0.02 + r(5) * 0.03,
        ampY: 0.02 + r(6) * 0.03,
        speed: 0.12 + r(7) * 0.12,
        phase: r(8) * Math.PI * 2,
      }
    })

    this.cells = Array.from({ length: VISUAL.cellCount }, (_, i) => {
      const r = rand(i + 40, 3)
      return {
        parent: i % VISUAL.warmBlobCount,
        ox: (r(2) - 0.5) * 1.1,
        oy: (r(3) - 0.5) * 1.1,
        radius: 0.008 + r(4) * 0.03,
        speed: 0.08 + r(5) * 0.12,
        phase: r(6) * Math.PI * 2,
        depth: 0.35 + r(7) * 0.55,
      }
    })
  }

  private paint(params: VisualParams): void {
    const { ctx, liquidCtx, width, height } = this
    const short = Math.min(width, height)
    const colors = params.colors
    const warmA = VISUAL.warmAlpha * params.opacity
    const coolA = VISUAL.coolAlpha * params.opacity

    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.drawImage(this.floor, 0, 0, width, height)

    resetLayer(liquidCtx, this.liquid, width)

    // 1) 暖色油膜
    liquidCtx.globalCompositeOperation = 'lighter'
    const warmCenters: Array<{ x: number; y: number; r: number; aspect: number }> = []
    for (const blob of this.warms) {
      const t = this.time * blob.speed + blob.phase
      const x = width * (blob.ox + Math.sin(t) * blob.ampX)
      const y = height * (blob.oy + Math.cos(t * 0.9 + blob.seed) * blob.ampY)
      const radius = short * blob.radius * (0.95 + 0.05 * Math.sin(t * 0.5))
      warmCenters.push({ x, y, r: radius, aspect: blob.aspect })
      const c0 = colors[blob.colorIndex % colors.length]
      const c1 = colors[(blob.colorIndex + 1) % colors.length]
      paintWarmOil(liquidCtx, x, y, radius, blob.aspect, c0, c1, warmA, t)
    }

    // 2) 寒色ディスク
    for (const disc of this.cools) {
      const t = this.time * disc.speed + disc.phase
      const x = width * (disc.ox + Math.sin(t) * disc.ampX)
      const y = height * (disc.oy + Math.cos(t * 0.8) * disc.ampY)
      const radius = short * disc.radius
      paintCoolDisc(liquidCtx, x, y, radius, colors[2], coolA)
    }

    // 3) 暗い油セル（ハイライト付きシャボンではない）
    liquidCtx.globalCompositeOperation = 'source-atop'
    for (const cell of this.cells) {
      const parent = warmCenters[cell.parent]
      if (!parent) continue
      const bt = this.time * cell.speed + cell.phase
      const x = parent.x + parent.r * (cell.ox * 0.55 + 0.04 * Math.sin(bt))
      const y = parent.y + parent.r * parent.aspect * (cell.oy * 0.55 + 0.04 * Math.cos(bt))
      const rr = short * cell.radius * (0.85 + 0.2 * cell.depth)
      paintOilCell(liquidCtx, x, y, rr, cell.depth * VISUAL.cellAlpha)
    }

    // 4) 中心の柔らかい発光（繊維はノイズで有機的に）
    liquidCtx.globalCompositeOperation = 'lighter'
    paintSoftCore(liquidCtx, width, height, short, colors[3], this.time, VISUAL.coreGain)

    // 5) 外周フェード
    applyEllipticalFade(liquidCtx, width, height, short, VISUAL.fadeRadius)

    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = VISUAL.liquidGain
    ctx.drawImage(this.liquid, 0, 0, width, height)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  private buildFloor(width: number, height: number, dpr: number): void {
    const pw = Math.floor(width * dpr)
    const ph = Math.floor(height * dpr)
    this.floor.width = pw
    this.floor.height = ph
    const ctx = this.floor.getContext('2d')
    if (!ctx) return

    const [br, bg, bb] = VISUAL.floorColor
    const scale = 4
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
        const n = hash2(x * 0.8, y * 0.8)
        const v = (n - 0.5) * 255 * strength
        data[i] = clampByte(br + v)
        data[i + 1] = clampByte(bg + v)
        data[i + 2] = clampByte(bb + v)
        data[i + 3] = 255
      }
    }
    sctx.putImageData(image, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(small, 0, 0, pw, ph)
  }
}

function paintWarmOil(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  aspect: number,
  c0: RGB,
  c1: RGB,
  alpha: number,
  t: number,
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(Math.sin(t * 0.2) * 0.15)
  ctx.scale(1, aspect)
  const g = ctx.createRadialGradient(0, 0, radius * 0.05, 0, 0, radius)
  g.addColorStop(0, cssRgb(lighten(c1, 0.15), alpha))
  g.addColorStop(0.35, cssRgb(c0, alpha * 0.9))
  g.addColorStop(0.7, cssRgb(c0, alpha * 0.4))
  g.addColorStop(1, cssRgb(c0, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function paintCoolDisc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: RGB,
  alpha: number,
): void {
  const g = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius)
  g.addColorStop(0, cssRgb(lighten(color, 0.25), alpha * 0.85))
  g.addColorStop(0.55, cssRgb(color, alpha * 0.45))
  g.addColorStop(1, cssRgb(color, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
}

function paintOilCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  alpha: number,
): void {
  // 理想画の暗い斑点：縁だけ濃いフラットな油セル
  const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r)
  g.addColorStop(0, `rgba(25, 12, 8, ${0.15 * alpha})`)
  g.addColorStop(0.55, `rgba(20, 10, 6, ${0.35 * alpha})`)
  g.addColorStop(0.82, `rgba(8, 4, 2, ${0.7 * alpha})`)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

function paintSoftCore(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  short: number,
  color: RGB,
  time: number,
  gain: number,
): void {
  const cx = width * (0.42 + 0.02 * Math.sin(time * 0.15))
  const cy = height * (0.46 + 0.015 * Math.cos(time * 0.12))
  const coreR = short * 0.18

  // 柔らかい核
  let g = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR)
  g.addColorStop(0, cssRgb([255, 250, 230], 0.55 * gain))
  g.addColorStop(0.25, cssRgb(lighten(color, 0.35), 0.28 * gain))
  g.addColorStop(0.65, cssRgb(color, 0.08 * gain))
  g.addColorStop(1, cssRgb(color, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, coreR, 0, Math.PI * 2)
  ctx.fill()

  // 有機的なにじみ（短いストロークを散らす。直線放射はしない）
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + time * 0.05
    const wobble = 0.7 + 0.3 * Math.sin(time * 0.4 + i * 1.7)
    const len = short * (0.08 + 0.12 * hash2(i, 3)) * wobble
    const x2 = cx + Math.cos(a) * len
    const y2 = cy + Math.sin(a) * len * 0.85
    const mid = 0.35 + 0.3 * hash2(i, 5)
    const mx = cx + (x2 - cx) * mid + (hash2(i, 7) - 0.5) * short * 0.03
    const my = cy + (y2 - cy) * mid + (hash2(i, 8) - 0.5) * short * 0.03
    const grad = ctx.createLinearGradient(cx, cy, x2, y2)
    grad.addColorStop(0, cssRgb([255, 245, 210], 0.12 * gain))
    grad.addColorStop(0.5, cssRgb(color, 0.08 * gain))
    grad.addColorStop(1, cssRgb(color, 0))
    ctx.strokeStyle = grad
    ctx.lineWidth = short * (0.01 + 0.02 * hash2(i, 9))
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.quadraticCurveTo(mx, my, x2, y2)
    ctx.stroke()
  }
}

function applyEllipticalFade(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  short: number,
  fadeRadius: number,
): void {
  ctx.globalCompositeOperation = 'destination-in'
  ctx.save()
  ctx.translate(width * 0.5, height * 0.48)
  ctx.scale(1.2, 0.84)
  const fade = ctx.createRadialGradient(0, 0, short * 0.1, 0, 0, short * fadeRadius)
  fade.addColorStop(0, 'rgba(0,0,0,1)')
  fade.addColorStop(0.55, 'rgba(0,0,0,0.96)')
  fade.addColorStop(0.82, 'rgba(0,0,0,0.35)')
  fade.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = fade
  ctx.beginPath()
  ctx.arc(0, 0, short * fadeRadius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function resetLayer(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  width: number,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const dpr = canvas.width / width
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function lighten(color: RGB, amount: number): RGB {
  return [
    Math.min(255, Math.round(color[0] + (255 - color[0]) * amount)),
    Math.min(255, Math.round(color[1] + (255 - color[1]) * amount)),
    Math.min(255, Math.round(color[2] + (255 - color[2]) * amount)),
  ]
}

function rand(i: number, salt: number): (n: number) => number {
  return (n: number) => fract(Math.sin((i + 1) * (n + salt) * 12.9898) * 43758.5453)
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
