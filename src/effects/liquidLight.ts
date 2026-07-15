import { LIQUID_LIGHT } from '../liquidLight/config'
import { LiquidLightAutomation } from '../liquidLight/automation'
import { LiquidLightRenderer } from '../liquidLight/renderer'
import { LiquidLightSim } from '../liquidLight/simulation'
import type { VisualParams } from '../visualParams'
import type { Effect } from './types'

/**
 * リキッドライト — 油と水のフェーズ分離型シミュレーションを透過光として投影する。
 */
export class LiquidLightEffect implements Effect {
  readonly id = 'liquidLight' as const
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly sim: LiquidLightSim
  private readonly automation: LiquidLightAutomation
  private readonly renderer: LiquidLightRenderer

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D not available')
    this.ctx = ctx
    this.sim = new LiquidLightSim(LIQUID_LIGHT.gridSize)
    this.sim.seedInitialState()
    this.automation = new LiquidLightAutomation()
    this.renderer = new LiquidLightRenderer(this.sim)
  }

  resize(width: number, height: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.floor(width * dpr)
    this.canvas.height = Math.floor(height * dpr)
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.renderer.resize(width, height)
  }

  update(dt: number, params: VisualParams): void {
    const speed = Math.max(0.05, params.speed)
    const stepDt = Math.min(LIQUID_LIGHT.maxStepDt, dt * speed)

    this.automation.update(this.sim, stepDt, speed)
    this.sim.step(stepDt)
    this.renderer.updateColors(params.colors, dt)
    this.renderer.render(this.ctx, params)
  }
}
