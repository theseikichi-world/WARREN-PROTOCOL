// ─── XP, levels, and what a level opens ───────────────────────────────────────
// One economy. ORBIT shipped XP constants that were never wired to anything,
// so this is the first and only progression layer — nothing to merge, nothing
// running in parallel.
//
// Rewards stay informational: the numbers describe what happened, they don't
// congratulate. This app has one user and he knows when he's being flattered.

import type { GoalSlot, NodeTier } from './types'
import type { Priority } from '../scrap7/types'
import { xpRateForSlot } from './types'
import { LAST_GATED_STAGE, stageComplete, stageQuests, stageXp, type Quest } from './quests'
import { SLOT_GATES } from './lifeSupport'
import { modulesOpenedAt } from '../../moduleAccess'
import type { ModuleId } from '../../guild'

export type XpEvent =
  /**
   * A routine performed today. `score` is the automatism it had going IN, which
   * is what the run actually cost you — see `runXp`. Absent means a fresh one.
   */
  | { kind: 'routine.run';       tier: NodeTier; score?: number }
  | { kind: 'threshold.raised' }                    // moved up the ladder
  | { kind: 'routine.strong' }                      // crossed into `strong`
  | { kind: 'routine.integrated' }                  // crossed 0.70
  | { kind: 'breach.cleared' }                      // a chapter's real-world event
  | { kind: 'uplink.complete' }                     // every act done — the goal is finished
  | { kind: 'tool.tier' }                           // an instrument deepened
  | { kind: 'baseline.run' }                        // a LIFE SUPPORT habit, once a day
  | { kind: 'baseline.automatic' }                  // a LIFE SUPPORT habit crossed 0.70
  | { kind: 'errand.done'; priority: Priority }     // a one-off you set yourself, cleared

/**
 * What one run of a routine is worth.
 *
 * TIER WEIGHTS THE EFFORT; AUTOMATISM DISCOUNTS IT. A routine on day one is
 * expensive to perform and pays full; the same routine at 0.70 costs you
 * noticeably less and pays 0.65 of it; a fully automatic one pays half.
 *
 * The flat rate this replaces made the level curve a measure of attendance
 * rather than progress: over a hundred days a routine paid 1600 XP for showing
 * up and 150 for the two crossings that meant something — 9% of its lifetime
 * income reflected any actual advance. Tapering the run does not punish
 * consistency (the habit still pays, forever); it stops mastery from being the
 * most efficient thing to farm, which is the same argument the slot cap makes.
 */
export const runXp = (tier: NodeTier, score: number): number =>
  Math.round(8 * tier * (1 - 0.5 * Math.min(1, Math.max(0, score))))

/** Base award before slot rate and fuel. Tier weights the effort a run costs. */
export function baseXp(e: XpEvent): number {
  switch (e.kind) {
    case 'routine.run':        return runXp(e.tier, e.score ?? 0)
    case 'threshold.raised':   return 40
    case 'routine.strong':     return 60
    case 'routine.integrated': return 90
    // The two rarest events in the app, and the only ones that answer to
    // something outside it. A breach is worth more than a week of the heaviest
    // routine because it is a real thing that really happened; finishing an
    // uplink is worth about a mid-game level because it is months of them.
    //
    // They are also the only awards that cannot be farmed at all: a goal has
    // three to five acts in its entire life, and exactly one ending.
    case 'breach.cleared':     return 300
    case 'uplink.complete':    return 500
    case 'tool.tier':          return 50
    // Life support pays a fraction of the cheapest routine (8) on purpose. It
    // should register, and it must never become the efficient way to level.
    case 'baseline.run':       return 3
    case 'baseline.automatic': return 25
    case 'errand.done':        return ERRAND_XP[e.priority]
  }
}

// ─── The parallel lane ────────────────────────────────────────────────────────
// Not everything you do serves a dream. A licence, a visa, taxes, the cupboard
// you have been meaning to clear — that work is real, it costs a day, and it
// belonged to no system, so it earned nothing. A tree where the only progress
// is goal progress quietly says the rest of your life is not progress.
//
// The weight was already authored: ORBIT has had a priority on every to-do
// since it shipped, and it only ever coloured a label. This is that field
// finally meaning something.
//
// TWO RULES KEEP IT HONEST, and both come from the same place as the life
// support fraction:
//
//   · Only a ONE-OFF pays. A repeating task is uncapped and unscored — paying
//     per tick would make "water the plants, daily" an XP faucet.
//   · The day is capped. You can write yourself a hundred errands; the tenth
//     hard one pays nothing and says so. Clearing your list is worth about one
//     good routine run, never a level.

export const ERRAND_XP: Record<Priority, number> = {
  trivial: 2, easy: 4, medium: 8, hard: 16,
}

/**
 * The most the parallel lane can pay in one day — roughly a single tier-3
 * routine run. It has to register, and it must never become the efficient way
 * to level: a day of errands is a day you did not train anything.
 */
export const ERRAND_DAILY_CAP = 24

/** What an errand actually pays, given what today has already paid out. */
export function awardErrandXp(e: XpEvent, spentToday: number): number {
  const room = Math.max(0, ERRAND_DAILY_CAP - Math.max(0, spentToday))
  return Math.min(baseXp(e), room)
}

/**
 * Life support isn't goal work, so no slot rate applies — it belongs to no
 * uplink and is worth the same whichever goal happens to be loaded. UPKEEP does
 * apply: turning up is exactly what a basic is.
 */
export const awardBaselineXp = (e: XpEvent, multiplier = 1): number =>
  Math.round(baseXp(e) * multiplier)

/**
 * Final award. Slot rate keeps the secondary uplink honest at 0.6×; fuel is
 * SOLARIS' passive multiplier (1.0 until that lands).
 */
export function awardXp(e: XpEvent, slot: GoalSlot, fuelMultiplier = 1): number {
  return Math.round(baseXp(e) * xpRateForSlot(slot) * fuelMultiplier)
}

// ─── UPKEEP — the one streak that does anything ───────────────────────────────
// Three streaks were being shown at once: days you did ANYTHING, days a single
// habit hit its dose, and the best of those. Three numbers with three meanings
// is nought streaks — none of them said anything about the others, and losing
// any of them cost exactly nothing.
//
// This one is the forgiving one, and it is deliberately the forgiving one: a day
// counts if you did a single thing the app tracks. It is not asking whether you
// did enough. It is asking whether you were here.
//
// It multiplies what everything else pays. That answers the only real objection
// to a streak in an app about your own life — that watching a number reset
// punishes you for a bad week. It does not take anything away: the bonus lapses
// and the base rate is what it always was. The per-habit streak stays exactly
// where it was, as a fact about that habit; it just stops pretending to be a
// second economy.

export const UPKEEP_BANDS: { days: number; mult: number }[] = [
  { days: 0,  mult: 1.00 },
  { days: 3,  mult: 1.05 },
  { days: 7,  mult: 1.10 },
  { days: 14, mult: 1.15 },
  { days: 30, mult: 1.20 },
  { days: 66, mult: 1.25 },   // the formation median, and the ceiling
]

/** What a streak of this length multiplies every award by. */
export function upkeep(streak: number): number {
  let mult = 1
  for (const band of UPKEEP_BANDS) if (streak >= band.days) mult = band.mult
  return mult
}

/** The next band, for a strip that would rather say what is coming than nothing. */
export function nextUpkeep(streak: number): { days: number; mult: number } | null {
  return UPKEEP_BANDS.find(b => b.days > streak) ?? null
}

// ─── The one thing XP buys ────────────────────────────────────────────────────
// Until now XP was a scoreboard: it went up, it gated levels, and nothing could
// ever be spent. A currency with no sink is a number, and a number is not a
// decision — which is why the bar never felt like it mattered.
//
// What it buys is deliberately NOT progress. Buying score would make the whole
// automatism reading a lie, and buying a slot would dissolve the scarcity the
// tech tree stands on. It buys a DAY BACK: one habit, one missed day, no decay
// and the streak kept.
//
// `skipHabitDay` has existed, untested and uncalled, since ORBIT shipped. Free
// and unlimited it would have been an exploit; priced and capped it is the only
// honest thing a habit tracker can sell you. You are not buying the day — you
// are declining to be charged for one you already lost.

/**
 * Roughly what a full running protocol pays in a day. Cheap enough to use on a
 * day that genuinely went wrong; dear enough that you would rather do the thing.
 */
export const SKIP_COST = 40

/**
 * Per habit. A bad day happens and can be bought back; a bad week is
 * information, and no amount of XP should be able to buy that away.
 */
export const SKIP_EVERY_DAYS = 7

// ─── Level curve ──────────────────────────────────────────────────────────────
// A gated level costs exactly what its stage pays out, so finishing the stage
// fills the bar and levels you in the same motion. The alternative — a fixed
// curve — meant level 1 cost 40 while stage 1 paid 130, so the bar slammed to
// full on the first quest and then sat there saying HELD. A bar that maxes out
// two thirds of the way through the work it represents is just noise.
//
// The floor keeps the curve rising even where a stage happens to pay less than
// the one before, and carries it past the last gated level. It is deliberately
// gentler than the old level² × 40: that reached 1000 at level 5, this reaches
// 440, because the gate is what paces early progress now — not the grind.

const BASE_COST = 120
const COST_STEP = 80

export function levelCost(level: number): number {
  const floor = BASE_COST + Math.max(0, level - 1) * COST_STEP
  return Math.max(stageXp(level), floor)
}

export interface LevelState {
  level:    number
  intoNext: number   // xp banked toward the next level
  needed:   number   // xp the next level costs
  progress: number   // 0..1
}

export function levelFor(totalXp: number): LevelState {
  let level = 1
  let rest  = Math.max(0, Math.floor(totalXp))
  while (rest >= levelCost(level)) { rest -= levelCost(level); level++ }
  const needed = levelCost(level)
  return { level, intoNext: rest, needed, progress: needed > 0 ? rest / needed : 0 }
}

// ─── The quest gate ───────────────────────────────────────────────────────────
// XP alone does not advance you. Each early level has a stage of quests behind
// it, and the curve stops at the last stage you actually finished — bank a
// hundred thousand points without naming your character and you are still
// level 1. Grinding is not a substitute for setting the thing up.
//
// Levels past LAST_GATED_STAGE are XP alone: the starting zone is finite.

/** The highest level the quest line currently permits. */
export function levelCap(completed: Record<string, string> | undefined): number {
  let cap = 1
  for (let stage = 1; stage <= LAST_GATED_STAGE; stage++) {
    if (!stageComplete(stage, completed)) return cap
    cap = stage + 1
  }
  return Number.POSITIVE_INFINITY
}

export interface GatedLevel extends LevelState {
  /** What XP alone would have bought — above `level` whenever the gate is holding. */
  xpLevel:  number
  capped:   boolean
  /** The quests standing between you and the next level. Empty unless capped. */
  blocking: Quest[]
}

/**
 * The level you're actually at. When the gate is holding, the bar reads full and
 * `blocking` says why — a full bar that does nothing, with no explanation, is
 * exactly the empty-progress-bar failure this app refuses everywhere else.
 */
export function gatedLevel(totalXp: number, completed: Record<string, string> | undefined): GatedLevel {
  const raw = levelFor(totalXp)
  const cap = levelCap(completed)
  if (raw.level <= cap) return { ...raw, xpLevel: raw.level, capped: false, blocking: [] }

  const done   = completed ?? {}
  const needed = levelCost(cap)
  return {
    level:    cap,
    intoNext: needed,
    needed,
    progress: 1,
    xpLevel:  raw.level,
    capped:   true,
    // Leaving level L means clearing stage L
    blocking: stageQuests(cap).filter(q => !done[q.id]),
  }
}

// ─── Level gates ──────────────────────────────────────────────────────────────
// Titan Quest: the first mastery is yours early, the second is the reward for
// proving you'll stay. Everything here gates *capacity*, never utility.

export interface Gate {
  level: number
  key:   'primary' | 'skip' | 'secondary' | 'rung2' | 'rung3'
  label: string
  ru:    string
}

/**
 * Every one of these names something the app can actually do.
 *
 * Three of the five used to be furniture: "Cache & credits", "Wagers" and
 * "Chapter 3 · tier IV nodes" described features that were never written, so
 * the character sheet spent eleven levels promising things that would not
 * arrive. A locked door has to open onto a room.
 *
 * The top two are the endgame, and they are one mechanic: the THRESHOLD LADDER.
 * Every routine was authored with three ascending standards for the same
 * behaviour and has sat on the first one forever. Raising a rung is the only
 * verb that gets harder as you get better — you spend mastery to make a
 * mastered thing difficult again.
 */
export const GATES: Gate[] = [
  { level: 1,  key: 'primary',   label: 'Primary uplink · chapter 1', ru: 'Основной канал · глава 1' },
  { level: 3,  key: 'skip',      label: 'Buy a day back',             ru: 'Выкуп дня' },
  { level: 5,  key: 'secondary', label: 'Second uplink',              ru: 'Второй канал' },
  { level: 8,  key: 'rung2',     label: 'Standards · second rung',    ru: 'Стандарты · вторая ступень' },
  { level: 12, key: 'rung3',     label: 'Standards · third rung',     ru: 'Стандарты · третья ступень' },
]

/**
 * How many rungs of a routine's ladder this level permits.
 *
 * This is where the level curve stops. Twelve is the last gate on purpose:
 * a scale that keeps promising past the content it has is worse than one that
 * says plainly it is finished. What continues past 12 is the ladder itself —
 * every routine you own has two more standards waiting, and holding all of them
 * at the top rung is a great deal more work than reaching level 13.
 */
export function rungsOpen(level: number): number {
  if (isUnlockedAt('rung3', level)) return 3
  if (isUnlockedAt('rung2', level)) return 2
  return 1
}

export const isUnlockedAt = (key: Gate['key'], level: number): boolean =>
  level >= (GATES.find(g => g.key === key)?.level ?? Number.POSITIVE_INFINITY)

/** The next thing the level curve is holding back, for the character sheet. */
export function nextGate(level: number): Gate | null {
  return GATES.find(g => g.level > level) ?? null
}

// ─── What a level actually hands you ──────────────────────────────────────────
// A level-up that says only "LEVEL 3" is a number with no content. This gathers
// everything that genuinely changed so the moment can name it: capacity opened,
// a wider floor, and the quests that just became reachable.

export interface LevelReward {
  level:   number
  gates:   Gate[]          // capacity this level unlocks
  slots:   number | null   // new LIFE SUPPORT slot count, when it widened
  modules: ModuleId[]      // instruments the world just widened to include
  quests:  Quest[]         // the stage that just became current
}

export function levelReward(level: number): LevelReward {
  const slotGate = SLOT_GATES.find(g => g.level === level)
  return {
    level,
    gates:   GATES.filter(g => g.level === level && g.level > 1),
    slots:   slotGate ? slotGate.slots : null,
    modules: modulesOpenedAt(level),
    quests:  stageQuests(level),
  }
}

/** True when the level opened nothing but the number — the copy adapts. */
export const rewardIsBare = (r: LevelReward): boolean =>
  r.gates.length === 0 && r.slots === null && r.modules.length === 0 && r.quests.length === 0
