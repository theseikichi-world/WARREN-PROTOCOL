// ─── Progression store — the two bandwidth slots ──────────────────────────────
// Every rule here is a pure function over state so the cap, the cooldown and
// the freeze can be tested without a browser.

import {
  type Goal, type GoalSlot, type ProgressionState,
  SWAP_COOLDOWN_DAYS, THRESHOLD_UNLOCK_AT, maxNodesFor,
} from './types'
import { applyDraft, draftToGoal, type ChainDraft } from './draft'
import { baselineTaskId, type LifeSupportTemplate } from './lifeSupport'
import { evaluateUnlocks, isUnlocked, nodeScore, routineTaskId } from './chain'
import { awardXp, awardBaselineXp, gatedLevel, type XpEvent } from './xp'
import { evaluateQuests, type Quest, type QuestContext } from './quests'
import {
  loadState as loadScrap7, saveState as saveScrap7, createExternalTask,
} from '../scrap7/store'

const KEY = 'warren_progression_v1'

const INITIAL: ProgressionState = { goals: [], seeded: false, xp: 0, quests: {}, initiatedAt: null }

export function loadProgression(): ProgressionState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return structuredClone(INITIAL)
    const parsed = JSON.parse(raw) as Partial<ProgressionState>
    return {
      goals:  Array.isArray(parsed.goals) ? parsed.goals : [],
      seeded: parsed.seeded === true,
      xp:     typeof parsed.xp === 'number' ? parsed.xp : 0,
      quests: (parsed.quests && typeof parsed.quests === 'object') ? parsed.quests : {},
      initiatedAt: typeof parsed.initiatedAt === 'string' ? parsed.initiatedAt : null,
    }
  } catch {
    return structuredClone(INITIAL)
  }
}

export function saveProgression(s: ProgressionState): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* quota */ }
}

/**
 * Nothing installs itself — including a goal.
 *
 * Two reference uplinks used to appear on first run. They were scaffolding for
 * a system with no way to author a chain; now that a dream can be promoted, an
 * uplink you didn't choose is just someone else's life in your character sheet.
 * The same two chains survive as TEMPLATES in `draft.ts`, offered and editable.
 *
 * Kept as a no-op so an already-seeded state is untouched and `seeded` keeps its
 * meaning if an older build ever reads this data back.
 */
export function seedIfEmpty(state: ProgressionState): ProgressionState {
  return state.seeded ? state : { ...state, seeded: true }
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
 * Both live slots are capped, at a different width: an automatic routine no
 * longer counts, since it's maintenance rather than work in progress, so
 * mastering something frees the slot it was using.
 */
export function instantiableNodes(goal: Goal, tasks: ReturnType<typeof loadScrap7>['tasks']): Set<string> {
  const unlocked = goal.nodes.filter(isUnlocked)
  if (goal.slot === 'archived') {
    // Frozen: nothing new opens, but whatever already exists stays
    return new Set(unlocked.filter(n => n.scrapTaskId).map(n => n.id))
  }

  const cap = maxNodesFor(goal.slot)
  const byUnlockTime = [...unlocked].sort((a, b) => (a.unlockedAt ?? '').localeCompare(b.unlockedAt ?? ''))
  const allowed = new Set<string>()
  let active = 0
  for (const n of byUnlockTime) {
    if (nodeScore(n, tasks) >= THRESHOLD_UNLOCK_AT) { allowed.add(n.id); continue }  // automatic — free
    if (active < cap) { allowed.add(n.id); active++ }
  }
  return allowed
}

/**
 * Reconcile the chains with SCRAP-7. Opens routines whose prerequisites are
 * integrated and keeps frozen flags honest — but never installs anything.
 *
 * Installation is a decision, like spending a perk point: an AVAILABLE routine
 * sits there glowing until you choose it. Nothing appears in your habit list
 * because the system decided it was your turn.
 */
export function syncChain(state: ProgressionState, now = new Date()): ProgressionState {
  const before = loadScrap7()

  // 1. Open routines whose prerequisites are integrated (frozen goals don't advance)
  const goals = state.goals.map(g =>
    g.slot === 'archived' ? g : evaluateUnlocks(g, before.tasks, now).goal)

  // 2. Freeze / thaw. A frozen habit is never deleted — it stays visible and
  //    trackable, decays at half rate, and earns nothing.
  const frozenIds = new Set<string>()
  const liveIds   = new Set<string>()
  for (const g of goals) {
    for (const n of g.nodes) {
      if (!n.scrapTaskId) continue
      ;(g.slot === 'archived' ? frozenIds : liveIds).add(n.scrapTaskId)
    }
  }

  let touched = false
  const tasks = before.tasks.map(t => {
    const want = frozenIds.has(t.id) ? true : liveIds.has(t.id) ? false : undefined
    if (want === undefined || !!t.frozen === want) return t
    touched = true
    return { ...t, frozen: want }
  })
  if (touched) {
    saveScrap7({ ...before, tasks })
    window.dispatchEvent(new CustomEvent('warren:sync', { detail: { source: 'progression' } }))
  }

  return { ...state, goals }
}

export type InstallResult =
  | { ok: true;  state: ProgressionState }
  | { ok: false; reason: 'locked' | 'installed' | 'capacity' }

/**
 * Learn a routine. The one place a chain habit is ever created.
 *
 * Idempotent: the habit id derives from the routine id and is only created when
 * no task with that id exists, so a double-click or a replayed event can never
 * duplicate it or reset an accumulated score.
 */
export function installNode(state: ProgressionState, nodeId: string): InstallResult {
  const goal = state.goals.find(g => g.nodes.some(n => n.id === nodeId))
  const node = goal?.nodes.find(n => n.id === nodeId)
  if (!goal || !node) return { ok: false, reason: 'locked' }
  if (!isUnlocked(node))  return { ok: false, reason: 'locked' }
  if (node.scrapTaskId)   return { ok: false, reason: 'installed' }
  if (!hasCapacity(goal, loadScrap7().tasks)) return { ok: false, reason: 'capacity' }

  const taskId = routineTaskId(node)
  if (!loadScrap7().tasks.some(t => t.id === taskId)) {
    createExternalTask({
      id:        taskId,
      text:      node.title,
      category:  goal.title,
      taskType:  'habit',
      direction: 'positive',
      origin:    'chain',
      target:    1,
      unit:      'times',
    })
  }

  return {
    ok: true,
    state: {
      ...state,
      goals: state.goals.map(g => g.id !== goal.id ? g : {
        ...g,
        nodes: g.nodes.map(n => n.id === nodeId ? { ...n, scrapTaskId: taskId } : n),
      }),
    },
  }
}

/** Routines currently being trained — installed but not yet integrated. */
export function trainingCount(goal: Goal, tasks: ReturnType<typeof loadScrap7>['tasks']): number {
  return goal.nodes.filter(n => n.scrapTaskId && nodeScore(n, tasks) < THRESHOLD_UNLOCK_AT).length
}

/**
 * Room for another routine? Both live slots are capped, so installing is a
 * decision rather than a formality — an automatic routine no longer counts, so
 * mastering something frees the slot it was using.
 */
export function hasCapacity(goal: Goal, tasks: ReturnType<typeof loadScrap7>['tasks']): boolean {
  if (goal.slot === 'archived') return false
  return trainingCount(goal, tasks) < maxNodesFor(goal.slot)
}

/** Add a goal, into a free slot if one exists, otherwise straight to the archive. */
export function addGoal(s: ProgressionState, goal: Goal, now = new Date()): ProgressionState {
  const slot: GoalSlot = !primaryGoal(s) ? 'primary' : !secondaryGoal(s) ? 'secondary' : 'archived'
  return { ...s, goals: [...s.goals, stamp(goal, slot, now)] }
}

// ─── Authoring ────────────────────────────────────────────────────────────────

/**
 * Push an edit down into SCRAP-7, in one pass.
 *
 * DETACHED — a routine dropped from a chain is not deleted. Freeze never
 * deletes and neither does editing: the habit becomes UNBOUND with its score
 * and streak intact, to re-attach or archive by hand.
 *
 * RENAMED — a routine renamed in the tree is renamed on its habit. This patches
 * the two display fields only; it never goes near createExternalTask, which
 * would rebuild the task and wipe the score hanging off that id.
 */
function applyScrap7Edits(detached: string[], renames: Map<string, { text: string; category: string }>): void {
  if (detached.length === 0 && renames.size === 0) return
  const dropped = new Set(detached)
  const s7 = loadScrap7()

  let touched = false
  const tasks = s7.tasks.map(t => {
    if (dropped.has(t.id)) { touched = true; return { ...t, origin: 'manual' as const, frozen: false } }
    const rename = renames.get(t.id)
    if (!rename || (t.text === rename.text && t.category === rename.category)) return t
    touched = true
    return { ...t, text: rename.text, category: rename.category }
  })

  if (!touched) return
  saveScrap7({ ...s7, tasks })
  window.dispatchEvent(new CustomEvent('warren:sync', { detail: { source: 'progression' } }))
}

export interface CommitResult {
  state:    ProgressionState
  goalId:   string
  /** Habits released to UNBOUND by this edit. */
  detached: string[]
}

/**
 * Commit a draft. Creates the uplink when the draft has no goal id, otherwise
 * folds the edit into the existing one — where everything already earned
 * survives, because nodes are matched by their permanent key.
 */
export function commitDraft(s: ProgressionState, draft: ChainDraft, now = new Date()): CommitResult {
  const existing = draft.goalId ? s.goals.find(g => g.id === draft.goalId) : null

  if (!existing) {
    const goal = draftToGoal({ ...draft, goalId: null }, s.goals.map(g => g.id), now)
    return { state: addGoal(s, goal, now), goalId: goal.id, detached: [] }
  }

  const { goal, detached } = applyDraft(existing, draft, now)
  applyScrap7Edits(detached, new Map(goal.nodes
    .filter(n => n.scrapTaskId)
    .map(n => [n.scrapTaskId, { text: n.title, category: goal.title }])))
  return {
    state: { ...s, goals: s.goals.map(g => g.id === goal.id ? goal : g) },
    goalId: goal.id,
    detached,
  }
}

// ─── Life support ─────────────────────────────────────────────────────────────
// The basics, chosen from a template. Same idempotency rule as a routine: the
// id derives from the template, and an existing habit is never rebuilt.

/**
 * Install a baseline habit. Returns false when it already exists.
 * The cue stays on the template rather than the task — SCRAP-7 has no field
 * for it, and life support anchors are fixed rather than authored.
 */
export function installLifeSupport(template: LifeSupportTemplate, title: string, unit: string): boolean {
  const id = baselineTaskId(template.id)
  if (loadScrap7().tasks.some(t => t.id === id)) return false

  createExternalTask({
    id,
    text:      title,
    category:  'Life support',
    taskType:  'habit',
    direction: 'positive',
    origin:    'baseline',
    target:    template.target,
    unit,
  })
  return true
}

/** Drop a baseline habit from life support. Kept, not deleted — it becomes yours. */
export function releaseLifeSupport(taskId: string): void {
  const s7 = loadScrap7()
  if (!s7.tasks.some(t => t.id === taskId)) return
  saveScrap7({ ...s7, tasks: s7.tasks.map(t => t.id === taskId ? { ...t, origin: 'manual' as const } : t) })
  window.dispatchEvent(new CustomEvent('warren:sync', { detail: { source: 'progression' } }))
}

/** Adopt a hand-made habit into life support, so it starts earning. */
export function adoptAsLifeSupport(taskId: string): void {
  const s7 = loadScrap7()
  if (!s7.tasks.some(t => t.id === taskId)) return
  saveScrap7({ ...s7, tasks: s7.tasks.map(t => t.id === taskId ? { ...t, origin: 'baseline' as const } : t) })
  window.dispatchEvent(new CustomEvent('warren:sync', { detail: { source: 'progression' } }))
}

/**
 * Bank a life-support run. Flat and small: no slot rate, no tier weighting, no
 * fuel. Crossing into automatic pays once, detected from the score either side
 * of the run exactly as a routine's crossing is.
 */
export function recordBaselineRun(state: ProgressionState, before: number, after: number): RunReward {
  const events: XpEvent[] = [{ kind: 'baseline.run' }]
  if (before < THRESHOLD_UNLOCK_AT && after >= THRESHOLD_UNLOCK_AT) events.push({ kind: 'baseline.automatic' })

  const gained = events.reduce((sum, e) => sum + awardBaselineXp(e), 0)
  const levelBefore = gatedLevel(state.xp, state.quests).level
  const next = { ...state, xp: state.xp + gained }
  const levelAfter = gatedLevel(next.xp, next.quests).level

  return { state: next, gained, events, levelUp: levelAfter > levelBefore ? levelAfter : null }
}

// ─── Earning ──────────────────────────────────────────────────────────────────

export interface RunReward {
  state:  ProgressionState
  gained: number
  events: XpEvent[]
  levelUp: number | null    // the new level, when one was crossed
}

/**
 * Bank what a single run was worth. Crossing `strong` or the integration
 * threshold pays once, because the crossing is detected from the score either
 * side of the run rather than from a stored flag.
 */
export function recordRun(
  state: ProgressionState,
  taskId: string,
  before: number,
  after: number,
  fuelMultiplier = 1,
): RunReward {
  const goal = state.goals.find(g => g.nodes.some(n => n.scrapTaskId === taskId))
  const node = goal?.nodes.find(n => n.scrapTaskId === taskId)
  if (!goal || !node) return { state, gained: 0, events: [], levelUp: null }

  const events: XpEvent[] = [{ kind: 'routine.run', tier: node.tier }]
  if (before < 0.65 && after >= 0.65) events.push({ kind: 'routine.strong' })
  if (before < THRESHOLD_UNLOCK_AT && after >= THRESHOLD_UNLOCK_AT) events.push({ kind: 'routine.integrated' })

  const gained = events.reduce((sum, e) => sum + awardXp(e, goal.slot, fuelMultiplier), 0)
  const levelBefore = gatedLevel(state.xp, state.quests).level
  const next = { ...state, xp: state.xp + gained }
  const levelAfter = gatedLevel(next.xp, next.quests).level

  return { state: next, gained, events, levelUp: levelAfter > levelBefore ? levelAfter : null }
}

/**
 * Clear any main-quest step the record now satisfies and bank its reward.
 * Quest XP is flat — it is a story beat, not a routine, so slot rate and fuel
 * don't apply.
 */
export function syncQuests(state: ProgressionState, ctx: QuestContext, now = new Date()): {
  state: ProgressionState
  cleared: Quest[]
} {
  const { completed, cleared } = evaluateQuests(state.quests, ctx, now)
  if (cleared.length === 0) return { state, cleared }
  const gained = cleared.reduce((sum, q) => sum + q.xp, 0)
  return { state: { ...state, quests: completed, xp: state.xp + gained }, cleared }
}
