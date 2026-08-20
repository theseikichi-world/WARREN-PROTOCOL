// ─── The record — what actually happened when you tried before ────────────────
// The guide has been writing plans for a stranger. It knows your waking hours
// and the words of the dream, and nothing else — so if three morning routines
// have already died on you, it will cheerfully propose a fourth in the same
// slot, with the same shape, for the same reason.
//
// Everything needed to stop that is already in storage. A habit carries its
// score, its streak, its tracking history and the last day it was touched, and
// those four fields say plainly which things stuck, which are being dragged, and
// which were quietly abandoned weeks ago.
//
// This reads all three, and the brief it produces goes into every call the guide
// makes. It is deliberately not a judgement: an abandoned routine is evidence
// about a plan, not a verdict on a person, and the prompt says so.

import type { Task } from '../scrap7/types'
import { taskOrigin } from '../scrap7/types'

/** Automatic enough to build on — the same bar a routine must clear to unlock. */
export const HOLDING_AT = 0.60
/** Being dragged rather than running, once it has had time to bed in. */
export const STRUGGLING_UNDER = 0.30
/** Untouched this long and it is not "in progress", whatever the score says. */
export const STALE_AFTER_DAYS = 14
/** Below this age nothing counts as struggling — new is not the same as failing. */
export const SETTLE_DAYS = 21

export interface RecordEntry {
  title:  string
  /** Days since it was last tracked. 0 when tracked today. */
  idle:   number
  /** Days since it was created. */
  age:    number
  score:  number
  streak: number
  /** A goal routine, or one of the basics. */
  kind:   'routine' | 'basic'
}

export interface OperatorRecord {
  holding:    RecordEntry[]
  struggling: RecordEntry[]
  abandoned:  RecordEntry[]
}

const DAY = 86400000

const daysBetween = (iso: string | null | undefined, now: Date): number | null => {
  if (!iso) return null
  const t = Date.parse(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now.getTime() - t) / DAY))
}

/**
 * Sort the habits into what stuck, what is being dragged, and what stopped.
 *
 * Only habits with real history are considered — something installed yesterday
 * has proved nothing either way, and counting it would make the guide timid for
 * no reason. Frozen routines are excluded too: their goal was archived, so they
 * stopped for a decision rather than a failure (rule 3).
 */
export function operatorRecord(tasks: Task[], now = new Date()): OperatorRecord {
  const out: OperatorRecord = { holding: [], struggling: [], abandoned: [] }

  for (const t of tasks) {
    if (t.taskType !== 'habit' || t.frozen) continue
    const origin = taskOrigin(t)
    if (origin !== 'chain' && origin !== 'baseline') continue

    const history = t.trackingHistory ?? []
    if (history.length === 0) continue      // never once done — nothing to learn

    const age  = daysBetween(t.createdAt, now) ?? 0
    const idle = daysBetween(t.lastTrackedDate ?? history[history.length - 1], now) ?? 0

    const entry: RecordEntry = {
      title:  t.text,
      idle, age,
      score:  Math.round((t.score ?? 0) * 100) / 100,
      streak: t.streak ?? 0,
      kind:   origin === 'chain' ? 'routine' : 'basic',
    }

    if (idle >= STALE_AFTER_DAYS)                             out.abandoned.push(entry)
    else if (entry.score >= HOLDING_AT)                       out.holding.push(entry)
    else if (entry.score < STRUGGLING_UNDER && age >= SETTLE_DAYS) out.struggling.push(entry)
  }

  // Strongest first in each list, so a truncated brief keeps the clearest cases.
  out.holding.sort((a, b) => b.score - a.score)
  out.struggling.sort((a, b) => a.score - b.score)
  out.abandoned.sort((a, b) => b.age - a.age)
  return out
}

const line = (e: RecordEntry): string =>
  `  · ${e.title} — ${e.kind}, ${e.score.toFixed(2)} automatic after ${e.age}d` +
  (e.idle > 0 ? `, last done ${e.idle}d ago` : ', done today')

/**
 * What the guide is told about the attempts that came before this one.
 *
 * Empty for a new operator, which is correct — with no record there is nothing
 * to avoid and nothing to build on, and inventing caution would be worse than
 * silence.
 */
export function recordBrief(r: OperatorRecord): string {
  const parts: string[] = []

  if (r.holding.length) {
    parts.push(
      'ALREADY HOLDING — these are automatic or nearly so. Anchor new routines to them ' +
      'rather than inventing a new slot in the day:\n' +
      r.holding.slice(0, 6).map(line).join('\n'))
  }
  if (r.struggling.length) {
    parts.push(
      'STRUGGLING — running, but not bedding in. Do not stack anything demanding on top of these:\n' +
      r.struggling.slice(0, 6).map(line).join('\n'))
  }
  if (r.abandoned.length) {
    parts.push(
      'ALREADY TRIED AND STOPPED — do not propose these again in the same shape. If the ' +
      'dream genuinely needs one of them, it has to arrive differently: a smaller first ' +
      'rung, a different anchor, or a different time of day. Say what you changed.\n' +
      r.abandoned.slice(0, 8).map(line).join('\n'))
  }

  if (parts.length === 0) return ''
  return `THE OPERATOR'S RECORD (read off real tracking, not self-report):\n\n${parts.join('\n\n')}`
}
