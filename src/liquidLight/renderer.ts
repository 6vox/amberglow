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

/**
 * シミュレーション結果を透過光として描画する。
 * 染料吸収 + 厚みによる明暗、境界の縁取り・屈折を近似する。
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

    this.buildBoundaryBuffers()

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const idx = this.sim.ix(i + 1, j + 1)
        const p = (j * n + i) * 4
        const oil = this.sim.oil[idx]
        const water = this.sim.water[idx]
        const liquid = Math.min(1, oil + water)

        if (liquid < 0.008) {
          data[p] = 0
          data[p + 1] = 0
          data[p + 2] = 0
          data[p + 3] = 0
          continue
        }

        const d0 = this.sim.dye[0][idx]
        const d1 = this.sim.dye[1][idx]
        const d2 = this.sim.dye[2][idx]
        const d3 = this.sim.dye[3][idx]
        const thick = Math.max(0.05, this.sim.thickness[idx])

        // 透過光: 白い光が染料・厚みで吸収される近似
        const oilW = oil / (liquid + 0.001)
        const waterW = water / (liquid + 0.001)

        let absorbR = (d0 * roles.oilA[0] + d1 * roles.oilB[0] * oilW + d2 * roles.water[0] * waterW + d3 * roles.accent[0] * 0.3) / 255
        let absorbG = (d0 * roles.oilA[1] + d1 * roles.oilB[1] * oilW + d2 * roles.water[1] * waterW + d3 * roles.accent[1] * 0.3) / 255
        let absorbB = (d0 * roles.oilA[2] + d1 * roles.oilB[2] * oilW + d2 * roles.water[2] * waterW + d3 * roles.accent[2] * 0.3) / 255

        const density = (d0 + d1 + d2) * 0.35 + thick * 0.65
        absorbR = absorbR * density * 1.1
        absorbG = absorbG * density * 1.05
        absorbB = absorbB * density * 1.15

        // Beer-Lambert 近似
        let r = 255 * Math.exp(-absorbR * 2.2)
        let g = 255 * Math.exp(-absorbG * 2.0)
        let b = 255 * Math.exp(-absorbB * 2.3)

        // 薄い場所は明るく、厚い場所は暗く
        const thinBoost = Math.exp(-thick * 1.8) * 0.35
        r = r * (0.55 + thinBoost) + roles.accent[0] * thinBoost * 0.15
        g = g * (0.55 + thinBoost) + roles.accent[1] * thinBoost * 0.15
        b = b * (0.55 + thinBoost) + roles.accent[2] * thinBoost * 0.15

        const sat = Math.min(1, (d0 + d1 + d2) * 0.4)
        r = lerp(r, roles.oilA[0] * (0.4 + thick * 0.5), sat * 0.25)
        g = lerp(g, roles.water[1] * (0.35 + thick * 0.45), sat * 0.2)
        b = lerp(b, roles.water[2] * (0.4 + thick * 0.5), sat * 0.22)

        // 境界表現
        const bi = j * n + i
        const edge = this.boundaryStrength(i, j)
        const hi = edge * LIQUID_LIGHT.edgeHighlight
        const lo = edge * LIQUID_LIGHT.edgeDarken
        r = r * (1 - lo) + 255 * hi
        g = g * (1 - lo) + 255 * hi * 0.95
        b = b * (1 - lo) + 255 * hi * 0.9

        // 屈折: ごく小さなチャンネルずれ
        const shift = LIQUID_LIGHT.refractionShift
        if (edge > 0.05) {
          r = r * 0.85 + this.boundaryR[bi] * 0.15 * (1 + shift * 0.02)
          g = g * 0.88 + this.boundaryG[bi] * 0.12
          b = b * 0.85 + this.boundaryB[bi] * 0.15 * (1 - shift * 0.02)
        }

        const alpha = Math.min(255, liquid * density * 210 * gain)
        data[p] = clampByte(r)
        data[p + 1] = clampByte(g)
        data[p + 2] = clampByte(b)
        data[p + 3] = alpha
      }
    }

    this.simCtx.putImageData(this.image, 0, 0)

    // 黒ベース + 透過光を screen で合成
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
    lctx.globalAlpha = 0.92
    lctx.drawImage(this.simCanvas, 0, 0, width, height)
    lctx.globalAlpha = 1

    this.applyEdgeFade(lctx, width, height, params.edgeFadePx)

    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = 1
    ctx.drawImage(this.layer, 0, 0, width, height)
    ctx.globalCompositeOperation = 'source-over'
  }

  private buildBoundaryBuffers(): void {
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
        const t = this.sim.thickness[idx]
        const bright = edge * (180 + t * 40)
        this.boundaryR[bi] = clampByte(d0 * 80 + bright)
        this.boundaryG[bi] = clampByte(d1 * 70 + bright * 0.95)
        this.boundaryB[bi] = clampByte(d2 * 90 + bright * 0.88)
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
    return Math.min(1, grad * 2.8 + mix * 0.6)
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
