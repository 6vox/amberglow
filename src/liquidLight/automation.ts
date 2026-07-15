import type { LiquidLightSim } from './simulation'
import { SeededRandom } from './random'

type OrbitKind = 'circle' | 'ellipse' | 'serpentine' | 'drift'

interface Stirrer {
  cx: number
  cy: number
  ang: number
  orbitX: number
  orbitY: number
  speed: number
  force: number
  kind: OrbitKind
  phase: number
  driftAng: number
  driftSpeed: number
}

interface DropEvent {
  nextAt: number
  isOil: boolean
  x: number
  y: number
  radius: number
  dyeChannel: 0 | 1
  amount: number
  burst: number
}

interface PressEvent {
  nextAt: number
  cx: number
  cy: number
  strength: number
  radius: number
}

/**
 * 無操作でも成立する自動演出。
 * 滴下・攪拌・回転・Press・微細対流を時間変化で駆動する。
 */
export class LiquidLightAutomation {
  private time = 0
  private readonly stirrers: Stirrer[]
  private drop: DropEvent
  private press: PressEvent
  private readonly rng: SeededRandom
  private rotationPhase = 0
  private tiltX = 0
  private tiltY = 0
  private lastDropX = 0.5
  private lastDropY = 0.5

  constructor(seed = 77) {
    this.rng = new SeededRandom(seed)
    this.stirrers = [
      { cx: 0.38, cy: 0.46, ang: 0.3, orbitX: 0.14, orbitY: 0.11, speed: 0.22, force: 1.6, kind: 'circle', phase: 0.1, driftAng: 0, driftSpeed: 0.03 },
      { cx: 0.62, cy: 0.52, ang: 2.1, orbitX: 0.16, orbitY: 0.09, speed: -0.18, force: 1.4, kind: 'ellipse', phase: 1.4, driftAng: 0.5, driftSpeed: 0.025 },
      { cx: 0.5, cy: 0.42, ang: 1.0, orbitX: 0.12, orbitY: 0.14, speed: 0.15, force: 1.1, kind: 'serpentine', phase: 2.2, driftAng: 1.2, driftSpeed: 0.028 },
      { cx: 0.45, cy: 0.58, ang: 3.5, orbitX: 0.1, orbitY: 0.12, speed: 0.12, force: 0.95, kind: 'drift', phase: 0.8, driftAng: 2.0, driftSpeed: 0.02 },
    ]
    this.drop = this.scheduleDrop(1.2)
    this.press = this.schedulePress(8)
  }

  update(sim: LiquidLightSim, dt: number, speed: number): void {
    this.time += dt
    const sdt = dt * Math.max(0.4, speed)

    this.applyStirrers(sim, sdt)
    this.applyRotation(sim, sdt)
    this.applyDrops(sim, sdt)
    this.applyPress(sim, sdt)
    this.applyAmbient(sim, sdt)
  }

  private applyStirrers(sim: LiquidLightSim, dt: number): void {
    for (const st of this.stirrers) {
      st.ang += st.speed * dt * (0.75 + 0.35 * Math.sin(this.time * 0.21 + st.phase))
      st.driftAng += st.driftSpeed * dt
      st.cx = clamp01(st.cx + Math.cos(st.driftAng) * 0.0012 * dt * 60, 0.22, 0.78)
      st.cy = clamp01(st.cy + Math.sin(st.driftAng * 0.85) * 0.001 * dt * 60, 0.25, 0.75)

      let x = st.cx
      let y = st.cy
      const mod = 0.8 + 0.25 * Math.sin(this.time * 0.27 + st.phase)

      switch (st.kind) {
        case 'circle':
          x += Math.cos(st.ang) * st.orbitX * mod
          y += Math.sin(st.ang) * st.orbitY * mod
          break
        case 'ellipse':
          x += Math.cos(st.ang) * st.orbitX * mod
          y += Math.sin(st.ang * 1.3) * st.orbitY * mod
          break
        case 'serpentine':
          x += Math.cos(st.ang) * st.orbitX + Math.sin(st.ang * 2.5) * 0.045
          y += Math.sin(st.ang) * st.orbitY + Math.cos(st.ang * 1.8) * 0.04
          break
        case 'drift':
          x += Math.cos(st.ang) * st.orbitX * mod + Math.sin(this.time * 0.09 + st.phase) * 0.05
          y += Math.sin(st.ang) * st.orbitY * mod + Math.cos(this.time * 0.07 + st.phase) * 0.045
          break
      }

      // 力の強さを周期的に変え、常時同じ攪拌にしない
      const pulse = 0.45 + 0.55 * Math.max(0, Math.sin(this.time * 0.37 + st.phase))
      const force = st.force * pulse
      const tx = -Math.sin(st.ang) * force * dt * 28
      const ty = Math.cos(st.ang) * force * dt * 28
      sim.addForce(x, y, tx, ty, 0.085)
    }
  }

  private applyRotation(sim: LiquidLightSim, dt: number): void {
    this.rotationPhase += dt
    const cycle = Math.sin(this.rotationPhase * 0.055) * 0.5 + 0.5
    const strength = cycle * 0.55 + 0.08
    sim.addRotation(0.48, 0.5, strength * dt * 5.5, 0.52)
  }

  private applyDrops(sim: LiquidLightSim, dt: number): void {
    this.drop.nextAt -= dt
    if (this.drop.nextAt > 0) return

    const d = this.drop
    for (let b = 0; b < d.burst; b++) {
      const ox = d.x + (b === 0 ? 0 : this.rng.range(-0.06, 0.06))
      const oy = d.y + (b === 0 ? 0 : this.rng.range(-0.06, 0.06))
      const r = d.radius * (b === 0 ? 1 : this.rng.range(0.55, 0.85))
      const amt = d.amount * (b === 0 ? 1 : 0.65)
      if (d.isOil) {
        sim.addOilDrop(ox, oy, amt, r, d.dyeChannel, amt * 1.1)
      } else {
        sim.addWaterDrop(ox, oy, amt, r, amt * 1.05)
      }
    }
    this.lastDropX = d.x
    this.lastDropY = d.y
    this.drop = this.scheduleDrop(this.rng.range(2.2, 4.8))
  }

  private applyPress(sim: LiquidLightSim, dt: number): void {
    this.press.nextAt -= dt
    if (this.press.nextAt > 0) return

    const p = this.press
    sim.addPress(p.cx, p.cy, p.strength, p.radius)
    this.press = this.schedulePress(this.rng.range(10, 18))
  }

  private applyAmbient(sim: LiquidLightSim, dt: number): void {
    this.tiltX = Math.sin(this.time * 0.06) * 0.55
    this.tiltY = Math.cos(this.time * 0.048) * 0.45
    sim.addForce(
      0.5 + this.tiltX * 0.03,
      0.5 + this.tiltY * 0.03,
      this.tiltX * dt * 0.9,
      this.tiltY * dt * 0.9,
      0.85,
    )
  }

  private scheduleDrop(delay: number): DropEvent {
    const margin = 0.2
    let x = margin + this.rng.range(0, 1) * (1 - margin * 2)
    let y = margin + this.rng.range(0, 1) * (1 - margin * 2)
    // 同じ位置への連続滴下を避ける
    for (let tries = 0; tries < 4; tries++) {
      const dx = x - this.lastDropX
      const dy = y - this.lastDropY
      if (dx * dx + dy * dy > 0.04) break
      x = margin + this.rng.range(0, 1) * (1 - margin * 2)
      y = margin + this.rng.range(0, 1) * (1 - margin * 2)
    }
    const isOil = this.rng.next() > 0.4
    return {
      nextAt: delay,
      isOil,
      x,
      y,
      radius: this.rng.range(0.04, 0.08),
      dyeChannel: isOil ? (this.rng.next() > 0.45 ? 0 : 1) : 1,
      amount: this.rng.range(0.7, 1.15),
      burst: this.rng.next() > 0.72 ? 2 : 1,
    }
  }

  private schedulePress(delay: number): PressEvent {
    return {
      nextAt: delay,
      cx: 0.35 + this.rng.range(0, 0.3),
      cy: 0.38 + this.rng.range(0, 0.24),
      strength: this.rng.range(0.75, 1.2),
      radius: this.rng.range(0.14, 0.24),
    }
  }
}

function clamp01(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}
