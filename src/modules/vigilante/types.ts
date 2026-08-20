// ─── VIGILANTE — time under tension ───────────────────────────────────────────
// The whole module is built on one idea: a static hold is measured in SECONDS,
// not reps. There is nothing to count and nothing to round up — you either held
// the position or you let go, and the clock is the only witness.
//
// It owns the SESSION (what the holds are, how long, the timer that runs them)
// and nothing else. It deliberately does NOT score you, streak you, or award
// anything: a training habit BUILDS YOU, and rule 31/32 puts that on an UPLINK
// protocol where it is capped and scored, not in a second private economy over
// here. A routine points at this module with `toolId`; this module just runs.

import { dateKey } from '../scrap7/types'

/** A position you hold. No reps, no load — only how long you stayed in it. */
export interface Hold {
  id:     string
  name:   string
  nameRu: string
  /** The one form note that decides whether the hold is real or a cheat. */
  cue:    string
  cueRu:  string
  icon:   string
}

/**
 * LEVEL 1 — STATICS.
 *
 * Four holds that need no equipment and no space: the whole point of starting
 * here is that there is no excuse available. Every cue names the thing that
 * collapses first, because that is where the hold is actually lost.
 */
export const STATIC_HOLDS: Hold[] = [
  {
    id: 'wall-sit', icon: '🪑',
    name: 'Wall sit',   nameRu: 'Стульчик у стены',
    cue:   'Back flat to the wall, thighs parallel to the floor, knees over ankles. Do not let the hips creep up.',
    cueRu: 'Спина прижата к стене, бёдра параллельно полу, колени над щиколотками. Не давайте тазу ползти вверх.',
  },
  {
    id: 'superman', icon: '🦸',
    name: 'Superman',   nameRu: 'Супермен',
    cue:   'Face down, arms and legs lifted, gaze at the floor. Lift from the back, not from the neck.',
    cueRu: 'Лёжа на животе, руки и ноги подняты, взгляд в пол. Поднимайтесь спиной, а не шеей.',
  },
  {
    id: 'plank', icon: '▬',
    name: 'Plank',      nameRu: 'Планка',
    cue:   'Forearms under the shoulders, one straight line from heel to head. The moment the hips sag, the hold is over.',
    cueRu: 'Предплечья под плечами, прямая линия от пятки до головы. Провис таза — и удержание закончилось.',
  },
  {
    id: 'pushup-hold', icon: '⊻',
    name: 'Push-up hold', nameRu: 'Отжимание в упоре',
    cue:   'The hardest point: chest just off the floor, elbows close to the ribs. Hold there, do not press up.',
    cueRu: 'Самая тяжёлая точка: грудь у самого пола, локти вдоль рёбер. Держите, не выжимайте вверх.',
  },
]

export const HOLD_BY_ID: Record<string, Hold> =
  Object.fromEntries(STATIC_HOLDS.map(h => [h.id, h]))

/**
 * The shape of a session.
 *
 * Rounds are PER HOLD, not per circuit: you finish all three rounds of the wall
 * sit before the superman starts. That is how the set was described and it is a
 * different session from a circuit — holding one position to failure three
 * times is the point, and rotating away from it would let you dodge that.
 */
export interface CircuitSpec {
  holdIds: string[]
  workSec: number
  restSec: number
  rounds:  number
  /** Seconds to get into position before the first hold. 0 = start cold. */
  leadInSec: number
}

export const DEFAULT_SPEC: CircuitSpec = {
  holdIds: STATIC_HOLDS.map(h => h.id),
  workSec: 30,
  restSec: 45,
  rounds:  3,
  // You cannot be in a wall sit the instant you press START. Without this the
  // first hold is always short by however long it took to get down the wall.
  leadInSec: 10,
}

/** One step of the running session. */
export interface Phase {
  kind:   'ready' | 'work' | 'rest'
  holdId: string
  round:  number
  /** Seconds this phase runs for. */
  seconds: number
}

/**
 * Flatten a spec into the exact sequence the timer walks.
 *
 * The final rest is dropped: resting after the last hold is just standing
 * around, and a timer that keeps running after the work is done invites you to
 * walk away mid-session and have it recorded as unfinished.
 */
export function buildPhases(spec: CircuitSpec): Phase[] {
  const out: Phase[] = []
  if (spec.holdIds.length && spec.leadInSec > 0)
    out.push({ kind: 'ready', holdId: spec.holdIds[0], round: 1, seconds: spec.leadInSec })
  for (const holdId of spec.holdIds) {
    for (let round = 1; round <= spec.rounds; round++) {
      out.push({ kind: 'work', holdId, round, seconds: spec.workSec })
      out.push({ kind: 'rest', holdId, round, seconds: spec.restSec })
    }
  }
  while (out.length && out[out.length - 1].kind === 'rest') out.pop()
  return out
}

/** Total time under tension a spec asks for, in seconds. */
export const specHoldSeconds = (spec: CircuitSpec): number =>
  spec.holdIds.length * spec.rounds * spec.workSec

/**
 * What actually happened. Written when a session ends — finished or not.
 *
 * `heldSec` is time under tension you genuinely accumulated, so a session you
 * abandoned halfway is recorded as exactly what it was. Rule 10: the record
 * informs, it does not flatter.
 */
export interface SessionLog {
  id:        string
  date:      string      // dateKey — the day it counted for
  startedAt: string      // ISO
  holdIds:   string[]
  workSec:   number
  restSec:   number
  rounds:    number
  /** Work phases completed in full. */
  doneWork:  number
  /** Work phases the spec asked for. */
  totalWork: number
  heldSec:   number
  finished:  boolean
}

export interface VigilanteState {
  spec:     CircuitSpec
  log:      SessionLog[]
  /** A local audio file the user picked. Empty = the timer runs silent. */
  musicName: string
  /** Spoken cues, so you never look at the screen mid-hold. */
  voiceOn:  boolean
  version:  number
}

export const EMPTY_STATE: VigilanteState = {
  spec: DEFAULT_SPEC,
  log: [],
  musicName: '',
  voiceOn: true,
  version: 1,
}

export const todayKey = (now = new Date()): string => dateKey(now)

/** mm:ss — the only format a person reads mid-hold. */
export function clock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
