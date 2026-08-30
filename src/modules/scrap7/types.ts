// ─── Task types ───────────────────────────────────────────────────────────────

import { loadSettings } from '../../settings'

/**
 * ORBIT presents ONE kind of thing: a task, which may repeat. `taskType` is the
 * storage-level spelling of that — `'daily'` means "repeats", `'todo'` means
 * "once" — and keeping the two names avoids migrating every stored task and the
 * daily-reset machinery that already reads them.
 *
 * `'habit'` is not creatable in ORBIT at all. It belongs to UPLINKS: a goal
 * routine (`origin: 'chain'`) or a basic (`origin: 'baseline'`). The line is
 * BUILDS YOU vs JUST HAS TO HAPPEN, not repeats vs doesn't — which is why
 * repeating tasks are uncapped and unscored while basics are capped and scored.
 * You choose your basics; you mostly don't choose your obligations.
 */
export type TaskType  = 'habit' | 'daily' | 'todo'

/** A task that comes back when you complete it. */
export const isRepeating = (t: Pick<Task, 'taskType'>): boolean => t.taskType === 'daily'

/** Everything ORBIT owns: the day's obligations, repeating or not. */
export const isOrbitTask = (t: Pick<Task, 'taskType'>): boolean =>
  t.taskType === 'daily' || t.taskType === 'todo'

/**
 * Where a task came from. Decides who it answers to:
 *   manual   — you made it here. Yours, earns nothing, listed under YOUR OWN
 *              HABITS on the character sheet where it can be adopted.
 *   log      — synced from L.O.G. Belongs to a system that still exists, so it
 *              is not an orphan. Earns no progression XP.
 *   chain    — carries a PROTOCOL routine. Goal work, full XP.
 *   baseline — LIFE SUPPORT: the basics of being a person, chosen from a
 *              template on the character sheet. No tree, no gating, no
 *              prerequisites, and deliberately a fraction of the XP — showing
 *              up for your own life should count for something, but it must
 *              never out-earn the work you picked a goal to do.
 * Legacy tasks have no field; `taskOrigin()` infers it.
 */
export type TaskOrigin = 'manual' | 'log' | 'chain' | 'baseline'
export type Priority  = 'trivial' | 'easy' | 'medium' | 'hard'
export type Direction = 'positive' | 'negative'
export type TimeOfDay = 'morning' | 'day' | 'evening' | 'daily'

export interface Schedule {
  type: 'everyday' | 'weekly'
  days?: string[]  // ['mon','wed','fri']
}

export interface Task {
  id:         string
  text:       string
  category:   string
  taskType:   TaskType
  completed:  boolean
  createdAt:  string
  origin?:    TaskOrigin   // absent on legacy tasks — see taskOrigin()
  /**
   * Set when the routine's goal loses its bandwidth slot. The habit is never
   * deleted: it stays visible and trackable, its score decays at half rate,
   * and it earns nothing. Owned by the progression module.
   */
  frozen?:    boolean

  // Habit-specific
  direction?:        Direction
  streak?:           number
  score?:            number    // 0.0–1.0, exponential smoothing (alpha=0.05)
  todayCount?:       number
  lastTrackedDate?:  string | null
  trackingHistory?:  string[]
  skippedDates?:     string[]  // days marked skip — no decay, streak preserved
  target?:           number    // daily dose target (default 1)
  unit?:             string    // "glasses", "minutes", "km", "pages" etc.

  // Daily-specific
  schedule?:          Schedule
  completionHistory?: string[]

  // Todo-specific
  priority?:  Priority
  dueDate?:   string | null

  // Cross-module provenance (set by createExternalTask — e.g. L.O.G sync)
  logMission?: string
  logDream?:   string
}

// ─── Task origin ──────────────────────────────────────────────────────────────
// Legacy tasks predate the field. L.O.G stamped its provenance on every task it
// synced, so those are recoverable exactly; everything else was made by hand.

export function taskOrigin(t: Pick<Task, 'origin' | 'logMission' | 'logDream'>): TaskOrigin {
  if (t.origin) return t.origin
  return (t.logMission || t.logDream) ? 'log' : 'manual'
}

/** Routines and life support earn; a hand-made task or a L.O.G sync does not. */
export function feedsProgression(t: Pick<Task, 'origin' | 'logMission' | 'logDream'>): boolean {
  const o = taskOrigin(t)
  return o === 'chain' || o === 'baseline'
}

/** A PROTOCOL routine — the only origin with a tree, gating and full XP. */
export const isRoutine = (t: Pick<Task, 'origin' | 'logMission' | 'logDream'>): boolean =>
  taskOrigin(t) === 'chain'

/** LIFE SUPPORT — chosen from a template, no tree, a fraction of the XP. */
/**
 * Is this unit something you REPEAT, or something that measures one session?
 *
 * "Teeth, twice" is two events in a day and a tap each is right. "Move the body,
 * 15 minutes" is one event with a size — nobody taps once per minute, and until
 * the fifteenth tap the score does not move at all, so the first fourteen looked
 * like the button was broken.
 *
 * Anything not listed is treated as a measure, because that is the safer wrong
 * answer: completing in one tap is merely generous, while demanding thirty is
 * unusable.
 */
const COUNTABLE_UNITS = new Set([
  'time', 'times', 'dose', 'doses', 'glass', 'glasses', 'serving', 'servings',
  'rep', 'reps', 'set', 'sets', 'session', 'sessions', 'page', 'pages',
  'night', 'nights', 'day', 'days', 'morning', 'mornings', 'person', 'people',
  'раз', 'раза', 'ночь', 'день', 'доза', 'стакан', 'страница',
])

export const isCountableUnit = (unit: string | undefined): boolean =>
  COUNTABLE_UNITS.has((unit ?? 'times').trim().toLowerCase())

export const isBaseline = (t: Pick<Task, 'origin' | 'logMission' | 'logDream'>): boolean =>
  taskOrigin(t) === 'baseline'

/**
 * Made by hand, belonging to no system. Only ever a TODO or a DAILY now — a
 * hand-made HABIT is a basic, so `adoptOrphanHabits` moves it to life support
 * on load. See rule 32.
 */
export function isUnbound(t: Pick<Task, 'origin' | 'logMission' | 'logDream'>): boolean {
  return taskOrigin(t) === 'manual'
}

/**
 * A habit with no home. There is exactly one place for a habit that isn't a
 * goal routine — LIFE SUPPORT — so this should always be empty after a load.
 *
 * This used to test for `'manual'` specifically, which missed the worst case.
 * PATHFINDER's old analysis panel created habits through the L.O.G sync, so they
 * carried `logDream` and resolved to `'log'`: not adopted here, not listed by
 * `orbitTasks` (which keeps only todos and due dailies), and not in any chain.
 * They existed in storage, decayed on every daily reset, and were drawn on no
 * screen at all. Anything that is not a routine and not a basic is an orphan.
 */
export const isOrphanHabit = (t: Task): boolean => {
  if (t.taskType !== 'habit') return false
  const o = taskOrigin(t)
  return o !== 'chain' && o !== 'baseline'
}

// ─── Milestone labels (cyberpunk-flavoured) ───────────────────────────────────
export const MILESTONE_LABELS: Record<number, { label: string; icon: string }> = {
  3:   { label: 'Spark',   icon: '✦'  },
  7:   { label: 'Ember',   icon: '🔥' },
  14:  { label: 'Flame',   icon: '🔥' },
  21:  { label: 'Fire',    icon: '🔥' },
  30:  { label: 'Blaze',   icon: '⚡' },
  66:  { label: 'Inferno', icon: '💀' },
  100: { label: 'Eternal', icon: '👁' },
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id:      string
  text:    string
  sender:  'user' | 'scrap7'
  ts:      string
}

// ─── App state ────────────────────────────────────────────────────────────────

export interface Scrap7State {
  tasks:          Task[]
  categories:     string[]
  chatHistory:    ChatMessage[]
  lastDailyReset: string    // YYYY-MM-DD
}

// ─── Weekly streak helpers ────────────────────────────────────────────────────

/** Returns the ISO date strings for Mon–Sun of the current week */
export function thisWeekDates(): string[] {
  const today = new Date()
  const day   = today.getDay()           // 0=Sun … 6=Sat
  const mon   = new Date(today)
  mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon)
    d.setDate(mon.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

/** Days this week where at least one habit was tracked */
export function weeklyDoneSet(tasks: Task[]): Set<string> {
  const done = new Set<string>()
  const week = new Set(thisWeekDates())
  for (const t of tasks) {
    if (t.taskType === 'habit') {
      for (const d of (t.trackingHistory ?? [])) {
        if (week.has(d)) done.add(d)
      }
    }
    if (t.taskType === 'daily') {
      for (const d of (t.completionHistory ?? [])) {
        if (week.has(d)) done.add(d)
      }
    }
  }
  return done
}

/** Current consecutive-day streak across all habits + dailies */
/**
 * The first day this operator did anything the app tracks.
 *
 * The week strip used to draw a red miss on every past day that was not in the
 * done set, which meant a profile one day old was told it had failed six days
 * it could not have attended. A day before you arrived is not a day you missed.
 */
export function firstActiveDate(tasks: Task[]): string | null {
  let first: string | null = null
  for (const t of tasks) {
    for (const d of [...(t.trackingHistory ?? []), ...(t.completionHistory ?? [])]) {
      if (first === null || d < first) first = d
    }
  }
  return first
}

export function calcStreak(tasks: Task[]): number {
  const allDates = new Set<string>()
  for (const t of tasks) {
    for (const d of [...(t.trackingHistory ?? []), ...(t.completionHistory ?? [])]) {
      allDates.add(d)
    }
  }
  let streak = 0
  const today = todayKey()
  for (let i = 0; i < 365; i++) {
    // Local keys throughout: the histories are written with local dates, so
    // counting back with UTC ones skipped or double-counted a day near midnight.
    if (allDates.has(shiftDateKey(today, -i))) streak++
    else if (i > 0) break   // allow today to be not-yet-done
  }
  return streak
}

// ─── Habit score tiers (Loop-inspired) ───────────────────────────────────────
// Score curve with alpha=0.05: ~5% day 1 → ~30% week 1 → ~80% month 1 → ~96% month 2

export interface HabitTier {
  tier:   string
  color:  string
  label:  string
}

export function getHabitTier(score: number): HabitTier {
  if (score < 0.01)  return { tier: 'new',      color: '#00b4ff', label: 'New'      }
  if (score < 0.15)  return { tier: 'spark',    color: '#00f5ff', label: 'Spark'    }
  if (score < 0.40)  return { tier: 'forming',  color: '#eab308', label: 'Forming'  }
  if (score < 0.65)  return { tier: 'building', color: '#22c55e', label: 'Building' }
  if (score < 0.85)  return { tier: 'strong',   color: '#3b82f6', label: 'Strong'   }
  if (score < 0.97)  return { tier: 'hardened', color: '#8b5cf6', label: 'Hardened' }
  return                    { tier: 'forged',   color: '#f59e0b', label: 'Forged'   }
}

export const HABIT_MILESTONES = [
  { days: 3,   label: 'Spark',   msg: 'Getting started! Keep the flame alive.' },
  { days: 7,   label: 'Ember',   msg: 'One week! A pattern is forming.' },
  { days: 14,  label: 'Flame',   msg: 'Two weeks. Your brain is rewiring.' },
  { days: 21,  label: 'Fire',    msg: '21 days — science says this is a habit now!' },
  { days: 30,  label: 'Blaze',   msg: 'One month. You are transforming.' },
  { days: 66,  label: 'Inferno', msg: '66 days — this is automatic now.' },
  { days: 100, label: 'Eternal', msg: '100 days. This is who you are.' },
]

// ─── XP ───────────────────────────────────────────────────────────────────────

export const XP_TABLE: Record<TaskType, Record<string, number>> = {
  habit: { base: 8, weeklyBonus: 10, milestone: 20 },
  daily: { base: 12, streakBonus: 10 },
  todo:  { trivial: 5, easy: 8, medium: 15, hard: 30 },
}

export function levelThreshold(l: number): number { return l * 100 }

export function xpProgress(xp: number): { level: number; current: number; needed: number } {
  let l = 1, x = xp
  while (x >= levelThreshold(l)) { x -= levelThreshold(l); l++ }
  return { level: l, current: x, needed: levelThreshold(l) }
}

// ─── Default data ─────────────────────────────────────────────────────────────

export const DEFAULT_CATEGORIES = ['Health', 'Work', 'Study', 'Fitness', 'Mindset', 'Other']

export const WEEKDAYS = [
  { value: 'mon', label: 'M' }, { value: 'tue', label: 'T' },
  { value: 'wed', label: 'W' }, { value: 'thu', label: 'T' },
  { value: 'fri', label: 'F' }, { value: 'sat', label: 'S' },
  { value: 'sun', label: 'S' },
]

/**
 * TODAY — the operator's day, which ends when they go to bed.
 *
 * Two wrong answers came before this one. It was the UTC date, while INFINITY-8
 * used the local date, so the two disagreed for hours at a time. Then it was the
 * local calendar date, which is right for most people and still wrong for this
 * one: with a bedtime of 02:00, work done at 01:00 belongs to the day that
 * started yesterday morning, not to the calendar date that just ticked over.
 *
 * So the day rolls at BEDTIME, not at midnight. Everything before the cutoff is
 * still yesterday. The deadline is real and it does not extend: miss it and the
 * day closed, which is the point — a day you can still repair at 4am is not a
 * day, it's an accordion.
 */
export function todayKey(now = new Date()): string {
  let cutoff = 0
  try { cutoff = sleepCutoffMin(loadSettings().sleepTime) } catch { /* no profile yet */ }
  return dayKeyAt(now, cutoff)
}

/**
 * Minutes past midnight at which the day rolls over.
 *
 * Only a bedtime in the small hours moves the boundary. Someone who sleeps at
 * 23:00 keeps midnight — pushing their rollover to 23:00 would close the day
 * while they were still awake in it.
 */
export function sleepCutoffMin(sleepTime: string | undefined): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((sleepTime ?? '').trim())
  if (!m) return 0
  const mins = Number(m[1]) * 60 + Number(m[2])
  return mins > 0 && mins < 12 * 60 ? mins : 0
}

/** The day `now` belongs to, given a rollover `cutoff` in minutes past midnight. */
export function dayKeyAt(now: Date, cutoffMin: number): string {
  const minsToday = now.getHours() * 60 + now.getMinutes()
  return minsToday < cutoffMin ? shiftDateKey(dateKey(now), -1) : dateKey(now)
}

/** The local calendar date of a moment, as YYYY-MM-DD. Never UTC. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A YYYY-MM-DD key parsed back as LOCAL midnight, so day arithmetic is symmetric. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** `key` shifted by `days`, staying in local time across DST. */
export function shiftDateKey(key: string, days: number): string {
  const d = parseDateKey(key)
  d.setDate(d.getDate() + days)
  return dateKey(d)
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. Negative when `to` is earlier. */
export function daysBetweenKeys(from: string, to: string): number {
  return Math.round((parseDateKey(to).getTime() - parseDateKey(from).getTime()) / 86400000)
}
