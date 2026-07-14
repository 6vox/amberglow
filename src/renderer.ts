import { VISUAL } from './config'
import { FluidSim } from './fluid'
import type { VisualParams } from './visualParams'

interface Stir {
  x: number
  y: number
  ang: number
  orbit: number
  speed: number
  force: number
}

interface Dropper {
  x: number
  y: number
  channel: 0 | 1 | 2
  period: number
  phase: number
  radius: number
}

/**
 * 流体シミュレーション結果を床へ投影する。
 * VisualParams の speed / colors / opacity を参照（将来の音声連動用に分離）。
 */
export class AmberglowRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly fluidCanvas: HTMLCanvasElement
  private readonly fluidCtx: CanvasRenderingContext2D
  private readonly floor: HTMLCanvasElement
  private readonly sim: FluidSim
  private readonly image: ImageData
  private width = 0
  private height = 0
  private time = 0
  private stirs: Stir[] = []
  private droppers: Dropper[] = []

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D not available')
    this.ctx = ctx

    this.fluidCanvas = document.createElement('canvas')
    const fluidCtx = this.fluidCanvas.getContext('2d')
    if (!fluidCtx) throw new Error('fluid canvas failed')
    this.fluidCtx = fluidCtx

    this.floor = document.createElement('canvas')
    this.sim = new FluidSim(VISUAL.fluidSize)
    this.image = this.fluidCtx.createImageData(VISUAL.fluidSize, VISUAL.fluidSize)
    this.initActors()
    this.seedInitialDye()
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

    this.fluidCanvas.width = VISUAL.fluidSize
    this.fluidCanvas.height = VISUAL.fluidSize
    this.buildFloor(width, height, dpr)
  }

  update(dt: number, params: VisualParams): void {
    const speed = Math.max(0.05, params.speed)
    this.time += dt * speed
    this.drive(dt * speed)
    // 固定ステップで安定させる
    const steps = 1
    const stepDt = Math.min(0.033, dt * speed) / steps
    for (let i = 0; i < steps; i++) {
      this.sim.step(
        stepDt,
        VISUAL.viscosity,
        VISUAL.diffusion,
        VISUAL.dissipation,
      )
    }
    this.paint(params)
  }

  private initActors(): void {
    this.stirs = [
      { x: 0.35, y: 0.45, ang: 0.2, orbit: 0.12, speed: 0.35, force: 1 },
      { x: 0.65, y: 0.5, ang: 2.4, orbit: 0.1, speed: -0.28, force: 0.85 },
      { x: 0.5, y: 0.4, ang: 1.1, orbit: 0.08, speed: 0.22, force: 0.55 },
    ]
    this.droppers = [
      { x: 0.3, y: 0.42, channel: 0, period: 5.5, phase: 0.2, radius: 0.07 },
      { x: 0.4, y: 0.55, channel: 1, period: 6.5, phase: 2.1, radius: 0.06 },
      { x: 0.72, y: 0.45, channel: 2, period: 7.2, phase: 4.0, radius: 0.08 },
      { x: 0.62, y: 0.58, channel: 2, period: 8.0, phase: 1.3, radius: 0.05 },
    ]
  }

  private seedInitialDye(): void {
    // 最初から空にしない
    this.sim.addDye(0.32, 0.45, 1.2, 0, 0.12)
    this.sim.addDye(0.4, 0.52, 0.9, 1, 0.1)
    this.sim.addDye(0.7, 0.48, 1.1, 2, 0.13)
    this.sim.addForce(0.45, 0.48, 8, -4, 0.15)
  }

  private drive(dt: number): void {
    const force = VISUAL.stirForce * dt
    for (const s of this.stirs) {
      s.ang += s.speed * dt
      const x = s.x + Math.cos(s.ang) * s.orbit
      const y = s.y + Math.sin(s.ang) * s.orbit * 0.85
      const tx = -Math.sin(s.ang) * s.force * force
      const ty = Math.cos(s.ang) * s.force * force
      this.sim.addForce(x, y, tx, ty, 0.08)
    }

    for (const d of this.droppers) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * ((Math.PI * 2) / d.period) + d.phase)
      if (pulse > 0.82) {
        const wobbleX = d.x + 0.02 * Math.sin(this.time * 0.3 + d.phase)
        const wobbleY = d.y + 0.02 * Math.cos(this.time * 0.25 + d.phase)
        this.sim.addDye(
          wobbleX,
          wobbleY,
          VISUAL.dyeAmount * (pulse - 0.82) * 4,
          d.channel,
          d.radius,
        )
      }
    }
  }

  private paint(params: VisualParams): void {
    const { ctx, width, height } = this
    const n = this.sim.n
    const colors = params.colors
    const data = this.image.data
    const gain = VISUAL.liquidGain * params.opacity
    const c0 = colors[0]
    const c1 = colors[1]
    const c2 = colors[2]
    const c3 = colors[3]

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const idx = this.sim.ix(i + 1, j + 1)
        const a = Math.min(1.5, this.sim.d[0][idx])
        const b = Math.min(1.5, this.sim.d[1][idx])
        const c = Math.min(1.5, this.sim.d[2][idx])
        const dens = a + b + c
        if (dens < 0.002) {
          const p = (j * n + i) * 4
          data[p] = 0
          data[p + 1] = 0
          data[p + 2] = 0
          data[p + 3] = 0
          continue
        }

        // チャンネルをパレット色へ
        let r = c0[0] * a + c1[0] * b + c2[0] * c
        let g = c0[1] * a + c1[1] * b + c2[1] * c
        let bl = c0[2] * a + c1[2] * b + c2[2] * c
        const sum = a + b + c
        r /= sum
        g /= sum
        bl /= sum
        // 濃いところは少し明るく（ガラス越しのハイライト）
        const bright = Math.min(1, dens * 0.55)
        r = r + (c3[0] - r) * bright * 0.25
        g = g + (c3[1] - g) * bright * 0.25
        bl = bl + (c3[2] - bl) * bright * 0.25

        const alpha = Math.min(255, dens * 160 * gain)
        const p = (j * n + i) * 4
        data[p] = clamp(r)
        data[p + 1] = clamp(g)
        data[p + 2] = clamp(bl)
        data[p + 3] = alpha
      }
    }

    this.fluidCtx.putImageData(this.image, 0, 0)

    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.drawImage(this.floor, 0, 0, width, height)

    // 低解像流体を拡大（にじみ）
    ctx.save()
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = 1
    // 楕円マスクで外周を床へ
    ctx.beginPath()
    const rx = width * VISUAL.fadeRadius * 0.55
    const ry = height * VISUAL.fadeRadius * 0.42
    ctx.ellipse(width * 0.5, height * 0.48, rx, ry, 0, 0, Math.PI * 2)
    ctx.clip()
    ctx.filter = 'blur(10px)'
    ctx.drawImage(this.fluidCanvas, 0, 0, width, height)
    ctx.filter = 'none'
    ctx.globalAlpha = 0.85
    ctx.drawImage(this.fluidCanvas, 0, 0, width, height)
    ctx.restore()

    // 外周のソフトな落ち込み
    const fade = ctx.createRadialGradient(
      width * 0.5,
      height * 0.48,
      Math.min(width, height) * 0.18,
      width * 0.5,
      height * 0.48,
      Math.min(width, height) * 0.62,
    )
    fade.addColorStop(0, 'rgba(0,0,0,0)')
    fade.addColorStop(0.7, 'rgba(0,0,0,0)')
    fade.addColorStop(1, `rgba(${VISUAL.floorColor[0]},${VISUAL.floorColor[1]},${VISUAL.floorColor[2]},0.92)`)
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = fade
    ctx.fillRect(0, 0, width, height)
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
    g.addColorStop(0, 'rgba(255,255,255,0.03)')
    g.addColorStop(1, 'rgba(0,0,0,0.2)')
    c.fillStyle = g
    c.fillRect(0, 0, pw, ph)
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}
