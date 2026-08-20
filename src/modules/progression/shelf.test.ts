import { describe, it, expect } from 'vitest'
import { deployState, applyToGoal, shelfTaskId, type ShelfContext } from './shelf'
import type { Candidate } from './spine'
import type { Goal } from './types'

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  key: 'shadow', kind: 'routine', act: 'fluency', title: 'Shadow a scene', why: '',
  cue: 'after coffee', tier: 2, ladder: ['10 min'], after: [], toolId: null, repeats: false,
  ...over,
})

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'goal-crossing', title: 'CROSSING', slot: 'primary',
  createdAt: '2026-01-01T00:00:00.000Z', lastSlotChangeAt: '2026-01-01T00:00:00.000Z',
  chapters: [
    { index: 1, title: 'English fluency', key: 'fluency', nodeIds: [], boss: null },
    { index: 2, title: 'Pipeline', key: 'pipeline', nodeIds: [], boss: null, planned: true },
  ],
  nodes: [],
  ...over,
})

const ctx = (over: Partial<ShelfContext> = {}): ShelfContext => ({
  dreamId: 'dream-1', goal: goal(), taskIds: new Set(), basics: new Set(), ...over,
})

describe('deployState', () => {
  it('is ready when the act exists and nothing has been deployed', () => {
    expect(deployState(cand(), ctx())).toEqual({ kind: 'ready' })
  })

  it('blocks a routine until the dream is an uplink, and says so', () => {
    expect(deployState(cand(), ctx({ goal: null }))).toEqual({ kind: 'blocked', reason: 'no-uplink' })
  })

  it('blocks a routine whose act is not in the protocol', () => {
    expect(deployState(cand({ act: 'ghost' }), ctx())).toEqual({ kind: 'blocked', reason: 'no-act' })
  })

  it('reads done off the protocol rather than remembering a button press', () => {
    const g = goal({ nodes: [{
      id: 'goal-crossing:shadow', goalId: 'goal-crossing', title: 'Shadow a scene', cue: 'c', tier: 2,
      thresholds: ['a'], thresholdIndex: 0, unlocksAt: 0.6, prerequisiteIds: [],
      unlockedAt: null, toolId: null, scrapTaskId: '',
    }] })
    expect(deployState(cand(), ctx({ goal: g }))).toEqual({ kind: 'done' })
  })

  it('tracks a task by its stable id, so a second press is a no-op', () => {
    const c = cand({ kind: 'task', key: 'coach', title: 'Book a coach' })
    expect(deployState(c, ctx())).toEqual({ kind: 'ready' })
    expect(deployState(c, ctx({ taskIds: new Set([shelfTaskId('dream-1', 'coach')]) })))
      .toEqual({ kind: 'done' })
  })

  it('matches a basic by name, because life support ids are its own', () => {
    const c = cand({ kind: 'basic', key: 'sleep', title: 'Sleep 7h' })
    expect(deployState(c, ctx({ basics: new Set(['sleep 7h']) }))).toEqual({ kind: 'done' })
  })

  it('needs no uplink for a task or a basic', () => {
    expect(deployState(cand({ kind: 'task' }), ctx({ goal: null }))).toEqual({ kind: 'ready' })
    expect(deployState(cand({ kind: 'basic' }), ctx({ goal: null }))).toEqual({ kind: 'ready' })
  })

  it('is done for a proof once its act carries that boss', () => {
    const c = cand({ kind: 'proof', act: 'pipeline', title: 'A self-tape submitted' })
    expect(deployState(c, ctx())).toEqual({ kind: 'ready' })

    const g = goal()
    g.chapters[1].boss = { title: 'A self-tape submitted', requirement: { minScore: 0.7 }, completedAt: null }
    expect(deployState(c, ctx({ goal: g }))).toEqual({ kind: 'done' })
  })
})

describe('applyToGoal', () => {
  it('adds a routine to its act as a node, not as a habit', () => {
    const g = applyToGoal(goal(), cand())!
    expect(g.nodes.map(n => n.id)).toEqual(['goal-crossing:shadow'])
    expect(g.chapters[0].nodeIds).toEqual(['goal-crossing:shadow'])
    // Rule 1: nothing installs itself. Installing is still the operator's call.
    expect(g.nodes[0].scrapTaskId).toBe('')
    expect(g.nodes[0].cue).toBe('after coffee')
  })

  it('deepening an act ends its planned state', () => {
    const g = applyToGoal(goal(), cand({ act: 'pipeline' }))!
    expect(g.chapters[1].planned).toBe(false)
    expect(g.chapters[1].nodeIds).toHaveLength(1)
  })

  it('leaves an untouched planned act planned', () => {
    const g = applyToGoal(goal(), cand())!
    expect(g.chapters[1].planned).toBe(true)
  })

  it('is a no-op on a second press', () => {
    const once = applyToGoal(goal(), cand())!
    expect(applyToGoal(once, cand())).toBeNull()
  })

  it('refuses a candidate whose act is not there', () => {
    expect(applyToGoal(goal(), cand({ act: 'ghost' }))).toBeNull()
  })

  it('drops a prerequisite naming a sibling that was never deployed', () => {
    const g = applyToGoal(goal(), cand({ after: ['never-deployed'] }))!
    expect(g.nodes[0].prerequisiteIds).toEqual([])
  })

  it('keeps a prerequisite that is already in the protocol', () => {
    const first  = applyToGoal(goal(), cand())!
    const second = applyToGoal(first, cand({ key: 'monologue', title: 'Record', after: ['shadow'] }))!
    expect(second.nodes[1].prerequisiteIds).toEqual(['goal-crossing:shadow'])
  })

  it('writes a proof onto its act as the boss', () => {
    const g = applyToGoal(goal(), cand({ kind: 'proof', act: 'pipeline', title: 'A self-tape submitted' }))!
    expect(g.chapters[1].boss?.title).toBe('A self-tape submitted')
    expect(g.chapters[1].boss?.completedAt).toBeNull()
  })

  it('never touches the goal for a task or a basic', () => {
    expect(applyToGoal(goal(), cand({ kind: 'task' }))).toBeNull()
    expect(applyToGoal(goal(), cand({ kind: 'basic' }))).toBeNull()
  })

  it('does not disturb a routine that is already carrying a habit', () => {
    const live = goal({ nodes: [{
      id: 'goal-crossing:live', goalId: 'goal-crossing', title: 'Live one', cue: 'c', tier: 2,
      thresholds: ['a'], thresholdIndex: 0, unlocksAt: 0.6, prerequisiteIds: [],
      unlockedAt: '2026-02-01T00:00:00.000Z', toolId: null, scrapTaskId: 'chain:goal-crossing:live',
    }] })
    live.chapters[0].nodeIds = ['goal-crossing:live']

    const g = applyToGoal(live, cand())!
    const kept = g.nodes.find(n => n.id === 'goal-crossing:live')!
    expect(kept.scrapTaskId).toBe('chain:goal-crossing:live')
    expect(kept.unlockedAt).toBe('2026-02-01T00:00:00.000Z')
  })
})
