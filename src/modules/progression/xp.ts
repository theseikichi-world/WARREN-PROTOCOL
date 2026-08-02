// ─── XP, levels, and what a level opens ───────────────────────────────────────
// One economy. SCRAP-7 shipped XP constants that were never wired to anything,
// so this is the first and only progression layer — nothing to merge, nothing
// running in parallel.
//
// Rewards stay informational: the numbers describe what happened, they don't
// congratulate. This app has one user and he knows when he's being flattered.

import type { GoalSlot, NodeTier } from './types'
import { xpRateForSlot } from './types'

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
// level² × 40: level 2 at 160, level 5 at 1000, level 12 at 5760. Slow enough
// that a slot is genuinely earned, not slow enough to feel inert.

export const levelCost = (level: number): number => level * level * 40

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
