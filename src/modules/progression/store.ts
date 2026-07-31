// ─── Progression store — the two bandwidth slots ──────────────────────────────
// Every rule here is a pure function over state so the cap, the cooldown and
// the freeze can be tested without a browser.

import {
  type Goal, type GoalSlot, type ProgressionState,
  SWAP_COOLDOWN_DAYS,
} from './types'
import { SEED_GOALS } from './seed'

const KEY = 'warren_progression_v1'

const INITIAL: ProgressionState = { goals: [], seeded: false }

export function loadProgression(): ProgressionState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return structuredClone(INITIAL)
    const parsed = JSON.parse(raw) as Partial<ProgressionState>
    return {
      goals:  Array.isArray(parsed.goals) ? parsed.goals : [],
      seeded: parsed.seeded === true,
    }
  } catch {
    return structuredClone(INITIAL)
  }
}

export function saveProgression(s: ProgressionState): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* quota */ }
}

/**
 * Install the reference uplinks once, on a genuinely empty state. Hand-written
 * chains — never generated, never derived from L.O.G.
 */
export function seedIfEmpty(state: ProgressionState): ProgressionState {
  if (state.seeded || state.goals.length > 0) return { ...state, seeded: true }
  return { goals: structuredClone(SEED_GOALS), seeded: true }
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export const goalInSlot = (s: ProgressionState, slot: GoalSlot): Goal | null =>
  s.goals.find(g => g.slot === slot) ?? null

export const primaryGoal   = (s: ProgressionState): Goal | null => goalInSlot(s, 'primary')
export const secondaryGoal = (s: ProgressionState): Goal | null => goalInSlot(s, 'secondary')
export const archivedGoals = (s: ProgressionState): Goal[] => s.goals.filter(g => g.slot === 'archived')

/** Both slots allocated — a third uplink has nowhere to land. */
export const bandwidthFull = (s: ProgressionState): boolean =>
  !!primaryGoal(s) && !!secondaryGoal(s)

export const bandwidthUsed = (s: ProgressionState): number =>
  (primaryGoal(s) ? 1 : 0) + (secondaryGoal(s) ? 1 : 0)

// ─── Swap cooldown ────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000

function daysSince(iso: string, now: Date): number {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY
  return (now.getTime() - t) / DAY_MS
}

/**
 * Days before the primary slot can be reassigned again. Swapping costs a
 * cooldown so goals aren't hopped; promoting the secondary is exempt (see
 * promoteSecondary) because nothing leaves the system.
 */
export function cooldownRemaining(s: ProgressionState, now = new Date()): number {
  const p = primaryGoal(s)
  if (!p) return 0
  const left = SWAP_COOLDOWN_DAYS - daysSince(p.lastSlotChangeAt, now)
  return left > 0 ? Math.ceil(left) : 0
}

export const canReassignPrimary = (s: ProgressionState, now = new Date()): boolean =>
  cooldownRemaining(s, now) === 0

// ─── Writes ───────────────────────────────────────────────────────────────────

const stamp = (g: Goal, slot: GoalSlot, now: Date): Goal =>
  ({ ...g, slot, lastSlotChangeAt: now.toISOString() })

/**
 * Exchange the two slots. Free and always allowed: both goals stay live, so
 * nothing freezes and no progress is at risk.
 */
export function promoteSecondary(s: ProgressionState, now = new Date()): ProgressionState {
  const p = primaryGoal(s), sec = secondaryGoal(s)
  if (!sec) return s
  return {
    ...s,
    goals: s.goals.map(g =>
      g.id === sec.id ? stamp(g, 'primary', now)
      : p && g.id === p.id ? stamp(g, 'secondary', now)
      : g),
  }
}

/**
 * Move a goal into the primary slot, displacing whoever holds it into the
 * archive (frozen: preserved, but earning nothing). Gated by the cooldown.
 */
export function assignPrimary(s: ProgressionState, goalId: string, now = new Date()): ProgressionState {
  const target = s.goals.find(g => g.id === goalId)
  if (!target || target.slot === 'primary') return s
  if (target.slot === 'secondary') return promoteSecondary(s, now)   // free path
  if (!canReassignPrimary(s, now)) return s

  const outgoing = primaryGoal(s)
  return {
    ...s,
    goals: s.goals.map(g =>
      g.id === target.id ? stamp(g, 'primary', now)
      : outgoing && g.id === outgoing.id ? stamp(g, 'archived', now)
      : g),
  }
}

/** Move a goal into the free secondary slot. */
export function assignSecondary(s: ProgressionState, goalId: string, now = new Date()): ProgressionState {
  const target = s.goals.find(g => g.id === goalId)
  if (!target || target.slot === 'secondary') return s
  if (target.slot === 'primary') {
    // Demoting the primary costs a swap, like any other reassignment
    if (!canReassignPrimary(s, now)) return s
    const sec = secondaryGoal(s)
    return {
      ...s,
      goals: s.goals.map(g =>
        g.id === target.id ? stamp(g, 'secondary', now)
        : sec && g.id === sec.id ? stamp(g, 'archived', now)
        : g),
    }
  }
  if (secondaryGoal(s)) return s          // occupied — caller must free it first
  return { ...s, goals: s.goals.map(g => g.id === target.id ? stamp(g, 'secondary', now) : g) }
}

/** Park a goal. Progress is preserved; it simply stops earning. */
export function archiveGoal(s: ProgressionState, goalId: string, now = new Date()): ProgressionState {
  return { ...s, goals: s.goals.map(g => g.id === goalId ? stamp(g, 'archived', now) : g) }
}

/** Add a goal, into a free slot if one exists, otherwise straight to the archive. */
export function addGoal(s: ProgressionState, goal: Goal, now = new Date()): ProgressionState {
  const slot: GoalSlot = !primaryGoal(s) ? 'primary' : !secondaryGoal(s) ? 'secondary' : 'archived'
  return { ...s, goals: [...s.goals, stamp(goal, slot, now)] }
}
