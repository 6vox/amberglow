import { LIQUID_LIGHT } from './config'
import { SeededRandom } from './random'

const IX = (n: number, i: number, j: number): number => i + (n + 2) * j

/**
 * 油・水フェーズ分離型の簡易流体シミュレーション。
 * RGB チャンネル混ぜではなく、油/水の占有と染料追従で境界を維持する。
 */
export class LiquidLightSim {
  readonly n: number
  private readonly N: number

  u: Float32Array
  v: Float32Array
  u0: Float32Array
  v0: Float32Array

  /** 油性液体のフェーズ 0–1 */
  oil: Float32Array
  /** 水性液体のフェーズ 0–1 */
  water: Float32Array
  oil0: Float32Array
  water0: Float32Array

  /** 染料: 油性A / 油性または水性B / 水性 / 境界補助 */
  dye: [Float32Array, Float32Array, Float32Array, Float32Array]
  dye0: [Float32Array, Float32Array, Float32Array, Float32Array]

  /** 液体の厚み */
  thickness: Float32Array
  thickness0: Float32Array

  /** 圧力・作業バッファ */
  pressure: Float32Array
  div: Float32Array
  scratch: Float32Array

  constructor(n: number) {
    this.n = n
    this.N = (n + 2) * (n + 2)
    this.u = new Float32Array(this.N)
    this.v = new Float32Array(this.N)
    this.u0 = new Float32Array(this.N)
    this.v0 = new Float32Array(this.N)
    this.oil = new Float32Array(this.N)
    this.water = new Float32Array(this.N)
    this.oil0 = new Float32Array(this.N)
    this.water0 = new Float32Array(this.N)
    this.dye = [
      new Float32Array(this.N),
      new Float32Array(this.N),
      new Float32Array(this.N),
      new Float32Array(this.N),
    ]
    this.dye0 = [
      new Float32Array(this.N),
      new Float32Array(this.N),
      new Float32Array(this.N),
      new Float32Array(this.N),
    ]
    this.thickness = new Float32Array(this.N)
    this.thickness0 = new Float32Array(this.N)
    this.pressure = new Float32Array(this.N)
    this.div = new Float32Array(this.N)
    this.scratch = new Float32Array(this.N)
  }

  ix(i: number, j: number): number {
    return IX(this.n, i, j)
  }

  seedInitialState(seed = LIQUID_LIGHT.initSeed): void {
    this.clear()
    const rng = new SeededRandom(seed)
    const n = this.n

    // 大きな油性領域（赤）— 中央やや左
    this.addPhaseBlob(0.34, 0.44, 0.22, 'oil', 0.95)
    this.addDyeBlob(0.34, 0.44, 0.2, 0, 1.4)
    this.addThickness(0.34, 0.44, 0.18, 0.7)

    // オレンジの油性帯
    this.addPhaseBlob(0.48, 0.58, 0.14, 'oil', 0.8)
    this.addDyeBlob(0.48, 0.58, 0.13, 1, 1.2)
    this.addThickness(0.48, 0.58, 0.12, 0.55)

    // 水性領域（シアン）— 右
    this.addPhaseBlob(0.68, 0.48, 0.18, 'water', 0.9)
    this.addDyeBlob(0.68, 0.48, 0.17, 2, 1.35)
    this.addThickness(0.68, 0.48, 0.15, 0.6)

    // 黄色い小さな滴
    for (let i = 0; i < 5; i++) {
      const x = 0.4 + rng.range(-0.18, 0.22)
      const y = 0.42 + rng.range(-0.12, 0.18)
      const r = rng.range(0.035, 0.065)
      this.addPhaseBlob(x, y, r, 'oil', rng.range(0.55, 0.85))
      this.addDyeBlob(x, y, r * 0.95, 1, rng.range(0.9, 1.3))
      this.addThickness(x, y, r, rng.range(0.4, 0.7))
    }

    // 水性セル（青）
    for (let i = 0; i < 4; i++) {
      const x = 0.55 + rng.range(-0.15, 0.2)
      const y = 0.55 + rng.range(-0.15, 0.15)
      const r = rng.range(0.04, 0.09)
      this.addPhaseBlob(x, y, r, 'water', rng.range(0.5, 0.8))
      this.addDyeBlob(x, y, r * 0.9, 2, rng.range(0.85, 1.25))
      this.addThickness(x, y, r, rng.range(0.35, 0.6))
    }

    // ごく弱い初期回転
    for (let j = 1; j <= n; j++) {
      for (let i = 1; i <= n; i++) {
        const idx = this.ix(i, j)
        const nx = (i / n) - 0.45
        const ny = (j / n) - 0.5
        const dist = Math.sqrt(nx * nx + ny * ny) + 0.01
        this.u[idx] += (-ny / dist) * 1.2 * Math.exp(-dist * 5)
        this.v[idx] += (nx / dist) * 1.2 * Math.exp(-dist * 5)
      }
    }
  }

  clear(): void {
    this.u.fill(0)
    this.v.fill(0)
    this.oil.fill(0)
    this.water.fill(0)
    for (let c = 0; c < 4; c++) this.dye[c].fill(0)
    this.thickness.fill(0)
  }

  step(dt: number): void {
    const n = this.n
    const visc = LIQUID_LIGHT.viscosity
    const pDiff = LIQUID_LIGHT.phaseDiffusion
    const dDiff = LIQUID_LIGHT.dyeDiffusion

    // velocity
    diffuse(n, 1, this.u0, this.u, visc, dt)
    diffuse(n, 2, this.v0, this.v, visc, dt)
    project(n, this.u0, this.v0, this.u, this.v)
    advect(n, 1, this.u, this.u0, this.u0, this.v0, dt)
    advect(n, 2, this.v, this.v0, this.u0, this.v0, dt)
    project(n, this.u, this.v, this.u0, this.v0)

    // phases & thickness advection
    diffuse(n, 0, this.oil0, this.oil, pDiff, dt)
    advect(n, 0, this.oil, this.oil0, this.u, this.v, dt)
    diffuse(n, 0, this.water0, this.water, pDiff, dt)
    advect(n, 0, this.water, this.water0, this.u, this.v, dt)
    diffuse(n, 0, this.thickness0, this.thickness, pDiff * 0.5, dt)
    advect(n, 0, this.thickness, this.thickness0, this.u, this.v, dt)

    for (let c = 0; c < 4; c++) {
      diffuse(n, 0, this.dye0[c], this.dye[c], dDiff, dt)
      advect(n, 0, this.dye[c], this.dye0[c], this.u, this.v, dt)
    }

    this.applySurfaceTension()
    this.separatePhases()
    this.sharpenDyes()
    this.followDyesWithPhases()
    this.applyDissipation()
    this.dampenVelocity(0.992)
  }

  /** 正規化座標 0–1 に力を加える */
  addForce(x: number, y: number, fx: number, fy: number, radius: number): void {
    splat(this.n, this.u, x, y, fx, radius)
    splat(this.n, this.v, x, y, fy, radius)
  }

  /** 回転力（中心 cx,cy 周り） */
  addRotation(cx: number, cy: number, strength: number, radius: number): void {
    const n = this.n
    const cxp = cx * n
    const cyp = cy * n
    const r = Math.max(1, radius * n)
    const r2 = r * r
    for (let j = 1; j <= n; j++) {
      for (let i = 1; i <= n; i++) {
        const dx = i - cxp
        const dy = j - cyp
        const d2 = dx * dx + dy * dy
        if (d2 > r2) continue
        const w = Math.exp((-d2 / r2) * 2)
        const dist = Math.sqrt(d2) + 0.01
        const idx = this.ix(i, j)
        this.u[idx] += (-dy / dist) * strength * w
        this.v[idx] += (dx / dist) * strength * w
      }
    }
  }

  /** 押し広げ（Press）: 中心を薄く、周囲にリング */
  addPress(cx: number, cy: number, strength: number, radius: number): void {
    const n = this.n
    const cxp = cx * n
    const cyp = cy * n
    const r = Math.max(1, radius * n)
    const r2 = r * r
    for (let j = 1; j <= n; j++) {
      for (let i = 1; i <= n; i++) {
        const dx = i - cxp
        const dy = j - cyp
        const d2 = dx * dx + dy * dy
        if (d2 > r2) continue
        const dist = Math.sqrt(d2) / r
        const idx = this.ix(i, j)
        const ring = Math.exp(-((dist - 0.55) ** 2) * 18)
        const core = Math.exp(-dist * dist * 5)
        this.thickness[idx] = Math.max(0, this.thickness[idx] - core * strength * 0.35)
        this.thickness[idx] += ring * strength * 0.25
        const push = ring * strength * 0.02
        const ang = Math.atan2(dy, dx) + 0.001
        this.u[idx] += Math.cos(ang) * push
        this.v[idx] += Math.sin(ang) * push
      }
    }
  }

  addOilDrop(x: number, y: number, amount: number, radius: number, dyeChannel: 0 | 1, dyeAmt: number): void {
    this.addPhaseBlob(x, y, radius, 'oil', amount)
    this.addDyeBlob(x, y, radius * 0.9, dyeChannel, dyeAmt)
    this.addThickness(x, y, radius, amount * 0.4)
  }

  addWaterDrop(x: number, y: number, amount: number, radius: number, dyeAmt: number): void {
    this.addPhaseBlob(x, y, radius, 'water', amount)
    this.addDyeBlob(x, y, radius * 0.9, 2, dyeAmt)
    this.addThickness(x, y, radius, amount * 0.35)
  }

  private addPhaseBlob(
    x: number,
    y: number,
    radius: number,
    phase: 'oil' | 'water',
    amount: number,
  ): void {
    const field = phase === 'oil' ? this.oil : this.water
    splat(this.n, field, x, y, amount, radius)
  }

  private addDyeBlob(x: number, y: number, radius: number, channel: 0 | 1 | 2 | 3, amount: number): void {
    splat(this.n, this.dye[channel], x, y, amount, radius)
  }

  private addThickness(x: number, y: number, radius: number, amount: number): void {
    splat(this.n, this.thickness, x, y, amount, radius)
  }

  private applySurfaceTension(): void {
    const n = this.n
    const iters = LIQUID_LIGHT.tensionSmoothIters
    const sharpen = LIQUID_LIGHT.phaseSharpen

    for (const field of [this.oil, this.water]) {
      for (let k = 0; k < iters; k++) {
        smoothField(n, field, this.scratch)
        field.set(this.scratch)
      }
      // コントラスト強調で丸い輪郭を維持（閾値を下げて色面を残す）
      for (let j = 1; j <= n; j++) {
        for (let i = 1; i <= n; i++) {
          const idx = this.ix(i, j)
          const v = field[idx]
          const centered = (v - 0.28) * sharpen + 0.28
          field[idx] = Math.max(0, Math.min(1.2, centered))
        }
      }
    }
  }

  private separatePhases(): void {
    const n = this.n
    const sep = LIQUID_LIGHT.phaseSeparation
    for (let j = 1; j <= n; j++) {
      for (let i = 1; i <= n; i++) {
        const idx = this.ix(i, j)
        let o = this.oil[idx]
        let w = this.water[idx]
        const sum = o + w
        if (sum > 1.15) {
          const scale = 1.15 / sum
          o *= scale
          w *= scale
        }
        // 境界で強く押し出す
        const diff = o - w
        const push = Math.sign(diff) * Math.min(0.2, Math.abs(diff) * sep * 0.18)
        o = Math.max(0, Math.min(1.2, o + push))
        w = Math.max(0, Math.min(1.2, w - push))
        this.oil[idx] = o
        this.water[idx] = w
      }
    }
  }

  private sharpenDyes(): void {
    const n = this.n
    const sharpen = LIQUID_LIGHT.dyeSharpen
    for (let c = 0; c < 3; c++) {
      const field = this.dye[c]
      for (let j = 1; j <= n; j++) {
        for (let i = 1; i <= n; i++) {
          const idx = this.ix(i, j)
          const v = field[idx]
          if (v < 0.02) {
            field[idx] *= 0.97
            continue
          }
          field[idx] = Math.max(0, Math.min(1.8, (v - 0.2) * sharpen + 0.2))
        }
      }
    }
  }

  private followDyesWithPhases(): void {
    const n = this.n
    for (let j = 1; j <= n; j++) {
      for (let i = 1; i <= n; i++) {
        const idx = this.ix(i, j)
        const o = this.oil[idx]
        const w = this.water[idx]
        const liquid = Math.min(1.2, o + w)
        // 相のない場所の染料だけ弱く減衰（クランプで潰さない）
        if (o < 0.04) this.dye[0][idx] *= 0.992
        if (liquid < 0.04) this.dye[1][idx] *= 0.992
        if (w < 0.04) this.dye[2][idx] *= 0.992
        // 境界補助色
        const gx = this.oil[this.ix(i + 1, j)] - this.oil[this.ix(i - 1, j)]
        const gy = this.oil[this.ix(i, j + 1)] - this.oil[this.ix(i, j - 1)]
        const gxw = this.water[this.ix(i + 1, j)] - this.water[this.ix(i - 1, j)]
        const gyw = this.water[this.ix(i, j + 1)] - this.water[this.ix(i, j - 1)]
        const edge = Math.sqrt(gx * gx + gy * gy + gxw * gxw + gyw * gyw)
        this.dye[3][idx] = this.dye[3][idx] * 0.9 + edge * 0.45
      }
    }
    // 厚みはゆっくり液体量へ寄せる（急激な均一化を避ける）
    for (let j = 1; j <= n; j++) {
      for (let i = 1; i <= n; i++) {
        const idx = this.ix(i, j)
        const liquid = Math.min(1.2, this.oil[idx] + this.water[idx])
        const dyeSum = this.dye[0][idx] + this.dye[1][idx] + this.dye[2][idx]
        const target = liquid * 0.45 + dyeSum * 0.12
        this.thickness[idx] = this.thickness[idx] * 0.96 + target * 0.04
        if (liquid < 0.03) this.thickness[idx] *= 0.98
      }
    }
  }

  private dampenVelocity(factor: number): void {
    for (let i = 0; i < this.u.length; i++) {
      this.u[i] *= factor
      this.v[i] *= factor
    }
  }

  private applyDissipation(): void {
    const pd = LIQUID_LIGHT.phaseDissipation
    const dd = LIQUID_LIGHT.dyeDissipation
    const td = LIQUID_LIGHT.thicknessDissipation
    for (let i = 0; i < this.oil.length; i++) {
      this.oil[i] *= pd
      this.water[i] *= pd
      this.thickness[i] *= td
      for (let c = 0; c < 4; c++) this.dye[c][i] *= dd
    }
  }
}

function splat(
  n: number,
  field: Float32Array,
  x: number,
  y: number,
  amount: number,
  radius: number,
): void {
  const cx = x * n
  const cy = y * n
  const r = Math.max(1, radius * n)
  const r2 = r * r
  const i0 = Math.max(1, Math.floor(cx - r))
  const i1 = Math.min(n, Math.ceil(cx + r))
  const j0 = Math.max(1, Math.floor(cy - r))
  const j1 = Math.min(n, Math.ceil(cy + r))
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const dx = i - cx
      const dy = j - cy
      const d2 = dx * dx + dy * dy
      if (d2 > r2) continue
      const w = Math.exp((-d2 / r2) * 2.5)
      field[IX(n, i, j)] += amount * w
    }
  }
}

function smoothField(n: number, src: Float32Array, dst: Float32Array): void {
  for (let j = 1; j <= n; j++) {
    for (let i = 1; i <= n; i++) {
      const idx = IX(n, i, j)
      dst[idx] =
        (src[IX(n, i - 1, j)]
          + src[IX(n, i + 1, j)]
          + src[IX(n, i, j - 1)]
          + src[IX(n, i, j + 1)]
          + src[idx] * 0.5) / 4.5
    }
  }
  setBnd(n, 0, dst)
}

function setBnd(n: number, b: number, x: Float32Array): void {
  for (let i = 1; i <= n; i++) {
    x[IX(n, 0, i)] = b === 1 ? -x[IX(n, 1, i)] : x[IX(n, 1, i)]
    x[IX(n, n + 1, i)] = b === 1 ? -x[IX(n, n, i)] : x[IX(n, n, i)]
    x[IX(n, i, 0)] = b === 2 ? -x[IX(n, i, 1)] : x[IX(n, i, 1)]
    x[IX(n, i, n + 1)] = b === 2 ? -x[IX(n, i, n)] : x[IX(n, i, n)]
  }
  x[IX(n, 0, 0)] = 0.5 * (x[IX(n, 1, 0)] + x[IX(n, 0, 1)])
  x[IX(n, 0, n + 1)] = 0.5 * (x[IX(n, 1, n + 1)] + x[IX(n, 0, n)])
  x[IX(n, n + 1, 0)] = 0.5 * (x[IX(n, n, 0)] + x[IX(n, n + 1, 1)])
  x[IX(n, n + 1, n + 1)] = 0.5 * (x[IX(n, n, n + 1)] + x[IX(n, n + 1, n)])
}

function linSolve(
  n: number,
  b: number,
  x: Float32Array,
  x0: Float32Array,
  a: number,
  c: number,
): void {
  const cRecip = 1 / c
  for (let k = 0; k < 8; k++) {
    for (let j = 1; j <= n; j++) {
      for (let i = 1; i <= n; i++) {
        x[IX(n, i, j)] =
          (x0[IX(n, i, j)]
            + a * (
              x[IX(n, i - 1, j)]
              + x[IX(n, i + 1, j)]
              + x[IX(n, i, j - 1)]
              + x[IX(n, i, j + 1)]
            )) * cRecip
      }
    }
    setBnd(n, b, x)
  }
}

function diffuse(
  n: number,
  b: number,
  x: Float32Array,
  x0: Float32Array,
  diff: number,
  dt: number,
): void {
  const a = dt * diff * n * n
  linSolve(n, b, x, x0, a, 1 + 4 * a)
}

function project(
  n: number,
  velocX: Float32Array,
  velocY: Float32Array,
  p: Float32Array,
  div: Float32Array,
): void {
  for (let j = 1; j <= n; j++) {
    for (let i = 1; i <= n; i++) {
      div[IX(n, i, j)] =
        (-0.5
          * (
            velocX[IX(n, i + 1, j)]
            - velocX[IX(n, i - 1, j)]
            + velocY[IX(n, i, j + 1)]
            - velocY[IX(n, i, j - 1)]
          )) / n
      p[IX(n, i, j)] = 0
    }
  }
  setBnd(n, 0, div)
  setBnd(n, 0, p)
  linSolve(n, 0, p, div, 1, 4)

  for (let j = 1; j <= n; j++) {
    for (let i = 1; i <= n; i++) {
      velocX[IX(n, i, j)] -= 0.5 * (p[IX(n, i + 1, j)] - p[IX(n, i - 1, j)]) * n
      velocY[IX(n, i, j)] -= 0.5 * (p[IX(n, i, j + 1)] - p[IX(n, i, j - 1)]) * n
    }
  }
  setBnd(n, 1, velocX)
  setBnd(n, 2, velocY)
}

function advect(
  n: number,
  b: number,
  d: Float32Array,
  d0: Float32Array,
  velocX: Float32Array,
  velocY: Float32Array,
  dt: number,
): void {
  const dt0 = dt * n
  for (let j = 1; j <= n; j++) {
    for (let i = 1; i <= n; i++) {
      let x = i - dt0 * velocX[IX(n, i, j)]
      let y = j - dt0 * velocY[IX(n, i, j)]
      if (x < 0.5) x = 0.5
      if (x > n + 0.5) x = n + 0.5
      if (y < 0.5) y = 0.5
      if (y > n + 0.5) y = n + 0.5
      const i0 = Math.floor(x)
      const i1 = i0 + 1
      const j0 = Math.floor(y)
      const j1 = j0 + 1
      const s1 = x - i0
      const s0 = 1 - s1
      const t1 = y - j0
      const t0 = 1 - t1
      d[IX(n, i, j)] =
        s0 * (t0 * d0[IX(n, i0, j0)] + t1 * d0[IX(n, i0, j1)])
        + s1 * (t0 * d0[IX(n, i1, j0)] + t1 * d0[IX(n, i1, j1)])
    }
  }
  setBnd(n, b, d)
}
