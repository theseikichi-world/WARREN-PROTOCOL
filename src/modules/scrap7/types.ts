// ─── Task types ───────────────────────────────────────────────────────────────

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
 */
export const isOrphanHabit = (t: Task): boolean =>
  t.taskType === 'habit' && taskOrigin(t) === 'manual'

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
export function calcStreak(tasks: Task[]): number {
  const allDates = new Set<string>()
  for (const t of tasks) {
    for (const d of [...(t.trackingHistory ?? []), ...(t.completionHistory ?? [])]) {
      allDates.add(d)
    }
  }
  let streak = 0
  const today = new Date()
  for (let i = 0; i < 365; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    if (allDates.has(key)) streak++
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

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}
