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
  size: number
  aspect: number
  speed: number
  phase: number
  depth: number
}

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
    this.warms = [
      mkWarm(0, 0.3, 0.42, 0.5, 0, 0.95),
      mkWarm(1, 0.42, 0.36, 0.42, 1, 0.8),
      mkWarm(2, 0.36, 0.55, 0.4, 0, 0.85),
      mkWarm(3, 0.5, 0.48, 0.34, 1, 0.75),
      mkWarm(4, 0.24, 0.34, 0.36, 0, 0.9),
      mkWarm(5, 0.48, 0.6, 0.3, 1, 0.7),
    ]
    this.cools = [
      { ox: 0.74, oy: 0.4, radius: 0.36, ampX: 0.018, ampY: 0.016, speed: 0.1, phase: 0.8 },
      { ox: 0.7, oy: 0.58, radius: 0.24, ampX: 0.012, ampY: 0.018, speed: 0.08, phase: 2.6 },
    ]
    this.cells = Array.from({ length: VISUAL.cellCount }, (_, i) => {
      const r = rnd(i + 50)
      const rad = 0.15 + r() * 0.75
      const ang = r() * Math.PI * 2
      return {
        parent: i % this.warms.length,
        ox: Math.cos(ang) * rad,
        oy: Math.sin(ang) * rad,
        size: 0.01 + r() * 0.032,
        aspect: 0.75 + r() * 0.5,
        speed: 0.05 + r() * 0.08,
        phase: r() * Math.PI * 2,
        depth: 0.3 + r() * 0.55,
      }
    })
  }

  private paint(params: VisualParams): void {
    const { ctx, liquidCtx, width, height } = this
    const short = Math.min(width, height)
    const colors = params.colors

    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.drawImage(this.floor, 0, 0, width, height)

    resetLayer(liquidCtx, this.liquid, width)

    // 暖色油膜（lighter しすぎると白飛びして細菌っぽくなるので抑える）
    liquidCtx.globalCompositeOperation = 'screen'
    const centers: Array<{ x: number; y: number; r: number; aspect: number }> = []
    for (const b of this.warms) {
      const t = this.time * b.speed + b.phase
      const x = width * (b.ox + Math.sin(t) * b.ampX)
      const y = height * (b.oy + Math.cos(t * 0.9 + b.seed) * b.ampY)
      const radius = short * b.radius * (0.97 + 0.03 * Math.sin(t * 0.4))
      centers.push({ x, y, r: radius, aspect: b.aspect })
      fillSoftBlob(
        liquidCtx,
        x,
        y,
        radius,
        b.aspect,
        colors[b.colorIndex],
        colors[(b.colorIndex + 1) % colors.length],
        VISUAL.warmAlpha * params.opacity,
        t,
      )
    }

    // 寒色ディスク
    liquidCtx.globalCompositeOperation = 'screen'
    for (const d of this.cools) {
      const t = this.time * d.speed + d.phase
      const x = width * (d.ox + Math.sin(t) * d.ampX)
      const y = height * (d.oy + Math.cos(t * 0.85) * d.ampY)
      fillCool(liquidCtx, x, y, short * d.radius, colors[2], VISUAL.coolAlpha * params.opacity)
    }

    // 油セル：赤茶の輪＋薄い塗り（理想画左の油泡寄り）
    liquidCtx.globalCompositeOperation = 'source-atop'
    for (const cell of this.cells) {
      const p = centers[cell.parent]
      if (!p) continue
      const bt = this.time * cell.speed + cell.phase
      const x = p.x + p.r * 0.5 * (cell.ox + 0.03 * Math.sin(bt))
      const y = p.y + p.r * p.aspect * 0.5 * (cell.oy + 0.03 * Math.cos(bt))
      // 明るい核付近は避ける
      const dx = (x - width * 0.4) / short
      const dy = (y - height * 0.45) / short
      if (dx * dx + dy * dy < 0.02) continue
      fillOilCell(
        liquidCtx,
        x,
        y,
        short * cell.size,
        cell.aspect,
        cell.depth * VISUAL.cellAlpha,
        bt,
      )
    }

    liquidCtx.globalCompositeOperation = 'lighter'
    fillSoftCore(liquidCtx, width, height, short, colors[3], this.time, VISUAL.coreGain)

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
    // 低周波のごく薄いムラのみ
    const g = c.createRadialGradient(pw * 0.5, ph * 0.45, 0, pw * 0.5, ph * 0.45, pw * 0.7)
    g.addColorStop(0, 'rgba(255,255,255,0.03)')
    g.addColorStop(1, 'rgba(0,0,0,0.12)')
    c.fillStyle = g
    c.fillRect(0, 0, pw, ph)
  }
}

function mkWarm(
  i: number,
  ox: number,
  oy: number,
  radius: number,
  colorIndex: number,
  aspect: number,
): WarmBlob {
  const r = rnd(i + 1)
  return {
    ox,
    oy,
    radius,
    aspect,
    ampX: 0.015 + r() * 0.02,
    ampY: 0.012 + r() * 0.018,
    speed: 0.1 + r() * 0.1,
    phase: r() * Math.PI * 2,
    colorIndex,
    seed: i * 8.3,
  }
}

function fillSoftBlob(
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
  ctx.rotate(Math.sin(t * 0.15) * 0.1)
  ctx.scale(1.05, aspect)
  const g = ctx.createRadialGradient(0, 0, radius * 0.05, 0, 0, radius)
  g.addColorStop(0, cssRgb(lighten(c1, 0.15), alpha))
  g.addColorStop(0.28, cssRgb(c0, alpha * 0.95))
  g.addColorStop(0.62, cssRgb(c0, alpha * 0.42))
  g.addColorStop(1, cssRgb(c0, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function fillCool(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: RGB,
  alpha: number,
): void {
  const g = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius)
  g.addColorStop(0, cssRgb(lighten(color, 0.28), alpha * 0.85))
  g.addColorStop(0.55, cssRgb(color, alpha * 0.4))
  g.addColorStop(1, cssRgb(color, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
}

function fillOilCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  aspect: number,
  alpha: number,
  t: number,
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(t * 0.12)
  ctx.scale(1, aspect)
  // 内側の油泡：中は少し透け、縁が濃い赤茶
  const g = ctx.createRadialGradient(0, 0, size * 0.2, 0, 0, size)
  g.addColorStop(0, `rgba(90, 25, 10, ${0.12 * alpha})`)
  g.addColorStop(0.55, `rgba(60, 15, 6, ${0.2 * alpha})`)
  g.addColorStop(0.82, `rgba(30, 8, 3, ${0.55 * alpha})`)
  g.addColorStop(1, 'rgba(20, 5, 2, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, size, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function fillSoftCore(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  short: number,
  color: RGB,
  time: number,
  gain: number,
): void {
  const cx = width * (0.4 + 0.012 * Math.sin(time * 0.1))
  const cy = height * (0.45 + 0.01 * Math.cos(time * 0.08))
  const r = short * 0.16
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
  g.addColorStop(0, cssRgb([255, 250, 230], 0.28 * gain))
  g.addColorStop(0.35, cssRgb(lighten(color, 0.2), 0.14 * gain))
  g.addColorStop(0.75, cssRgb(color, 0.04 * gain))
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
  ctx.scale(1.28, 0.88)
  const fade = ctx.createRadialGradient(0, 0, short * 0.14, 0, 0, short * fadeRadius)
  fade.addColorStop(0, 'rgba(0,0,0,1)')
  fade.addColorStop(0.58, 'rgba(0,0,0,0.95)')
  fade.addColorStop(0.84, 'rgba(0,0,0,0.28)')
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

function rnd(seed: number): () => number {
  let s = seed * 17.13 + 3.1
  return () => {
    s += 1
    return fract(Math.sin(s * 12.9898) * 43758.5453)
  }
}

function fract(n: number): number {
  return n - Math.floor(n)
}
