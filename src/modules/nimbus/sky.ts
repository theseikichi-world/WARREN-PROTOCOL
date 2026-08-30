import { t } from '../../i18n'

// ─── NIMBUS — the sky, read before you open the door ──────────────────────────
// Open-Meteo, because it needs no API key: nothing to paste into settings,
// nothing to leak from a bundle, nothing to proxy later. It is the only weather
// source that does not drag the whole credential problem in with it.
//
// The ADVICE IS DERIVED, NOT ASKED FOR. Temperature, rain odds and UV are
// numbers; turning them into "wear SPF" is an `if`, not a model call. Sending
// that to Claude would mean paying tokens every time the hub opens, for a
// sentence about an umbrella.
//
// One thing worth being plain about: this sends your coordinates to
// open-meteo.com. That is the mechanic of asking about local weather, and it
// happens only once you set a place in Settings.

const KEY = 'warren_sky_v1'
/** Two hours. The weather does not move faster than that, and neither should we. */
const TTL_MS = 2 * 60 * 60 * 1000

export interface Sky {
  place:      string
  lat:        number
  lon:        number
  tempC:      number
  feelsC:     number
  /** WMO weather code — see `conditionOf`. */
  code:       number
  /** Highest chance of precipitation across the rest of today, 0-100. */
  rainChance: number
  /** Hour of the day the rain is most likely, when there is a chance at all. */
  rainHour:   number | null
  uvMax:      number
  /** European AQI, or null when the air endpoint had nothing. */
  aqi:        number | null
  fetchedAt:  string
}

// ── Pure readings ────────────────────────────────────────────────────────────

export type Condition = 'clear' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm'

/** WMO code → the handful of conditions worth wording differently. */
export function conditionOf(code: number): Condition {
  if (code === 0)                    return 'clear'
  if (code <= 3)                     return 'cloud'
  if (code === 45 || code === 48)    return 'fog'
  if (code >= 51 && code <= 57)      return 'drizzle'
  if (code >= 71 && code <= 77)      return 'snow'
  if (code === 85 || code === 86)    return 'snow'
  if (code >= 95)                    return 'storm'
  return 'rain'
}

export function conditionWord(c: Condition): string {
  switch (c) {
    case 'clear':   return t('clear',    'ясно')
    case 'cloud':   return t('cloudy',   'облачно')
    case 'fog':     return t('fog',      'туман')
    case 'drizzle': return t('drizzle',  'морось')
    case 'snow':    return t('snow',     'снег')
    case 'storm':   return t('storms',   'гроза')
    default:        return t('rain',     'дождь')
  }
}

export interface AqiBand {
  label: string
  color: string
  /** 1 (good) … 6 (extremely poor) — the European AQI bands. */
  level: number
}

/**
 * The European AQI bands, reported and not prescribed.
 *
 * A number and a word for it is information. "Do not run outside today" is
 * health advice, which this is not qualified to give and which rule 10 would
 * not want it giving anyway.
 */
export function aqiBand(aqi: number | null): AqiBand | null {
  if (aqi === null || Number.isNaN(aqi)) return null
  if (aqi <= 20)  return { level: 1, color: '#39ff14', label: t('good',       'хороший') }
  if (aqi <= 40)  return { level: 2, color: '#a3e635', label: t('fair',       'нормальный') }
  if (aqi <= 60)  return { level: 3, color: '#ffd700', label: t('moderate',   'умеренный') }
  if (aqi <= 80)  return { level: 4, color: '#ffb13c', label: t('poor',       'плохой') }
  if (aqi <= 100) return { level: 5, color: '#ff6b00', label: t('very poor',  'очень плохой') }
  return            { level: 6, color: '#ff0033', label: t('extreme',    'экстремальный') }
}

/**
 * One line for the brief. Leads with what it is, adds the one thing worth
 * doing about it, and says nothing when there is nothing to say.
 */
export function skyLine(sky: Sky | null): string | null {
  if (!sky) return null
  const cond = conditionOf(sky.code)
  const temp = `${Math.round(sky.tempC)}°`
  const head = `${temp} ${t('and', 'и')} ${conditionWord(cond)}`

  // At most one piece of advice. Two is a forecast; one is a reminder.
  let tip: string | null = null
  if (cond === 'storm') {
    tip = t('storms about — keep the evening loose', 'гроза — вечер лучше не планировать плотно')
  } else if (sky.rainChance >= 50) {
    tip = sky.rainHour !== null
      ? t(`rain likely around ${sky.rainHour}:00 — take a jacket`,
          `дождь около ${sky.rainHour}:00 — возьмите куртку`)
      : t('rain likely — take a jacket', 'вероятен дождь — возьмите куртку')
  } else if (sky.uvMax >= 6 && sky.tempC >= 20) {
    tip = t('high sun — wear SPF', 'солнце сильное — нанесите SPF')
  } else if (sky.tempC <= 0) {
    tip = t('below freezing — layer up', 'ниже нуля — одевайтесь слоями')
  } else if (sky.feelsC - sky.tempC <= -5) {
    tip = t(`feels like ${Math.round(sky.feelsC)}° — wind is doing that`,
            `ощущается как ${Math.round(sky.feelsC)}° — это ветер`)
  }

  return tip ? `${head} — ${tip}` : head
}

// ── The network edge ─────────────────────────────────────────────────────────

interface Cached { sky: Sky }

export function readCachedSky(): Sky | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as Cached
    return c?.sky ?? null
  } catch { return null }
}

export function isStale(sky: Sky | null, now = Date.now()): boolean {
  if (!sky) return true
  const at = new Date(sky.fetchedAt).getTime()
  return Number.isNaN(at) || now - at > TTL_MS
}

function saveSky(sky: Sky): void {
  try { localStorage.setItem(KEY, JSON.stringify({ sky } satisfies Cached)) } catch { /* private mode */ }
}

/** Turn a place name into coordinates. Open-Meteo's geocoder, also key-free. */
async function geocode(place: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`geocoding failed (${res.status})`)
  const data = await res.json() as { results?: { latitude: number; longitude: number; name: string }[] }
  const hit = data.results?.[0]
  return hit ? { lat: hit.latitude, lon: hit.longitude, name: hit.name } : null
}

/**
 * Read the sky for a place. Two calls: forecast and air quality.
 *
 * The air call is allowed to fail on its own — a missing AQI should cost you
 * the badge, not the temperature.
 */
export async function fetchSky(place: string): Promise<Sky> {
  const where = await geocode(place)
  if (!where) throw new Error(`no place called "${place}"`)

  const fUrl = `https://api.open-meteo.com/v1/forecast?latitude=${where.lat}&longitude=${where.lon}`
    + '&current=temperature_2m,apparent_temperature,weather_code'
    + '&hourly=precipitation_probability,uv_index&forecast_days=1&timezone=auto'
  const fRes = await fetch(fUrl)
  if (!fRes.ok) throw new Error(`weather failed (${fRes.status})`)
  const f = await fRes.json() as {
    current: { temperature_2m: number; apparent_temperature: number; weather_code: number }
    hourly: { time: string[]; precipitation_probability: (number | null)[]; uv_index: (number | null)[] }
  }

  // Only the hours still ahead: rain at 06:00 is not news at 21:00.
  const nowHour = new Date().getHours()
  let rainChance = 0
  let rainHour: number | null = null
  let uvMax = 0
  f.hourly.time.forEach((iso, i) => {
    const h = new Date(iso).getHours()
    if (h < nowHour) return
    const p = f.hourly.precipitation_probability[i] ?? 0
    if (p > rainChance) { rainChance = p; rainHour = h }
    uvMax = Math.max(uvMax, f.hourly.uv_index[i] ?? 0)
  })

  let aqi: number | null = null
  try {
    const aRes = await fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${where.lat}&longitude=${where.lon}&current=european_aqi`)
    if (aRes.ok) {
      const a = await aRes.json() as { current?: { european_aqi?: number } }
      aqi = typeof a.current?.european_aqi === 'number' ? a.current.european_aqi : null
    }
  } catch { /* the badge simply does not appear */ }

  const sky: Sky = {
    place: where.name, lat: where.lat, lon: where.lon,
    tempC:  f.current.temperature_2m,
    feelsC: f.current.apparent_temperature,
    code:   f.current.weather_code,
    rainChance, rainHour, uvMax, aqi,
    fetchedAt: new Date().toISOString(),
  }
  saveSky(sky)
  return sky
}
