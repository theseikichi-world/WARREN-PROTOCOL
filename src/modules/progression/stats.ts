// ─── Character stats — read off your actual record ────────────────────────────
// Fallout's S.P.E.C.I.A.L. is assigned at creation. These are the opposite:
// nothing here can be allocated, only earned, and every number traces back to
// something you did. A module you don't use reads "—", never zero — an unused
// instrument isn't a failing grade.

import type { Task } from '../scrap7/types'
import type { Goal } from './types'
import { THRESHOLD_UNLOCK_AT } from './types'
import { nodeScore } from './chain'
import type { ModuleSummaries } from '../bigscreen/moduleStats'

export interface Stat {
  key:    string
  label:  string
  ru:     string
  value:  number | null      // 0–100, null = nothing to measure yet
  detail: string
  color:  string
}

const pct = (n: number): number => Math.max(0, Math.min(100, Math.round(n)))

/** Every routine currently installed across the allocated uplinks. */
function installedRoutines(goals: Goal[], tasks: Task[]): { score: number; streak: number }[] {
  return goals
    .filter(g => g.slot !== 'archived')
    .flatMap(g => g.nodes.filter(n => n.scrapTaskId).map(n => ({
      score:  nodeScore(n, tasks),
      streak: tasks.find(t => t.id === n.scrapTaskId)?.streak ?? 0,
    })))
}

export function deriveStats(goals: Goal[], tasks: Task[], sums: ModuleSummaries): Stat[] {
  const routines = installedRoutines(goals, tasks)

  // AUTOMATISM — how automatic the installed routines have actually become.
  // Named for what it measures: this is the number you read every day, so it
  // says the plain thing rather than the in-world thing.
  const automatism: Stat = {
    key: 'automatism', label: 'AUTOMATISM', ru: 'АВТОМАТИЗМ', color: '#00f5ff',
    value: routines.length ? pct((routines.reduce((s, r) => s + r.score, 0) / routines.length) * 100) : null,
    detail: routines.length ? `${routines.length} routines running` : 'no routines installed',
  }

  // STREAK — the longest unbroken run you're currently holding
  const bestStreak = routines.reduce((m, r) => Math.max(m, r.streak), 0)
  const streak: Stat = {
    key: 'streak', label: 'STREAK', ru: 'СЕРИЯ', color: '#ff6b00',
    value: routines.length ? pct((bestStreak / 66) * 100) : null,   // 66 days ≈ the median formation point
    detail: routines.length ? `${bestStreak} day best run` : 'nothing running yet',
  }

  // RESOLVE — how much of what you started you actually finished
  const automatic = routines.filter(r => r.score >= THRESHOLD_UNLOCK_AT).length
  const resolve: Stat = {
    key: 'resolve', label: 'RESOLVE', ru: 'ВОЛЯ', color: '#ffd700',
    value: routines.length ? pct((automatic / routines.length) * 100) : null,
    detail: routines.length ? `${automatic}/${routines.length} automatic` : 'nothing to hold yet',
  }

  // VITALITY — SOLARIS, the body the rest of it runs on
  const sol = sums.solaris
  const vitality: Stat = {
    key: 'vitality', label: 'VITALITY', ru: 'ЖИЗНЕННЫЕ СИЛЫ', color: '#4ade80',
    value: sol ? pct((Math.min(100, sol.kcalPct) + sol.waterPct) / 2) : null,
    detail: sol ? `${sol.kcalPct}% fuel · ${sol.waterPct}% water` : 'no crew calibrated',
  }

  // RECALL — A.R.D.O, what you can actually reproduce from memory
  const ardo = sums.ardo
  const recall: Stat = {
    key: 'recall', label: 'RECALL', ru: 'ПАМЯТЬ', color: '#00e4a0',
    value: ardo && ardo.texts > 0 ? pct(ardo.mastery) : null,
    detail: ardo && ardo.texts > 0 ? `${ardo.texts} texts · ${ardo.due} due` : 'no texts loaded',
  }

  // INSIGHT — the journal, i.e. whether you're paying attention to yourself
  const jr = sums.journal
  const insight: Stat = {
    key: 'insight', label: 'INSIGHT', ru: 'ОСОЗНАННОСТЬ', color: '#c084fc',
    value: jr && jr.entries > 0 ? pct((Math.min(jr.streak, 30) / 30) * 100) : null,
    detail: jr && jr.entries > 0 ? `${jr.entries} entries · ${jr.streak} day streak` : 'journal untouched',
  }

  return [automatism, streak, resolve, vitality, recall, insight]
}

/** One headline number: the average of whatever is actually measurable. */
export function overallRating(stats: Stat[]): number | null {
  const live = stats.filter((s): s is Stat & { value: number } => s.value !== null)
  if (live.length === 0) return null
  return Math.round(live.reduce((s, x) => s + x.value, 0) / live.length)
}
