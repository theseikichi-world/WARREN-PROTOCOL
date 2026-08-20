// ─── The shelf — a candidate lands where its kind allows ──────────────────────
// PATHFINDER's analysis used to end in ORBIT with `logDream` set and no
// origin, which resolved to `'log'` — and `feedsProgression` says `'log'` earns
// nothing. Every card you pressed made an object that could not score, could not
// streak and belonged to no system. A HABIT made that way was worse: with origin
// `'log'` it failed `isOrphanHabit` (which wants `'manual'`), so life support
// never adopted it, and ORBIT only lists todos and due dailies, so it was drawn
// nowhere at all while the habit machinery kept decaying it.
//
// The fix is to stop treating "where does this go" as an afterthought. A
// candidate carries its KIND, the kind IS the destination, and every deploy
// below writes an explicit origin:
//
//   routine → a PROTOCOL node        scored, streaked, costs a slot to install
//   task    → ORBIT, origin 'manual' uncapped and unscored, per rule 32
//   basic   → LIFE SUPPORT           origin 'baseline', 3 XP a run
//   proof   → the act's BREACH       a datable external event
//
// Nothing here installs a habit. Adding a routine to the tree is not starting
// it — `installNode` is still the only path, and still the operator's decision.

import type { Candidate } from './spine'
import type { Goal } from './types'
import { goalToDraft, applyDraft } from './draft'
import { createExternalTask, loadState as loadScrap7 } from '../scrap7/store'
import { isBaseline } from '../scrap7/types'
import { installCustomLifeSupport } from './store'

/**
 * A deployed candidate's task id. Derived from the dream and the candidate key
 * so pressing twice upserts the same task instead of making a second one —
 * `createExternalTask` matches on id.
 */
export const shelfTaskId = (dreamId: string, key: string): string => `shelf:${dreamId}:${key}`

export type BlockReason = 'no-uplink' | 'no-act'

export type DeployState =
  | { kind: 'ready' }
  | { kind: 'done' }
  | { kind: 'blocked'; reason: BlockReason }

export interface ShelfContext {
  dreamId: string
  /** The uplink promoted from this dream, when there is one. */
  goal:    Goal | null
  /** Ids already present in ORBIT. */
  taskIds: Set<string>
  /** Titles of installed basics, lowercased — a basic is matched by name, not id. */
  basics:  Set<string>
}

const chapterFor = (goal: Goal, actKey: string) =>
  goal.chapters.find(c => c.key === actKey) ?? null

const hasNode = (goal: Goal, key: string): boolean =>
  goal.nodes.some(n => n.id === `${goal.id}:${key}`)

/**
 * Whether this candidate can be deployed, is already deployed, or is waiting on
 * something. A blocked candidate always names its condition rather than sitting
 * there inert — rule 5, and rule 30 for the ones that are simply not open yet.
 */
export function deployState(c: Candidate, ctx: ShelfContext): DeployState {
  switch (c.kind) {
    case 'routine':
      if (!ctx.goal) return { kind: 'blocked', reason: 'no-uplink' }
      if (hasNode(ctx.goal, c.key)) return { kind: 'done' }
      if (!chapterFor(ctx.goal, c.act)) return { kind: 'blocked', reason: 'no-act' }
      return { kind: 'ready' }

    case 'proof': {
      if (!ctx.goal) return { kind: 'blocked', reason: 'no-uplink' }
      const chapter = chapterFor(ctx.goal, c.act)
      if (!chapter) return { kind: 'blocked', reason: 'no-act' }
      return chapter.boss?.title === c.title.trim() ? { kind: 'done' } : { kind: 'ready' }
    }

    case 'basic':
      return ctx.basics.has(c.title.trim().toLowerCase()) ? { kind: 'done' } : { kind: 'ready' }

    case 'task':
      return ctx.taskIds.has(shelfTaskId(ctx.dreamId, c.key)) ? { kind: 'done' } : { kind: 'ready' }
  }
}

export function blockText(reason: BlockReason): { en: string; ru: string } {
  switch (reason) {
    case 'no-uplink': return {
      en: 'PROMOTE THIS DREAM FIRST — this needs a protocol to live in',
      ru: 'СНАЧАЛА ПРОДВИНЬТЕ МЕЧТУ — этому нужен протокол',
    }
    case 'no-act': return {
      en: 'ITS ACT IS NOT IN THE PROTOCOL — re-read the dream or move it',
      ru: 'ЕГО АКТА НЕТ В ПРОТОКОЛЕ — перечитайте мечту или перенесите его',
    }
  }
}

// ─── The goal-side deploys, kept pure ─────────────────────────────────────────

/**
 * Fold a routine or a proof into an uplink and hand back the new goal. Pure, so
 * the caller decides when it is saved.
 *
 * A routine added here is a NODE, not a habit: `scrapTaskId` stays empty until
 * the operator installs it. That is rule 1, and it is the difference between
 * offering a branch on the tech tree and spending the perk point for someone.
 *
 * Returns null when there is nothing to do, so a double press is a no-op rather
 * than a second node.
 */
export function applyToGoal(goal: Goal, c: Candidate, now = new Date()): Goal | null {
  const chapterIndex = goal.chapters.findIndex(ch => ch.key === c.act)
  if (chapterIndex < 0) return null

  if (c.kind === 'routine') {
    if (hasNode(goal, c.key)) return null
    const draft = goalToDraft(goal)
    const keys  = new Set(draft.nodes.map(n => n.key))
    draft.nodes = [...draft.nodes, {
      key:    c.key,
      title:  c.title,
      cue:    c.cue,
      tier:   c.tier,
      // Only prerequisites that actually exist in this protocol — a candidate
      // may name a sibling that was never deployed.
      after:  c.after.filter(k => keys.has(k)),
      ladder: c.ladder,
      toolId: c.toolId,
    }]
    draft.chapters = draft.chapters.map((ch, i) =>
      i === chapterIndex ? { ...ch, keys: [...ch.keys, c.key] } : ch)
    return applyDraft(goal, draft, now).goal
  }

  if (c.kind === 'proof') {
    const title = c.title.trim()
    if (!title || goal.chapters[chapterIndex].boss?.title === title) return null
    const draft = goalToDraft(goal)
    draft.chapters = draft.chapters.map((ch, i) => i === chapterIndex ? { ...ch, boss: title } : ch)
    return applyDraft(goal, draft, now).goal
  }

  return null
}

// ─── The day-side deploys ─────────────────────────────────────────────────────

/**
 * Send a candidate to ORBIT or to LIFE SUPPORT. Returns the task id it created
 * or reused, or null when the kind belongs to the goal instead.
 *
 * The origin is written explicitly in both cases. That single field is what the
 * old path left to be inferred, and inferring it is what made every deployed
 * card inert.
 */
export function deployToDay(c: Candidate, ctx: ShelfContext, dreamTitle: string): string | null {
  if (c.kind === 'task') {
    const id = shelfTaskId(ctx.dreamId, c.key)
    createExternalTask({
      id,
      text:     c.title.trim(),
      category: 'Goals',
      // ORBIT has one kind of thing: a task, which may repeat (rule 33).
      taskType: c.repeats ? 'daily' : 'todo',
      // Explicitly unbound. ORBIT is uncapped and unscored on purpose — capping
      // your obligations would be absurd, you did not choose them (rule 32).
      origin:   'manual',
      logDream: dreamTitle,
    })
    return id
  }

  if (c.kind === 'basic') {
    const title = c.title.trim()
    if (ctx.basics.has(title.toLowerCase())) return null
    // A ladder rung is a threshold like "20 min"; life support counts runs, so
    // the target is the count and the rung text becomes the unit it is measured in.
    const unit = c.ladder.find(l => l.trim())?.trim() || 'once'
    return installCustomLifeSupport(title, 1, unit)
  }

  return null
}

/** Read the context a shelf needs out of live storage. */
export function shelfContext(dreamId: string, goal: Goal | null): ShelfContext {
  const tasks = loadScrap7().tasks
  return {
    dreamId,
    goal,
    taskIds: new Set(tasks.map(t => t.id)),
    basics:  new Set(tasks.filter(isBaseline).map(t => t.text.trim().toLowerCase())),
  }
}
