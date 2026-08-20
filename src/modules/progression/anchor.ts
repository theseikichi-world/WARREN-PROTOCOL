import { t as tr } from '../../i18n'

// ─── The anchor — when a routine actually happens ─────────────────────────────
// A cue used to be a free-text line: "after morning coffee · Mon/Wed/Fri 19:00".
// Two problems, and the second is the serious one.
//
// It was overloaded — one field carrying an event, a weekday set and a clock
// time, typed by hand every time.
//
// And NOTHING READ IT. The timeline decides when to schedule a routine with
// `classifyPeriod`, which regex-matches keywords in the routine's TITLE. The
// carefully written anchor was displayed and thrown away, and the scheduler
// re-guessed from scratch. Two systems solving the same problem, neither aware
// of the other, and the guess usually lost.
//
// So the anchor becomes a small structured thing the scheduler can obey:
//
//   AFTER   an existing habit — habit stacking, the strongest anchor there is
//   AT      a clock time — one fixed block in the day
//   PERIOD  morning/midday/afternoon/evening — ORBIT finds the slot in your
//           real free time
//
// Rule 18 gets STRONGER, not weaker: every one of the three produces a concrete
// placement, so "3x a week" is still unsayable. What is gone is the typing.

import type { Period } from '../infinity8/store'

export type RoutineAnchor =
  | { kind: 'after';  taskId: string }
  | { kind: 'at';     time: string }     // "19:00"
  | { kind: 'period'; period: Period }

export const PERIODS: Period[] = ['morning', 'midday', 'afternoon', 'evening']

export const PERIOD_LABEL: Record<Period, { en: string; ru: string; hint: string; hintRu: string }> = {
  morning:   { en: 'MORNING',   ru: 'УТРО',   hint: 'first hours after waking', hintRu: 'первые часы после подъёма' },
  midday:    { en: 'MIDDAY',    ru: 'ДЕНЬ',   hint: 'the middle of the day',    hintRu: 'середина дня' },
  afternoon: { en: 'AFTERNOON', ru: 'ВЕЧЕР',  hint: 'when the body is warmest', hintRu: 'когда тело разогрето' },
  evening:   { en: 'EVENING',   ru: 'НОЧЬ',   hint: 'the wind-down',            hintRu: 'перед сном' },
}

const TIME_RE = /\b([01]?\d|2[0-3]):([0-5]\d)\b/

/** "19:00" → true. Anything else is not a placement. */
export const isClock = (s: string): boolean => /^([01]?\d|2[0-3]):[0-5]\d$/.test(s.trim())

/**
 * The line shown on a node, a shelf card and in the guide's brief.
 *
 * Derived rather than stored, so renaming the habit you anchored to renames the
 * cue everywhere it appears — the old free text would have gone stale silently.
 */
export function anchorLabel(
  anchor: RoutineAnchor | undefined,
  nameOf: (taskId: string) => string | null = () => null,
): string {
  if (!anchor) return ''
  switch (anchor.kind) {
    case 'after': {
      const name = nameOf(anchor.taskId)
      // "после разминки" — the habit's own name is whatever the user typed, so
      // only the connective is translated.
      return name
        ? tr(`after ${name}`, `после «${name}»`)
        : tr('after your last routine', 'после последней рутины')
    }
    case 'at':     return anchor.time
    case 'period': {
      const p = PERIOD_LABEL[anchor.period]
      return tr(p.en.toLowerCase(), p.ru.toLowerCase())
    }
  }
}

/** Which part of the day this wants. `after` inherits from whatever it follows. */
export function anchorPeriod(anchor: RoutineAnchor | undefined): Period | null {
  if (!anchor) return null
  if (anchor.kind === 'period') return anchor.period
  if (anchor.kind === 'at') {
    const m = TIME_RE.exec(anchor.time)
    if (!m) return null
    const h = Number(m[1])
    if (h < 11) return 'morning'
    if (h < 15) return 'midday'
    if (h < 19) return 'afternoon'
    return 'evening'
  }
  return null
}

/**
 * Best-effort reading of a legacy cue into an anchor.
 *
 * Existing protocols carry prose, and so does every proposal the guide writes —
 * the prompt asks for "straight after morning coffee" or "Mon/Wed/Fri 19:00"
 * because that is what a person says. This is where that becomes something the
 * scheduler can act on.
 *
 * A clock time anywhere in the line wins, because it is the most specific thing
 * present. Then "after X", where X is matched against habits you actually run —
 * an anchor pointing at something that does not exist would be worse than none.
 * Otherwise the wording is read for a part of the day, and failing that the
 * caller gets null and the prose is kept as-is.
 */
export function parseAnchor(
  cue: string,
  habits: { id: string; text: string }[] = [],
): RoutineAnchor | null {
  const raw = cue.trim()
  if (!raw) return null
  const lower = raw.toLowerCase()

  const time = TIME_RE.exec(raw)
  if (time) return { kind: 'at', time: `${time[1].padStart(2, '0')}:${time[2]}` }

  // "straight after reading aloud" / "после чтения"
  if (/\b(after|straight after|following|после)\b/i.test(lower)) {
    const match = habits.find(h => h.text.trim() && lower.includes(h.text.trim().toLowerCase()))
    if (match) return { kind: 'after', taskId: match.id }
  }

  // `\b` is an ASCII-only boundary in JS, so Cyrillic needs its own pass —
  // `\bутро\b` never matches anything.
  if (/\b(morning|wake|waking|breakfast|dawn)\b/i.test(lower) || /утр/i.test(lower)) {
    return { kind: 'period', period: 'morning' }
  }
  if (/\b(evening|night|bed|bedtime|wind.?down)\b/i.test(lower) || /(вечер|ночь|перед сном)/i.test(lower)) {
    return { kind: 'period', period: 'evening' }
  }
  if (/\b(afternoon|lunch|midday|noon)\b/i.test(lower) || /(обед|днём|полдень)/i.test(lower)) {
    return { kind: 'period', period: 'midday' }
  }

  return null
}

/** An anchor pointing at a habit that no longer exists is no anchor at all. */
export function anchorIsLive(anchor: RoutineAnchor | undefined, taskIds: Set<string>): boolean {
  if (!anchor) return false
  return anchor.kind !== 'after' || taskIds.has(anchor.taskId)
}
