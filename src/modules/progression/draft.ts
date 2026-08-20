// ─── Chain drafts — the editable form of a PROTOCOL ───────────────────────────
// A goal used to be hand-written in seed.ts and shipped as scaffolding. It is
// now authored: a dream is promoted, the guide proposes a chain, and every node
// is edited before anything commits. This file is the shape in between — a
// draft nobody has agreed to yet.
//
// Two rules govern the conversion back into a live Goal, and both exist because
// integration is the one thing in this app that cannot be re-earned:
//
//   · A node's KEY is permanent. Ids derive from it (`goal-actor:reading`) and
//     the ORBIT habit derives from the id, so renaming a routine's title must
//     never touch its key — the accumulated score hangs off it.
//   · Editing never deletes a habit. A routine dropped from the chain hands its
//     habit back as UNBOUND, with its score and streak intact.

import type { ChainNode, Chapter, Goal, NodeTier } from './types'
import { DEFAULT_UNLOCKS_AT } from './types'
import { anchorLabel, type RoutineAnchor } from './anchor'
import { SEED_GOALS } from './seed'

export interface DraftNode {
  key:    string        // permanent once created — see the header
  title:  string
  /** Legacy prose, and the fallback label when there is no structured anchor. */
  cue:    string
  /** When it happens, in a form ORBIT can schedule. See `anchor.ts`. */
  anchor?: RoutineAnchor
  /** How long a run takes, in minutes — what makes fitting it into free time real. */
  minutes?: number
  tier:   NodeTier
  ladder: string[]      // thresholds, ascending
  after:  string[]      // prerequisite keys — empty means chain entry
  toolId: string | null // instrument this routine grants, if any
}

export interface DraftChapter {
  title: string
  keys:  string[]
  /** The spine act this chapter is. Survives renaming — see `Chapter.key`. */
  key?:  string
  /** A real, datable, external event, or nothing. Score states are not bosses. */
  boss:  string | null
  /** Named but not yet filled — see `Chapter.planned`. Never true once it has keys. */
  planned?: boolean
}

export interface ChainDraft {
  /** Set when editing a live uplink; null when this will create one. */
  goalId:        string | null
  title:         string
  nodes:         DraftNode[]
  chapters:      DraftChapter[]
  /** The L.O.G dream this came from, for provenance. */
  sourceDreamId: string | null
  /** The guide's read on the dream. Shown while editing, never stored. */
  note:          string
}

export const nodeId = (goalId: string, key: string): string => `${goalId}:${key}`

// ─── Keys ─────────────────────────────────────────────────────────────────────

export function slugify(s: string): string {
  const ascii = s.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')      // Cyrillic titles slug to nothing — handled below
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return ascii.slice(0, 24)
}

/**
 * A slug that isn't taken yet.
 *
 * Falls back to a counted placeholder when the title slugs to nothing — a blank
 * routine named later, or a Cyrillic title. The key is permanent either way,
 * so it is never re-derived once set: the habit's score hangs off it.
 */
export function uniqueKey(title: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = slugify(title) || 'routine'
  if (!used.has(base)) return base
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`
    if (!used.has(candidate)) return candidate
  }
}

export function newGoalId(title: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = `goal-${slugify(title) || 'uplink'}`
  if (!used.has(base)) return base
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`
    if (!used.has(candidate)) return candidate
  }
}

// ─── Construction ─────────────────────────────────────────────────────────────

export function blankNode(title = '', taken: Iterable<string> = []): DraftNode {
  return { key: uniqueKey(title, taken), title, cue: '', tier: 2, ladder: [''], after: [], toolId: null }
}

export function blankDraft(title = ''): ChainDraft {
  return {
    goalId: null, title, nodes: [], sourceDreamId: null, note: '',
    chapters: [{ title: 'Chapter 1', keys: [], boss: null }],
  }
}

/** Read a live uplink back into an editable draft. Keys come from the node ids. */
export function goalToDraft(goal: Goal): ChainDraft {
  const keyOf = (id: string) => id.startsWith(`${goal.id}:`) ? id.slice(goal.id.length + 1) : id

  return {
    goalId:        goal.id,
    title:         goal.title,
    sourceDreamId: goal.sourceDreamId ?? null,
    note:          '',
    nodes: goal.nodes.map(n => ({
      key:    keyOf(n.id),
      title:  n.title,
      cue:    n.cue,
      ...(n.anchor ? { anchor: n.anchor } : {}),
      ...(n.minutes ? { minutes: n.minutes } : {}),
      tier:   n.tier,
      ladder: [...n.thresholds],
      after:  n.prerequisiteIds.map(keyOf),
      toolId: n.toolId,
    })),
    chapters: goal.chapters.map(c => ({
      title:   c.title,
      keys:    c.nodeIds.map(keyOf),
      boss:    c.boss?.title ?? null,
      planned: c.planned === true,
      ...(c.key ? { key: c.key } : {}),
    })),
  }
}

/**
 * The reference chains, offered rather than installed. They were scaffolding
 * while there was no way to author a goal; as templates they're a starting point
 * you edit, and every node is yours the moment it commits.
 */
export const TEMPLATES: ChainDraft[] = SEED_GOALS.map(g => ({ ...goalToDraft(g), goalId: null }))

// ─── Validation ───────────────────────────────────────────────────────────────

export type DraftProblem =
  | { kind: 'title.missing' }
  | { kind: 'nodes.empty' }
  | { kind: 'node.title';       key: string }
  | { kind: 'node.cue';         key: string }
  | { kind: 'node.ladder';      key: string }
  | { kind: 'node.duplicate';   key: string }
  | { kind: 'node.prereq';      key: string; missing: string }
  | { kind: 'node.self';        key: string }
  | { kind: 'node.cycle';       key: string }
  | { kind: 'node.unchaptered'; key: string }
  | { kind: 'chapter.title';    index: number }
  | { kind: 'chapter.empty';    index: number }

/** Keys that sit on a prerequisite cycle — the graph must be a DAG to lay out. */
export function findCycles(nodes: DraftNode[]): Set<string> {
  const byKey = new Map(nodes.map(n => [n.key, n]))
  const state = new Map<string, 'visiting' | 'done'>()
  const onCycle = new Set<string>()

  const walk = (key: string, stack: string[]): void => {
    const seen = state.get(key)
    if (seen === 'done') return
    if (seen === 'visiting') {
      // Everything from where the stack re-entered this key is part of the loop
      for (const k of stack.slice(stack.indexOf(key))) onCycle.add(k)
      return
    }
    state.set(key, 'visiting')
    for (const dep of byKey.get(key)?.after ?? []) {
      if (byKey.has(dep)) walk(dep, [...stack, key])
    }
    state.set(key, 'done')
  }

  for (const n of nodes) walk(n.key, [])
  return onCycle
}

export function validateDraft(draft: ChainDraft): DraftProblem[] {
  const problems: DraftProblem[] = []
  if (!draft.title.trim()) problems.push({ kind: 'title.missing' })
  if (draft.nodes.length === 0) problems.push({ kind: 'nodes.empty' })

  const keys = new Set<string>()
  const dupes = new Set<string>()
  for (const n of draft.nodes) {
    if (keys.has(n.key)) dupes.add(n.key)
    keys.add(n.key)
  }
  for (const key of dupes) problems.push({ kind: 'node.duplicate', key })

  const chaptered = new Map<string, number>()
  draft.chapters.forEach((c, i) => {
    if (!c.title.trim()) problems.push({ kind: 'chapter.title', index: i })
    // A PLANNED act is empty on purpose — it is the part of the story that has
    // not been reached yet. Only an act that was meant to be filled is a problem.
    if (c.keys.length === 0 && c.planned !== true) problems.push({ kind: 'chapter.empty', index: i })
    for (const k of c.keys) if (!chaptered.has(k)) chaptered.set(k, i)
  })

  const cycles = findCycles(draft.nodes)
  for (const n of draft.nodes) {
    if (!n.title.trim()) problems.push({ kind: 'node.title', key: n.key })
    // A structured anchor is an anchor. Prose still counts, so a protocol
    // written before anchors were structured stays committable untouched.
    if (!n.anchor && !n.cue.trim()) problems.push({ kind: 'node.cue', key: n.key })
    if (n.ladder.filter(l => l.trim()).length === 0) problems.push({ kind: 'node.ladder', key: n.key })
    for (const dep of n.after) {
      if (dep === n.key) problems.push({ kind: 'node.self', key: n.key })
      else if (!keys.has(dep)) problems.push({ kind: 'node.prereq', key: n.key, missing: dep })
    }
    if (cycles.has(n.key)) problems.push({ kind: 'node.cycle', key: n.key })
    if (!chaptered.has(n.key)) problems.push({ kind: 'node.unchaptered', key: n.key })
  }

  return problems
}

/** A locked thing states its condition — so does a draft that won't commit. */
export function problemText(p: DraftProblem, draft: ChainDraft): { en: string; ru: string } {
  const title = (key: string) => draft.nodes.find(n => n.key === key)?.title.trim() || key
  switch (p.kind) {
    case 'title.missing':    return { en: 'The uplink needs a name', ru: 'Каналу нужно имя' }
    case 'nodes.empty':      return { en: 'A protocol needs at least one routine', ru: 'Протоколу нужна хотя бы одна рутина' }
    case 'node.title':       return { en: 'A routine has no name', ru: 'У рутины нет имени' }
    case 'node.cue':         return { en: `${title(p.key)} — no anchor. A routine without a cue doesn't automate.`,
                                      ru: `${title(p.key)} — нет якоря. Рутина без привязки не автоматизируется.` }
    case 'node.ladder':      return { en: `${title(p.key)} — no threshold set`, ru: `${title(p.key)} — не задан порог` }
    case 'node.duplicate':   return { en: `Two routines share the key ${p.key}`, ru: `Две рутины делят ключ ${p.key}` }
    case 'node.prereq':      return { en: `${title(p.key)} requires a routine that isn't here`,
                                      ru: `${title(p.key)} требует рутину, которой нет` }
    case 'node.self':        return { en: `${title(p.key)} requires itself`, ru: `${title(p.key)} требует сама себя` }
    case 'node.cycle':       return { en: `${title(p.key)} is in a requirement loop`, ru: `${title(p.key)} в кольце требований` }
    case 'node.unchaptered': return { en: `${title(p.key)} belongs to no chapter`, ru: `${title(p.key)} не входит ни в одну главу` }
    case 'chapter.title':    return { en: `Chapter ${p.index + 1} has no name`, ru: `У главы ${p.index + 1} нет имени` }
    case 'chapter.empty':    return { en: `Chapter ${p.index + 1} is empty`, ru: `Глава ${p.index + 1} пуста` }
  }
}

// ─── Draft → live chain ───────────────────────────────────────────────────────

const cleanLadder = (ladder: string[]): string[] => {
  const kept = ladder.map(l => l.trim()).filter(Boolean)
  return kept.length ? kept : ['once']
}

/**
 * Provisional nodes for the preview diagram. Same shape the real tree lays out,
 * so the forge shows exactly the graph that will commit.
 */
export function draftToNodes(draft: ChainDraft, goalId = draft.goalId ?? 'draft'): ChainNode[] {
  const keys = new Set(draft.nodes.map(n => n.key))
  return draft.nodes.map(n => ({
    id:              nodeId(goalId, n.key),
    goalId,
    title:           n.title.trim() || n.key,
    cue:             n.anchor ? anchorLabel(n.anchor) : n.cue,
    ...(n.anchor ? { anchor: n.anchor } : {}),
    tier:            n.tier,
    thresholds:      cleanLadder(n.ladder),
    thresholdIndex:  0,
    unlocksAt:       DEFAULT_UNLOCKS_AT,
    prerequisiteIds: n.after.filter(k => keys.has(k) && k !== n.key).map(k => nodeId(goalId, k)),
    unlockedAt:      null,
    toolId:          n.toolId,
    scrapTaskId:     '',
  }))
}

function draftChapters(draft: ChainDraft, goalId: string, prior: Chapter[]): Chapter[] {
  return draft.chapters.map((c, i) => {
    const wasBoss = prior[i]?.boss
    return {
      index:   i + 1,
      title:   c.title.trim() || `Chapter ${i + 1}`,
      nodeIds: c.keys.map(k => nodeId(goalId, k)),
      // Deepening an act is what ends its planned state, and holding a routine
      // is what deepening means — so the flag is derived, never left to drift.
      planned: c.planned === true && c.keys.length === 0,
      ...(c.key ? { key: c.key } : {}),
      boss: c.boss?.trim()
        ? {
            title:       c.boss.trim(),
            requirement: { minScore: wasBoss?.requirement.minScore ?? 0.70 },
            // The event either happened or it didn't; renaming the chapter
            // doesn't un-happen it, but a different event has not been cleared.
            completedAt: wasBoss?.title === c.boss.trim() ? wasBoss.completedAt : null,
          }
        : null,
    }
  })
}

export interface ApplyResult {
  goal: Goal
  /** Habits whose routine left the chain. Never deleted — handed back as UNBOUND. */
  detached: string[]
}

/**
 * Fold a draft into an existing uplink. Everything earned survives: a node
 * matched by key keeps its unlock date, its habit and its threshold rung, so
 * renaming a routine or re-ordering the tree costs nothing.
 */
export function applyDraft(
  goal: Goal,
  draft: ChainDraft,
  now = new Date(),
  /** Resolves a habit id to its title, so "after X" reads as a name. */
  nameOf: (taskId: string) => string | null = () => null,
): ApplyResult {
  const prior = new Map(goal.nodes.map(n => [n.id, n]))
  const keys  = new Set(draft.nodes.map(n => n.key))

  const nodes: ChainNode[] = draft.nodes.map(dn => {
    const id  = nodeId(goal.id, dn.key)
    const was = prior.get(id)
    const prerequisiteIds = dn.after.filter(k => keys.has(k) && k !== dn.key).map(k => nodeId(goal.id, k))
    const ladder = cleanLadder(dn.ladder)

    return {
      id,
      goalId:         goal.id,
      title:          dn.title.trim() || dn.key,
      // The label follows the anchor, so renaming the habit you stacked onto
      // renames the cue everywhere. Stored prose only survives where there is
      // no anchor to derive from.
      cue:            dn.anchor ? anchorLabel(dn.anchor, nameOf) : dn.cue.trim(),
      ...(dn.anchor ? { anchor: dn.anchor } : {}),
      ...(dn.minutes ? { minutes: dn.minutes } : {}),
      tier:           dn.tier,
      thresholds:     ladder,
      thresholdIndex: Math.min(was?.thresholdIndex ?? 0, ladder.length - 1),
      unlocksAt:      was?.unlocksAt ?? DEFAULT_UNLOCKS_AT,
      prerequisiteIds,
      // An unlock is a fact of history. Gaining a prerequisite later never
      // re-locks a routine you already opened; losing every prerequisite opens
      // one that was waiting.
      unlockedAt:     was?.unlockedAt ?? (prerequisiteIds.length === 0 ? now.toISOString() : null),
      toolId:         dn.toolId,
      scrapTaskId:    was?.scrapTaskId ?? '',
    }
  })

  const kept = new Set(nodes.map(n => n.id))
  const detached = goal.nodes
    .filter(n => !kept.has(n.id) && n.scrapTaskId)
    .map(n => n.scrapTaskId)

  return {
    goal: {
      ...goal,
      title:         draft.title.trim() || goal.title,
      nodes,
      chapters:      draftChapters(draft, goal.id, goal.chapters),
      sourceDreamId: draft.sourceDreamId ?? goal.sourceDreamId ?? null,
    },
    detached,
  }
}

/** Build a brand-new uplink from a draft. `takenIds` keeps goal ids unique. */
export function draftToGoal(
  draft: ChainDraft,
  takenIds: Iterable<string>,
  now = new Date(),
  nameOf: (taskId: string) => string | null = () => null,
): Goal {
  const id = draft.goalId ?? newGoalId(draft.title, takenIds)
  const shell: Goal = {
    id,
    title:            draft.title.trim() || 'UPLINK',
    slot:             'archived',
    nodes:            [],
    chapters:         [],
    createdAt:        now.toISOString(),
    lastSlotChangeAt: now.toISOString(),
  }
  return applyDraft(shell, draft, now, nameOf).goal
}
