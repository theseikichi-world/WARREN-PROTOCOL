// ─── Progression store — the two bandwidth slots ──────────────────────────────
// Every rule here is a pure function over state so the cap, the cooldown and
// the freeze can be tested without a browser.

import {
  type Goal, type GoalSlot, type ProgressionState,
  SWAP_COOLDOWN_DAYS, SECONDARY_MAX_NODES, THRESHOLD_UNLOCK_AT,
} from './types'
import { SEED_GOALS } from './seed'
import { evaluateUnlocks, isUnlocked, nodeScore, routineTaskId } from './chain'
import {
  loadState as loadScrap7, saveState as saveScrap7, createExternalTask,
} from '../scrap7/store'

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

// ─── Chain ↔ SCRAP-7 sync ─────────────────────────────────────────────────────

/**
 * Which unlocked routines of a goal may carry a live habit right now.
 *
 * The primary uplink carries all of them. The secondary is capped at
 * SECONDARY_MAX_NODES *active* routines — one already past the integration
 * threshold no longer counts, since it's maintenance rather than work in
 * progress, so mastering something frees the slot it was using.
 */
export function instantiableNodes(goal: Goal, tasks: ReturnType<typeof loadScrap7>['tasks']): Set<string> {
  const unlocked = goal.nodes.filter(isUnlocked)
  if (goal.slot === 'primary') return new Set(unlocked.map(n => n.id))
  if (goal.slot === 'archived') {
    // Frozen: nothing new opens, but whatever already exists stays
    return new Set(unlocked.filter(n => n.scrapTaskId).map(n => n.id))
  }

  const byUnlockTime = [...unlocked].sort((a, b) => (a.unlockedAt ?? '').localeCompare(b.unlockedAt ?? ''))
  const allowed = new Set<string>()
  let active = 0
  for (const n of byUnlockTime) {
    if (nodeScore(n, tasks) >= THRESHOLD_UNLOCK_AT) { allowed.add(n.id); continue }  // integrated — free
    if (active < SECONDARY_MAX_NODES) { allowed.add(n.id); active++ }
  }
  return allowed
}

/**
 * Bring SCRAP-7 in line with the chains: open what qualifies, create exactly
 * one habit per newly opened routine, and mark frozen anything belonging to a
 * goal that lost its slot.
 *
 * Idempotent by construction. Habit ids are derived from the routine id, and a
 * habit is only ever created when no task with that id exists — re-running this
 * on an already-unlocked chain writes nothing and can never reset a score.
 */
export function syncChain(state: ProgressionState, now = new Date()): ProgressionState {
  const before = loadScrap7()
  const existing = new Set(before.tasks.map(t => t.id))

  // 1. Open routines whose prerequisites are integrated (frozen goals don't advance)
  let goals = state.goals.map(g =>
    g.slot === 'archived' ? g : evaluateUnlocks(g, before.tasks, now).goal)

  // 2. Give every eligible open routine a habit, exactly once
  const pending: { node: Goal['nodes'][number]; goal: Goal }[] = []
  goals = goals.map(g => {
    const allowed = instantiableNodes(g, before.tasks)
    const nodes = g.nodes.map(n => {
      if (!isUnlocked(n) || !allowed.has(n.id)) return n
      const taskId = routineTaskId(n)
      if (!existing.has(taskId)) { pending.push({ node: n, goal: g }); existing.add(taskId) }
      return n.scrapTaskId === taskId ? n : { ...n, scrapTaskId: taskId }
    })
    return { ...g, nodes }
  })

  for (const { node, goal } of pending) {
    createExternalTask({
      id:        routineTaskId(node),
      text:      node.title,
      category:  goal.title,
      taskType:  'habit',
      direction: 'positive',
      origin:    'chain',
      target:    1,
      unit:      'times',
    })
  }

  // 3. Freeze / thaw. A frozen habit is never deleted — it stays visible and
  //    trackable, decays at half rate, and earns nothing.
  const frozenIds = new Set<string>()
  const liveIds   = new Set<string>()
  for (const g of goals) {
    for (const n of g.nodes) {
      if (!n.scrapTaskId) continue
      ;(g.slot === 'archived' ? frozenIds : liveIds).add(n.scrapTaskId)
    }
  }

  const after = loadScrap7()
  let touched = false
  const tasks = after.tasks.map(t => {
    const want = frozenIds.has(t.id) ? true : liveIds.has(t.id) ? false : undefined
    if (want === undefined || !!t.frozen === want) return t
    touched = true
    return { ...t, frozen: want }
  })
  if (touched) {
    saveScrap7({ ...after, tasks })
    window.dispatchEvent(new CustomEvent('warren:sync', { detail: { source: 'progression' } }))
  }

  return { ...state, goals }
}

/** Add a goal, into a free slot if one exists, otherwise straight to the archive. */
export function addGoal(s: ProgressionState, goal: Goal, now = new Date()): ProgressionState {
  const slot: GoalSlot = !primaryGoal(s) ? 'primary' : !secondaryGoal(s) ? 'secondary' : 'archived'
  return { ...s, goals: [...s.goals, stamp(goal, slot, now)] }
}
