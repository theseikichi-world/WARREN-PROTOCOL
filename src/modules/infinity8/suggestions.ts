// ─── GUILD SUGGESTS — what every module would whisper into your free time ─────
// INFINITY-8 owns no tasks; it only surfaces the FREE TIME left in a day.
// This module turns that emptiness into gentle, natural INVITATIONS — never
// obligations. Each guild member offers what it has to give:
//   • PICTURES — the episode you're mid-binge on, a film off the watchlist
//   • A.R.D.O   — lines that are due before the memory fades
//   • L.O.G     — the next concrete step toward a dream
//   • JOURNAL   — tonight's page, still blank, the owl waiting
// Entertainment is a FIRST-CLASS citizen here: catching an episode is a valid,
// guilt-free way to spend a free block — exactly the point of the module.
//
// All functions are pure reads (localStorage via each module's own loader),
// so they're trivially testable and never mutate anything.

import { loadLib } from '../pictures/types'
import { loadArdoState, getTotalDue } from '../ardo/store'
import { loadLogState } from '../log/store'
import { loadJournal, todayKey as journalToday } from '../journal/store'

export type SuggestTone = 'play' | 'grow' | 'care'

export interface Suggestion {
  id:      string
  module:  'pictures' | 'ardo' | 'log' | 'journal'
  icon:    string
  label:   string          // the invitation, phrased warmly
  detail?: string          // a soft second line
  minutes: number          // rough size — used to fit a free gap
  path:    string          // where the chip navigates
  tone:    SuggestTone     // play = entertainment, grow = progress, care = wellbeing
  weight:  number          // higher = surfaced first
}

const safe = (fn: () => Suggestion[]): Suggestion[] => { try { return fn() } catch { return [] } }

// ─── PICTURES — entertainment, unashamed ──────────────────────────────────────
function picturesSuggestions(): Suggestion[] {
  const lib = loadLib()
  const out: Suggestion[] = []

  // Shows you're mid-binge — the strongest pull (you're already invested)
  for (const m of lib.filter(x => x.type === 'tv' && x.status === 'watching')) {
    const released = m.episodes_released ?? 0
    const seen     = m.progress?.episode ?? 0
    const behind   = released - seen
    const fresh    = behind > 0 && behind < 100
    out.push({
      id: `pic-tv-${m.id}`, module: 'pictures', icon: m.emoji || '📺',
      label: `Watch ${m.title}`,
      detail: fresh ? `${behind} new episode${behind > 1 ? 's' : ''} waiting` : 'pick up where you left off',
      minutes: 45, path: '/pictures', tone: 'play',
      weight: fresh ? 9 : 6,
    })
  }

  // A game in progress
  for (const m of lib.filter(x => x.type === 'game' && x.status === 'watching').slice(0, 1)) {
    out.push({
      id: `pic-gm-${m.id}`, module: 'pictures', icon: m.emoji || '🎮',
      label: `Play ${m.title}`, detail: 'jump back in', minutes: 60,
      path: '/pictures', tone: 'play', weight: 7,
    })
  }

  // A film off the watchlist — needs a bigger block
  for (const m of lib.filter(x => x.type === 'movie' && x.status === 'watchlist').slice(0, 2)) {
    out.push({
      id: `pic-mv-${m.id}`, module: 'pictures', icon: m.emoji || '🎬',
      label: `Movie night: ${m.title}`,
      detail: m.year ? `${m.year} · from your watchlist` : 'from your watchlist',
      minutes: 120, path: '/pictures', tone: 'play', weight: 5,
    })
  }

  return out
}

// ─── A.R.D.O — catch the lines before they fade ───────────────────────────────
function ardoSuggestions(): Suggestion[] {
  const due = getTotalDue(loadArdoState())
  if (due <= 0) return []
  const minutes = Math.min(40, Math.max(10, due * 2))   // ~2 min per due card
  return [{
    id: 'ardo-due', module: 'ardo', icon: '🧠',
    label: 'Drill your due lines',
    detail: `${due} card${due > 1 ? 's' : ''} ripe for recall — catch them before they fade`,
    minutes, path: '/ardo', tone: 'grow', weight: 8,
  }]
}

// ─── L.O.G — one concrete step toward a dream ─────────────────────────────────
function logSuggestions(): Suggestion[] {
  const st = loadLogState()
  const out: Suggestion[] = []

  // The next open one-off step per dream (recurring tasks already live in SCRAP-7)
  for (const d of st.dreams) {
    if (out.length >= 2) break
    for (const m of d.missions) {
      if (m.status !== 'active') continue
      const next = m.tasks.find(t => !t.done && t.type === 'todo' && !t.scrap7Id)
      if (next) {
        out.push({
          id: `log-${next.id}`, module: 'log', icon: '✦',
          label: next.text, detail: `advances “${d.title}”`,
          minutes: 30, path: '/log', tone: 'grow', weight: 6,
        })
        break
      }
    }
  }

  // Constellation plan items waiting to be deployed
  for (const p of (st.constellation?.plan ?? []).filter(x => !x.deployed).slice(0, 1)) {
    out.push({
      id: `log-plan-${p.text}`, module: 'log', icon: '✦',
      label: p.text, detail: `serves ${p.serves}`,
      minutes: 30, path: '/log', tone: 'grow', weight: 5,
    })
  }

  return out
}

// ─── JOURNAL — tonight's page is still blank ───────────────────────────────────
function journalSuggestions(): Suggestion[] {
  const st = loadJournal()
  if (st.entries.some(e => e.date === journalToday())) return []
  return [{
    id: 'journal-today', module: 'journal', icon: '🦉',
    label: "Write today's page",
    detail: 'the owl is waiting — tonight is still blank',
    minutes: 15, path: '/journal', tone: 'care', weight: 7,
  }]
}

/** Every invitation the guild has to offer right now, strongest first. */
export function gatherSuggestions(): Suggestion[] {
  return [
    ...safe(picturesSuggestions),
    ...safe(ardoSuggestions),
    ...safe(logSuggestions),
    ...safe(journalSuggestions),
  ].sort((a, b) => b.weight - a.weight)
}

// A suggestion fits a gap if it isn't much longer than the gap (small slack so a
// 45-min episode still fits a 40-min window).
const fits = (s: Suggestion, gapMin: number): boolean => s.minutes <= gapMin + 10

/** Pick the strongest invitations that fit a single gap, one per module for variety. */
export function suggestionsForGap(all: Suggestion[], gapMin: number, max = 2): Suggestion[] {
  const picks: Suggestion[] = []
  const used = new Set<string>()
  for (const s of all) {
    if (picks.length >= max) break
    if (!fits(s, gapMin) || used.has(s.module)) continue
    picks.push(s); used.add(s.module)
  }
  return picks
}

/** The single best invitation for the time left right now (for the Hub NOW card). */
export function topSuggestion(all: Suggestion[], gapMin: number): Suggestion | null {
  return all.find(s => fits(s, gapMin)) ?? all[0] ?? null
}

/**
 * Spread invitations across a day's free blocks (chronological), consuming each
 * as it's placed so the same one never repeats. Big blocks naturally draw the
 * film; little gaps draw a drill or a journal page.
 */
export function assignToFreeBlocks(
  freeBlocks: { id: string; minutes: number }[],
  all: Suggestion[],
  perBlock = 2,
): Record<string, Suggestion[]> {
  const pool = [...all]
  const result: Record<string, Suggestion[]> = {}
  for (const fb of freeBlocks) {
    const picks: Suggestion[] = []
    const used = new Set<string>()
    for (const s of pool) {
      if (picks.length >= perBlock) break
      if (!fits(s, fb.minutes) || used.has(s.module)) continue
      picks.push(s); used.add(s.module)
    }
    for (const p of picks) pool.splice(pool.indexOf(p), 1)
    if (picks.length) result[fb.id] = picks
  }
  return result
}
