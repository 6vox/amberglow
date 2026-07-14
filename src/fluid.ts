/**
 * 簡易 Stable Fluids（Jos Stam 系）＋多色染料。
 * リキッドライトの「落として動かして混ぜる」を最小限で再現する。
 */
export class FluidSim {
  readonly n: number
  private readonly N: number
  u: Float32Array
  v: Float32Array
  u0: Float32Array
  v0: Float32Array
  /** 染料チャンネル（暖色A / 暖色B / 寒色） */
  d: [Float32Array, Float32Array, Float32Array]
  d0: [Float32Array, Float32Array, Float32Array]

  constructor(n: number) {
    this.n = n
    this.N = (n + 2) * (n + 2)
    this.u = new Float32Array(this.N)
    this.v = new Float32Array(this.N)
    this.u0 = new Float32Array(this.N)
    this.v0 = new Float32Array(this.N)
    this.d = [
      new Float32Array(this.N),
      new Float32Array(this.N),
      new Float32Array(this.N),
    ]
    this.d0 = [
      new Float32Array(this.N),
      new Float32Array(this.N),
      new Float32Array(this.N),
    ]
  }

  ix(i: number, j: number): number {
    return i + (this.n + 2) * j
  }

  step(dt: number, viscosity: number, diffusion: number, dissipation: number): void {
    const n = this.n
    // velocity
    diffuse(n, 1, this.u0, this.u, viscosity, dt)
    diffuse(n, 2, this.v0, this.v, viscosity, dt)
    project(n, this.u0, this.v0, this.u, this.v)
    advect(n, 1, this.u, this.u0, this.u0, this.v0, dt)
    advect(n, 2, this.v, this.v0, this.u0, this.v0, dt)
    project(n, this.u, this.v, this.u0, this.v0)

    // dye channels
    for (let c = 0; c < 3; c++) {
      diffuse(n, 0, this.d0[c], this.d[c], diffusion, dt)
      advect(n, 0, this.d[c], this.d0[c], this.u, this.v, dt)
      const dens = this.d[c]
      for (let i = 0; i < dens.length; i++) dens[i] *= dissipation
    }
  }

  /** 正規化座標 0–1 に力を加える */
  addForce(x: number, y: number, fx: number, fy: number, radius: number): void {
    splat(this.n, this.u, x, y, fx, radius)
    splat(this.n, this.v, x, y, fy, radius)
  }

  /** 正規化座標 0–1 に染料を落とす */
  addDye(x: number, y: number, amount: number, channel: 0 | 1 | 2, radius: number): void {
    splat(this.n, this.d[channel], x, y, amount, radius)
  }

  clearSources(): void {
    this.u0.fill(0)
    this.v0.fill(0)
    this.d0[0].fill(0)
    this.d0[1].fill(0)
    this.d0[2].fill(0)
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
      field[i + (n + 2) * j] += amount * w
    }
  }
}

function setBnd(n: number, b: number, x: Float32Array): void {
  for (let i = 1; i <= n; i++) {
    x[ix(n, 0, i)] = b === 1 ? -x[ix(n, 1, i)] : x[ix(n, 1, i)]
    x[ix(n, n + 1, i)] = b === 1 ? -x[ix(n, n, i)] : x[ix(n, n, i)]
    x[ix(n, i, 0)] = b === 2 ? -x[ix(n, i, 1)] : x[ix(n, i, 1)]
    x[ix(n, i, n + 1)] = b === 2 ? -x[ix(n, i, n)] : x[ix(n, i, n)]
  }
  x[ix(n, 0, 0)] = 0.5 * (x[ix(n, 1, 0)] + x[ix(n, 0, 1)])
  x[ix(n, 0, n + 1)] = 0.5 * (x[ix(n, 1, n + 1)] + x[ix(n, 0, n)])
  x[ix(n, n + 1, 0)] = 0.5 * (x[ix(n, n, 0)] + x[ix(n, n + 1, 1)])
  x[ix(n, n + 1, n + 1)] = 0.5 * (x[ix(n, n, n + 1)] + x[ix(n, n + 1, n)])
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
  for (let k = 0; k < 12; k++) {
    for (let j = 1; j <= n; j++) {
      for (let i = 1; i <= n; i++) {
        x[ix(n, i, j)] =
          (x0[ix(n, i, j)]
            + a * (
              x[ix(n, i - 1, j)]
              + x[ix(n, i + 1, j)]
              + x[ix(n, i, j - 1)]
              + x[ix(n, i, j + 1)]
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
      div[ix(n, i, j)] =
        (-0.5
          * (
            velocX[ix(n, i + 1, j)]
            - velocX[ix(n, i - 1, j)]
            + velocY[ix(n, i, j + 1)]
            - velocY[ix(n, i, j - 1)]
          )) / n
      p[ix(n, i, j)] = 0
    }
  }
  setBnd(n, 0, div)
  setBnd(n, 0, p)
  linSolve(n, 0, p, div, 1, 4)

  for (let j = 1; j <= n; j++) {
    for (let i = 1; i <= n; i++) {
      velocX[ix(n, i, j)] -= 0.5 * (p[ix(n, i + 1, j)] - p[ix(n, i - 1, j)]) * n
      velocY[ix(n, i, j)] -= 0.5 * (p[ix(n, i, j + 1)] - p[ix(n, i, j - 1)]) * n
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
      let x = i - dt0 * velocX[ix(n, i, j)]
      let y = j - dt0 * velocY[ix(n, i, j)]
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
      d[ix(n, i, j)] =
        s0 * (t0 * d0[ix(n, i0, j0)] + t1 * d0[ix(n, i0, j1)])
        + s1 * (t0 * d0[ix(n, i1, j0)] + t1 * d0[ix(n, i1, j1)])
    }
  }
  setBnd(n, b, d)
}

function ix(n: number, i: number, j: number): number {
  return i + (n + 2) * j
}
