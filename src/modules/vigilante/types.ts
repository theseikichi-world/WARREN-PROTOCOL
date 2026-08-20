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
    id: 'pullup-hold', icon: '🎯',
    name: 'Pull-up hold', nameRu: 'Вис в подтягивании',
    cue:   'Chin above the bar, elbows locked into your sides. The hardest point of the pull — hang there, do not drop.',
    cueRu: 'Подбородок над перекладиной, локти прижаты к бокам. Самая тяжёлая точка подтягивания — висите, не падайте.',
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

// ─── The ladder ───────────────────────────────────────────────────────────────
// You do not choose how long you hold. You choose how hard you start, and then
// the seconds come off the work you actually did — three finished sessions buys
// five more seconds on every position, all the way to a minute.
//
// Stage is DERIVED from the log, never stored. A number you could edit is a
// number you would edit at 3am on a bad week, and the whole point is that the
// ladder only moves when the work moves.

export const BOSS_SEC = 60              // the final boss: a minute of everything
export const STEP_SEC = 5               // what one stage buys you
export const SESSIONS_PER_STAGE = 3     // "three times a week"
export const PULLUP_UNLOCK_STAGE = 3    // the fifth hold arrives in the middle

export type Tier = 'beginner' | 'hero' | 'superhero'

export interface TierSpec {
  id:      Tier
  name:    string
  nameRu:  string
  restSec: number
  rounds:  number
  /** Where each hold starts, in seconds. */
  start:   Record<string, number>
}

/**
 * Three ways in. They differ in more than the clock: a harder tier starts
 * longer, rests shorter and (at the top) adds a round — because "hard" is not
 * just a bigger number, it is less recovery between the same numbers.
 *
 * Every tier converges on the same boss, so the choice is where you enter, not
 * where you finish.
 */
export const TIERS: Record<Tier, TierSpec> = {
  beginner: {
    id: 'beginner', name: 'BEGINNER HERO', nameRu: 'ГЕРОЙ-НОВИЧОК',
    restSec: 45, rounds: 3,
    start: { 'wall-sit': 30, superman: 30, plank: 30, 'pushup-hold': 20, 'pullup-hold': 15 },
  },
  hero: {
    id: 'hero', name: 'HERO', nameRu: 'ГЕРОЙ',
    restSec: 30, rounds: 3,
    start: { 'wall-sit': 40, superman: 40, plank: 40, 'pushup-hold': 30, 'pullup-hold': 25 },
  },
  superhero: {
    id: 'superhero', name: 'SUPERHERO', nameRu: 'СУПЕРГЕРОЙ',
    restSec: 20, rounds: 4,
    start: { 'wall-sit': 45, superman: 45, plank: 45, 'pushup-hold': 40, 'pullup-hold': 30 },
  },
}

export const TIER_ORDER: Tier[] = ['beginner', 'hero', 'superhero']

/** Which holds are in play at this stage. The pull-up joins in the middle. */
export function holdsAt(stage: number): string[] {
  return STATIC_HOLDS
    .filter(h => h.id !== 'pullup-hold' || stage >= PULLUP_UNLOCK_STAGE)
    .map(h => h.id)
}

/** How long one position is held at this tier and stage. Capped at the boss. */
export function holdSecFor(tier: Tier, stage: number, holdId: string): number {
  const base = TIERS[tier].start[holdId]
  if (base == null) return BOSS_SEC
  return Math.min(BOSS_SEC, base + Math.max(0, stage) * STEP_SEC)
}

/** The stage at which every position — including the last to arrive — hits 60s. */
export function maxStage(tier: Tier): number {
  return Math.max(...Object.values(TIERS[tier].start)
    .map(v => Math.ceil((BOSS_SEC - v) / STEP_SEC)))
}

/**
 * The ladder position you have earned.
 *
 * Only FINISHED sessions count. A session you walked out of halfway did not buy
 * you five seconds, and pretending otherwise is exactly the flattery rule 10
 * exists to prevent.
 */
export function stageFrom(finishedSessions: number, tier: Tier): number {
  return Math.min(maxStage(tier), Math.floor(Math.max(0, finishedSessions) / SESSIONS_PER_STAGE))
}

/** Finished sessions still owed before the next five seconds. */
export function toNextStage(finishedSessions: number, tier: Tier): number {
  if (stageFrom(finishedSessions, tier) >= maxStage(tier)) return 0
  return SESSIONS_PER_STAGE - (Math.max(0, finishedSessions) % SESSIONS_PER_STAGE)
}

/** Every position at a full minute — the boss is down. */
export function bossBeaten(tier: Tier, stage: number): boolean {
  return holdsAt(stage).every(id => holdSecFor(tier, stage, id) >= BOSS_SEC)
    && stage >= PULLUP_UNLOCK_STAGE
}

/**
 * The shape of a session.
 *
 * Rounds are PER HOLD, not per circuit: you finish all three rounds of the wall
 * sit before the superman starts. That is how the set was described and it is a
 * different session from a circuit — holding one position to failure three
 * times is the point, and rotating away from it would let you dodge that.
 */
export interface CircuitSpec {
  tier:    Tier
  restSec: number
  rounds:  number
  /** Seconds to get into position before the first hold. 0 = start cold. */
  leadInSec: number
}

export const DEFAULT_SPEC: CircuitSpec = {
  tier: 'beginner',
  restSec: TIERS.beginner.restSec,
  rounds:  TIERS.beginner.rounds,
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
export function buildPhases(spec: CircuitSpec, stage: number): Phase[] {
  const holdIds = holdsAt(stage)
  const out: Phase[] = []
  if (!holdIds.length) return out
  if (spec.leadInSec > 0)
    out.push({ kind: 'ready', holdId: holdIds[0], round: 1, seconds: spec.leadInSec })
  for (const holdId of holdIds) {
    const sec = holdSecFor(spec.tier, stage, holdId)
    for (let round = 1; round <= spec.rounds; round++) {
      out.push({ kind: 'work', holdId, round, seconds: sec })
      out.push({ kind: 'rest', holdId, round, seconds: spec.restSec })
    }
  }
  while (out.length && out[out.length - 1].kind === 'rest') out.pop()
  return out
}

/** Total time under tension a session asks for, in seconds. */
export const specHoldSeconds = (spec: CircuitSpec, stage: number): number =>
  holdsAt(stage).reduce((sum, id) => sum + holdSecFor(spec.tier, stage, id) * spec.rounds, 0)

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
  tier:      Tier
  stage:     number
  /** Longest single hold in this session — what "best" is read from. */
  maxHoldSec: number
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
