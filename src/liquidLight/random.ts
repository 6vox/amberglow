/** シード付き簡易乱数（再現確認用） */
export class SeededRandom {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0 || 1
  }

  /** [0, 1) */
  next(): number {
    let t = (this.state += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** [min, max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  /** ガウス近似 */
  gauss(mean = 0, std = 1): number {
    const u1 = Math.max(1e-6, this.next())
    const u2 = this.next()
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(Math.PI * 2 * u2)
    return mean + z * std
  }
}
