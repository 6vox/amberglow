import { VISUAL, type RGB } from './config'
import { cssRgb } from './palette'
import type { VisualParams } from './visualParams'

interface Mass {
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

/**
 * 構図優先のリキッドライト。
 * 左暖色 / 右寒色ディスク / 中央の柔らかい核 / 外周だけ床へ溶かす。
 * 個別の泡円は描かない（不快・AIっぽさの主因だったため）。
 */
export class AmberglowRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly liquid: HTMLCanvasElement
  private readonly liquidCtx: CanvasRenderingContext2D
  private readonly floor: HTMLCanvasElement
  private readonly grain: HTMLCanvasElement
  private width = 0
  private height = 0
  private time = 0
  private warms: Mass[] = []
  private cools: Mass[] = []

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
    this.grain = document.createElement('canvas')
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
    this.buildGrain(width, height, dpr)
  }

  update(dt: number, params: VisualParams): void {
    this.time += dt * params.speed
    this.paint(params)
  }

  private initEntities(): void {
    this.warms = [
      mass(0, 0.3, 0.44, 0.52, 0, 1.0),
      mass(1, 0.42, 0.38, 0.44, 1, 0.85),
      mass(2, 0.34, 0.56, 0.4, 0, 0.9),
      mass(3, 0.48, 0.5, 0.34, 1, 0.8),
      mass(4, 0.24, 0.34, 0.36, 0, 0.95),
    ]
    this.cools = [
      mass(10, 0.74, 0.4, 0.38, 2, 1.0),
      mass(11, 0.7, 0.58, 0.26, 2, 0.9),
    ]
  }

  private paint(params: VisualParams): void {
    const { ctx, liquidCtx, width, height } = this
    const short = Math.min(width, height)
    const colors = params.colors

    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.drawImage(this.floor, 0, 0, width, height)

    resetLayer(liquidCtx, this.liquid, width)
    liquidCtx.globalCompositeOperation = 'screen'

    for (const m of this.warms) {
      paintMass(liquidCtx, width, height, short, m, colors, VISUAL.warmAlpha * params.opacity, this.time)
    }
    for (const m of this.cools) {
      paintMass(liquidCtx, width, height, short, m, colors, VISUAL.coolAlpha * params.opacity, this.time)
    }

    // 内部テクスチャ：粗いノイズを multiply（円の列ではない）
    liquidCtx.globalCompositeOperation = 'soft-light'
    liquidCtx.globalAlpha = VISUAL.grainAlpha
    liquidCtx.drawImage(this.grain, 0, 0, width, height)
    liquidCtx.globalAlpha = 1

    liquidCtx.globalCompositeOperation = 'lighter'
    paintCore(liquidCtx, width, height, short, colors[3], this.time, VISUAL.coreGain)

    applyFade(liquidCtx, width, height, short, VISUAL.fadeRadius)

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
    const c = this.floor.getContext('2d')
    if (!c) return
    const [br, bg, bb] = VISUAL.floorColor
    c.fillStyle = `rgb(${br},${bg},${bb})`
    c.fillRect(0, 0, pw, ph)
    const g = c.createRadialGradient(pw * 0.5, ph * 0.48, 0, pw * 0.5, ph * 0.48, pw * 0.65)
    g.addColorStop(0, 'rgba(255,255,255,0.025)')
    g.addColorStop(1, 'rgba(0,0,0,0.18)')
    c.fillStyle = g
    c.fillRect(0, 0, pw, ph)
  }

  private buildGrain(width: number, height: number, dpr: number): void {
    const pw = Math.floor(width * dpr)
    const ph = Math.floor(height * dpr)
    this.grain.width = pw
    this.grain.height = ph
    const c = this.grain.getContext('2d')
    if (!c) return
    // 低解像のまだらを拡大 → 有機的なムラ（泡円ではない）
    const sw = Math.max(48, Math.floor(width / 18))
    const sh = Math.max(30, Math.floor(height / 18))
    const small = document.createElement('canvas')
    small.width = sw
    small.height = sh
    const s = small.getContext('2d')
    if (!s) return
    const img = s.createImageData(sw, sh)
    const data = img.data
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4
        const n = hash2(x * 1.3, y * 1.1)
        const v = Math.floor(40 + n * 180)
        data[i] = v
        data[i + 1] = Math.floor(v * 0.55)
        data[i + 2] = Math.floor(v * 0.35)
        data[i + 3] = 255
      }
    }
    s.putImageData(img, 0, 0)
    c.imageSmoothingEnabled = true
    c.drawImage(small, 0, 0, pw, ph)
  }
}

function mass(
  i: number,
  ox: number,
  oy: number,
  radius: number,
  colorIndex: number,
  aspect: number,
): Mass {
  const r = fract(Math.sin((i + 1) * 19.17) * 43758.5453)
  const r2 = fract(Math.sin((i + 1) * 47.11) * 24634.917)
  return {
    ox,
    oy,
    radius,
    aspect,
    ampX: 0.012 + r * 0.018,
    ampY: 0.01 + r2 * 0.015,
    speed: 0.09 + r * 0.09,
    phase: r2 * Math.PI * 2,
    colorIndex,
    seed: i * 7.3,
  }
}

function paintMass(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  short: number,
  m: Mass,
  colors: RGB[],
  alpha: number,
  time: number,
): void {
  const t = time * m.speed + m.phase
  const x = width * (m.ox + Math.sin(t) * m.ampX)
  const y = height * (m.oy + Math.cos(t * 0.9 + m.seed) * m.ampY)
  const radius = short * m.radius * (0.97 + 0.03 * Math.sin(t * 0.35))
  const c0 = colors[m.colorIndex % colors.length]
  const c1 = colors[(m.colorIndex + 1) % colors.length]

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(Math.sin(t * 0.14) * 0.1)
  ctx.scale(1.05, m.aspect)
  const g = ctx.createRadialGradient(0, 0, radius * 0.06, 0, 0, radius)
  g.addColorStop(0, cssRgb(lighten(c1, 0.12), alpha))
  g.addColorStop(0.3, cssRgb(c0, alpha * 0.92))
  g.addColorStop(0.65, cssRgb(c0, alpha * 0.38))
  g.addColorStop(1, cssRgb(c0, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function paintCore(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  short: number,
  color: RGB,
  time: number,
  gain: number,
): void {
  const cx = width * (0.4 + 0.01 * Math.sin(time * 0.1))
  const cy = height * (0.45 + 0.008 * Math.cos(time * 0.08))
  const r = short * 0.17
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
  g.addColorStop(0, cssRgb([255, 248, 220], 0.32 * gain))
  g.addColorStop(0.3, cssRgb(lighten(color, 0.2), 0.16 * gain))
  g.addColorStop(0.7, cssRgb(color, 0.05 * gain))
  g.addColorStop(1, cssRgb(color, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
}

function applyFade(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  short: number,
  fadeRadius: number,
): void {
  ctx.globalCompositeOperation = 'destination-in'
  ctx.save()
  ctx.translate(width * 0.5, height * 0.48)
  ctx.scale(1.3, 0.9)
  const fade = ctx.createRadialGradient(0, 0, short * 0.16, 0, 0, short * fadeRadius)
  fade.addColorStop(0, 'rgba(0,0,0,1)')
  fade.addColorStop(0.55, 'rgba(0,0,0,0.96)')
  fade.addColorStop(0.82, 'rgba(0,0,0,0.3)')
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

function fract(n: number): number {
  return n - Math.floor(n)
}

function hash2(x: number, y: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453)
}
