import { LOCATION } from './config'

/**
 * 大阪府吹田市付近の日の入り時刻をブラウザ上で概算する。
 * NOAA 簡易アルゴリズム（分単位の精度で十分）。
 */
export function getSunsetLocal(date: Date = new Date()): Date {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()

  const n = Math.floor(275 * month / 9)
    - Math.floor((month + 9) / 12)
      * (1 + Math.floor((year - 4 * Math.floor(year / 4) + 2) / 3))
    + day
    - 30

  const lngHour = LOCATION.longitude / 15
  const t = n + ((18 - lngHour) / 24)

  const m = 0.9856 * t - 3.289
  let l = m
    + 1.916 * Math.sin(degToRad(m))
    + 0.020 * Math.sin(degToRad(2 * m))
    + 282.634
  l = normalizeDegrees(l)

  let ra = radToDeg(Math.atan(0.91764 * Math.tan(degToRad(l))))
  ra = normalizeDegrees(ra)
  const lQuadrant = Math.floor(l / 90) * 90
  const raQuadrant = Math.floor(ra / 90) * 90
  ra = ra + (lQuadrant - raQuadrant)
  ra /= 15

  const sinDec = 0.39782 * Math.sin(degToRad(l))
  const cosDec = Math.cos(Math.asin(sinDec))

  const lat = LOCATION.latitude
  const cosH = (Math.cos(degToRad(90.833)) - sinDec * Math.sin(degToRad(lat)))
    / (cosDec * Math.cos(degToRad(lat)))

  if (cosH < -1 || cosH > 1) {
    // 極域の極昼・極夜相当。吹田では起きないがフォールバック。
    const fallback = new Date(date)
    fallback.setHours(18, 30, 0, 0)
    return fallback
  }

  const h = (360 - radToDeg(Math.acos(cosH))) / 15
  const tSet = h + ra - 0.06571 * t - 6.622
  let ut = tSet - lngHour
  ut = ((ut % 24) + 24) % 24

  const localHours = ut + LOCATION.timezoneOffsetHours
  const normalized = ((localHours % 24) + 24) % 24
  const hours = Math.floor(normalized)
  const minutes = Math.floor((normalized - hours) * 60)
  const seconds = Math.floor((((normalized - hours) * 60) - minutes) * 60)

  const result = new Date(date)
  result.setHours(hours, minutes, seconds, 0)
  return result
}

/** 現在時刻と日の入りの差（時間）。負 = 日没前 */
export function hoursFromSunset(now: Date = new Date()): number {
  const sunset = getSunsetLocal(now)
  return (now.getTime() - sunset.getTime()) / (1000 * 60 * 60)
}

function degToRad(d: number): number {
  return (d * Math.PI) / 180
}

function radToDeg(r: number): number {
  return (r * 180) / Math.PI
}

function normalizeDegrees(d: number): number {
  return ((d % 360) + 360) % 360
}
