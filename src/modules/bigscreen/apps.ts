// ─── Big Screen launcher — pure helpers ───────────────────────────────────────
// The Rust side hands us { name, path } entries scanned from the Start Menu;
// everything presentational (search, monograms, tile colors) is derived here
// so it stays trivially testable.

export interface AppEntry {
  name: string
  path: string
}

/** Case-insensitive substring filter, stable order preserved. */
export function filterApps(apps: AppEntry[], query: string): AppEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return apps
  return apps.filter(a => a.name.toLowerCase().includes(q))
}

/** 1–2 letter monogram for the tile: initials of the first two words. */
export function monogram(name: string): string {
  const words = name.trim().split(/[\s\-_]+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

// Neon palette shared with the guild aesthetic — deterministic per app name,
// so tiles keep their color between sessions.
const TILE_NEONS = [
  '#00f5ff', '#bf5fff', '#39ff14', '#ff6b00',
  '#ff006e', '#4488ff', '#ffd700', '#00e4a0',
]

export function tileNeon(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return TILE_NEONS[h % TILE_NEONS.length]
}

// ─── Favorites — pinned programs shown on the Warren OS home screen ───────────
const FAVS_KEY = 'bigscreen_favs_v1'

export function loadFavs(): string[] {
  try {
    const raw = localStorage.getItem(FAVS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}

export function saveFavs(favs: string[]): void {
  try { localStorage.setItem(FAVS_KEY, JSON.stringify(favs)) } catch { /* quota — favorites are optional */ }
}

/** Pure toggle — append if missing, remove if present (order preserved). */
export function toggleFav(favs: string[], path: string): string[] {
  return favs.includes(path) ? favs.filter(p => p !== path) : [...favs, path]
}

/** Group apps under their first letter (digits and symbols pool under '#'). */
export function groupByLetter(apps: AppEntry[]): { letter: string; apps: AppEntry[] }[] {
  const groups = new Map<string, AppEntry[]>()
  for (const a of apps) {
    const c = a.name[0]?.toUpperCase() ?? '#'
    const letter = /[A-ZА-ЯЁ]/.test(c) ? c : '#'
    const list = groups.get(letter) ?? []
    list.push(a)
    groups.set(letter, list)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '#' ? -1 : b === '#' ? 1 : a.localeCompare(b)))
    .map(([letter, list]) => ({ letter, apps: list }))
}
