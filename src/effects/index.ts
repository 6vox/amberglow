import { LiquidLightEffect } from './liquidLight'
import { SmokeEffect } from './smoke'
import type { Effect, EffectId } from './types'

export type { Effect, EffectId, EffectMeta } from './types'
export {
  EFFECT_META,
  EFFECT_ORDER,
  nextEffectId,
  prevEffectId,
} from './types'

export function createEffect(id: EffectId, canvas: HTMLCanvasElement): Effect {
  switch (id) {
    case 'smoke':
      return new SmokeEffect(canvas)
    case 'liquidLight':
      return new LiquidLightEffect(canvas)
    default: {
      const _exhaustive: never = id
      return _exhaustive
    }
  }
}
