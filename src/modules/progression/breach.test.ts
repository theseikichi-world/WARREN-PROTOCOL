import { describe, it, expect } from 'vitest'
import { clearBreach } from './store'
import { chapterState, goalComplete } from './chain'
import { runXp, baseXp, awardXp } from './xp'
import type { Chapter, ChainNode, Goal, ProgressionState } from './types'
import type { Task } from '../scrap7/types'

const NOW = new Date('2026-06-12T09:00:00')

const node = (key: string): ChainNode => ({
  id: `g:${key}`, goalId: 'g', title: key, cue: 'after coffee', tier: 2,
  thresholds: ['once'], thresholdIndex: 0, unlocksAt: 0.6, prerequisiteIds: [],
  unlockedAt: NOW.toISOString(), toolId: null, scrapTaskId: `chain:g:${key}`,
})

const habit = (key: string, score: number): Task => ({
  id: `chain:g:${key}`, text: key, category: 'x', taskType: 'habit',
  completed: false, createdAt: NOW.toISOString(), origin: 'chain', score,
})

const chapter = (index: number, keys: string[], boss: string | null, cleared = false): Chapter => ({
  index, title: `Act ${index}`, nodeIds: keys.map(k => `g:${k}`),
  boss: boss ? { title: boss, requirement: { minScore: 0.70 },
                 completedAt: cleared ? NOW.toISOString() : null } : null,
})

const goal = (chapters: Chapter[], keys: string[]): Goal => ({
  id: 'g', title: 'G', slot: 'primary', chapters, nodes: keys.map(node),
  createdAt: NOW.toISOString(), lastSlotChangeAt: NOW.toISOString(),
})

const state = (g: Goal): ProgressionState =>
  ({ goals: [g], seeded: true, xp: 0, quests: {} })

describe('the breach decides its act', () => {
  it('completes the chapter even when the routines are behind', () => {
    // You sat the exam and passed. A mock-test habit at 0.4 does not un-happen
    // that, and the app does not get to disagree with reality.
    const g = goal([chapter(1, ['a'], 'The exam', true)], ['a'])
    const st = chapterState(g.chapters[0], g, [habit('a', 0.4)])

    expect(st.breachReady).toBe(false)
    expect(st.complete).toBe(true)
  })

  it('leaves it open while the event has not happened, however trained you are', () => {
    const g = goal([chapter(1, ['a'], 'The exam')], ['a'])
    const st = chapterState(g.chapters[0], g, [habit('a', 1)])

    expect(st.breachReady).toBe(true)
    expect(st.complete).toBe(false)
  })

  it('still gates a chapter with no event on the scores alone', () => {
    const g = goal([chapter(1, ['a'], null)], ['a'])
    expect(chapterState(g.chapters[0], g, [habit('a', 0.4)]).complete).toBe(false)
    expect(chapterState(g.chapters[0], g, [habit('a', 0.8)]).complete).toBe(true)
  })
})

describe('clearing a breach', () => {
  const tasks = [habit('a', 0.2), habit('b', 0.2)]

  it('banks the largest award in the game', () => {
    const g = goal([chapter(1, ['a'], 'Act one event'), chapter(2, ['b'], 'The exam')], ['a', 'b'])
    const r = clearBreach(state(g), 'g', 1, tasks, NOW)

    expect(r.gained).toBe(300)
    expect(r.state.goals[0].chapters[0].boss?.completedAt).toBe(NOW.toISOString())
    expect(r.goalDone).toBe(false)
  })

  it('pays the slot rate the work was done at', () => {
    const g = { ...goal([chapter(1, ['a'], 'Event')], ['a']), slot: 'secondary' as const }
    // The only chapter, so finishing lands too: (300 + 500) × 0.6
    expect(clearBreach(state(g), 'g', 1, tasks, NOW).gained).toBe(480)
  })

  it('finishes the uplink on the last chapter, and releases its bandwidth', () => {
    const g = goal([chapter(1, ['a'], 'Event', true), chapter(2, ['b'], 'The exam')], ['a', 'b'])
    const r = clearBreach(state(g), 'g', 2, tasks, NOW)

    expect(r.goalDone).toBe(true)
    // The ending pays on top of the act that ended it, never instead of it.
    expect(r.gained).toBe(800)
    expect(r.events.map(e => e.kind)).toEqual(['breach.cleared', 'uplink.complete'])
    expect(r.state.goals[0].completedAt).toBe(NOW.toISOString())
    // Finished, not abandoned — but the slot it cost really is free now.
    expect(r.state.goals[0].slot).toBe('archived')
  })

  it('pays once — an event does not happen twice', () => {
    const g = goal([chapter(1, ['a'], 'Event', true)], ['a'])
    expect(clearBreach(state(g), 'g', 1, tasks, NOW).gained).toBe(0)
  })

  it('has nothing to clear on a chapter with no event', () => {
    const g = goal([chapter(1, ['a'], null)], ['a'])
    expect(clearBreach(state(g), 'g', 1, tasks, NOW).gained).toBe(0)
  })

  it('knows a goal is finished only when every chapter is', () => {
    const g = goal([chapter(1, ['a'], 'One', true), chapter(2, ['b'], 'Two')], ['a', 'b'])
    expect(goalComplete(g, tasks)).toBe(false)
    expect(goalComplete(goal([chapter(1, ['a'], 'One', true)], ['a']), tasks)).toBe(true)
  })
})

describe('a run is paid for what it cost', () => {
  it('pays full on a routine you still have to decide to do', () => {
    expect(runXp(2, 0)).toBe(16)
    expect(baseXp({ kind: 'routine.run', tier: 2 })).toBe(16)   // absent score = fresh
  })

  it('tapers as the routine becomes automatic', () => {
    expect(runXp(2, 0.70)).toBe(10)
    expect(runXp(2, 1)).toBe(8)
    // Never to zero: the habit still pays, forever. It just stops being the
    // most efficient thing in the app to farm.
    expect(runXp(1, 1)).toBeGreaterThan(0)
  })

  it('keeps tier as the effort weight it always was', () => {
    expect(runXp(4, 0)).toBe(32)
    expect(runXp(4, 0)).toBeGreaterThan(runXp(1, 0))
  })

  it('still leaves a cleared breach worth more than a week of one routine', () => {
    expect(awardXp({ kind: 'breach.cleared' }, 'primary')).toBeGreaterThan(runXp(4, 0) * 7)
  })
})
