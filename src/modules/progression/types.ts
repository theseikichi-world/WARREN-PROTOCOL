// ─── PROGRESSION — uplinks, protocols, routines ───────────────────────────────
// One goal drives everything. A goal (UPLINK) holds a chain (PROTOCOL) of
// habit nodes (ROUTINES); each routine carries its automatism through a
// SCRAP-7 habit, and unlocks the next once it's integrated enough.
//
// Step 2 owns the goals and the two slots. The node graph below is already
// modelled and seeded so the shape is fixed, but gating goes live in step 3.

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
  cue:             string        // "after morning coffee" — anchor, required
  tier:            NodeTier
  thresholds:      string[]      // ordered, ascending
  thresholdIndex:  number
  unlocksAt:       number        // score required on every prerequisite
  prerequisiteIds: string[]      // empty = chain entry point
  unlockedAt:      string | null
  toolId:          string | null // module this routine grants, if any
  scrapTaskId:     string        // the SCRAP-7 habit carrying score/streak
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
}

export interface Chapter {
  index:   number
  title:   string
  nodeIds: string[]
  /** null when no genuine external event exists — the chapter advances on gating alone. */
  boss:    Milestone | null
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
}

export interface ProgressionState {
  goals:   Goal[]
  seeded:  boolean               // reference uplinks installed once
}

// ─── Slot rules ───────────────────────────────────────────────────────────────

export const SWAP_COOLDOWN_DAYS   = 7
export const SECONDARY_MAX_NODES  = 3     // active routines allowed in the second slot
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
