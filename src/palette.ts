import { PALETTES, PHASE_HOURS, type RGB } from './config'
import { hoursFromSunset } from './sunset'

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ]
}

function lerpPalette(a: readonly RGB[], b: readonly RGB[], t: number): RGB[] {
  const n = Math.min(a.length, b.length)
  const out: RGB[] = []
  for (let i = 0; i < n; i++) {
    out.push(lerpColor(a[i], b[i], t))
  }
  return out
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * 日没からの経過時間に応じて、4パレット間を滑らかに補間する。
 */
export function paletteFromTime(now: Date = new Date()): RGB[] {
  const h = hoursFromSunset(now)
  const { dayEnd, eveningPeak, sunsetPeak, nightStart } = PHASE_HOURS

  if (h <= dayEnd) {
    return [...PALETTES.day]
  }

  if (h < eveningPeak) {
    const t = smoothstep(dayEnd, eveningPeak, h)
    return lerpPalette(PALETTES.day, PALETTES.evening, t)
  }

  if (h < sunsetPeak) {
    const t = smoothstep(eveningPeak, sunsetPeak, h)
    return lerpPalette(PALETTES.evening, PALETTES.sunset, t)
  }

  if (h < nightStart) {
    const t = smoothstep(sunsetPeak, nightStart, h)
    return lerpPalette(PALETTES.sunset, PALETTES.night, t)
  }

  return [...PALETTES.night]
}

export function cssRgb(c: RGB, alpha = 1): string {
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`
}
