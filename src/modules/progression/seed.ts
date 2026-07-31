// ─── Reference uplinks — hand-written, not generated ──────────────────────────
// The two real goals from the spec. Every routine carries a concrete cue: a
// routine without an anchor doesn't build automatism, so there are none here.
// Training days are pinned to weekdays and times on purpose — floating
// frequency ("3× a week") measurably slows integration.
//
// scrapTaskId is empty until step 3 links each routine to its SCRAP-7 habit.

import type { ChainNode, Chapter, Goal, NodeTier } from './types'
import { DEFAULT_UNLOCKS_AT } from './types'

interface NodeSeed {
  key:       string
  title:     string
  cue:       string
  tier:      NodeTier
  ladder:    string[]
  after?:    string[]        // prerequisite keys — empty means chain entry
  tool?:     string
}

function buildNodes(goalId: string, seeds: NodeSeed[]): ChainNode[] {
  const id = (key: string) => `${goalId}:${key}`
  return seeds.map(s => ({
    id:              id(s.key),
    goalId,
    title:           s.title,
    cue:             s.cue,
    tier:            s.tier,
    thresholds:      s.ladder,
    thresholdIndex:  0,
    unlocksAt:       DEFAULT_UNLOCKS_AT,
    prerequisiteIds: (s.after ?? []).map(id),
    unlockedAt:      (s.after ?? []).length === 0 ? new Date(0).toISOString() : null,
    toolId:          s.tool ?? null,
    scrapTaskId:     '',
  }))
}

const chapter = (index: number, title: string, goalId: string, keys: string[],
                 bossTitle: string, nodeCount: number): Chapter => ({
  index,
  title,
  nodeIds: keys.map(k => `${goalId}:${k}`),
  boss: { title: bossTitle, requirement: { nodeCount, minScore: 0.70 }, completedAt: null },
})

// ─── ACTOR ────────────────────────────────────────────────────────────────────
const ACTOR_ID = 'goal-actor'

const ACTOR_NODES: NodeSeed[] = [
  // Chapter 1 — Voice & Presence
  { key: 'reading',  title: 'Reading aloud',      cue: 'after morning coffee',      tier: 2,
    ladder: ['30 min', '45 min', '60 min'] },
  { key: 'diction',  title: 'Diction drills',     cue: 'straight after reading',    tier: 2,
    ladder: ['10 min', '15 min', '20 min'], after: ['reading'] },

  // Chapter 2 — Material
  { key: 'journal',  title: "Actor's journal",    cue: 'last thing before bed',     tier: 2,
    ladder: ['3 lines', '1 page', 'page + one observation'], after: ['diction'], tool: 'journal' },
  { key: 'books',    title: 'Acting books',       cue: 'after dinner, at the desk', tier: 2,
    ladder: ['10 pages', '20 pages', 'one chapter'], after: ['diction'] },
  { key: 'observe',  title: 'Observation',        cue: 'on the way home',           tier: 1,
    ladder: ['1 note', '3 notes', '3 notes + a sketch'], after: ['diction'] },

  // Chapter 3 — Craft
  { key: 'memorize', title: 'Text memorization',  cue: 'after morning reading',     tier: 3,
    ladder: ['4 lines', '8 lines', 'a full monologue'], after: ['journal'], tool: 'ardo' },
  { key: 'selftape', title: 'Self-tape',          cue: 'Saturday 11:00',            tier: 3,
    ladder: ['1 take', '3 takes', 'a full scene'], after: ['memorize'] },
  { key: 'english',  title: 'English practice',   cue: 'after lunch',               tier: 3,
    ladder: ['15 min', '30 min', '45 min'], after: ['journal'] },
]

const ACTOR: Goal = {
  id:    ACTOR_ID,
  title: 'ACTOR',
  slot:  'primary',
  nodes: buildNodes(ACTOR_ID, ACTOR_NODES),
  chapters: [
    chapter(1, 'Voice & Presence', ACTOR_ID, ['reading', 'diction'],
      'Record a monologue, start to finish', 2),
    chapter(2, 'Material', ACTOR_ID, ['journal', 'books', 'observe'],
      'Write a character study drawn from life', 3),
    chapter(3, 'Craft', ACTOR_ID, ['memorize', 'selftape', 'english'],
      'A self-tape shot and submitted', 3),
  ],
  createdAt:        new Date(0).toISOString(),
  lastSlotChangeAt: new Date(0).toISOString(),
}

// ─── CAPOEIRA ─────────────────────────────────────────────────────────────────
const CAP_ID = 'goal-capoeira'

const CAP_NODES: NodeSeed[] = [
  // Chapter 1 — Base
  { key: 'training', title: 'Training',           cue: 'Mon/Wed/Fri 19:00',         tier: 3,
    ladder: ['60 min', '90 min', '90 min + open mat'] },
  { key: 'mobility', title: 'Mobility',           cue: 'right after waking',        tier: 2,
    ladder: ['10 min', '15 min', '20 min'], after: ['training'] },

  // Chapter 2 — Movement
  { key: 'ginga',    title: 'Ginga',              cue: 'after mobility',            tier: 2,
    ladder: ['5 min', '10 min', '15 min'], after: ['mobility'] },
  { key: 'cardio',   title: 'Cardio & breathing', cue: 'Tue/Thu 08:00',             tier: 3,
    ladder: ['15 min', '25 min', '35 min'], after: ['mobility'] },

  // Chapter 3 — Roda
  { key: 'berimbau', title: 'Berimbau',           cue: 'after training, before leaving', tier: 2,
    ladder: ['10 min', '20 min', '30 min'], after: ['ginga'] },
  { key: 'ptbr',     title: 'Portuguese',         cue: 'with morning coffee',       tier: 2,
    ladder: ['10 min', '20 min', '30 min'], after: ['ginga'] },
  { key: 'roda',     title: 'Roda',               cue: 'Sunday session',            tier: 4,
    ladder: ['observe', 'one entry', 'three entries'], after: ['berimbau', 'cardio'] },
]

const CAPOEIRA: Goal = {
  id:    CAP_ID,
  title: 'CAPOEIRA',
  slot:  'secondary',
  nodes: buildNodes(CAP_ID, CAP_NODES),
  chapters: [
    chapter(1, 'Base', CAP_ID, ['training', 'mobility'],
      'A full training week, nothing missed', 2),
    chapter(2, 'Movement', CAP_ID, ['ginga', 'cardio'],
      'Hold the ginga through a whole song', 2),
    chapter(3, 'Roda', CAP_ID, ['berimbau', 'ptbr', 'roda'],
      'Entering the roda', 3),
  ],
  createdAt:        new Date(0).toISOString(),
  lastSlotChangeAt: new Date(0).toISOString(),
}

export const SEED_GOALS: Goal[] = [ACTOR, CAPOEIRA]
