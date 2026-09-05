// ─── Deadlines — what a date does to an act ───────────────────────────────────
// A BREACH was always "a real, datable, external event". It just never carried
// the date. Without one the spine can name the exam and still not know that the
// routine meant to carry you into it needs forty days to automate and has
// twenty-two — which is the single most useful thing a plan can tell you.
//
// Everything here is pure over (chapter, goal, tasks, now), and everything it
// says is a projection, never a promise: `estimateDays` is a baseline that
// self-corrects, so this reports a shortfall, it does not forbid one.
//
// Deliberately NOT a gate. A date that passed does not lock the chapter, and a
// routine that projects past it is not removed. You are the one who decides
// whether to move the date, drop the routine, or go anyway.

import type { Task } from '../scrap7/types'
import type { Chapter, Goal } from './types'
import { estimateDays } from './types'
import { nodeScore } from './chain'

/** How close the date is. The bands are copy, not rules — nothing gates on them. */
export type DeadlineBand = 'overdue' | 'tight' | 'near' | 'clear'

const DAY = 86_400_000
const dayNumber = (d: Date): number =>
  Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY)

/** A stored due date: `YYYY-MM-DD`, and a real day on the calendar. */
export function isDueDate(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim())
  if (!m) return false
  const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const d = new Date(Date.UTC(y, mo - 1, da))
  return d.getUTCFullYear() === y && d.getUTCMonth() === mo - 1 && d.getUTCDate() === da
}

/**
 * Whole days from today to the date. Negative once it has passed, 0 on the day.
 * Compared at day granularity so an evening never eats a day the operator has.
 */
export function daysUntil(due: string, now = new Date()): number | null {
  if (!isDueDate(due)) return null
  const [y, mo, da] = due.trim().split('-').map(Number)
  return Math.floor(Date.UTC(y, mo - 1, da) / DAY) - dayNumber(now)
}

export function bandOf(days: number): DeadlineBand {
  if (days < 0)  return 'overdue'
  if (days <= 7) return 'tight'
  if (days <= 30) return 'near'
  return 'clear'
}

export const bandColor = (band: DeadlineBand): string =>
  band === 'overdue' ? '#f87171'
  : band === 'tight' ? '#fbbf24'
  : band === 'near'  ? 'rgba(255,215,0,0.7)'
  : 'rgba(148,163,184,0.7)'

export interface Countdown {
  days: number
  band: DeadlineBand
  en:   string
  ru:   string
}

const ruDays = (n: number): string =>
  n % 10 === 1 && n % 100 !== 11 ? 'день'
  : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'дня'
  : 'дней'

/** The date as a countdown. Says the number; says nothing about how you're doing. */
export function countdown(due: string, now = new Date()): Countdown | null {
  const days = daysUntil(due, now)
  if (days === null) return null
  const band = bandOf(days)
  if (days === 0) return { days, band, en: 'TODAY', ru: 'СЕГОДНЯ' }
  if (days < 0) {
    const n = -days
    return { days, band, en: `${n}D PAST`, ru: `${n} ${ruDays(n)} НАЗАД` }
  }
  return { days, band, en: `${days}D LEFT`, ru: `ОСТАЛОСЬ ${days} ${ruDays(days)}` }
}

// ─── Will the routines be ready in time? ──────────────────────────────────────

export interface Shortfall {
  nodeId:   string
  title:    string
  /** Projected days to automation at the current score — see `estimateDays`. */
  needDays: number
  /** Days actually left before the breach. */
  haveDays: number
  short:    number
}

/**
 * Routines that project past their chapter's date, worst first.
 *
 * This is the maturity check the tree could never make: a tier-3 routine at
 * score 0.1 is 108 days from automatic, and if the exam is in six weeks that is
 * a fact worth knowing in week one rather than in week five.
 *
 * Empty when there is no date, when the date is unreadable, or when everything
 * projects inside it — silence is the correct output for a plan that fits.
 */
export function shortfalls(chapter: Chapter, goal: Goal, tasks: Task[], now = new Date()): Shortfall[] {
  const due = chapter.boss?.due
  if (!due) return []
  const haveDays = daysUntil(due, now)
  if (haveDays === null) return []

  const out: Shortfall[] = []
  for (const id of chapter.nodeIds) {
    const node = goal.nodes.find(n => n.id === id)
    if (!node) continue
    const needDays = estimateDays(nodeScore(node, tasks), node.tier)
    // An already-automatic routine needs nothing, so it can never be late.
    if (needDays <= haveDays) continue
    out.push({ nodeId: node.id, title: node.title, needDays, haveDays, short: needDays - haveDays })
  }
  return out.sort((a, b) => b.short - a.short)
}

/**
 * One line under the countdown, or nothing.
 *
 * Names the worst offender by number and counts the rest. It reports; it does
 * not tell you to drop anything, because which routine matters is a judgement
 * about the goal and this file only knows arithmetic.
 */
export function scheduleLine(
  chapter: Chapter, goal: Goal, tasks: Task[], now = new Date(),
): { en: string; ru: string } | null {
  const late = shortfalls(chapter, goal, tasks, now)
  if (late.length === 0) return null
  const [worst] = late
  const rest = late.length - 1
  const more = rest > 0
    ? { en: ` · ${rest} more won't`, ru: ` · ещё ${rest} не успева${rest === 1 ? 'ет' : 'ют'}` }
    : { en: '', ru: '' }

  return {
    en: `${worst.title} projects ${worst.needDays}d to automatic, ${worst.haveDays}d remain${more.en}`,
    ru: `${worst.title}: до автоматизма ~${worst.needDays} ${ruDays(worst.needDays)}, осталось ${worst.haveDays}${more.ru}`,
  }
}
