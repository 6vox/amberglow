import type { VisualParams } from '../visualParams'

export type EffectId = 'smoke' | 'liquidLight'

export interface EffectMeta {
  id: EffectId
  label: string
  /** false のとき実装はスタブ（切り替え確認用） */
  ready: boolean
}

export interface Effect {
  readonly id: EffectId
  resize(width: number, height: number): void
  update(dt: number, params: VisualParams): void
}

export const EFFECT_META: Record<EffectId, EffectMeta> = {
  smoke: { id: 'smoke', label: '光の煙', ready: true },
  liquidLight: { id: 'liquidLight', label: 'リキッドライト', ready: true },
}

export const EFFECT_ORDER: EffectId[] = ['liquidLight', 'smoke']

export function nextEffectId(current: EffectId): EffectId {
  const i = EFFECT_ORDER.indexOf(current)
  return EFFECT_ORDER[(i + 1) % EFFECT_ORDER.length]
}

export function prevEffectId(current: EffectId): EffectId {
  const i = EFFECT_ORDER.indexOf(current)
  return EFFECT_ORDER[(i - 1 + EFFECT_ORDER.length) % EFFECT_ORDER.length]
}
