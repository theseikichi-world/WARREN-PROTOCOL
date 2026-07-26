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

// ─── Launch history — how often and how recently you actually use things ──────
const STATS_KEY = 'bigscreen_launches_v1'

export interface LaunchStat { count: number; last: string }   // last = ISO timestamp
export type LaunchStats = Record<string, LaunchStat>

export function loadLaunchStats(): LaunchStats {
  try {
    const raw = localStorage.getItem(STATS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== 'object') return {}
    const out: LaunchStats = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const s = v as Partial<LaunchStat>
      if (typeof s?.count === 'number' && typeof s?.last === 'string') out[k] = { count: s.count, last: s.last }
    }
    return out
  } catch { return {} }
}

export function saveLaunchStats(stats: LaunchStats): void {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)) } catch { /* optional data */ }
}

/** Pure: bump a program's launch count and stamp the time. */
export function recordLaunch(stats: LaunchStats, path: string, now = new Date()): LaunchStats {
  const prev = stats[path]
  return { ...stats, [path]: { count: (prev?.count ?? 0) + 1, last: now.toISOString() } }
}

/** Most-launched programs first; never returns anything you've never opened. */
export function mostUsed(apps: AppEntry[], stats: LaunchStats, limit: number): AppEntry[] {
  return apps
    .filter(a => (stats[a.path]?.count ?? 0) > 0)
    .sort((a, b) => (stats[b.path]!.count - stats[a.path]!.count)
      || stats[b.path]!.last.localeCompare(stats[a.path]!.last))
    .slice(0, limit)
}

/** Most recently launched first. */
export function recentlyUsed(apps: AppEntry[], stats: LaunchStats, limit: number): AppEntry[] {
  return apps
    .filter(a => !!stats[a.path]?.last)
    .sort((a, b) => stats[b.path]!.last.localeCompare(stats[a.path]!.last))
    .slice(0, limit)
}

/** Compact "how long ago" for a tile footer. */
export function fmtAgo(iso: string, now = new Date()): string {
  const ms = now.getTime() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 'now'
  const min = Math.floor(ms / 60000)
  if (min < 1)  return 'now'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return d < 7 ? `${d}d` : `${Math.floor(d / 7)}w`
}

// ─── Running detection ────────────────────────────────────────────────────────
/** Strip everything but letters/digits so "Visual Studio Code" ≈ "code". */
export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Is this program among the running processes? Matches loosely (a shortcut is
 * rarely named exactly like its exe) but demands 4+ characters before allowing
 * a substring hit, so short names can't match half the machine.
 */
export function isRunning(appName: string, processes: string[]): boolean {
  const a = normalizeName(appName)
  if (a.length < 2) return false
  return processes.some(p => {
    const n = normalizeName(p)
    if (n.length < 2) return false
    if (n === a) return true
    if (n.length >= 4 && a.includes(n)) return true
    if (a.length >= 4 && n.includes(a)) return true
    return false
  })
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
