// ─── XP, levels, and what a level opens ───────────────────────────────────────
// One economy. SCRAP-7 shipped XP constants that were never wired to anything,
// so this is the first and only progression layer — nothing to merge, nothing
// running in parallel.
//
// Rewards stay informational: the numbers describe what happened, they don't
// congratulate. This app has one user and he knows when he's being flattered.

import type { GoalSlot, NodeTier } from './types'
import { xpRateForSlot } from './types'
import { LAST_GATED_STAGE, stageComplete, stageQuests, stageXp, type Quest } from './quests'
import { SLOT_GATES } from './lifeSupport'
import { modulesOpenedAt } from '../../moduleAccess'
import type { ModuleId } from '../../guild'

export type XpEvent =
  | { kind: 'routine.run';       tier: NodeTier }   // a routine performed today
  | { kind: 'threshold.raised' }                    // moved up the ladder
  | { kind: 'routine.strong' }                      // crossed into `strong`
  | { kind: 'routine.integrated' }                  // crossed 0.70
  | { kind: 'breach.cleared' }                      // a chapter's real-world event
  | { kind: 'tool.tier' }                           // an instrument deepened
  | { kind: 'baseline.run' }                        // a LIFE SUPPORT habit, once a day
  | { kind: 'baseline.automatic' }                  // a LIFE SUPPORT habit crossed 0.70

/** Base award before slot rate and fuel. Tier weights the effort a run costs. */
export function baseXp(e: XpEvent): number {
  switch (e.kind) {
    case 'routine.run':        return 8 * e.tier
    case 'threshold.raised':   return 40
    case 'routine.strong':     return 60
    case 'routine.integrated': return 90
    case 'breach.cleared':     return 200
    case 'tool.tier':          return 50
    // Life support pays a fraction of the cheapest routine (8) on purpose. It
    // should register, and it must never become the efficient way to level.
    case 'baseline.run':       return 3
    case 'baseline.automatic': return 25
  }
}

/**
 * Life support isn't goal work, so no slot rate applies — it belongs to no
 * uplink and is worth the same whichever goal happens to be loaded.
 */
export const awardBaselineXp = (e: XpEvent): number => baseXp(e)

/**
 * Final award. Slot rate keeps the secondary uplink honest at 0.6×; fuel is
 * SOLARIS' passive multiplier (1.0 until that lands).
 */
export function awardXp(e: XpEvent, slot: GoalSlot, fuelMultiplier = 1): number {
  return Math.round(baseXp(e) * xpRateForSlot(slot) * fuelMultiplier)
}

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
  key:   'primary' | 'inventory' | 'secondary' | 'wager' | 'deepTree'
  label: string
  ru:    string
}

export const GATES: Gate[] = [
  { level: 1,  key: 'primary',   label: 'Primary uplink · chapter 1', ru: 'Основной канал · глава 1' },
  { level: 3,  key: 'inventory', label: 'Cache & credits',            ru: 'Тайник и кредиты' },
  { level: 5,  key: 'secondary', label: 'Second uplink',              ru: 'Второй канал' },
  { level: 8,  key: 'wager',     label: 'Wagers · deeper thresholds', ru: 'Ставки · глубокие пороги' },
  { level: 12, key: 'deepTree',  label: 'Chapter 3 · tier IV nodes',  ru: 'Глава 3 · узлы тира IV' },
]

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
