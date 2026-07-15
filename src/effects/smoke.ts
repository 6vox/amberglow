import { AmberglowRenderer } from '../renderer'
import type { VisualParams } from '../visualParams'
import type { Effect } from './types'

/** 現行実装 = 光の煙 */
export class SmokeEffect implements Effect {
  readonly id = 'smoke' as const
  private readonly renderer: AmberglowRenderer

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new AmberglowRenderer(canvas)
  }

  resize(width: number, height: number): void {
    this.renderer.resize(width, height)
  }

  update(dt: number, params: VisualParams): void {
    this.renderer.update(dt, params)
  }
}
