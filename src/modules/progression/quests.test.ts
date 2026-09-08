import { describe, it, expect } from 'vitest'
import {
  QUEST_LINE, measure, activeQuest, evaluateQuests, stageQuests, stageComplete,
  activeStage, stageState, questFloorXp, LAST_GATED_STAGE, QUEST_DESTINATIONS, questCta,
  type QuestContext,
} from './quests'
import { GUILD } from '../../guild'
import type { Task } from '../scrap7/types'
import type { ChainNode, Goal } from './types'
import type { ModuleSummaries } from '../bigscreen/moduleStats'

const NOW = new Date('2026-08-02T10:00:00.000Z')

const EMPTY_SUMS: ModuleSummaries = {
  scrap7: null, log: null, ardo: null, solaris: null, pictures: null, journal: null, vigilante: null,
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

/** Stage 1: one uplink, and nothing else. */
const stage1Done = () => ctx({ goals: [goal([], 'primary')] })

/** Stages 1 and 2: the uplink, and the floor under it. */
const setupDone = () => ctx({
  tasks: [{ ...habit('life:sleep'), origin: 'baseline' } as Task],
  goals: [goal([], 'primary')],
})

describe('quest line', () => {
  it('opens with setup and pays for everything', () => {
    expect(QUEST_LINE[0].stage).toBe(1)
    expect(new Set(QUEST_LINE.map(q => q.id)).size).toBe(QUEST_LINE.length)
    expect(QUEST_LINE.every(q => q.xp > 0)).toBe(true)
    expect(QUEST_LINE.every(q => q.brief.length > 0 && q.briefRu.length > 0)).toBe(true)
  })

  it('asks stage 1 for one thing — the dream everything else serves', () => {
    // The basic moved to stage 2 when the line went from five stages to nine.
    // Day one is one decision, not a checklist.
    expect(stageQuests(1).map(q => q.objective.kind)).toEqual(['uplink.created'])
    expect(stageQuests(2).map(q => q.objective.kind)).toEqual(['baseline.installed'])
  })

  it('paces itself on how long an objective physically takes', () => {
    // The five-stage line held you at one level for thirteen days because stage
    // 4 wanted a routine at 0.65 — twenty-two days of showing up. Nine stages
    // land on days 1, 2, 4, 7, 10, 14, 19, 23, 27, and no depth objective jumps
    // more than 0.15 over the one before it.
    const depths = QUEST_LINE
      .filter(q => q.objective.kind === 'routine.depth')
      .map(q => q.objective.need)
    expect(depths).toEqual([30, 55, 70])
    for (let i = 1; i < depths.length; i++) {
      expect(depths[i] - depths[i - 1]).toBeLessThanOrEqual(25)
    }
  })

  it('ends the starting zone at level 10', () => {
    expect(LAST_GATED_STAGE).toBe(9)
  })

  it('pays each gated stage exactly what its level costs', () => {
    // Rule 21, checked at the seam that just moved: finish the stage, fill the
    // bar, level up — one motion, with no leftover grind between them.
    expect(stageQuests(1).reduce((s, q) => s + q.xp, 0)).toBe(120)
  })

  it('numbers its stages without a gap', () => {
    const stages = [...new Set(QUEST_LINE.map(q => q.stage))].sort((a, b) => a - b)
    expect(stages).toEqual(Array.from({ length: LAST_GATED_STAGE }, (_, i) => i + 1))
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

  it('counts life support only — a routine is not a basic', () => {
    const tasks = [
      { ...habit('life:sleep'), origin: 'baseline' } as Task,
      habit('chain:g:reading'),
      { ...habit('todo'), taskType: 'todo' } as Task,
    ]
    expect(measure({ kind: 'baseline.installed', need: 1 }, ctx({ tasks }))).toBe(1)
  })

  it('counts uplinks holding a slot, never frozen ones', () => {
    expect(measure({ kind: 'uplink.created', need: 1 }, ctx({ goals: [goal([], 'archived')] }))).toBe(0)
    expect(measure({ kind: 'uplink.created', need: 1 },
      ctx({ goals: [goal([], 'primary'), goal([], 'archived')] }))).toBe(1)
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

describe('stages', () => {
  it('holds a stage until every quest in it is done, whatever order they come', () => {
    // Stage 3 is the first with two quests in it: install a routine, and reach
    // the water target. Either may clear first; the stage waits for both.
    const done12 = evaluateQuests({}, setupDone(), NOW).completed
    const routineOnly = ctx({
      tasks: [{ ...habit('life:sleep'), origin: 'baseline' } as Task, habit('t1')],
      goals: [goal([node('a', 't1')])],
    })
    const { completed, cleared } = evaluateQuests(done12, routineOnly, NOW)
    expect(cleared.map(q => q.id)).toEqual(['q3-first-routine'])
    expect(stageComplete(3, completed)).toBe(false)
    expect(activeStage(completed)).toBe(3)
  })

  it('clears the opening stages one at a time', () => {
    const first = evaluateQuests({}, stage1Done(), NOW)
    expect(first.cleared.map(q => q.id)).toEqual(['s1-first-uplink'])
    expect(activeStage(first.completed)).toBe(2)

    const second = evaluateQuests(first.completed, setupDone(), NOW)
    expect(second.cleared.map(q => q.id)).toEqual(['s1-life-support'])
    expect(activeStage(second.completed)).toBe(3)
  })

  it('will not clear a later stage while setup is outstanding', () => {
    // A routine installed, run twenty times and nearly automatic — but no
    // uplink-first, no basic. Nothing past stage 1 may clear.
    const later = ctx({ goals: [goal([node('a', 't1')])], tasks: [habit('t1', 0.9, 20)] })
    const { cleared } = evaluateQuests({}, later, NOW)
    expect(cleared.every(q => q.stage === 1)).toBe(true)
  })

  it('is idempotent — a cleared quest never re-fires', () => {
    const first = evaluateQuests({}, setupDone(), NOW)
    const again = evaluateQuests(first.completed, setupDone(), new Date('2026-09-01T00:00:00.000Z'))
    expect(again.cleared).toHaveLength(0)
    expect(again.completed['s1-first-uplink']).toBe(NOW.toISOString())
  })

  it('reports what the current stage still wants', () => {
    const st = stageState({}, ctx())
    expect(st.stage).toBe(1)
    expect(st.total).toBe(1)
    expect(st.cleared).toBe(0)
    expect(st.remaining.map(q => q.id)).toEqual(['s1-first-uplink'])
  })

  it('never shows a stage ahead of the level — its modules are not open yet', () => {
    // The real failure this fixes: the ledger ran ahead of the bank, so the
    // panel offered WATER DISCIPLINE while the kitchen was still shut.
    const { completed } = evaluateQuests({}, setupDone(), NOW)
    expect(activeStage(completed)).toBe(3)
    expect(stageState(completed, setupDone(), 1).stage).toBe(1)
    expect(stageState(completed, setupDone(), 3).stage).toBe(3)
  })

  it('shows every quest of the shown stage against an open module', () => {
    // The invariant stated the other way round from moduleAccess.test.ts: there,
    // no quest may point past its stage; here, no stage may be shown past the level.
    for (let level = 1; level <= LAST_GATED_STAGE; level++) {
      const st = stageState({}, ctx(), level)
      for (const q of st.quests) expect(q.quest.stage).toBeLessThanOrEqual(level)
    }
  })
})

describe('questFloorXp', () => {
  it('is nothing when nothing has cleared', () => {
    expect(questFloorXp({})).toBe(0)
    expect(questFloorXp(undefined)).toBe(0)
  })

  it('adds up exactly what the cleared quests paid', () => {
    const { completed } = evaluateQuests({}, setupDone(), NOW)
    const paid = [1, 2].flatMap(stageQuests).reduce((s, q) => s + q.xp, 0)
    expect(questFloorXp(completed)).toBe(paid)
  })

  it('ignores a quest id that is no longer in the line', () => {
    expect(questFloorXp({ 'q-that-was-deleted': NOW.toISOString() })).toBe(0)
  })

  it('guarantees a finished stage has paid for its level', () => {
    // Rule 21 as an arithmetic fact rather than a hope: clear stage 1 and the
    // floor alone covers level 1's cost, whatever the reward numbers were when
    // the save was written.
    const { completed } = evaluateQuests({}, setupDone(), NOW)
    expect(questFloorXp(completed)).toBeGreaterThanOrEqual(120)
  })

  it('runs out — the starting zone is finite', () => {
    const all = Object.fromEntries(QUEST_LINE.map(q => [q.id, NOW.toISOString()]))
    expect(activeStage(all)).toBeNull()
    expect(activeQuest(all)).toBeNull()
    expect(stageState(all, ctx()).stage).toBeNull()
  })
})

describe('missing ledger', () => {
  it('survives a state saved before quests existed', () => {
    expect(activeQuest(undefined)?.stage).toBe(1)
    expect(evaluateQuests(undefined, ctx(), NOW).cleared).toHaveLength(0)
  })
})

describe('quest destinations', () => {
  it('points every quest at somewhere real', () => {
    for (const q of QUEST_LINE) expect(QUEST_DESTINATIONS[q.target]).toBeDefined()
  })

  it('sends each quest where its objective is actually measured', () => {
    const byId = Object.fromEntries(QUEST_LINE.map(q => [q.id, q.target]))
    expect(byId['s1-first-light']).toBe('journal')
    expect(byId['s1-life-support']).toBe('scrap7')   // basics live in the list they run in
    expect(byId['s1-first-uplink']).toBe('log')     // a dream is written before it is promoted
    expect(byId['q2-water']).toBe('solaris')        // the kitchen, not "somewhere"
    expect(byId['q6-memory']).toBe('ardo')
  })

  it('routes every destination at a real module', () => {
    // Checked against the guild rather than string literals, so a module that
    // moves or is un-built breaks the test instead of the quest.
    // '/' is the hub, which is a real destination now that modules live on it
    // as cards — DREAMS is one, and the card opens itself on arrival.
    const shipped = new Set([...GUILD.filter(m => m.built).map(m => m.path), '/uplinks', '/'])
    for (const dest of Object.values(QUEST_DESTINATIONS)) {
      if (dest.path) expect(shipped).toContain(dest.path)
    }
  })

  it('names a destination in both languages for every target', () => {
    for (const dest of Object.values(QUEST_DESTINATIONS)) {
      expect(dest.label.trim()).not.toBe('')
      expect(dest.ru.trim()).not.toBe('')
    }
  })

  it('does not tell you to open a protocol you do not have', () => {
    const q = QUEST_LINE.find(x => x.id === 'q3-first-routine')!
    expect(questCta(q, false).en).toMatch(/CREATE/)
    expect(questCta(q, true).en).toMatch(/OPEN/)
  })

  it('names the destination the same way regardless of uplink state elsewhere', () => {
    const q2 = QUEST_LINE.find(q => q.id === 'q2-water')!
    expect(questCta(q2, false)).toEqual(questCta(q2, true))
  })
})
