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
import { t as tr, plural } from '../../i18n'

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
    detail: routines.length
      ? tr(`${routines.length} routines running`,
           `${routines.length} ${plural(routines.length, 'рутина', 'рутины', 'рутин')} в работе`)
      : tr('no routines installed', 'рутины не установлены'),
  }

  // STREAK — the longest unbroken run you're currently holding
  const bestStreak = routines.reduce((m, r) => Math.max(m, r.streak), 0)
  const streak: Stat = {
    key: 'streak', label: 'STREAK', ru: 'СЕРИЯ', color: '#ff6b00',
    value: routines.length ? pct((bestStreak / 66) * 100) : null,   // 66 days ≈ the median formation point
    detail: routines.length
      ? tr(`${bestStreak} day best run`,
           `лучшая серия — ${bestStreak} ${plural(bestStreak, 'день', 'дня', 'дней')}`)
      : tr('nothing running yet', 'пока ничего не запущено'),
  }

  // RESOLVE — how much of what you started you actually finished
  const automatic = routines.filter(r => r.score >= THRESHOLD_UNLOCK_AT).length
  const resolve: Stat = {
    key: 'resolve', label: 'RESOLVE', ru: 'ВОЛЯ', color: '#ffd700',
    value: routines.length ? pct((automatic / routines.length) * 100) : null,
    detail: routines.length
      ? tr(`${automatic}/${routines.length} automatic`, `${automatic}/${routines.length} на автомате`)
      : tr('nothing to hold yet', 'пока нечего держать'),
  }

  // VITALITY — SOLARIS, the body the rest of it runs on
  const sol = sums.solaris
  const vitality: Stat = {
    key: 'vitality', label: 'VITALITY', ru: 'ЖИЗНЕННЫЕ СИЛЫ', color: '#4ade80',
    value: sol ? pct((Math.min(100, sol.kcalPct) + sol.waterPct) / 2) : null,
    detail: sol
      ? tr(`${sol.kcalPct}% fuel · ${sol.waterPct}% water`, `${sol.kcalPct}% топлива · ${sol.waterPct}% воды`)
      : tr('no crew calibrated', 'экипаж не откалиброван'),
  }

  // RECALL — A.R.D.O, what you can actually reproduce from memory
  const ardo = sums.ardo
  const recall: Stat = {
    key: 'recall', label: 'RECALL', ru: 'ПАМЯТЬ', color: '#00e4a0',
    value: ardo && ardo.texts > 0 ? pct(ardo.mastery) : null,
    detail: ardo && ardo.texts > 0
      ? tr(`${ardo.texts} texts · ${ardo.due} due`,
           `${ardo.texts} ${plural(ardo.texts, 'текст', 'текста', 'текстов')} · ${ardo.due} к повтору`)
      : tr('no texts loaded', 'тексты не загружены'),
  }

  // INSIGHT — the journal, i.e. whether you're paying attention to yourself
  const jr = sums.journal
  const insight: Stat = {
    key: 'insight', label: 'INSIGHT', ru: 'ОСОЗНАННОСТЬ', color: '#c084fc',
    value: jr && jr.entries > 0 ? pct((Math.min(jr.streak, 30) / 30) * 100) : null,
    detail: jr && jr.entries > 0
      ? tr(`${jr.entries} entries · ${jr.streak} day streak`,
           `${jr.entries} ${plural(jr.entries, 'запись', 'записи', 'записей')} · серия ${jr.streak} ${plural(jr.streak, 'день', 'дня', 'дней')}`)
      : tr('journal untouched', 'журнал не открывали'),
  }

  // IRON — VIGILANTE, time you actually spent under tension. Scaled against an
  // hour: a stat you can move in a week would say nothing by the second month.
  const vg = sums.vigilante
  const iron: Stat = {
    key: 'iron', label: 'IRON', ru: 'СТОЙКОСТЬ', color: '#6366f1',
    value: vg && vg.sessions > 0 ? pct((Math.min(vg.heldSec, 3600) / 3600) * 100) : null,
    detail: vg && vg.sessions > 0
      ? tr(`stage ${vg.stage} · ${vg.finished}/${vg.sessions} held`,
           `этап ${vg.stage} · ${vg.finished}/${vg.sessions} выдержано`)
      : tr('never held a position', 'ни одного удержания'),
  }

  return [automatism, streak, resolve, vitality, recall, insight, iron]
}

/** One headline number: the average of whatever is actually measurable. */
export function overallRating(stats: Stat[]): number | null {
  const live = stats.filter((s): s is Stat & { value: number } => s.value !== null)
  if (live.length === 0) return null
  return Math.round(live.reduce((s, x) => s + x.value, 0) / live.length)
}
