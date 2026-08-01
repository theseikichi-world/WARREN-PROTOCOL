import { describe, it, expect } from 'vitest'
import {
  QUEST_LINE, measure, questProgress, activeQuest, evaluateQuests,
  type QuestContext,
} from './quests'
import type { Task } from '../scrap7/types'
import type { ChainNode, Goal } from './types'
import type { ModuleSummaries } from '../bigscreen/moduleStats'

const NOW = new Date('2026-08-02T10:00:00.000Z')

const EMPTY_SUMS: ModuleSummaries = {
  scrap7: null, log: null, ardo: null, solaris: null, pictures: null, journal: null,
}

const node = (id: string, taskId = ''): ChainNode => ({
  id, goalId: 'g', title: id, cue: 'cue', tier: 2, thresholds: ['a'], thresholdIndex: 0,
  unlocksAt: 0.6, prerequisiteIds: [], unlockedAt: NOW.toISOString(), toolId: null, scrapTaskId: taskId,
})
const goal = (nodes: ChainNode[], slot: Goal['slot'] = 'primary'): Goal => ({
  id: 'g', title: 'G', slot, nodes, chapters: [], createdAt: '', lastSlotChangeAt: '',
})
const habit = (id: string, score = 0, runs = 0): Task => ({
  id, text: id, category: 'G', taskType: 'habit', completed: false, createdAt: '',
  origin: 'chain', score, trackingHistory: Array.from({ length: runs }, (_, i) => `2026-07-${10 + i}`),
} as Task)

const ctx = (over: Partial<QuestContext> = {}): QuestContext =>
  ({ sums: EMPTY_SUMS, goals: [], tasks: [], ...over })

describe('quest line', () => {
  it('introduces one instrument at a time, in order', () => {
    expect(QUEST_LINE.map(q => q.id)[0]).toBe('q1-first-light')
    // no duplicate ids, every quest pays something
    expect(new Set(QUEST_LINE.map(q => q.id)).size).toBe(QUEST_LINE.length)
    expect(QUEST_LINE.every(q => q.xp > 0)).toBe(true)
    expect(QUEST_LINE.every(q => q.brief.length > 0 && q.briefRu.length > 0)).toBe(true)
  })
})

describe('measure', () => {
  it('reads the journal', () => {
    const sums = { ...EMPTY_SUMS, journal: { streak: 4, writtenToday: true, stickers: 2, entries: 9 } }
    expect(measure({ kind: 'journal.entries', need: 1 }, ctx({ sums }))).toBe(9)
    expect(measure({ kind: 'journal.streak', need: 7 }, ctx({ sums }))).toBe(4)
  })

  it('reads hydration only — calories are not this quest', () => {
    const sums = { ...EMPTY_SUMS, solaris: { member: 'You', kcalLeft: 0, kcalPct: 100, macros: [], waterPct: 55 } }
    expect(measure({ kind: 'hydration.today', need: 80 }, ctx({ sums }))).toBe(55)
  })

  it('counts installed routines, ignoring frozen goals and uninstalled nodes', () => {
    const live   = goal([node('a', 't1'), node('b')])
    const frozen = goal([node('c', 't2')], 'archived')
    expect(measure({ kind: 'routine.installed', need: 1 }, ctx({ goals: [live, frozen] }))).toBe(1)
  })

  it('counts runs across every chain habit', () => {
    const tasks = [habit('t1', 0, 4), habit('t2', 0, 3), { ...habit('m1', 0, 99), origin: 'manual' } as Task]
    expect(measure({ kind: 'routine.runs', need: 7 }, ctx({ tasks }))).toBe(7)   // manual excluded
  })

  it('reports the deepest routine for depth', () => {
    const g = goal([node('a', 't1'), node('b', 't2')])
    const tasks = [habit('t1', 0.42), habit('t2', 0.67)]
    expect(measure({ kind: 'routine.depth', need: 65 }, ctx({ goals: [g], tasks }))).toBe(67)
  })

  it('returns zero rather than throwing when a module is untouched', () => {
    expect(measure({ kind: 'ardo.texts', need: 1 }, ctx())).toBe(0)
    expect(measure({ kind: 'routine.depth', need: 65 }, ctx())).toBe(0)
  })
})

describe('questProgress', () => {
  it('caps the ratio at 1 and flags completion', () => {
    const sums = { ...EMPTY_SUMS, journal: { streak: 0, writtenToday: true, stickers: 0, entries: 5 } }
    const p = questProgress(QUEST_LINE[0], ctx({ sums }))
    expect(p.have).toBe(5)
    expect(p.ratio).toBe(1)
    expect(p.done).toBe(true)
  })
})

describe('evaluateQuests', () => {
  it('clears the first quest once the record supports it', () => {
    const sums = { ...EMPTY_SUMS, journal: { streak: 0, writtenToday: true, stickers: 0, entries: 1 } }
    const { completed, cleared } = evaluateQuests({}, ctx({ sums }), NOW)
    expect(cleared.map(q => q.id)).toEqual(['q1-first-light'])
    expect(completed['q1-first-light']).toBe(NOW.toISOString())
  })

  it('will not skip ahead when a later objective is met first', () => {
    // Plenty of A.R.D.O texts, but the journal was never opened
    const sums = { ...EMPTY_SUMS, ardo: { due: 0, texts: 3, mastery: 20, next: 'x' } }
    const { cleared } = evaluateQuests({}, ctx({ sums }), NOW)
    expect(cleared).toHaveLength(0)
  })

  it('cascades when several are satisfied at once', () => {
    const sums = {
      ...EMPTY_SUMS,
      journal: { streak: 0, writtenToday: true, stickers: 0, entries: 2 },
      solaris: { member: 'You', kcalLeft: 0, kcalPct: 50, macros: [], waterPct: 95 },
    }
    const { cleared } = evaluateQuests({}, ctx({ sums }), NOW)
    expect(cleared.map(q => q.id)).toEqual(['q1-first-light', 'q2-water'])
  })

  it('is idempotent — a cleared quest never re-fires', () => {
    const sums = { ...EMPTY_SUMS, journal: { streak: 0, writtenToday: true, stickers: 0, entries: 1 } }
    const first = evaluateQuests({}, ctx({ sums }), NOW)
    const again = evaluateQuests(first.completed, ctx({ sums }), new Date('2026-09-01T00:00:00.000Z'))
    expect(again.cleared).toHaveLength(0)
    expect(again.completed['q1-first-light']).toBe(NOW.toISOString())
  })
})

describe('missing ledger', () => {
  it('survives a state saved before quests existed', () => {
    expect(activeQuest(undefined)?.id).toBe('q1-first-light')
    expect(evaluateQuests(undefined, ctx(), NOW).cleared).toHaveLength(0)
  })
})

describe('activeQuest', () => {
  it('points at the front of the line', () => {
    expect(activeQuest({})?.id).toBe('q1-first-light')
    expect(activeQuest({ 'q1-first-light': NOW.toISOString() })?.id).toBe('q2-water')
  })
  it('returns null when the starting zone is finished', () => {
    const all = Object.fromEntries(QUEST_LINE.map(q => [q.id, NOW.toISOString()]))
    expect(activeQuest(all)).toBeNull()
  })
})
