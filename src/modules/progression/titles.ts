// ─── TITLES — what you have done, in one word, worn by choice ─────────────────
// A title is not a reward the app invents. It restates something that already
// happened, which is the only kind of honour a program can hand a person
// without it being a sticker.
//
// TWO RULES DECIDE THE WHOLE SET.
//
// ONLY THE PERMANENT. Every condition below is a fact that cannot un-happen: a
// breach that was cleared, an uplink that was finished, a rung that was raised,
// a date that passed. Nothing here reads a streak or a score, because those are
// STANDING's job and they are supposed to fall. A title you can lose is not a
// record of anything.
//
// ONLY THE RARE. UPKEEP already pays for showing up, so a title for seven days
// running would be paying twice for one thing and would mean nothing by the
// second month. These happen three to five times in the life of a goal, or once.
//
// And they are WORN BY CHOICE. An assigned title is a label; a chosen one is
// identity — the difference between the app describing you and you describing
// yourself with something you earned. Several unlock, one is worn, and changing
// costs nothing, because being honest about which of your own things you value
// should never have a price.
//
// The ledger is stamped exactly like `quests`: earned once, dated, and never
// recomputed away. A condition read live would let a deleted journal entry take
// a title back, and that is precisely what a record must not do.

import type { Goal, ProgressionState } from './types'
import type { ModuleSummaries } from '../bigscreen/moduleStats'

export interface TitleContext {
  goals:       Goal[]
  ascendedAt:  string | null | undefined
  initiatedAt: string | null | undefined
  sums:        ModuleSummaries
  now:         Date
}

export interface Title {
  id:     string
  en:     string
  ru:     string
  /** What it took. Shown beside a locked one, so the set is a map, not a tease. */
  needEn: string
  needRu: string
  earned: (c: TitleContext) => boolean
}

const DAY = 86_400_000

/** Breaches cleared across every uplink, finished or not. A cleared act stays cleared. */
export const breachesCleared = (goals: Goal[]): number =>
  goals.reduce((n, g) => n + g.chapters.filter(c => c.boss?.completedAt).length, 0)

export const uplinksFinished = (goals: Goal[]): number =>
  goals.filter(g => g.completedAt).length

/**
 * A routine standing on the last rung of its own ladder.
 *
 * `thresholdIndex` only ever rises — `raiseThreshold` increments it and nothing
 * decrements — so reaching the top is permanent even though the score that paid
 * for it is not. A ladder of one rung does not count: the mark has to cost
 * something, and two raises cost 0.40 of automatism and months of re-earning it.
 */
export const atTopRung = (goals: Goal[]): number =>
  goals.reduce((n, g) => n + g.nodes.filter(
    node => node.thresholds.length > 1 && node.thresholdIndex >= node.thresholds.length - 1).length, 0)

const daysSince = (iso: string | null | undefined, now: Date): number => {
  if (!iso) return 0
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : Math.floor((now.getTime() - t) / DAY)
}

export const TITLES: Title[] = [
  {
    id: 'unsupervised', en: 'UNSUPERVISED', ru: 'БЕЗ НАДЗОРА',
    needEn: 'Close the starting zone', needRu: 'Закрыть стартовую зону',
    earned: c => !!c.ascendedAt,
  },
  {
    id: 'seen-through', en: 'SEEN THROUGH', ru: 'ДОВЕДЕНО',
    needEn: 'Finish one uplink, every act of it', needRu: 'Завершить канал целиком',
    earned: c => uplinksFinished(c.goals) >= 1,
  },
  {
    id: 'twice-over', en: 'TWICE OVER', ru: 'ДВАЖДЫ',
    needEn: 'Finish two', needRu: 'Завершить два',
    earned: c => uplinksFinished(c.goals) >= 2,
  },
  {
    id: 'breacher', en: 'BREACHER', ru: 'ПРОРЫВНИК',
    needEn: 'Clear three breaches — real events, dated',
    needRu: 'Пройти три прорыва — реальных, с датой',
    earned: c => breachesCleared(c.goals) >= 3,
  },
  {
    id: 'standard-bearer', en: 'STANDARD BEARER', ru: 'ЭТАЛОН',
    needEn: 'Hold a routine to the top of its ladder',
    needRu: 'Довести рутину до верхней ступени',
    earned: c => atTopRung(c.goals) >= 1,
  },
  {
    id: 'chronicler', en: 'CHRONICLER', ru: 'ЛЕТОПИСЕЦ',
    needEn: 'A hundred entries in the log', needRu: 'Сто записей в журнале',
    earned: c => (c.sums.journal?.entries ?? 0) >= 100,
  },
  {
    id: 'under-tension', en: 'UNDER TENSION', ru: 'ПОД НАГРУЗКОЙ',
    needEn: 'Hold thirty VIGILANTE sessions to the end',
    needRu: 'Выдержать тридцать сессий VIGILANTE до конца',
    earned: c => (c.sums.vigilante?.finished ?? 0) >= 30,
  },
  {
    id: 'still-here', en: 'STILL HERE', ru: 'ВСЁ ЕЩЁ ЗДЕСЬ',
    needEn: 'A hundred days since the first day',
    needRu: 'Сто дней с первого дня',
    earned: c => daysSince(c.initiatedAt, c.now) >= 100,
  },
]

export const titleById = (id: string | null | undefined): Title | null =>
  TITLES.find(t => t.id === id) ?? null

/**
 * Stamp anything newly true. Mirrors `evaluateQuests`, and for the same reason:
 * the ledger is the record, and re-deriving it every load would let a change
 * elsewhere in the app quietly take something back.
 */
export function evaluateTitles(
  earned: Record<string, string> | undefined, ctx: TitleContext, now = new Date(),
): { earned: Record<string, string>; newly: Title[] } {
  const next: Record<string, string> = { ...(earned ?? {}) }
  const newly: Title[] = []
  for (const title of TITLES) {
    if (next[title.id] || !title.earned(ctx)) continue
    next[title.id] = now.toISOString()
    newly.push(title)
  }
  return { earned: next, newly }
}

/** Everything unlocked, in the order the set is written. */
export const heldTitles = (state: Pick<ProgressionState, 'titles'>): Title[] =>
  TITLES.filter(t => !!state.titles?.[t.id])

/**
 * The one being worn, or null.
 *
 * Checked against the ledger rather than trusted: a saved id that was never
 * earned — a hand-edited store, a title removed from the set — must not put a
 * word next to your name that you did not earn.
 */
export function wornTitle(state: Pick<ProgressionState, 'titles' | 'title'>): Title | null {
  if (!state.title || !state.titles?.[state.title]) return null
  return titleById(state.title)
}
