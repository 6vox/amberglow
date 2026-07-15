import type { RGB } from '../config'
import type { VisualParams } from '../visualParams'
import { LIQUID_LIGHT, paletteRoles } from './config'
import type { LiquidLightSim } from './simulation'

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpRgb(from: RGB, to: RGB, t: number): RGB {
  return [
    lerp(from[0], to[0], t),
    lerp(from[1], to[1], t),
    lerp(from[2], to[2], t),
  ]
}

/** 彩度を上げる（グレー寄りにせずビビッドにする） */
function boostSaturation(r: number, g: number, b: number, amount: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const mid = (r + g + b) / 3
  if (max - min < 1) return [r, g, b]
  return [
    mid + (r - mid) * amount,
    mid + (g - mid) * amount,
    mid + (b - mid) * amount,
  ]
}

/**
 * シミュレーション結果を透過光として描画する。
 * 染料チャンネルをパレット色へ直接写像し、厚みで明暗を付ける。
 */
export class LiquidLightRenderer {
  private readonly simCanvas: HTMLCanvasElement
  private readonly simCtx: CanvasRenderingContext2D
  private readonly layer: HTMLCanvasElement
  private readonly image: ImageData
  private readonly boundaryR: Uint8ClampedArray
  private readonly boundaryG: Uint8ClampedArray
  private readonly boundaryB: Uint8ClampedArray
  private displayColors: RGB[] = []
  private width = 0
  private height = 0

  constructor(private readonly sim: LiquidLightSim) {
    const n = sim.n
    this.simCanvas = document.createElement('canvas')
    const simCtx = this.simCanvas.getContext('2d')
    if (!simCtx) throw new Error('sim canvas failed')
    this.simCtx = simCtx
    this.simCanvas.width = n
    this.simCanvas.height = n
    this.image = simCtx.createImageData(n, n)
    this.boundaryR = new Uint8ClampedArray(n * n)
    this.boundaryG = new Uint8ClampedArray(n * n)
    this.boundaryB = new Uint8ClampedArray(n * n)
    this.layer = document.createElement('canvas')
  }

  resize(width: number, height: number): void {
    this.width = width
    this.height = height
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const pw = Math.floor(width * dpr)
    const ph = Math.floor(height * dpr)
    if (this.layer.width !== pw || this.layer.height !== ph) {
      this.layer.width = pw
      this.layer.height = ph
    }
  }

  /** パレットを短時間で補間 */
  updateColors(target: RGB[], dt: number): RGB[] {
    if (this.displayColors.length !== target.length) {
      this.displayColors = target.map((c) => [...c] as RGB)
      return this.displayColors
    }
    const t = Math.min(1, dt * 2.5)
    for (let i = 0; i < target.length; i++) {
      this.displayColors[i] = lerpRgb(this.displayColors[i], target[i], t)
    }
    return this.displayColors
  }

  render(ctx: CanvasRenderingContext2D, params: VisualParams): void {
    const { width, height } = this
    const colors = this.updateColors(params.colors, 1 / 60)
    const roles = paletteRoles(colors)
    const n = this.sim.n
    const gain = LIQUID_LIGHT.lightGain * params.opacity
    const data = this.image.data

    this.buildBoundaryBuffers(roles)

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const idx = this.sim.ix(i + 1, j + 1)
        const p = (j * n + i) * 4
        const oil = this.sim.oil[idx]
        const water = this.sim.water[idx]
        const liquid = Math.min(1.2, oil + water)

        const d0 = Math.max(0, this.sim.dye[0][idx])
        const d1 = Math.max(0, this.sim.dye[1][idx])
        const d2 = Math.max(0, this.sim.dye[2][idx])
        const d3 = Math.max(0, this.sim.dye[3][idx])
        const dyeSum = d0 + d1 + d2
        const presence = Math.max(liquid * 0.55, dyeSum * 0.45)

        if (presence < 0.04) {
          data[p] = 0
          data[p + 1] = 0
          data[p + 2] = 0
          data[p + 3] = 0
          continue
        }

        const thick = Math.max(0.05, this.sim.thickness[idx])

        // 染料チャンネルをパレット色へ直接混合（濁らない）
        const w0 = d0 + oil * 0.15
        const w1 = d1 + oil * 0.08
        const w2 = d2 + water * 0.2
        const wSum = Math.max(0.001, w0 + w1 + w2)
        let r = (roles.oilA[0] * w0 + roles.oilB[0] * w1 + roles.water[0] * w2) / wSum
        let g = (roles.oilA[1] * w0 + roles.oilB[1] * w1 + roles.water[1] * w2) / wSum
        let b = (roles.oilA[2] * w0 + roles.oilB[2] * w1 + roles.water[2] * w2) / wSum

        // 境界薄膜色を少し混ぜる
        const film = Math.min(0.35, d3 * 0.4)
        r = lerp(r, roles.accent[0], film)
        g = lerp(g, roles.accent[1], film)
        b = lerp(b, roles.accent[2], film)

        // 厚み: 薄い＝明るく、厚い＝濃く深い
        const thinGlow = Math.exp(-thick * 1.4)
        const deep = 0.42 + thick * 0.55
        r *= deep * (0.75 + thinGlow * 0.55)
        g *= deep * (0.75 + thinGlow * 0.55)
        b *= deep * (0.75 + thinGlow * 0.55)

        // 薄い縁はアクセントで少し発光
        r += roles.accent[0] * thinGlow * 0.12 * presence
        g += roles.accent[1] * thinGlow * 0.1 * presence
        b += roles.accent[2] * thinGlow * 0.08 * presence

        ;[r, g, b] = boostSaturation(r, g, b, LIQUID_LIGHT.saturationBoost)

        // 境界の縁取り
        const bi = j * n + i
        const edge = this.boundaryStrength(i, j)
        const hi = edge * LIQUID_LIGHT.edgeHighlight
        const lo = edge * LIQUID_LIGHT.edgeDarken
        r = r * (1 - lo) + 255 * hi
        g = g * (1 - lo) + 245 * hi
        b = b * (1 - lo) + 230 * hi

        if (edge > 0.08) {
          const shift = LIQUID_LIGHT.refractionShift
          r = r * 0.82 + this.boundaryR[bi] * 0.18 * (1 + shift * 0.015)
          g = g * 0.86 + this.boundaryG[bi] * 0.14
          b = b * 0.82 + this.boundaryB[bi] * 0.18 * (1 - shift * 0.015)
        }

        const alpha = Math.min(255, presence * (0.7 + thick * 0.5) * 240 * gain)
        data[p] = clampByte(r)
        data[p + 1] = clampByte(g)
        data[p + 2] = clampByte(b)
        data[p + 3] = alpha
      }
    }

    this.simCtx.putImageData(this.image, 0, 0)

    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, width, height)

    const lctx = this.layer.getContext('2d')
    if (!lctx) return
    const dpr = this.layer.width / width
    lctx.setTransform(1, 0, 0, 1, 0, 0)
    lctx.clearRect(0, 0, this.layer.width, this.layer.height)
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    lctx.imageSmoothingEnabled = true
    lctx.imageSmoothingQuality = 'high'
    lctx.filter = `blur(${LIQUID_LIGHT.upscaleBlur}px)`
    lctx.drawImage(this.simCanvas, 0, 0, width, height)
    lctx.filter = 'none'
    lctx.globalAlpha = 0.95
    lctx.drawImage(this.simCanvas, 0, 0, width, height)
    lctx.globalAlpha = 1

    this.applyEdgeFade(lctx, width, height, params.edgeFadePx)

    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = 1
    ctx.drawImage(this.layer, 0, 0, width, height)
    ctx.globalCompositeOperation = 'source-over'
  }

  private buildBoundaryBuffers(roles: ReturnType<typeof paletteRoles>): void {
    const n = this.sim.n
    const shift = Math.round(LIQUID_LIGHT.refractionShift)
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const edge = this.boundaryStrength(i, j)
        const bi = j * n + i
        const si = Math.max(0, Math.min(n - 1, i + shift))
        const sj = Math.max(0, Math.min(n - 1, j))
        const idx = this.sim.ix(si + 1, sj + 1)
        const d0 = this.sim.dye[0][idx]
        const d1 = this.sim.dye[1][idx]
        const d2 = this.sim.dye[2][idx]
        const bright = edge * 200
        this.boundaryR[bi] = clampByte(roles.oilA[0] * 0.4 + d0 * 60 + bright)
        this.boundaryG[bi] = clampByte(roles.oilB[1] * 0.35 + d1 * 50 + bright * 0.9)
        this.boundaryB[bi] = clampByte(roles.water[2] * 0.4 + d2 * 70 + bright * 0.85)
      }
    }
  }

  private boundaryStrength(i: number, j: number): number {
    const ii = i + 1
    const jj = j + 1
    const oil = this.sim.oil
    const water = this.sim.water
    const gx =
      oil[this.sim.ix(ii + 1, jj)] - oil[this.sim.ix(ii - 1, jj)]
      + water[this.sim.ix(ii + 1, jj)] - water[this.sim.ix(ii - 1, jj)]
    const gy =
      oil[this.sim.ix(ii, jj + 1)] - oil[this.sim.ix(ii, jj - 1)]
      + water[this.sim.ix(ii, jj + 1)] - water[this.sim.ix(ii, jj - 1)]
    const grad = Math.sqrt(gx * gx + gy * gy)
    const mix = Math.abs(oil[this.sim.ix(ii, jj)] - water[this.sim.ix(ii, jj)])
    return Math.min(1, grad * 3.2 + mix * 0.45)
  }

  private applyEdgeFade(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    fadePx: number,
  ): void {
    const band = Math.max(1, fadePx)
    const gradients = [
      (() => {
        const g = ctx.createLinearGradient(0, 0, band, 0)
        g.addColorStop(0, 'rgba(0,0,0,0)')
        g.addColorStop(1, 'rgba(0,0,0,1)')
        return g
      })(),
      (() => {
        const g = ctx.createLinearGradient(width, 0, width - band, 0)
        g.addColorStop(0, 'rgba(0,0,0,0)')
        g.addColorStop(1, 'rgba(0,0,0,1)')
        return g
      })(),
      (() => {
        const g = ctx.createLinearGradient(0, 0, 0, band)
        g.addColorStop(0, 'rgba(0,0,0,0)')
        g.addColorStop(1, 'rgba(0,0,0,1)')
        return g
      })(),
      (() => {
        const g = ctx.createLinearGradient(0, height, 0, height - band)
        g.addColorStop(0, 'rgba(0,0,0,0)')
        g.addColorStop(1, 'rgba(0,0,0,1)')
        return g
      })(),
    ]
    for (const g of gradients) {
      ctx.globalCompositeOperation = 'destination-in'
      ctx.fillStyle = g
      ctx.fillRect(0, 0, width, height)
    }
    ctx.globalCompositeOperation = 'source-over'
  }
}
