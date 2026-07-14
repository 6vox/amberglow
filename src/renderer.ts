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
  rx: number
  ry: number
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
    // 左〜中央に暖色油膜を厚く
    this.warms = [
      blob(0, 0.32, 0.45, 0.48, 0, 0.9),
      blob(1, 0.45, 0.38, 0.4, 1, 0.75),
      blob(2, 0.38, 0.58, 0.36, 0, 0.8),
      blob(3, 0.55, 0.5, 0.3, 1, 0.7),
      blob(4, 0.28, 0.32, 0.34, 0, 0.85),
    ]

    this.cools = [
      { ox: 0.72, oy: 0.42, radius: 0.34, ampX: 0.02, ampY: 0.02, speed: 0.11, phase: 1.2 },
      { ox: 0.68, oy: 0.58, radius: 0.22, ampX: 0.015, ampY: 0.02, speed: 0.09, phase: 3.5 },
    ]

    this.cells = Array.from({ length: VISUAL.cellCount }, (_, i) => {
      const r = rand(i + 40, 3)
      // 中心ホットスポットを避け、親油膜の外周寄りに配置
      const rad = 0.25 + r(2) * 0.7
      const ang = r(3) * Math.PI * 2
      return {
        parent: i % this.warms.length,
        ox: Math.cos(ang) * rad,
        oy: Math.sin(ang) * rad,
        rx: 0.01 + r(4) * 0.028,
        ry: 0.008 + r(5) * 0.024,
        speed: 0.06 + r(6) * 0.1,
        phase: r(7) * Math.PI * 2,
        depth: 0.25 + r(8) * 0.5,
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

    liquidCtx.globalCompositeOperation = 'lighter'
    const warmCenters: Array<{ x: number; y: number; r: number; aspect: number }> = []

    for (const b of this.warms) {
      const t = this.time * b.speed + b.phase
      const x = width * (b.ox + Math.sin(t) * b.ampX)
      const y = height * (b.oy + Math.cos(t * 0.9 + b.seed) * b.ampY)
      const radius = short * b.radius * (0.96 + 0.04 * Math.sin(t * 0.45))
      warmCenters.push({ x, y, r: radius, aspect: b.aspect })
      paintWarmOil(
        liquidCtx,
        x,
        y,
        radius,
        b.aspect,
        colors[b.colorIndex % colors.length],
        colors[(b.colorIndex + 1) % colors.length],
        VISUAL.warmAlpha * params.opacity,
        t,
      )
    }

    for (const d of this.cools) {
      const t = this.time * d.speed + d.phase
      const x = width * (d.ox + Math.sin(t) * d.ampX)
      const y = height * (d.oy + Math.cos(t * 0.8) * d.ampY)
      paintCoolDisc(
        liquidCtx,
        x,
        y,
        short * d.radius,
        colors[2],
        VISUAL.coolAlpha * params.opacity,
      )
    }

    // 油膜上の暗い斑点（白コア周りを避け、輪郭も弱く）
    liquidCtx.globalCompositeOperation = 'source-atop'
    for (const cell of this.cells) {
      const parent = warmCenters[cell.parent]
      if (!parent) continue
      const bt = this.time * cell.speed + cell.phase
      const x = parent.x + parent.r * 0.42 * (cell.ox + 0.05 * Math.sin(bt))
      const y = parent.y + parent.r * parent.aspect * 0.42 * (cell.oy + 0.05 * Math.cos(bt))
      // 画面中央の核付近は描かない
      const dx = (x - width * 0.42) / short
      const dy = (y - height * 0.46) / short
      if (dx * dx + dy * dy < 0.018) continue
      paintOilCell(
        liquidCtx,
        x,
        y,
        short * cell.rx,
        short * cell.ry,
        cell.depth * VISUAL.cellAlpha,
        bt,
      )
    }

    liquidCtx.globalCompositeOperation = 'lighter'
    paintSoftCore(liquidCtx, width, height, short, colors[3], this.time, VISUAL.coreGain)
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
    ctx.fillStyle = `rgb(${br},${bg},${bb})`
    ctx.fillRect(0, 0, pw, ph)
    // ごく弱い低周波ムラだけ
    const strength = VISUAL.floorNoiseStrength
    if (strength <= 0) return
    const image = ctx.getImageData(0, 0, pw, ph)
    const data = image.data
    for (let y = 0; y < ph; y += 2) {
      for (let x = 0; x < pw; x += 2) {
        const n = (hash2(x * 0.02, y * 0.02) - 0.5) * 255 * strength
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const i = ((y + dy) * pw + (x + dx)) * 4
            data[i] = clampByte(br + n)
            data[i + 1] = clampByte(bg + n)
            data[i + 2] = clampByte(bb + n)
            data[i + 3] = 255
          }
        }
      }
    }
    ctx.putImageData(image, 0, 0)
  }
}

function blob(
  i: number,
  ox: number,
  oy: number,
  radius: number,
  colorIndex: number,
  aspect: number,
): WarmBlob {
  const r = rand(i, 1)
  return {
    ox,
    oy,
    radius,
    aspect,
    ampX: 0.02 + r(2) * 0.025,
    ampY: 0.015 + r(3) * 0.02,
    speed: 0.12 + r(4) * 0.12,
    phase: r(5) * Math.PI * 2,
    colorIndex,
    seed: i * 9.7,
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
  ctx.rotate(Math.sin(t * 0.18) * 0.12)
  ctx.scale(1.05, aspect)
  const g = ctx.createRadialGradient(0, 0, radius * 0.04, 0, 0, radius)
  g.addColorStop(0, cssRgb(lighten(c1, 0.2), alpha))
  g.addColorStop(0.3, cssRgb(c0, alpha * 0.95))
  g.addColorStop(0.65, cssRgb(c0, alpha * 0.45))
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
  const g = ctx.createRadialGradient(x, y, radius * 0.08, x, y, radius)
  g.addColorStop(0, cssRgb(lighten(color, 0.3), alpha * 0.9))
  g.addColorStop(0.5, cssRgb(color, alpha * 0.5))
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
  rx: number,
  ry: number,
  alpha: number,
  t: number,
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(t * 0.2)
  ctx.scale(1, ry / Math.max(rx, 0.0001))
  const r = rx
  // 濃い斑点。白い縁取りやハイライトは付けない
  const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r)
  g.addColorStop(0, `rgba(40, 15, 8, ${0.55 * alpha})`)
  g.addColorStop(0.7, `rgba(20, 8, 4, ${0.35 * alpha})`)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
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
  const cx = width * (0.4 + 0.015 * Math.sin(time * 0.12))
  const cy = height * (0.45 + 0.01 * Math.cos(time * 0.1))
  const coreR = short * 0.14

  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR)
  g.addColorStop(0, cssRgb([255, 248, 220], 0.35 * gain))
  g.addColorStop(0.3, cssRgb(lighten(color, 0.25), 0.18 * gain))
  g.addColorStop(0.7, cssRgb(color, 0.05 * gain))
  g.addColorStop(1, cssRgb(color, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, coreR, 0, Math.PI * 2)
  ctx.fill()

  // 短い有機的なにじみだけ（直線放射はしない）
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + time * 0.04 + hash2(i, 1) * 0.4
    const len = short * (0.06 + 0.1 * hash2(i, 2))
    const x2 = cx + Math.cos(a) * len
    const y2 = cy + Math.sin(a) * len * 0.8
    const grad = ctx.createLinearGradient(cx, cy, x2, y2)
    grad.addColorStop(0, cssRgb([255, 240, 190], 0.07 * gain))
    grad.addColorStop(1, cssRgb(color, 0))
    ctx.strokeStyle = grad
    ctx.lineWidth = short * (0.012 + 0.02 * hash2(i, 3))
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.quadraticCurveTo(
      cx + (x2 - cx) * 0.4 + (hash2(i, 4) - 0.5) * short * 0.04,
      cy + (y2 - cy) * 0.4 + (hash2(i, 5) - 0.5) * short * 0.04,
      x2,
      y2,
    )
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
  ctx.scale(1.25, 0.86)
  const fade = ctx.createRadialGradient(0, 0, short * 0.12, 0, 0, short * fadeRadius)
  fade.addColorStop(0, 'rgba(0,0,0,1)')
  fade.addColorStop(0.6, 'rgba(0,0,0,0.95)')
  fade.addColorStop(0.85, 'rgba(0,0,0,0.3)')
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
  ctx.setTransform(canvas.width / width, 0, 0, canvas.width / width, 0, 0)
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
