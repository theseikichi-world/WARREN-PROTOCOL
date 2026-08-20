// ─── Putting the training in the day ──────────────────────────────────────────
// You say WHEN you want to train; this decides WHERE that lands.
//
// The habit itself is a life-support basic, not a private counter inside this
// module. That is rule 31 doing its job: a training habit builds you, so it has
// to live inside a system that scores it, streaks it and pays XP for it — and
// the one shared path (trackFromList) is what keeps the score, the streak and
// the XP moving together. A module that quietly tracked its own would be a
// second economy nobody audits.

import { loadState as loadScrap7, saveState as saveScrap7, updateTask } from '../scrap7/store'
import { installCustomLifeSupport } from '../progression/store'
import { loadInf8State, saveInf8State, setPrefTimes, buildDay, getTodayCommitments, effectiveAnchors }
  from '../infinity8/store'
import type { Period } from '../infinity8/store'
import { PERIODS } from '../progression/anchor'

/** What the user asks for. AUTO means "you pick" — see bestPeriod. */
export type WhenChoice = Period | 'auto'

/** Mon/Wed/Fri by default: three a week is what one ladder stage costs. */
export const DEFAULT_DAYS = ['mon', 'wed', 'fri']

/** Minutes of free time in each part of the day, from the live plan. */
export function freeByPeriod(blocks: { kind: string; start: number; end: number }[]): Record<Period, number> {
  const out: Record<Period, number> = { morning: 0, midday: 0, afternoon: 0, evening: 0 }
  for (const b of blocks) {
    if (b.kind !== 'free') continue
    // Walk the block minute-bucket by minute-bucket so a block spanning a
    // boundary is split rather than dumped whole into whichever end it started.
    for (let m = b.start; m < b.end; m += 5) {
      const h = Math.floor((m % 1440) / 60)
      const p: Period = h < 11 ? 'morning' : h < 15 ? 'midday' : h < 19 ? 'afternoon' : 'evening'
      out[p] += 5
    }
  }
  return out
}

/**
 * The best slot for a static session.
 *
 * Where you actually have room beats where a textbook says to train, so this
 * reads the real day first. The tie-break is the afternoon: that is when the
 * body is warmest, which is the same reason `anchor.ts` describes it that way.
 */
export function bestPeriod(free: Record<Period, number>, needMin: number): Period {
  const roomy = PERIODS.filter(p => free[p] >= needMin)
  const pool = roomy.length ? roomy : PERIODS
  let best: Period = 'afternoon'
  for (const p of pool) if (free[p] > free[best]) best = p
  return pool.includes(best) ? best : pool[0]
}

/** Read today's plan and answer where the session fits. */
export function pickPeriod(needMin: number): Period {
  try {
    const st = loadInf8State()
    const today = todayIso()
    const eff = effectiveAnchors(st, today)
    const plan = buildDay(eff, getTodayCommitments(st.durations, st.prefTime), st.events[today] ?? [], 0)
    return bestPeriod(freeByPeriod(plan.blocks), needMin)
  } catch {
    return 'afternoon'
  }
}

const todayIso = (): string => new Date().toISOString().slice(0, 10)

/**
 * Install the training habit and tell the timeline when to draw it.
 *
 * Returns the task id so the module can remember which habit is its own — the
 * completion card needs it to offer "mark done", and without the link the
 * session and the habit would be two records of the same event that never agree.
 */
export function installTrainingHabit(
  title: string, days: string[], when: WhenChoice, needMin: number,
): { taskId: string | null; period: Period } {
  const period = when === 'auto' ? pickPeriod(needMin) : when
  const taskId = installCustomLifeSupport(title, 1, 'session')
  if (!taskId) return { taskId: null, period }

  // A basic defaults to every day. Training is not an every-day thing — the
  // rest between sessions is part of the training. updateTask is pure, so the
  // result has to be written back or the schedule is silently dropped.
  saveScrap7(updateTask(loadScrap7(), taskId, { schedule: { type: 'weekly', days } }))

  try {
    saveInf8State(setPrefTimes(loadInf8State(), { [taskId]: period }))
  } catch { /* the timeline will guess from the title instead */ }

  return { taskId, period }
}
