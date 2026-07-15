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

  constructor(seed = 77) {
    this.rng = new SeededRandom(seed)
    this.stirrers = [
      { cx: 0.42, cy: 0.48, ang: 0.3, orbitX: 0.11, orbitY: 0.09, speed: 0.14, force: 1.0, kind: 'circle', phase: 0.1, driftAng: 0, driftSpeed: 0.02 },
      { cx: 0.58, cy: 0.52, ang: 2.1, orbitX: 0.13, orbitY: 0.07, speed: -0.11, force: 0.85, kind: 'ellipse', phase: 1.4, driftAng: 0.5, driftSpeed: 0.015 },
      { cx: 0.5, cy: 0.44, ang: 1.0, orbitX: 0.09, orbitY: 0.11, speed: 0.09, force: 0.6, kind: 'serpentine', phase: 2.2, driftAng: 1.2, driftSpeed: 0.018 },
      { cx: 0.47, cy: 0.56, ang: 3.5, orbitX: 0.08, orbitY: 0.1, speed: 0.07, force: 0.5, kind: 'drift', phase: 0.8, driftAng: 2.0, driftSpeed: 0.012 },
    ]
    this.drop = this.scheduleDrop(0)
    this.press = this.schedulePress(18)
  }

  update(sim: LiquidLightSim, dt: number, speed: number): void {
    this.time += dt
    const sdt = dt * speed

    this.applyStirrers(sim, sdt)
    this.applyRotation(sim, sdt)
    this.applyDrops(sim, sdt)
    this.applyPress(sim, sdt)
    this.applyAmbient(sim, sdt)
  }

  private applyStirrers(sim: LiquidLightSim, dt: number): void {
    for (const st of this.stirrers) {
      st.ang += st.speed * dt * (0.7 + 0.3 * Math.sin(this.time * 0.17 + st.phase))
      st.driftAng += st.driftSpeed * dt
      st.cx += Math.cos(st.driftAng) * 0.0008 * dt * 60
      st.cy += Math.sin(st.driftAng * 0.85) * 0.0007 * dt * 60

      let x = st.cx
      let y = st.cy
      const mod = 0.85 + 0.15 * Math.sin(this.time * 0.23 + st.phase)

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
          x += Math.cos(st.ang) * st.orbitX + Math.sin(st.ang * 2.5) * 0.03
          y += Math.sin(st.ang) * st.orbitY + Math.cos(st.ang * 1.8) * 0.025
          break
        case 'drift':
          x += Math.cos(st.ang) * st.orbitX * mod + Math.sin(this.time * 0.08 + st.phase) * 0.04
          y += Math.sin(st.ang) * st.orbitY * mod + Math.cos(this.time * 0.06 + st.phase) * 0.035
          break
      }

      const force = st.force * (0.6 + 0.4 * Math.sin(this.time * 0.31 + st.phase))
      const tx = -Math.sin(st.ang) * force * dt * 14
      const ty = Math.cos(st.ang) * force * dt * 14
      sim.addForce(x, y, tx, ty, 0.07)
    }
  }

  private applyRotation(sim: LiquidLightSim, dt: number): void {
    this.rotationPhase += dt
    // 数十秒単位で弱い回転
    const cycle = Math.sin(this.rotationPhase * 0.04) * 0.5 + 0.5
    const strength = cycle * 0.35 + 0.05
    sim.addRotation(0.48, 0.5, strength * dt * 3, 0.55)
  }

  private applyDrops(sim: LiquidLightSim, dt: number): void {
    this.drop.nextAt -= dt
    if (this.drop.nextAt > 0) return

    const d = this.drop
    if (d.isOil) {
      sim.addOilDrop(d.x, d.y, d.amount, d.radius, d.dyeChannel, d.amount * 0.85)
    } else {
      sim.addWaterDrop(d.x, d.y, d.amount, d.radius, d.amount * 0.8)
    }
    this.drop = this.scheduleDrop(this.rng.range(5.5, 11.5))
  }

  private applyPress(sim: LiquidLightSim, dt: number): void {
    this.press.nextAt -= dt
    if (this.press.nextAt > 0) return

    const p = this.press
    sim.addPress(p.cx, p.cy, p.strength, p.radius)
    this.press = this.schedulePress(this.rng.range(22, 38))
  }

  private applyAmbient(sim: LiquidLightSim, dt: number): void {
    this.tiltX = Math.sin(this.time * 0.05) * 0.4
    this.tiltY = Math.cos(this.time * 0.043) * 0.35
    sim.addForce(0.5 + this.tiltX * 0.02, 0.5 + this.tiltY * 0.02, this.tiltX * dt * 0.4, this.tiltY * dt * 0.4, 0.9)
  }

  private scheduleDrop(delay: number): DropEvent {
    const margin = 0.18
    const x = margin + this.rng.range(0, 1) * (1 - margin * 2)
    const y = margin + this.rng.range(0, 1) * (1 - margin * 2)
    const isOil = this.rng.next() > 0.42
    return {
      nextAt: delay,
      isOil,
      x,
      y,
      radius: this.rng.range(0.025, 0.055),
      dyeChannel: isOil ? (this.rng.next() > 0.5 ? 0 : 1) : 1,
      amount: this.rng.range(0.35, 0.65),
    }
  }

  private schedulePress(delay: number): PressEvent {
    return {
      nextAt: delay,
      cx: 0.4 + this.rng.range(0, 0.2),
      cy: 0.42 + this.rng.range(0, 0.16),
      strength: this.rng.range(0.5, 0.9),
      radius: this.rng.range(0.12, 0.2),
    }
  }
}
