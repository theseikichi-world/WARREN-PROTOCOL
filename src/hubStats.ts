// ─── Hub quick-stats — one glance across the guild ────────────────────────────
// Reads each module's localStorage and rolls it into the four dashboard tiles.
// Every gatherer is wrapped so a single bad/empty module never blanks the row.

import { loadState as loadScrap7 } from './modules/scrap7/store'
import { todayKey as scrapToday } from './modules/scrap7/types'
import { loadLogState } from './modules/log/store'
import { loadSolarisState, activeMember, getDay } from './modules/solaris/store'
import { computeTargets, sumDay } from './modules/solaris/types'

export interface HubStats {
  tasksDue:     number
  activeGoals:  number
  caloriesLeft: number | null   // null = no SOLARIS crew yet
  streak:       number
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** SCRAP-7: open todos + due dailies + due positive habits not yet done today. */
function scrap7TasksDue(): number {
  const tasks = loadScrap7().tasks
  const today = scrapToday()
  const dayKey = DAY_KEYS[new Date().getDay()]
  const dueToday = (s: { type: string; days?: string[] } | undefined): boolean =>
    !s || s.type === 'everyday' || (s.type === 'weekly' && !!s.days?.includes(dayKey))

  let n = 0
  for (const t of tasks) {
    if (t.taskType === 'todo') {
      if (!t.completed) n++
    } else if (t.taskType === 'daily') {
      if (dueToday(t.schedule) && !t.completed) n++
    } else if (t.taskType === 'habit') {
      if ((t.direction ?? 'positive') === 'positive' && dueToday(t.schedule)) {
        const done = t.lastTrackedDate === today && (t.todayCount ?? 0) >= (t.target ?? 1)
        if (!done) n++
      }
    }
  }
  return n
}

/** L.O.G: count of active missions across all dreams. */
function logActiveGoals(): number {
  let n = 0
  for (const d of loadLogState().dreams) for (const m of d.missions) if (m.status === 'active') n++
  return n
}

/** SOLARIS: kcal left today for the active crew member (null if no crew). */
function solarisCaloriesLeft(): number | null {
  const st = loadSolarisState()
  const m = activeMember(st)
  if (!m) return null
  const target   = computeTargets(m.profile).calories
  const consumed = sumDay(getDay(st, m.id)).calories
  return Math.max(0, target - consumed)
}

/** Best current streak across SCRAP-7 habits & dailies. */
function bestStreak(): number {
  return loadScrap7().tasks.reduce((m, t) => Math.max(m, t.streak ?? 0), 0)
}

const safe = <T>(fn: () => T, fallback: T): T => { try { return fn() } catch { return fallback } }

export function getHubStats(): HubStats {
  return {
    tasksDue:     safe(scrap7TasksDue, 0),
    activeGoals:  safe(logActiveGoals, 0),
    caloriesLeft: safe(solarisCaloriesLeft, null),
    streak:       safe(bestStreak, 0),
  }
}
