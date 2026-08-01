// ─── Chain engine — gating, unlock conditions, chapter state ──────────────────
// Pure over (goal, tasks). Nothing here touches storage, so every rule can be
// tested against a handful of fake habits.

import type { Task } from '../scrap7/types'
import type { ChainNode, Chapter, Goal } from './types'
import { THRESHOLD_UNLOCK_AT } from './types'

/** Deterministic id for the SCRAP-7 habit behind a routine — the idempotency key. */
export const routineTaskId = (node: ChainNode): string => `chain:${node.id}`

const scoreOf = (task: Task | undefined): number => task?.score ?? 0

/** Current integration of a routine, read from its habit. 0 when not yet created. */
export function nodeScore(node: ChainNode, tasks: Task[]): number {
  return scoreOf(tasks.find(t => t.id === (node.scrapTaskId || routineTaskId(node))))
}

export const isUnlocked = (node: ChainNode): boolean => node.unlockedAt !== null

export interface Requirement {
  nodeId: string
  title:  string
  need:   number
  have:   number
  met:    boolean
}

/**
 * What this routine is waiting on. Drives the locked-state copy, so a locked
 * routine can say "REQUIRES: Reading aloud @ 0.60 — currently 0.41" instead of
 * showing an empty bar you can't act on.
 */
export function unlockRequirements(node: ChainNode, goal: Goal, tasks: Task[]): Requirement[] {
  return node.prerequisiteIds.map(pid => {
    const prereq = goal.nodes.find(n => n.id === pid)
    const have   = prereq ? nodeScore(prereq, tasks) : 0
    return {
      nodeId: pid,
      title:  prereq?.title ?? pid,
      need:   node.unlocksAt,
      have,
      met:    have >= node.unlocksAt,
    }
  })
}

export const canUnlock = (node: ChainNode, goal: Goal, tasks: Task[]): boolean =>
  unlockRequirements(node, goal, tasks).every(r => r.met)

/**
 * Open every routine whose prerequisites are satisfied. Returns the goal
 * unchanged (same reference) when nothing moved, so callers can skip a write.
 */
export function evaluateUnlocks(goal: Goal, tasks: Task[], now = new Date()): {
  goal: Goal
  newlyUnlocked: ChainNode[]
} {
  const newlyUnlocked: ChainNode[] = []
  const nodes = goal.nodes.map(n => {
    if (isUnlocked(n) || !canUnlock(n, goal, tasks)) return n
    const opened = { ...n, unlockedAt: now.toISOString() }
    newlyUnlocked.push(opened)
    return opened
  })
  return newlyUnlocked.length ? { goal: { ...goal, nodes }, newlyUnlocked } : { goal, newlyUnlocked }
}

export interface ChapterState {
  total:       number
  unlocked:    number
  atThreshold: number    // routines at or above the breach requirement
  minScore:    number
  breachReady: boolean   // every routine is there — only meaningful with a boss
  complete:    boolean   // gating satisfied (and breach cleared, when one exists)
}

/**
 * A chapter is gated on ALL of its routines reaching the threshold — no node
 * count, because a hand-written chapter is exactly as long as the goal needs.
 */
export function chapterState(chapter: Chapter, goal: Goal, tasks: Task[]): ChapterState {
  const nodes    = chapter.nodeIds.map(id => goal.nodes.find(n => n.id === id)).filter((n): n is ChainNode => !!n)
  const minScore = chapter.boss?.requirement.minScore ?? 0.70
  const atThreshold = nodes.filter(n => nodeScore(n, tasks) >= minScore).length
  const breachReady = nodes.length > 0 && atThreshold === nodes.length

  return {
    total:       nodes.length,
    unlocked:    nodes.filter(isUnlocked).length,
    atThreshold,
    minScore,
    breachReady,
    complete:    breachReady && (chapter.boss ? chapter.boss.completedAt !== null : true),
  }
}

/** The chapter you're actually working in — the first one not yet complete. */
export function activeChapter(goal: Goal, tasks: Task[]): Chapter | null {
  return goal.chapters.find(c => !chapterState(c, goal, tasks).complete) ?? null
}

// ─── Node state ───────────────────────────────────────────────────────────────
// LOCKED     prerequisites unmet — shows what it needs
// AVAILABLE  unlocked, not installed — waiting on your decision
// TRAINING   installed, integrating through use
// INTEGRATED past the threshold; stops competing for a training slot

export type NodeState = 'locked' | 'available' | 'training' | 'integrated'

export function nodeState(node: ChainNode, tasks: Task[]): NodeState {
  if (!isUnlocked(node)) return 'locked'
  if (!node.scrapTaskId) return 'available'
  return nodeScore(node, tasks) >= THRESHOLD_UNLOCK_AT ? 'integrated' : 'training'
}
