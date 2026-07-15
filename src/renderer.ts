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

/** 流体染料とは別の飛沫／泡オブジェクト */
interface SplashDrop {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  life: number
  maxLife: number
  channel: 0 | 1 | 2
  /** 0=塗りつぶし滴, 1=泡リング */
  kind: 0 | 1
}

/**
 * 流体シミュレーション結果を床へ投影する。
 * VisualParams の speed / colors / opacity を参照（将来の音声連動用に分離）。
 * 飛沫は流体染料をいじらず、別レイヤーの粒子として重ねる。
 */
export class AmberglowRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly fluidCanvas: HTMLCanvasElement
  private readonly fluidCtx: CanvasRenderingContext2D
  private readonly floor: HTMLCanvasElement
  private readonly sim: FluidSim
  private readonly image: ImageData
  private layer: HTMLCanvasElement | null = null
  private width = 0
  private height = 0
  private time = 0
  private stirs: Stir[] = []
  private droppers: Dropper[] = []
  private readonly drops: SplashDrop[] = []
  private nextSplashAt = 3.5

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
    this.scheduleNextSplash(this.time)
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
    this.maybeSplash()
    this.updateDrops(dt * speed)
    const stepDt = Math.min(0.033, dt * speed)
    this.sim.step(
      stepDt,
      VISUAL.viscosity,
      VISUAL.diffusion,
      VISUAL.dissipation,
    )
    this.paint(params)
  }

  private initActors(): void {
    this.stirs = [
      { x: 0.35, y: 0.45, ang: 0.2, orbit: 0.12, speed: 0.16, force: 1 },
      { x: 0.65, y: 0.5, ang: 2.4, orbit: 0.1, speed: -0.13, force: 0.85 },
      { x: 0.5, y: 0.4, ang: 1.1, orbit: 0.08, speed: 0.1, force: 0.55 },
    ]
    this.droppers = [
      { x: 0.3, y: 0.42, channel: 0, period: 9.5, phase: 0.2, radius: 0.07 },
      { x: 0.4, y: 0.55, channel: 1, period: 11.0, phase: 2.1, radius: 0.06 },
      { x: 0.72, y: 0.45, channel: 2, period: 12.5, phase: 4.0, radius: 0.08 },
      { x: 0.62, y: 0.58, channel: 2, period: 14.0, phase: 1.3, radius: 0.05 },
    ]
  }

  private seedInitialDye(): void {
    this.sim.addDye(0.32, 0.45, 2.4, 0, 0.14)
    this.sim.addDye(0.4, 0.52, 1.8, 1, 0.12)
    this.sim.addDye(0.7, 0.48, 2.0, 2, 0.15)
    this.sim.addDye(0.55, 0.4, 1.2, 1, 0.08)
    this.sim.addForce(0.45, 0.48, 12, -6, 0.16)
    this.sim.addForce(0.62, 0.5, -8, 5, 0.12)
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

  private scheduleNextSplash(fromTime: number): void {
    const span = VISUAL.splashIntervalMax - VISUAL.splashIntervalMin
    this.nextSplashAt = fromTime + VISUAL.splashIntervalMin + Math.random() * span
  }

  /** 流体とは別オブジェクトとして飛沫／泡を発生 */
  private maybeSplash(): void {
    if (this.time < this.nextSplashAt) return
    this.scheduleNextSplash(this.time)

    const cx = 0.28 + Math.random() * 0.44
    const cy = 0.34 + Math.random() * 0.32
    const asBubble = Math.random() < VISUAL.bubbleChance
    const count =
      VISUAL.splashDropletMin
      + Math.floor(Math.random() * (VISUAL.splashDropletMax - VISUAL.splashDropletMin + 1))
    const baseCh = Math.floor(Math.random() * 3) as 0 | 1 | 2

    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5
      const speed =
        VISUAL.splashSpeedMin
        + Math.random() * (VISUAL.splashSpeedMax - VISUAL.splashSpeedMin)
      const life =
        VISUAL.splashLifeMin
        + Math.random() * (VISUAL.splashLifeMax - VISUAL.splashLifeMin)
      const radius =
        VISUAL.splashRadiusMin
        + Math.random() * (VISUAL.splashRadiusMax - VISUAL.splashRadiusMin)
      const ch = (
        Math.random() < 0.75
          ? baseCh
          : ((baseCh + 1 + (Math.random() < 0.5 ? 0 : 1)) % 3)
      ) as 0 | 1 | 2

      this.drops.push({
        x: cx + Math.cos(ang) * 0.008,
        y: cy + Math.sin(ang) * 0.008,
        vx: Math.cos(ang) * speed * (asBubble ? 0.35 : 1),
        vy: Math.sin(ang) * speed * (asBubble ? 0.35 : 1),
        radius: asBubble ? radius * (1.2 + Math.random() * 0.8) : radius,
        life,
        maxLife: life,
        channel: ch,
        kind: asBubble ? 1 : 0,
      })
    }
  }

  private updateDrops(dt: number): void {
    const drag = Math.exp(-1.1 * dt)
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]
      d.x += d.vx * dt
      d.y += d.vy * dt
      d.vx *= drag
      d.vy *= drag
      // ごく弱い漂い（流体のゆらぎに寄せるが、染料には書き込まない）
      d.vx += Math.sin(this.time * 0.7 + i) * 0.002 * dt
      d.vy += Math.cos(this.time * 0.55 + i * 0.3) * 0.002 * dt
      d.life -= dt
      if (
        d.life <= 0
        || d.x < -0.1
        || d.x > 1.1
        || d.y < -0.1
        || d.y > 1.1
      ) {
        this.drops.splice(i, 1)
      }
    }
  }

  private drawDrops(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    colors: VisualParams['colors'],
    opacity: number,
  ): void {
    if (this.drops.length === 0) return
    const scale = Math.min(width, height)
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    for (const d of this.drops) {
      const t = Math.max(0, d.life / d.maxLife)
      const fade = t * t * (3 - 2 * t)
      const alpha = fade * 0.85 * opacity
      if (alpha < 0.02) continue
      const col = colors[d.channel]
      const hi = colors[3]
      const px = d.x * width
      const py = d.y * height
      const r = d.radius * scale
      if (d.kind === 1) {
        // 泡: 柔らかいリング
        const g = ctx.createRadialGradient(px, py, r * 0.35, px, py, r)
        g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},0)`)
        g.addColorStop(0.55, `rgba(${col[0]},${col[1]},${col[2]},${alpha * 0.15})`)
        g.addColorStop(0.82, `rgba(${hi[0]},${hi[1]},${hi[2]},${alpha * 0.7})`)
        g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // 滴: 芯＋にじみ
        const g = ctx.createRadialGradient(px, py, 0, px, py, r)
        g.addColorStop(0, `rgba(${hi[0]},${hi[1]},${hi[2]},${alpha})`)
        g.addColorStop(0.35, `rgba(${col[0]},${col[1]},${col[2]},${alpha * 0.85})`)
        g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
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
        const p = (j * n + i) * 4
        if (dens < 0.002) {
          data[p] = 0
          data[p + 1] = 0
          data[p + 2] = 0
          data[p + 3] = 0
          continue
        }

        let r = c0[0] * a + c1[0] * b + c2[0] * c
        let g = c0[1] * a + c1[1] * b + c2[1] * c
        let bl = c0[2] * a + c1[2] * b + c2[2] * c
        const sum = a + b + c
        r /= sum
        g /= sum
        bl /= sum
        const bright = Math.min(1, dens * 0.55)
        r = r + (c3[0] - r) * bright * 0.25
        g = g + (c3[1] - g) * bright * 0.25
        bl = bl + (c3[2] - bl) * bright * 0.25

        const alpha = Math.min(255, dens * 200 * gain)
        data[p] = clamp(r * (0.85 + dens * 0.35))
        data[p + 1] = clamp(g * (0.85 + dens * 0.35))
        data[p + 2] = clamp(bl * (0.85 + dens * 0.35))
        data[p + 3] = alpha
      }
    }

    this.fluidCtx.putImageData(this.image, 0, 0)

    // プロジェクタ前提: 黒 = 投影なし = 床
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
    lctx.filter = `blur(${VISUAL.upscaleBlur}px)`
    lctx.drawImage(this.fluidCanvas, 0, 0, width, height)
    lctx.filter = 'none'
    lctx.globalAlpha = 0.95
    lctx.drawImage(this.fluidCanvas, 0, 0, width, height)
    lctx.globalAlpha = 1

    // 飛沫は流体の上に別オブジェクトとして重ねる（染料フィールドは変更しない）
    this.drawDrops(lctx, width, height, params.colors, params.opacity)

    this.applyEdgeFade(lctx, width, height, params.edgeFadePx)

    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = 1
    ctx.drawImage(layer, 0, 0, width, height)
    ctx.globalCompositeOperation = 'source-over'
  }

  /**
   * 端からの距離でフェード。
   * 端ピクセル = 透明度100%（黒）、edgeFadePx 内側 = 不透明。
   */
  private applyEdgeFade(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    fadePx: number,
  ): void {
    const band = Math.max(1, fadePx)
    const sides: Array<{ g: CanvasGradient }> = [
      { g: (() => {
        const g = ctx.createLinearGradient(0, 0, band, 0)
        g.addColorStop(0, 'rgba(0,0,0,0)')
        g.addColorStop(1, 'rgba(0,0,0,1)')
        return g
      })() },
      { g: (() => {
        const g = ctx.createLinearGradient(width, 0, width - band, 0)
        g.addColorStop(0, 'rgba(0,0,0,0)')
        g.addColorStop(1, 'rgba(0,0,0,1)')
        return g
      })() },
      { g: (() => {
        const g = ctx.createLinearGradient(0, 0, 0, band)
        g.addColorStop(0, 'rgba(0,0,0,0)')
        g.addColorStop(1, 'rgba(0,0,0,1)')
        return g
      })() },
      { g: (() => {
        const g = ctx.createLinearGradient(0, height, 0, height - band)
        g.addColorStop(0, 'rgba(0,0,0,0)')
        g.addColorStop(1, 'rgba(0,0,0,1)')
        return g
      })() },
    ]

    for (const side of sides) {
      ctx.globalCompositeOperation = 'destination-in'
      ctx.fillStyle = side.g
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

  private buildFloor(width: number, height: number, dpr: number): void {
    const pw = Math.floor(width * dpr)
    const ph = Math.floor(height * dpr)
    this.floor.width = pw
    this.floor.height = ph
    const c = this.floor.getContext('2d')
    if (!c) return
    c.fillStyle = '#000'
    c.fillRect(0, 0, pw, ph)
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}
