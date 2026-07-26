// ─── Living-card data — one glance per guild member ───────────────────────────
// Each module gets a small, typed summary of "what matters right now". The
// derive* functions are pure (state in → summary out) so they're unit-testable;
// the get* wrappers read localStorage and never throw.

import { loadState as loadScrap7 } from '../scrap7/store'
import {
  todayKey as scrapToday, thisWeekDates, weeklyDoneSet, calcStreak,
  type Task, type Schedule,
} from '../scrap7/types'
import { loadLogState } from '../log/store'
import type { LogState } from '../log/types'
import { loadArdoState, getTotalDue, getTextStats } from '../ardo/store'
import type { ArdoState } from '../ardo/store'
import { loadSolarisState, activeMember, getDay, getDrinks } from '../solaris/store'
import type { SolarisState } from '../solaris/store'
import {
  computeTargets, sumDay, recommendedWaterMl, effectiveHydration,
  todayKey as solarisToday,
} from '../solaris/types'
import { loadLib, daysUntil, type MediaItem } from '../pictures/types'
import { loadJournal, journalStreak, allStickers, todayKey as journalToday } from '../journal/store'
import type { JournalState } from '../journal/store'

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** Is a scheduled item due today? (no schedule = every day) */
export function dueToday(s: Schedule | undefined, dayKey: string): boolean {
  return !s || s.type === 'everyday' || (s.type === 'weekly' && !!s.days?.includes(dayKey))
}

// ─── SCRAP-7 ──────────────────────────────────────────────────────────────────
export interface Scrap7Summary {
  due:      number
  streak:   number
  weekDots: boolean[]      // Mon→Sun, true = something tracked that day
  next:     string | null  // the next thing worth doing
}

export function deriveScrap7(tasks: Task[], today: string, dayKey: string): Scrap7Summary {
  const open: Task[] = []
  for (const t of tasks) {
    if (t.taskType === 'todo') {
      if (!t.completed) open.push(t)
    } else if (t.taskType === 'daily') {
      if (dueToday(t.schedule, dayKey) && !t.completed) open.push(t)
    } else if (t.taskType === 'habit') {
      if ((t.direction ?? 'positive') === 'positive' && dueToday(t.schedule, dayKey)) {
        const done = t.lastTrackedDate === today && (t.todayCount ?? 0) >= (t.target ?? 1)
        if (!done) open.push(t)
      }
    }
  }
  const doneSet = weeklyDoneSet(tasks)
  return {
    due:      open.length,
    streak:   calcStreak(tasks),
    weekDots: thisWeekDates().map(d => doneSet.has(d)),
    next:     open[0]?.text ?? null,
  }
}

// ─── L.O.G ────────────────────────────────────────────────────────────────────
export interface LogSummary {
  dream:    string | null
  done:     number
  total:    number
  next:     string | null
  active:   number
}

export function deriveLog(state: LogState): LogSummary {
  const dream = state.dreams[0] ?? null
  let active = 0
  for (const d of state.dreams) for (const m of d.missions) if (m.status === 'active') active++
  if (!dream) return { dream: null, done: 0, total: 0, next: null, active }

  const total = dream.missions.length
  const done  = dream.missions.filter(m => m.status === 'completed').length
  let next: string | null = null
  for (const m of dream.missions) {
    if (m.status !== 'active') continue
    const t = m.tasks.find(x => !x.done)
    if (t) { next = t.text; break }
    if (!next) next = m.title
  }
  return { dream: dream.title, done, total, next, active }
}

// ─── A.R.D.O ──────────────────────────────────────────────────────────────────
export interface ArdoSummary {
  due:      number
  texts:    number
  mastery:  number         // 0–100 across active texts
  next:     string | null  // text with the most due chunks
}

export function deriveArdo(state: ArdoState): ArdoSummary {
  const active = state.texts.filter(t => t.status === 'active')
  if (active.length === 0) return { due: getTotalDue(state), texts: 0, mastery: 0, next: null }

  let mastered = 0, chunks = 0, topDue = -1, topTitle: string | null = null
  for (const t of active) {
    const s = getTextStats(t, state.cards)
    mastered += s.mastered
    chunks   += s.total
    if (s.due > topDue) { topDue = s.due; topTitle = t.title }
  }
  return {
    due:     getTotalDue(state),
    texts:   active.length,
    mastery: chunks > 0 ? Math.round((mastered / chunks) * 100) : 0,
    next:    topTitle,
  }
}

// ─── SOLARIS ──────────────────────────────────────────────────────────────────
export interface SolarisSummary {
  member:   string | null
  kcalLeft: number
  kcalPct:  number         // 0–100+ of the daily budget consumed
  macros:   { key: 'protein' | 'carbs' | 'fat'; pct: number }[]
  waterPct: number
}

export function deriveSolaris(state: SolarisState, today: string): SolarisSummary | null {
  const m = activeMember(state)
  if (!m) return null
  const target   = computeTargets(m.profile)
  const consumed = sumDay(getDay(state, m.id, today))
  const waterTarget = recommendedWaterMl(m.profile)
  const hydrated    = effectiveHydration(getDrinks(state, m.id, today))
  const pct = (c: number, t: number) => (t > 0 ? Math.min(100, Math.round((c / t) * 100)) : 0)

  return {
    member:   m.name,
    kcalLeft: Math.max(0, target.calories - consumed.calories),
    kcalPct:  target.calories > 0 ? Math.round((consumed.calories / target.calories) * 100) : 0,
    macros: [
      { key: 'protein', pct: pct(consumed.protein, target.protein) },
      { key: 'carbs',   pct: pct(consumed.carbs,   target.carbs)   },
      { key: 'fat',     pct: pct(consumed.fat,     target.fat)     },
    ],
    waterPct: pct(hydrated, waterTarget),
  }
}

// ─── GALACTIC PICTURES ────────────────────────────────────────────────────────
export interface PicturesSummary {
  title:    string | null
  detail:   string | null
  watching: number
  catchUp:  number         // episodes waiting across the library
  days:     number | null  // days until the next episode
}

export function derivePictures(lib: MediaItem[]): PicturesSummary {
  const watching = lib.filter(x => x.status === 'watching')
  const shows    = watching.filter(x => x.type === 'tv')

  let catchUp = 0
  for (const s of shows) {
    const behind = (s.episodes_released ?? 0) - (s.progress?.episode ?? 0)
    if (behind > 0) catchUp += behind
  }

  // Prefer something you can watch right now, else the soonest upcoming episode
  const ready = shows.find(s => (s.episodes_released ?? 0) - (s.progress?.episode ?? 0) > 0)
  if (ready) {
    const behind = (ready.episodes_released ?? 0) - (ready.progress?.episode ?? 0)
    return { title: ready.title, detail: `${behind} ep ready`, watching: watching.length, catchUp, days: 0 }
  }

  const upcoming = shows
    .map(s => ({ s, d: daysUntil(s.next_episode_date) }))
    .filter((x): x is { s: MediaItem; d: number } => x.d !== null && x.d >= 0)
    .sort((a, b) => a.d - b.d)[0]
  if (upcoming) {
    return { title: upcoming.s.title, detail: null, watching: watching.length, catchUp, days: upcoming.d }
  }

  const any = watching[0] ?? lib.find(x => x.status === 'watchlist') ?? null
  return { title: any?.title ?? null, detail: null, watching: watching.length, catchUp, days: null }
}

// ─── CAPTAIN'S JOURNAL ────────────────────────────────────────────────────────
export interface JournalSummary {
  streak:       number
  writtenToday: boolean
  stickers:     number
  entries:      number
}

export function deriveJournal(state: JournalState, today: string): JournalSummary {
  return {
    streak:       journalStreak(state),
    writtenToday: state.entries.some(e => e.date === today),
    stickers:     allStickers(state).length,
    entries:      state.entries.length,
  }
}

// ─── Roll-up ──────────────────────────────────────────────────────────────────
export interface ModuleSummaries {
  scrap7:   Scrap7Summary | null
  log:      LogSummary | null
  ardo:     ArdoSummary | null
  solaris:  SolarisSummary | null
  pictures: PicturesSummary | null
  journal:  JournalSummary | null
}

const safe = <T>(fn: () => T): T | null => { try { return fn() } catch { return null } }

export function getModuleSummaries(): ModuleSummaries {
  const dayKey = DAY_KEYS[new Date().getDay()]
  return {
    scrap7:   safe(() => deriveScrap7(loadScrap7().tasks, scrapToday(), dayKey)),
    log:      safe(() => deriveLog(loadLogState())),
    ardo:     safe(() => deriveArdo(loadArdoState())),
    solaris:  safe(() => deriveSolaris(loadSolarisState(), solarisToday())),
    pictures: safe(() => derivePictures(loadLib())),
    journal:  safe(() => deriveJournal(loadJournal(), journalToday())),
  }
}
