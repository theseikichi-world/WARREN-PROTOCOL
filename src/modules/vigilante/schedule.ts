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
import { isBaseline, type Task } from '../scrap7/types'
import { installCustomLifeSupport, loadProgression } from '../progression/store'
import { lifeSupportSlots } from '../progression/lifeSupport'
import { gatedLevel } from '../progression/xp'
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

/** Every life-support basic currently installed. */
export function existingBasics(): Task[] {
  try { return loadScrap7().tasks.filter(t => t.taskType === 'habit' && isBaseline(t)) }
  catch { return [] }
}

/**
 * Is there room for one more basic?
 *
 * The cap lives in LifeSupportPanel's UI, not in installCustomLifeSupport, so
 * every other caller is on its honour — and this module was not. Left alone it
 * would happily push you to 4/3 slots, which the character sheet then reports
 * as a number that should be impossible.
 */
export function slotsFree(): number {
  try {
    const p = loadProgression()
    const level = gatedLevel(p.xp, p.quests).level
    return Math.max(0, lifeSupportSlots(level) - existingBasics().length)
  } catch { return 1 }
}

/**
 * Point the module at a habit that already exists.
 *
 * Deliberately a choice rather than a guess. A habit called "Trainings Static"
 * is obviously the same thing as "Statics" to a person and not to a matcher,
 * and guessing by title similarity is exactly the mistake that made ORBIT drop
 * a task because "workouts" contains "work". The user knows which one is
 * theirs; the app should ask, not infer.
 */
export function scheduleExisting(taskId: string, days: string[], when: WhenChoice, needMin: number): Period {
  const period = when === 'auto' ? pickPeriod(needMin) : when
  saveScrap7(updateTask(loadScrap7(), taskId, { schedule: { type: 'weekly', days } }))
  try {
    saveInf8State(setPrefTimes(loadInf8State(), { [taskId]: period }))
  } catch { /* the timeline will guess from the title instead */ }
  return period
}

/**
 * Install the training habit and tell the timeline when to draw it.
 *
 * Returns the task id so the module can remember which habit is its own — the
 * completion card needs it to offer "mark done", and without the link the
 * session and the habit would be two records of the same event that never agree.
 */
/** Mirrors the slug installCustomLifeSupport derives, so adoption can find it. */
export const slugFor = (title: string): string =>
  title.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'basic'

export function installTrainingHabit(
  title: string, days: string[], when: WhenChoice, needMin: number,
): { taskId: string | null; period: Period; full?: boolean } {
  const period = when === 'auto' ? pickPeriod(needMin) : when

  // Adopt rather than duplicate. installCustomLifeSupport renames a collision to
  // "-2" and cheerfully hands back a SECOND habit for the same training, both
  // live, both eating a slot, both asking to be ticked.
  //
  // Matched on the TITLE, not the derived id. The installer strips non-latin
  // characters when it builds an id, so "Статика" and any other Cyrillic-named
  // basic all collapse to `life:own-basic` — adopting by id would have handed a
  // Russian user whatever unrelated habit happened to claim that slug first.
  const wanted = title.trim().toLowerCase()
  const mine = existingBasics().find(t => t.text.trim().toLowerCase() === wanted)
  if (mine) return { taskId: mine.id, period: scheduleExisting(mine.id, days, when, needMin) }

  if (slotsFree() <= 0) return { taskId: null, period, full: true }

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
