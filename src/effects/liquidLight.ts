import { LIQUID_LIGHT } from '../config'
import type { VisualParams } from '../visualParams'
import type { Effect } from './types'

interface Lobe {
  x: number
  y: number
  baseX: number
  baseY: number
  radius: number
  channel: 0 | 1 | 2
  ang: number
  orbit: number
  spin: number
  pulse: number
  phase: number
  amount: number
}

interface Cell {
  x: number
  y: number
  radius: number
  ang: number
  orbit: number
  spin: number
  phase: number
  depth: number
  pulse: number
}

interface Drip {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  channel: 0 | 1 | 2
  life: number
  maxLife: number
  amount: number
}

/**
 * リキッドライトショー系。
 * 光の煙（Stam 染料）とは別物: 油膜の厚み＋セル穴＋下からの透過光。
 */
export class LiquidLightEffect implements Effect {
  readonly id = 'liquidLight' as const
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly gridCanvas: HTMLCanvasElement
  private readonly gridCtx: CanvasRenderingContext2D
  private readonly image: ImageData
  private readonly thickness: [Float32Array, Float32Array, Float32Array]
  private layer: HTMLCanvasElement | null = null
  private width = 0
  private height = 0
  private time = 0
  private lobes: Lobe[] = []
  private cells: Cell[] = []
  private drips: Drip[] = []
  private nextDripAt = 2.5

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D not available')
    this.ctx = ctx

    const n = LIQUID_LIGHT.gridSize
    this.gridCanvas = document.createElement('canvas')
    this.gridCanvas.width = n
    this.gridCanvas.height = n
    const gridCtx = this.gridCanvas.getContext('2d')
    if (!gridCtx) throw new Error('liquid grid canvas failed')
    this.gridCtx = gridCtx
    this.image = gridCtx.createImageData(n, n)
    this.thickness = [
      new Float32Array(n * n),
      new Float32Array(n * n),
      new Float32Array(n * n),
    ]

    this.initFilm()
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
  }

  update(dt: number, params: VisualParams): void {
    const speed = Math.max(0.04, params.speed)
    this.time += dt * speed
    this.stepActors(dt * speed)
    this.maybeDrip()
    this.rebuildThickness()
    this.rasterize(params)
    this.present(params)
  }

  private initFilm(): void {
    const lobeSeeds: Array<{ x: number; y: number; ch: 0 | 1 | 2; r: number }> = [
      { x: 0.42, y: 0.46, ch: 0, r: 0.22 },
      { x: 0.58, y: 0.5, ch: 1, r: 0.2 },
      { x: 0.5, y: 0.4, ch: 2, r: 0.18 },
      { x: 0.34, y: 0.55, ch: 1, r: 0.15 },
      { x: 0.66, y: 0.42, ch: 0, r: 0.16 },
      { x: 0.52, y: 0.6, ch: 2, r: 0.14 },
    ]
    this.lobes = lobeSeeds.slice(0, LIQUID_LIGHT.lobeCount).map((s, i) => ({
      x: s.x,
      y: s.y,
      baseX: s.x,
      baseY: s.y,
      radius: s.r,
      channel: s.ch,
      ang: i * 1.7,
      orbit: 0.03 + (i % 3) * 0.012,
      spin: 0.08 + (i % 4) * 0.03,
      pulse: 0.35 + (i % 3) * 0.15,
      phase: i * 0.9,
      amount: 0.85 + (i % 3) * 0.12,
    }))

    this.cells = []
    for (let i = 0; i < LIQUID_LIGHT.cellCount; i++) {
      this.cells.push({
        x: 0.22 + Math.random() * 0.56,
        y: 0.24 + Math.random() * 0.52,
        radius: 0.012 + Math.random() * 0.038,
        ang: Math.random() * Math.PI * 2,
        orbit: 0.01 + Math.random() * 0.04,
        spin: 0.05 + Math.random() * 0.12,
        phase: Math.random() * Math.PI * 2,
        depth: 0.55 + Math.random() * 0.45,
        pulse: 0.25 + Math.random() * 0.35,
      })
    }
  }

  private stepActors(dt: number): void {
    for (const lobe of this.lobes) {
      lobe.ang += lobe.spin * dt
      lobe.x = lobe.baseX + Math.cos(lobe.ang) * lobe.orbit
      lobe.y = lobe.baseY + Math.sin(lobe.ang * 0.85 + lobe.phase) * lobe.orbit * 0.9
      for (const other of this.lobes) {
        if (other === lobe) continue
        const dx = lobe.x - other.x
        const dy = lobe.y - other.y
        const dist = Math.hypot(dx, dy) + 1e-5
        const min = (lobe.radius + other.radius) * 0.55
        if (dist < min) {
          const push = (min - dist) * 0.015
          lobe.baseX += (dx / dist) * push
          lobe.baseY += (dy / dist) * push
        }
      }
      lobe.baseX = clampRange(lobe.baseX, 0.22, 0.78)
      lobe.baseY = clampRange(lobe.baseY, 0.24, 0.74)
    }

    for (const cell of this.cells) {
      cell.ang += cell.spin * dt
      const ox = Math.cos(cell.ang + cell.phase) * cell.orbit
      const oy = Math.sin(cell.ang * 0.9) * cell.orbit * 0.85
      cell.x = clampRange(cell.x * 0.998 + (0.5 + ox) * 0.002, 0.12, 0.88)
      cell.y = clampRange(cell.y * 0.998 + (0.5 + oy) * 0.002, 0.14, 0.86)
      for (const other of this.cells) {
        if (other === cell) continue
        const dx = cell.x - other.x
        const dy = cell.y - other.y
        const dist = Math.hypot(dx, dy) + 1e-5
        const min = cell.radius + other.radius
        if (dist < min) {
          const push = (min - dist) * 0.08
          cell.x += (dx / dist) * push
          cell.y += (dy / dist) * push
        }
      }
      const breathe = 1 + Math.sin(this.time * cell.pulse + cell.phase) * 0.04
      cell.radius = clampRange(cell.radius * 0.997 + (0.012 + (cell.depth * 0.03)) * 0.003 * breathe, 0.008, 0.055)
    }

    for (let i = this.drips.length - 1; i >= 0; i--) {
      const d = this.drips[i]
      d.x += d.vx * dt
      d.y += d.vy * dt
      d.vx *= Math.exp(-0.8 * dt)
      d.vy *= Math.exp(-0.8 * dt)
      d.life -= dt
      d.radius *= Math.exp(-0.12 * dt)
      if (d.life <= 0 || d.radius < 0.004) this.drips.splice(i, 1)
    }
  }

  private maybeDrip(): void {
    if (this.time < this.nextDripAt) return
    const span = LIQUID_LIGHT.dripIntervalMax - LIQUID_LIGHT.dripIntervalMin
    this.nextDripAt = this.time + LIQUID_LIGHT.dripIntervalMin + Math.random() * span

    const cx = 0.3 + Math.random() * 0.4
    const cy = 0.32 + Math.random() * 0.36
    const count = 4 + Math.floor(Math.random() * 6)
    const ch = Math.floor(Math.random() * 3) as 0 | 1 | 2
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4
      const spd = 0.03 + Math.random() * 0.08
      const life = 2.2 + Math.random() * 2.8
      this.drips.push({
        x: cx,
        y: cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        radius: 0.012 + Math.random() * 0.02,
        channel: Math.random() < 0.75 ? ch : (((ch + 1) % 3) as 0 | 1 | 2),
        life,
        maxLife: life,
        amount: 0.7 + Math.random() * 0.5,
      })
    }

    if (this.cells.length > 0 && Math.random() < 0.55) {
      const idx = Math.floor(Math.random() * this.cells.length)
      this.cells[idx] = {
        x: cx + (Math.random() - 0.5) * 0.08,
        y: cy + (Math.random() - 0.5) * 0.08,
        radius: 0.01 + Math.random() * 0.03,
        ang: Math.random() * Math.PI * 2,
        orbit: 0.01 + Math.random() * 0.03,
        spin: 0.06 + Math.random() * 0.1,
        phase: Math.random() * Math.PI * 2,
        depth: 0.6 + Math.random() * 0.4,
        pulse: 0.25 + Math.random() * 0.35,
      }
    }
  }

  private rebuildThickness(): void {
    const n = LIQUID_LIGHT.gridSize
    for (let c = 0; c < 3; c++) this.thickness[c].fill(0)

    const stamp = (
      field: Float32Array,
      x: number,
      y: number,
      radius: number,
      amount: number,
      soft: number,
    ): void => {
      const cx = x * (n - 1)
      const cy = y * (n - 1)
      const r = Math.max(1.2, radius * n)
      const r2 = r * r
      const i0 = Math.max(0, Math.floor(cx - r))
      const i1 = Math.min(n - 1, Math.ceil(cx + r))
      const j0 = Math.max(0, Math.floor(cy - r))
      const j1 = Math.min(n - 1, Math.ceil(cy + r))
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const dx = i - cx
          const dy = j - cy
          const d2 = dx * dx + dy * dy
          if (d2 > r2) continue
          const w = Math.exp((-d2 / r2) * soft)
          field[j * n + i] += amount * w
        }
      }
    }

    for (const lobe of this.lobes) {
      const pulse = 1 + 0.08 * Math.sin(this.time * lobe.pulse + lobe.phase)
      stamp(
        this.thickness[lobe.channel],
        lobe.x,
        lobe.y,
        lobe.radius * pulse,
        lobe.amount,
        2.2,
      )
    }

    for (const drip of this.drips) {
      const fade = Math.max(0, drip.life / drip.maxLife)
      stamp(
        this.thickness[drip.channel],
        drip.x,
        drip.y,
        drip.radius,
        drip.amount * fade,
        2.8,
      )
    }

    for (const cell of this.cells) {
      const cx = cell.x * (n - 1)
      const cy = cell.y * (n - 1)
      const r = Math.max(1, cell.radius * n)
      const r2 = r * r
      const i0 = Math.max(0, Math.floor(cx - r))
      const i1 = Math.min(n - 1, Math.ceil(cx + r))
      const j0 = Math.max(0, Math.floor(cy - r))
      const j1 = Math.min(n - 1, Math.ceil(cy + r))
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const dx = i - cx
          const dy = j - cy
          const d2 = dx * dx + dy * dy
          if (d2 > r2) continue
          const edge = Math.sqrt(d2) / r
          const carve = cell.depth * Math.exp(-edge * edge * 2.8) * (1 - edge * 0.25)
          const idx = j * n + i
          this.thickness[0][idx] = Math.max(0, this.thickness[0][idx] - carve)
          this.thickness[1][idx] = Math.max(0, this.thickness[1][idx] - carve)
          this.thickness[2][idx] = Math.max(0, this.thickness[2][idx] - carve)
        }
      }
    }
  }

  private rasterize(params: VisualParams): void {
    const n = LIQUID_LIGHT.gridSize
    const data = this.image.data
    const colors = params.colors
    const c0 = colors[0]
    const c1 = colors[1]
    const c2 = colors[2]
    const c3 = colors[3]
    const gain = LIQUID_LIGHT.gain * params.opacity
    const absorb = LIQUID_LIGHT.absorb
    const thinGlow = LIQUID_LIGHT.thinGlow

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const idx = j * n + i
        const a = this.thickness[0][idx]
        const b = this.thickness[1][idx]
        const c = this.thickness[2][idx]
        const dens = a + b + c
        const p = idx * 4
        if (dens < 0.02) {
          data[p] = 0
          data[p + 1] = 0
          data[p + 2] = 0
          data[p + 3] = 0
          continue
        }

        const sum = dens
        let r = (c0[0] * a + c1[0] * b + c2[0] * c) / sum
        let g = (c0[1] * a + c1[1] * b + c2[1] * c) / sum
        let bl = (c0[2] * a + c1[2] * b + c2[2] * c) / sum

        const transmit = Math.exp(-dens * absorb)
        const body = 1 - transmit
        r = r * body + c3[0] * transmit * thinGlow
        g = g * body + c3[1] * transmit * thinGlow
        bl = bl * body + c3[2] * transmit * thinGlow

        const edgeBoost = Math.min(1, dens * 1.8) * (1 - Math.min(1, dens / 1.6))
        r += (c3[0] - r) * edgeBoost * 0.2
        g += (c3[1] - g) * edgeBoost * 0.2
        bl += (c3[2] - bl) * edgeBoost * 0.2

        const alpha = Math.min(255, body * 255 * gain)
        data[p] = clamp255(r)
        data[p + 1] = clamp255(g)
        data[p + 2] = clamp255(bl)
        data[p + 3] = alpha
      }
    }
    this.gridCtx.putImageData(this.image, 0, 0)
  }

  private present(params: VisualParams): void {
    const { ctx, width, height } = this
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, width, height)

    const layer = this.ensureLayer(width, height)
    const lctx = layer.getContext('2d')
    if (!lctx) return
    lctx.setTransform(1, 0, 0, 1, 0, 0)
    lctx.clearRect(0, 0, layer.width, layer.height)
    const dpr = layer.width / width
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    lctx.imageSmoothingEnabled = true
    lctx.imageSmoothingQuality = 'high'
    lctx.filter = `blur(${LIQUID_LIGHT.upscaleBlur}px)`
    lctx.drawImage(this.gridCanvas, 0, 0, width, height)
    lctx.filter = 'none'
    lctx.globalAlpha = 0.92
    lctx.drawImage(this.gridCanvas, 0, 0, width, height)
    lctx.globalAlpha = 1

    this.applyEdgeFade(lctx, width, height, params.edgeFadePx)

    ctx.globalCompositeOperation = 'screen'
    ctx.drawImage(layer, 0, 0, width, height)
    ctx.globalCompositeOperation = 'source-over'
  }

  private applyEdgeFade(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    fadePx: number,
  ): void {
    const band = Math.max(1, fadePx)
    const grads = [
      grad(ctx, 0, 0, band, 0),
      grad(ctx, width, 0, width - band, 0),
      grad(ctx, 0, 0, 0, band),
      grad(ctx, 0, height, 0, height - band),
    ]
    for (const g of grads) {
      ctx.globalCompositeOperation = 'destination-in'
      ctx.fillStyle = g
      ctx.fillRect(0, 0, width, height)
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  private ensureLayer(width: number, height: number): HTMLCanvasElement {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    if (!this.layer) this.layer = document.createElement('canvas')
    const pw = Math.floor(width * dpr)
    const ph = Math.floor(height * dpr)
    if (this.layer.width !== pw || this.layer.height !== ph) {
      this.layer.width = pw
      this.layer.height = ph
    }
    return this.layer
  }
}

function grad(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,1)')
  return g
}

function clampRange(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}
