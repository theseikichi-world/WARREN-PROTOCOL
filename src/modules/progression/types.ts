// ─── PROGRESSION — uplinks, protocols, routines ───────────────────────────────
// One goal drives everything. A goal (UPLINK) holds a chain (PROTOCOL) of
// habit nodes (ROUTINES); each routine carries its automatism through a
// ORBIT habit, and unlocks the next once it's integrated enough.
//
// Step 2 owns the goals and the two slots. The node graph below is already
// modelled and seeded so the shape is fixed, but gating goes live in step 3.

import type { RoutineAnchor } from './anchor'
import type { Direction } from '../scrap7/types'
import { alphaFor } from '../scrap7/types'

export type NodeTier = 1 | 2 | 3 | 4

/** Complexity tier → baseline days to form. An estimate that self-corrects. */
export const TIER_META: Record<NodeTier, { name: string; profile: string; baselineDays: number }> = {
  1: { name: 'REFLEX', profile: '<2 min, anchored, zero prep',            baselineDays: 25  },
  2: { name: 'RITUAL', profile: '10–30 min, at home, no logistics',       baselineDays: 66  },
  3: { name: 'SORTIE', profile: 'needs prep, travel, or equipment',       baselineDays: 120 },
  4: { name: 'SYSTEM', profile: 'multi-step, requires decisions',         baselineDays: 150 },
}

/**
 * Days left before a routine is likely automatic.
 *
 * Read off the SAME curve the score actually moves on, so the number can no
 * longer disagree with the engine. It used to be a straight line — remaining
 * score times the baseline — which was wrong twice over: it ignored that the
 * curve flattens (at 0.65 it claimed 23 more days for a tier-2 routine when the
 * real answer is 8), and it multiplied by a baseline the engine never used at
 * all.
 *
 * Still a projection, never a promise: it counts PERFECT days, and real
 * formation ranges roughly 18–254 days per person.
 */
export function estimateDays(score: number, tier: NodeTier): number {
  const s = Math.min(1, Math.max(0, score))
  if (s >= THRESHOLD_UNLOCK_AT) return 0
  const alpha = alphaFor(TIER_META[tier].baselineDays)
  return Math.ceil(Math.log((1 - THRESHOLD_UNLOCK_AT) / (1 - s)) / Math.log(1 - alpha))
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
  /**
   * Which way this routine runs. 'negative' is a habit you are QUITTING: the
   * daily tap means you held, and slipping is its own button.
   *
   * Absent means 'positive', which is what every routine written before the
   * `quit` shape had a way to reach the tree was.
   */
  direction?:      Direction
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
  /**
   * When the last chapter's breach was cleared.
   *
   * A goal used to have three states, and none of them was WON: 'archived' is a
   * parking bay for something you stopped doing. So nothing in the app could
   * ever finish — no dream had an end, and a system where nothing resolves has
   * no reason to be a game rather than a list.
   *
   * A finished goal releases its bandwidth like an archived one, because the
   * work really is over. What it does not do is read as abandonment.
   */
  completedAt?:     string | null
}

export interface ProgressionState {
  goals:   Goal[]
  seeded:  boolean               // reference uplinks installed once
  xp:      number                // the single progression currency
  quests:  Record<string, string>  // quest id → cleared at
  /** When the operator was first briefed. The arrival plays exactly once. */
  initiatedAt?: string | null
  /**
   * When the starting zone closed. The second and last rite, at level ten.
   *
   * It is a stamp rather than a setting: past it the hub stops leading with a
   * level and leads with STANDING instead, and there is no way back. A
   * reversible ceremony is a preference with music.
   */
  ascendedAt?: string | null
  /**
   * Titles unlocked, id → the day it happened. Stamped once and never
   * recomputed, exactly like `quests` — a title derived live could be taken back
   * by a deleted journal entry, and a record that can fall is not a record.
   */
  titles?: Record<string, string>
  /** The one being worn. Null is a real answer, and the default one. */
  title?:  string | null
  /** Highest level already celebrated, so the moment fires once per threshold. */
  celebratedLevel?: number
  /**
   * What the parallel lane has already paid out today, and which day that was.
   * One day, one number: the cap is the only thing standing between "errands
   * count" and "errands are the cheap way to level", so it has to survive a
   * reload. Rolls over on its own the first time a new date is seen.
   */
  errands?: { date: string; xp: number }
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
