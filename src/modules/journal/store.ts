// ─── CAPTAIN'S JOURNAL — diary with AI polish, stickers & debrief ─────────────
// The user's raw words are sacred: `raw` is never modified or lost.
// AI enhancement adds a `polished` version + stickers + mood + reflection.

export interface Sticker {
  emoji: string
  label: string
}

export interface EntryMood {
  label: string
  emoji: string
  color: string
}

export interface JournalEntry {
  id: string
  date: string          // YYYY-MM-DD
  createdAt: string
  raw: string           // original text — never touched
  polished?: string     // AI-improved version
  stickers?: Sticker[]
  mood?: EntryMood
  themes?: string[]
  reflection?: string   // the captain's debrief (AI thoughts)
  enhancedAt?: string
  view: 'raw' | 'polished'
}

export interface JournalState {
  entries: JournalEntry[]
}

const KEY = 'journal_v1'

export function loadJournal(): JournalState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return { entries: Array.isArray(p.entries) ? p.entries : [] }
    }
  } catch { /* fresh */ }
  return { entries: [] }
}

export function saveJournal(s: JournalState): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}

export function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addEntry(s: JournalState, raw: string, date: string): JournalState {
  const e: JournalEntry = {
    id: crypto.randomUUID(), date, createdAt: new Date().toISOString(),
    raw, view: 'raw',
  }
  return { entries: [e, ...s.entries] }
}

export function updateEntry(s: JournalState, id: string, patch: Partial<JournalEntry>): JournalState {
  return { entries: s.entries.map(e => e.id === id ? { ...e, ...patch } : e) }
}

export function deleteEntry(s: JournalState, id: string): JournalState {
  return { entries: s.entries.filter(e => e.id !== id) }
}

/** Consecutive days with ≥1 entry, ending today (unlogged today doesn't break it). */
export function journalStreak(s: JournalState): number {
  const dates = new Set(s.entries.map(e => e.date))
  let streak = 0
  const d = new Date()
  for (;;) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (dates.has(key)) { streak++; d.setDate(d.getDate() - 1) }
    else if (key === todayKey()) { d.setDate(d.getDate() - 1) }
    else break
  }
  return streak
}

/** All stickers ever earned — the collection. */
export function allStickers(s: JournalState): Sticker[] {
  const seen = new Map<string, Sticker>()
  for (const e of s.entries) for (const st of e.stickers ?? []) {
    if (!seen.has(st.emoji)) seen.set(st.emoji, st)
  }
  return [...seen.values()]
}

export function fmtStardate(date: string): string {
  return `STARDATE ${date.replace(/-/g, '.')}`
}

export function fmtDay(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short' })
}
