import { LIQUID_LIGHT } from '../config'
import type { VisualParams } from '../visualParams'
import type { Effect } from './types'

/**
 * 水面に浮かぶ一枚の油／絵の具。
 * 体積(mass)を保ったまま広がり、薄い膜になる。
 */
interface OilPatch {
  x: number
  y: number
  vx: number
  vy: number
  /** 体積に相当 */
  mass: number
  /** 現在の広がり半径（正規化座標） */
  radius: number
  /** 0 | 1 の2色だけ */
  channel: 0 | 1
  age: number
}

/**
 * リキッドライト（作り直し）。
 *
 * 物理メタファー:
 * - 黒い部分 = 水（油がないところ）
 * - 色 = 水面を滑る油／絵の具
 * - 広がりで薄くなり、別の油とぶつかると押し合い／同色はひっつく
 * - 「黒い点オブジェクト」は作らない。隙間は空けた結果として出る
 */
export class LiquidLightEffect implements Effect {
  readonly id = 'liquidLight' as const
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly gridCanvas: HTMLCanvasElement
  private readonly gridCtx: CanvasRenderingContext2D
  private readonly image: ImageData
  /** 2色の厚み場 */
  private readonly film: [Float32Array, Float32Array]
  private layer: HTMLCanvasElement | null = null
  private width = 0
  private height = 0
  private time = 0
  private patches: OilPatch[] = []
  private nextDripAt = 3

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
    this.film = [new Float32Array(n * n), new Float32Array(n * n)]

    this.seedPatches()
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
    const step = dt * speed
    this.time += step
    this.stepPatches(step)
    this.maybeDrip()
    this.rebuildFilm()
    this.rasterize(params)
    this.present(params)
  }

  private seedPatches(): void {
    this.patches = []
    for (let i = 0; i < LIQUID_LIGHT.initialPatches; i++) {
      const channel = (i % 2) as 0 | 1
      const mass = 0.012 + Math.random() * 0.02
      this.patches.push({
        x: 0.28 + Math.random() * 0.44,
        y: 0.3 + Math.random() * 0.4,
        vx: (Math.random() - 0.5) * 0.02,
        vy: (Math.random() - 0.5) * 0.02,
        mass,
        radius: Math.sqrt(mass / (Math.PI * 0.9)),
        channel,
        age: Math.random() * 4,
      })
    }
  }

  private stepPatches(dt: number): void {
    const drag = Math.exp(-LIQUID_LIGHT.drag * dt)

    // すべり＋ゆるい漂い
    for (const p of this.patches) {
      p.age += dt
      p.vx += Math.sin(this.time * 0.35 + p.age) * 0.004 * dt
      p.vy += Math.cos(this.time * 0.28 + p.age * 0.7) * 0.004 * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= drag
      p.vy *= drag

      // 体積保存で広がる: 目標半径 = sqrt(mass / (pi * minThickness))
      const maxR = Math.sqrt(p.mass / (Math.PI * LIQUID_LIGHT.minThickness))
      if (p.radius < maxR) {
        // 最初は速く、広がるほどゆっくり（水面の絵の具っぽさ）
        const room = maxR - p.radius
        p.radius += LIQUID_LIGHT.spreadRate * (0.35 + room * 2.5) * dt
        if (p.radius > maxR) p.radius = maxR
      }

      // 端では内側へ戻す（皿の縁）
      if (p.x < 0.12) p.vx += 0.08 * dt
      if (p.x > 0.88) p.vx -= 0.08 * dt
      if (p.y < 0.14) p.vy += 0.08 * dt
      if (p.y > 0.86) p.vy -= 0.08 * dt
      p.x = clamp(p.x, 0.08, 0.92)
      p.y = clamp(p.y, 0.1, 0.9)
    }

    // 干渉: 同色マージ / 異色は押し合い（隙間が自然に空く）
    for (let i = 0; i < this.patches.length; i++) {
      for (let j = i + 1; j < this.patches.length; j++) {
        const a = this.patches[i]
        const b = this.patches[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.hypot(dx, dy) + 1e-6
        const touch = (a.radius + b.radius) * LIQUID_LIGHT.mergeFactor

        if (dist >= touch) continue

        if (a.channel === b.channel) {
          // ひっついて大きくなる（体積合算、重心へ）
          const mass = a.mass + b.mass
          const w = b.mass / mass
          a.x += dx * w
          a.y += dy * w
          a.vx = (a.vx * a.mass + b.vx * b.mass) / mass
          a.vy = (a.vy * a.mass + b.vy * b.mass) / mass
          a.mass = mass
          // いったん少し縮めてからまた広がる感じ
          a.radius = Math.max(a.radius, b.radius) * 0.92
          this.patches.splice(j, 1)
          j--
        } else {
          // 混ざらず押し合い → あいだに水面（黒）が残る
          const overlap = touch - dist
          const nx = dx / dist
          const ny = dy / dist
          const push = overlap * LIQUID_LIGHT.repel
          const invA = 1 / (a.mass + 1e-6)
          const invB = 1 / (b.mass + 1e-6)
          const share = invA + invB
          a.x -= nx * push * (invA / share)
          a.y -= ny * push * (invA / share)
          b.x += nx * push * (invB / share)
          b.y += ny * push * (invB / share)
          a.vx -= nx * push * 0.8
          a.vy -= ny * push * 0.8
          b.vx += nx * push * 0.8
          b.vy += ny * push * 0.8
        }
      }
    }
  }

  private maybeDrip(): void {
    if (this.time < this.nextDripAt) return
    const span = LIQUID_LIGHT.dripIntervalMax - LIQUID_LIGHT.dripIntervalMin
    this.nextDripAt = this.time + LIQUID_LIGHT.dripIntervalMin + Math.random() * span
    if (this.patches.length >= LIQUID_LIGHT.maxPatches) return

    // 絵の具を一滴落とす → そこから広がる
    const mass = 0.008 + Math.random() * 0.016
    this.patches.push({
      x: 0.25 + Math.random() * 0.5,
      y: 0.28 + Math.random() * 0.44,
      vx: (Math.random() - 0.5) * 0.03,
      vy: (Math.random() - 0.5) * 0.03,
      mass,
      radius: Math.sqrt(mass / (Math.PI * 1.4)),
      channel: Math.random() < 0.5 ? 0 : 1,
      age: 0,
    })
  }

  private rebuildFilm(): void {
    const n = LIQUID_LIGHT.gridSize
    this.film[0].fill(0)
    this.film[1].fill(0)

    for (const p of this.patches) {
      // 体積保存: 平均厚み = mass / (pi r^2)、中心ほど厚く縁は薄い
      const area = Math.PI * p.radius * p.radius + 1e-6
      const meanT = p.mass / area
      stampSoftDisk(this.film[p.channel], n, p.x, p.y, p.radius, meanT * 2.4, 2.6)
    }
  }

  private rasterize(params: VisualParams): void {
    const n = LIQUID_LIGHT.gridSize
    const data = this.image.data
    const [c0, c1, cHi] = LIQUID_LIGHT.palette
    const gain = LIQUID_LIGHT.gain * params.opacity

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const idx = j * n + i
        const a = this.film[0][idx]
        const b = this.film[1][idx]
        const dens = a + b
        const p = idx * 4

        if (dens < 0.015) {
          // 水＝投影なし＝黒
          data[p] = 0
          data[p + 1] = 0
          data[p + 2] = 0
          data[p + 3] = 0
          continue
        }

        // 優勢な油の色（混色しすぎない）
        const w0 = a * a
        const w1 = b * b
        const wsum = w0 + w1 + 1e-5
        let r = (c0[0] * w0 + c1[0] * w1) / wsum
        let g = (c0[1] * w0 + c1[1] * w1) / wsum
        let bl = (c0[2] * w0 + c1[2] * w1) / wsum

        // 薄い縁はくすませず、少し明るく
        const thin = Math.exp(-dens * 3.2)
        r = r * (0.95 + thin * 0.15) + cHi[0] * thin * 0.35
        g = g * (0.95 + thin * 0.15) + cHi[1] * thin * 0.35
        bl = bl * (0.95 + thin * 0.15) + cHi[2] * thin * 0.35

        const avg = (r + g + bl) / 3
        r = avg + (r - avg) * 1.2
        g = avg + (g - avg) * 1.2
        bl = avg + (bl - avg) * 1.2

        data[p] = clamp255(r)
        data[p + 1] = clamp255(g)
        data[p + 2] = clamp255(bl)
        data[p + 3] = Math.min(255, dens * 220 * gain)
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
    lctx.globalAlpha = 1
    lctx.drawImage(this.gridCanvas, 0, 0, width, height)
    if (LIQUID_LIGHT.upscaleBlur > 0) {
      lctx.filter = `blur(${LIQUID_LIGHT.upscaleBlur}px)`
      lctx.globalAlpha = 0.3
      lctx.drawImage(this.gridCanvas, 0, 0, width, height)
      lctx.filter = 'none'
      lctx.globalAlpha = 1
    }

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
      makeFade(ctx, 0, 0, band, 0),
      makeFade(ctx, width, 0, width - band, 0),
      makeFade(ctx, 0, 0, 0, band),
      makeFade(ctx, 0, height, 0, height - band),
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

function stampSoftDisk(
  field: Float32Array,
  n: number,
  x: number,
  y: number,
  radius: number,
  amount: number,
  soft: number,
): void {
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

function makeFade(
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

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}
