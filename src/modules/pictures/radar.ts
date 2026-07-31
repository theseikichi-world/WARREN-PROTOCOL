// ─── RELEASE RADAR — what's landing soon, from what you already track ─────────
// A read-only projection over the PICTURES library: no API calls, no new state.
// Pure so it can be tested with a fixed "now".

import type { MediaItem, MediaType } from './types'

export type RadarKind = 'episode' | 'cinema' | 'game'

export interface RadarItem {
  id:     string
  title:  string
  date:   string        // YYYY-MM-DD
  days:   number        // 0 = today, negative = already out
  kind:   RadarKind
  type:   MediaType
  emoji:  string
  isNew:  boolean       // dropped within the last week
}

const DAY_MS = 86_400_000

/** Whole-day difference, immune to time-of-day and DST. */
export function dayDiff(date: string, now: Date): number | null {
  const target = Date.parse(`${date}T12:00:00Z`)
  const today  = Date.parse(`${now.toISOString().slice(0, 10)}T12:00:00Z`)
  if (!Number.isFinite(target) || !Number.isFinite(today)) return null
  return Math.round((target - today) / DAY_MS)
}

/** The one date that matters for an item: next episode for shows, release for the rest. */
function radarDate(item: MediaItem): { date: string; kind: RadarKind } | null {
  if (item.type === 'tv' && item.next_episode_date) {
    return { date: item.next_episode_date, kind: 'episode' }
  }
  if (item.release_date) {
    return { date: item.release_date, kind: item.type === 'game' ? 'game' : 'cinema' }
  }
  return null
}

/**
 * Split the library into what's coming and what just dropped.
 * `upcoming` is soonest-first, `recent` is newest-first, both capped at `limit`.
 */
export function buildRadar(lib: MediaItem[], now = new Date(), limit = 3): {
  upcoming: RadarItem[]
  recent:   RadarItem[]
} {
  const all: RadarItem[] = []

  for (const item of lib) {
    if (item.status === 'watched') continue          // finished — nothing to wait for
    const d = radarDate(item)
    if (!d) continue
    const days = dayDiff(d.date, now)
    if (days === null) continue

    all.push({
      id: item.id,
      title: item.title,
      date: d.date,
      days,
      kind: d.kind,
      type: item.type,
      emoji: item.emoji || (item.type === 'game' ? '🎮' : item.type === 'tv' ? '📺' : '🎬'),
      isNew: days < 0,
    })
  }

  const upcoming = all.filter(i => i.days >= 0).sort((a, b) => a.days - b.days).slice(0, limit)
  const recent   = all.filter(i => i.days < 0 && i.days >= -7)
    .sort((a, b) => b.days - a.days).slice(0, limit)

  return { upcoming, recent }
}

/** Short countdown label — the widget's whole job in one string. */
export function countdown(days: number): { text: string; hot: boolean } {
  if (days === 0)  return { text: 'TODAY',     hot: true  }
  if (days === 1)  return { text: 'TOMORROW',  hot: true  }
  if (days === -1) return { text: 'YESTERDAY', hot: true  }
  if (days < 0)    return { text: `${Math.abs(days)}d ago`, hot: Math.abs(days) <= 3 }
  if (days <= 7)   return { text: `in ${days}d`, hot: true }
  if (days <= 30)  return { text: `in ${days}d`, hot: false }
  const weeks = Math.round(days / 7)
  return { text: weeks <= 8 ? `in ${weeks}w` : `in ${Math.round(days / 30)}mo`, hot: false }
}
