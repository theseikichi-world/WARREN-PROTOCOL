import { describe, it, expect } from 'vitest'
import {
  routineTaskId, nodeScore, isUnlocked, unlockRequirements, canUnlock,
  evaluateUnlocks, chapterState, activeChapter,
} from './chain'
import type { Task } from '../scrap7/types'
import type { ChainNode, Chapter, Goal } from './types'

const NOW = new Date('2026-08-01T10:00:00.000Z')

const node = (key: string, after: string[] = [], p: Partial<ChainNode> = {}): ChainNode => ({
  id: key, goalId: 'g', title: key.toUpperCase(), cue: 'after coffee', tier: 2,
  thresholds: ['10 min', '20 min'], thresholdIndex: 0, unlocksAt: 0.60,
  prerequisiteIds: after, unlockedAt: after.length === 0 ? new Date(0).toISOString() : null,
  toolId: null, scrapTaskId: '', ...p,
})

const habit = (id: string, score: number): Task => ({
  id, text: id, category: 'G', taskType: 'habit', completed: false,
  createdAt: NOW.toISOString(), origin: 'chain', score,
} as Task)

const goal = (nodes: ChainNode[], chapters: Chapter[] = []): Goal => ({
  id: 'g', title: 'G', slot: 'primary', nodes, chapters,
  createdAt: NOW.toISOString(), lastSlotChangeAt: NOW.toISOString(),
})

const chapter = (nodeIds: string[], boss: Chapter['boss'] = null): Chapter =>
  ({ index: 1, title: 'C', nodeIds, boss })

describe('routineTaskId', () => {
  it('is deterministic — the idempotency key for habit creation', () => {
    const n = node('reading')
    expect(routineTaskId(n)).toBe('chain:reading')
    expect(routineTaskId(n)).toBe(routineTaskId({ ...n }))
  })
})

describe('nodeScore', () => {
  it('reads the linked habit, and falls back to the deterministic id', () => {
    const n = node('reading')
    expect(nodeScore(n, [habit('chain:reading', 0.42)])).toBe(0.42)
    expect(nodeScore({ ...n, scrapTaskId: 'chain:reading' }, [habit('chain:reading', 0.7)])).toBe(0.7)
  })
  it('is zero when no habit exists yet', () => {
    expect(nodeScore(node('reading'), [])).toBe(0)
  })
})

describe('unlockRequirements', () => {
  it('reports need vs have per prerequisite', () => {
    const reading = node('reading')
    const diction = node('diction', ['reading'])
    const g = goal([reading, diction])
    const [req] = unlockRequirements(diction, g, [habit('chain:reading', 0.41)])
    expect(req).toEqual({ nodeId: 'reading', title: 'READING', need: 0.60, have: 0.41, met: false })
  })

  it('marks a requirement met at exactly the threshold', () => {
    const g = goal([node('reading'), node('diction', ['reading'])])
    const [req] = unlockRequirements(g.nodes[1], g, [habit('chain:reading', 0.60)])
    expect(req.met).toBe(true)
    expect(canUnlock(g.nodes[1], g, [habit('chain:reading', 0.60)])).toBe(true)
  })

  it('requires EVERY prerequisite for a multi-prereq routine', () => {
    const g = goal([node('a'), node('b'), node('roda', ['a', 'b'])])
    const roda = g.nodes[2]
    expect(canUnlock(roda, g, [habit('chain:a', 0.9), habit('chain:b', 0.3)])).toBe(false)
    expect(canUnlock(roda, g, [habit('chain:a', 0.9), habit('chain:b', 0.7)])).toBe(true)
  })

  it('treats an entry point as immediately open', () => {
    expect(isUnlocked(node('reading'))).toBe(true)
    expect(unlockRequirements(node('reading'), goal([node('reading')]), [])).toEqual([])
  })
})

describe('evaluateUnlocks', () => {
  it('opens a routine once its prerequisite is integrated', () => {
    const g = goal([node('reading'), node('diction', ['reading'])])
    const { goal: next, newlyUnlocked } = evaluateUnlocks(g, [habit('chain:reading', 0.62)], NOW)
    expect(newlyUnlocked.map(n => n.id)).toEqual(['diction'])
    expect(next.nodes[1].unlockedAt).toBe(NOW.toISOString())
  })

  it('is idempotent — re-running never re-opens or duplicates', () => {
    const g = goal([node('reading'), node('diction', ['reading'])])
    const tasks = [habit('chain:reading', 0.62)]
    const first = evaluateUnlocks(g, tasks, NOW)
    const again = evaluateUnlocks(first.goal, tasks, new Date('2026-09-01T00:00:00.000Z'))
    expect(again.newlyUnlocked).toHaveLength(0)
    expect(again.goal).toBe(first.goal)                       // same reference: no write needed
    expect(again.goal.nodes[1].unlockedAt).toBe(NOW.toISOString())   // original timestamp kept
  })

  it('leaves everything shut when nothing qualifies', () => {
    const g = goal([node('reading'), node('diction', ['reading'])])
    const { goal: next, newlyUnlocked } = evaluateUnlocks(g, [habit('chain:reading', 0.2)], NOW)
    expect(newlyUnlocked).toHaveLength(0)
    expect(next).toBe(g)
  })
})

describe('chapterState', () => {
  it('gates on ALL routines, not a node count', () => {
    const g = goal([node('a'), node('b'), node('c')], [chapter(['a', 'b', 'c'])])
    const partly = chapterState(g.chapters[0], g, [habit('chain:a', 0.8), habit('chain:b', 0.8), habit('chain:c', 0.5)])
    expect(partly.atThreshold).toBe(2)
    expect(partly.breachReady).toBe(false)

    const all = chapterState(g.chapters[0], g, [habit('chain:a', 0.7), habit('chain:b', 0.75), habit('chain:c', 0.9)])
    expect(all.breachReady).toBe(true)
    expect(all.complete).toBe(true)          // no boss → gating alone completes it
  })

  it('holds a chapter open until its breach is cleared', () => {
    const boss = { title: 'A self-tape shot and submitted', requirement: { minScore: 0.70 }, completedAt: null }
    const g = goal([node('a')], [chapter(['a'], boss)])
    const tasks = [habit('chain:a', 0.9)]
    expect(chapterState(g.chapters[0], g, tasks).breachReady).toBe(true)
    expect(chapterState(g.chapters[0], g, tasks).complete).toBe(false)

    const cleared = goal([node('a')], [chapter(['a'], { ...boss, completedAt: NOW.toISOString() })])
    expect(chapterState(cleared.chapters[0], cleared, tasks).complete).toBe(true)
  })

  it('counts a two-routine chapter as legitimately complete', () => {
    // ACTOR chapter 1: reading + diction, both at 0.70 — no padding to four
    const g = goal([node('reading'), node('diction', ['reading'])], [chapter(['reading', 'diction'])])
    const st = chapterState(g.chapters[0], g, [habit('chain:reading', 0.71), habit('chain:diction', 0.7)])
    expect(st.total).toBe(2)
    expect(st.complete).toBe(true)
  })
})

describe('activeChapter', () => {
  it('points at the first chapter still in play', () => {
    const g = goal(
      [node('a'), node('b')],
      [chapter(['a']), { ...chapter(['b']), index: 2 }],
    )
    expect(activeChapter(g, [])?.nodeIds).toEqual(['a'])
    expect(activeChapter(g, [habit('chain:a', 0.8)])?.nodeIds).toEqual(['b'])
  })
  it('returns null once every chapter is done', () => {
    const g = goal([node('a')], [chapter(['a'])])
    expect(activeChapter(g, [habit('chain:a', 0.9)])).toBeNull()
  })
})
