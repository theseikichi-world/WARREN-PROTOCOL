// ─── PROGRESSION — uplinks, protocols, routines ───────────────────────────────
// One goal drives everything. A goal (UPLINK) holds a chain (PROTOCOL) of
// habit nodes (ROUTINES); each routine carries its automatism through a
// ORBIT habit, and unlocks the next once it's integrated enough.
//
// Step 2 owns the goals and the two slots. The node graph below is already
// modelled and seeded so the shape is fixed, but gating goes live in step 3.

import type { RoutineAnchor } from './anchor'

export type NodeTier = 1 | 2 | 3 | 4

/** Complexity tier → baseline days to form. An estimate that self-corrects. */
export const TIER_META: Record<NodeTier, { name: string; profile: string; baselineDays: number }> = {
  1: { name: 'REFLEX', profile: '<2 min, anchored, zero prep',            baselineDays: 25  },
  2: { name: 'RITUAL', profile: '10–30 min, at home, no logistics',       baselineDays: 66  },
  3: { name: 'SORTIE', profile: 'needs prep, travel, or equipment',       baselineDays: 120 },
  4: { name: 'SYSTEM', profile: 'multi-step, requires decisions',         baselineDays: 150 },
}

/**
 * Days left before a routine is likely automatic. Real formation ranges roughly
 * 18–254 days per person, so this is a projection, never a promise.
 */
export function estimateDays(score: number, tier: NodeTier): number {
  return Math.max(0, Math.round((1 - Math.min(1, Math.max(0, score))) * TIER_META[tier].baselineDays))
}

export interface ChainNode {
  id:              string
  goalId:          string
  title:           string
  /**
   * The human-readable anchor. DERIVED from `anchor` when one is set — see
   * `anchorLabel` — and kept as stored prose on protocols written before the
   * anchor was structured, so nothing already running loses its cue.
   */
  cue:             string
  /**
   * When this routine actually happens, in a form the timeline can obey.
   * Absent on legacy nodes; `parseAnchor` reads their prose on first edit.
   */
  anchor?:         RoutineAnchor
  /** How long one run takes, in minutes. What lets ORBIT fit it into real free time. */
  minutes?:        number
  tier:            NodeTier
  thresholds:      string[]      // ordered, ascending
  thresholdIndex:  number
  unlocksAt:       number        // score required on every prerequisite
  prerequisiteIds: string[]      // empty = chain entry point
  unlockedAt:      string | null
  toolId:          string | null // module this routine grants, if any
  scrapTaskId:     string        // the ORBIT habit carrying score/streak
}

/**
 * A BREACH: one datable, external, one-off event. If it couldn't go in a
 * calendar it isn't a breach — score states are already legible through the
 * tier names, and dressing one up as an event is filler.
 *
 * The gate is EVERY routine in the chapter at `minScore`. There is no node
 * count: a hand-written chapter is exactly as long as the goal needs.
 */
export interface Milestone {
  title:       string
  requirement: { minScore: number }
  completedAt: string | null
  /**
   * When it happens, as `YYYY-MM-DD`. Absent whenever the date isn't known —
   * most breaches don't have one, and a guessed date is worse than none.
   *
   * It gates NOTHING. Its whole job is to let `deadline.ts` compare the days
   * left against how long the chapter's routines project to automate, which is
   * the one question a tree of scores could never answer on its own.
   */
  due?:        string | null
}

export interface Chapter {
  index:   number
  title:   string
  nodeIds: string[]
  /**
   * The act key from the spine that produced it. Titles are editable, so a
   * shelf candidate that pointed at "Act 2" by name would follow the wrong act
   * the moment one was renamed. Absent on chapters authored before the spine.
   */
  key?:    string
  /** null when no genuine external event exists — the chapter advances on gating alone. */
  boss:    Milestone | null
  /**
   * PLANNED — the act exists in the story but has no routines yet.
   *
   * The spine names every act up front so the shape of the goal is visible from
   * day one, but only the opening act is filled: routines for act 4 are work
   * that cannot be started, and drawing them as available is a lie the tree used
   * to tell. A planned act is deepened when it is reached, with the operator's
   * real automatism scores as context. It stops being planned the moment it
   * holds a routine — see `draftChapters`.
   */
  planned?: boolean
}

/**
 * Slots are BANDWIDTH. Two are allocatable; 'archived' is the parking bay for a
 * goal that lost its slot — its progress is preserved, not deleted.
 */
export type GoalSlot = 'primary' | 'secondary' | 'archived'

export interface Goal {
  id:               string
  title:            string
  slot:             GoalSlot
  chapters:         Chapter[]
  nodes:            ChainNode[]
  createdAt:        string
  lastSlotChangeAt: string
  /** The L.O.G dream this uplink was promoted from, when it came from one. */
  sourceDreamId?:   string | null
}

export interface ProgressionState {
  goals:   Goal[]
  seeded:  boolean               // reference uplinks installed once
  xp:      number                // the single progression currency
  quests:  Record<string, string>  // quest id → cleared at
  /** When the operator was first briefed. The arrival plays exactly once. */
  initiatedAt?: string | null
  /** Highest level already celebrated, so the moment fires once per threshold. */
  celebratedLevel?: number
}

// ─── Slot rules ───────────────────────────────────────────────────────────────

export const SWAP_COOLDOWN_DAYS   = 7
/**
 * Concurrent routines in training, per slot. This is the scarcity the whole
 * tree hangs on: with unlimited installs a tech tree is a checklist you tick
 * top to bottom, and picking a branch means nothing. A routine past
 * THRESHOLD_UNLOCK_AT stops counting — it's maintenance, not work in progress —
 * so mastering something is what frees the slot it was using.
 */
export const PRIMARY_MAX_NODES    = 5
export const SECONDARY_MAX_NODES  = 3     // active routines allowed in the second slot

export const maxNodesFor = (slot: GoalSlot): number =>
  slot === 'primary' ? PRIMARY_MAX_NODES : slot === 'secondary' ? SECONDARY_MAX_NODES : 0
export const SECONDARY_XP_RATE    = 0.6
export const PRIMARY_XP_RATE      = 1.0
export const DEFAULT_UNLOCKS_AT   = 0.60
export const THRESHOLD_UNLOCK_AT  = 0.70
export const THRESHOLD_COST       = 0.20
/** A frozen goal's routines decay at half rate and earn nothing. */
export const FROZEN_DECAY_RATE    = 0.5

export function xpRateForSlot(slot: GoalSlot): number {
  return slot === 'primary' ? PRIMARY_XP_RATE : slot === 'secondary' ? SECONDARY_XP_RATE : 0
}
