import { describe, it, expect } from 'vitest'
import { baseXp, awardXp, levelCost, levelFor, gatedLevel, levelCap, isUnlockedAt, nextGate, GATES } from './xp'
import { stageQuests, LAST_GATED_STAGE } from './quests'
import { deriveStats, overallRating } from './stats'
import type { Task } from '../scrap7/types'
import type { ChainNode, Goal } from './types'
import type { ModuleSummaries } from '../bigscreen/moduleStats'

describe('xp awards', () => {
  it('weights a run by the tier it costs', () => {
    expect(baseXp({ kind: 'routine.run', tier: 1 })).toBe(8)
    expect(baseXp({ kind: 'routine.run', tier: 4 })).toBe(32)
  })

  it('pays the secondary uplink at 0.6× and the archive nothing', () => {
    expect(awardXp({ kind: 'routine.run', tier: 2 }, 'primary')).toBe(16)
    expect(awardXp({ kind: 'routine.run', tier: 2 }, 'secondary')).toBe(10)   // 16 × 0.6
    expect(awardXp({ kind: 'routine.run', tier: 2 }, 'archived')).toBe(0)
  })

  it('applies the fuel multiplier on top', () => {
    expect(awardXp({ kind: 'breach.cleared' }, 'primary', 1.2)).toBe(240)
    expect(awardXp({ kind: 'breach.cleared' }, 'primary', 0.8)).toBe(160)
  })
})

describe('level curve', () => {
  it('starts at level 1 with nothing banked', () => {
    expect(levelFor(0)).toEqual({ level: 1, intoNext: 0, needed: 40, progress: 0 })
  })

  it('levels exactly at the cost boundary', () => {
    expect(levelFor(levelCost(1) - 1).level).toBe(1)
    expect(levelFor(levelCost(1)).level).toBe(2)
  })

  it('gets steeper each level', () => {
    expect(levelCost(2)).toBeGreaterThan(levelCost(1))
    expect(levelCost(5)).toBe(1000)
  })

  it('reports progress toward the next level', () => {
    const s = levelFor(levelCost(1) + 80)
    expect(s.level).toBe(2)
    expect(s.intoNext).toBe(80)
    expect(s.progress).toBeCloseTo(80 / s.needed)
  })

  it('never goes negative or fractional', () => {
    expect(levelFor(-500).level).toBe(1)
    expect(levelFor(123.7).intoNext).toBe(83)
  })
})

describe('level gates', () => {
  it('opens the second uplink only at level 5', () => {
    expect(isUnlockedAt('secondary', 4)).toBe(false)
    expect(isUnlockedAt('secondary', 5)).toBe(true)
  })
  it('gives the first uplink from the start', () => {
    expect(isUnlockedAt('primary', 1)).toBe(true)
  })
  it('names the next thing being held back', () => {
    expect(nextGate(1)?.key).toBe('inventory')
    expect(nextGate(GATES[GATES.length - 1].level)).toBeNull()
  })
})

// ─── stats ────────────────────────────────────────────────────────────────────

const node = (id: string, taskId = ''): ChainNode => ({
  id, goalId: 'g', title: id, cue: 'cue', tier: 2, thresholds: ['a'], thresholdIndex: 0,
  unlocksAt: 0.6, prerequisiteIds: [], unlockedAt: new Date(0).toISOString(),
  toolId: null, scrapTaskId: taskId,
})
const goal = (nodes: ChainNode[], slot: Goal['slot'] = 'primary'): Goal => ({
  id: 'g', title: 'G', slot, nodes, chapters: [], createdAt: '', lastSlotChangeAt: '',
})
const habit = (id: string, score: number, streak = 0): Task =>
  ({ id, text: id, category: 'G', taskType: 'habit', completed: false, createdAt: '',
     origin: 'chain', score, streak } as Task)

const EMPTY: ModuleSummaries = {
  scrap7: null, log: null, ardo: null, solaris: null, pictures: null, journal: null,
}

describe('character stats', () => {
  it('reads "—" rather than zero for an untouched module', () => {
    const stats = deriveStats([], [], EMPTY)
    expect(stats.every(s => s.value === null)).toBe(true)
    expect(overallRating(stats)).toBeNull()
  })

  it('averages automatism across installed routines only', () => {
    const g = goal([node('a', 't1'), node('b', 't2'), node('c')])   // c not installed
    const stats = deriveStats([g], [habit('t1', 0.8), habit('t2', 0.4)], EMPTY)
    expect(stats.find(s => s.key === 'automatism')?.value).toBe(60)
  })

  it('measures resolve as integrated over installed', () => {
    const g = goal([node('a', 't1'), node('b', 't2')])
    const stats = deriveStats([g], [habit('t1', 0.9), habit('t2', 0.2)], EMPTY)
    expect(stats.find(s => s.key === 'resolve')?.value).toBe(50)
  })

  it('ignores routines belonging to a frozen goal', () => {
    const g = goal([node('a', 't1')], 'archived')
    expect(deriveStats([g], [habit('t1', 0.9)], EMPTY).find(s => s.key === 'automatism')?.value).toBeNull()
  })

  it('scales streak against the 66-day formation median and caps at 100', () => {
    const g = goal([node('a', 't1')])
    expect(deriveStats([g], [habit('t1', 0.5, 33)], EMPTY).find(s => s.key === 'streak')?.value).toBe(50)
    expect(deriveStats([g], [habit('t1', 0.5, 200)], EMPTY).find(s => s.key === 'streak')?.value).toBe(100)
  })

  it('picks vitality and recall up from the other modules', () => {
    const sums: ModuleSummaries = {
      ...EMPTY,
      solaris: { member: 'You', kcalLeft: 200, kcalPct: 80, macros: [], waterPct: 60 },
      ardo:    { due: 3, texts: 2, mastery: 45, next: 'x' },
    }
    const stats = deriveStats([], [], sums)
    expect(stats.find(s => s.key === 'vitality')?.value).toBe(70)   // (80 + 60) / 2
    expect(stats.find(s => s.key === 'recall')?.value).toBe(45)
  })

  it('averages only the stats that have something to say', () => {
    const sums: ModuleSummaries = { ...EMPTY, ardo: { due: 0, texts: 1, mastery: 60, next: null } }
    expect(overallRating(deriveStats([], [], sums))).toBe(60)
  })
})

describe('the quest gate', () => {
  const NOW = '2026-08-02T10:00:00.000Z'
  const clear = (...ids: string[]) => Object.fromEntries(ids.map(id => [id, NOW]))
  const stage = (n: number) => clear(...stageQuests(n).map(q => q.id))
  const all   = (upTo: number) => Object.assign({}, ...Array.from({ length: upTo }, (_, i) => stage(i + 1)))

  it('holds you at level 1 with nothing cleared, however much XP is banked', () => {
    const g = gatedLevel(1_000_000, {})
    expect(g.level).toBe(1)
    expect(g.capped).toBe(true)
    expect(g.xpLevel).toBeGreaterThan(1)
  })

  it('names what is holding it rather than showing a stuck bar', () => {
    const g = gatedLevel(1_000_000, {})
    expect(g.blocking).toHaveLength(stageQuests(1).length)
    expect(g.progress).toBe(1)          // the bar reads full, and the copy says why
  })

  it('opens level 2 only once every stage-1 quest is done', () => {
    const partial = clear(stageQuests(1)[0].id)
    expect(gatedLevel(1_000_000, partial).level).toBe(1)
    expect(gatedLevel(1_000_000, stage(1)).level).toBe(2)
  })

  it('still requires the XP — clearing a stage is not a free level', () => {
    const g = gatedLevel(0, all(4))
    expect(g.level).toBe(1)
    expect(g.capped).toBe(false)
    expect(g.blocking).toEqual([])
  })

  it('lets XP alone carry you once the starting zone is finished', () => {
    expect(levelCap(all(LAST_GATED_STAGE))).toBe(Number.POSITIVE_INFINITY)
    const g = gatedLevel(1_000_000, all(LAST_GATED_STAGE))
    expect(g.capped).toBe(false)
    expect(g.level).toBe(g.xpLevel)
  })

  it('raises the cap one stage at a time', () => {
    expect(levelCap({})).toBe(1)
    expect(levelCap(stage(1))).toBe(2)
    expect(levelCap(all(2))).toBe(3)
    // Clearing stage 2 without stage 1 buys nothing — order holds
    expect(levelCap(stage(2))).toBe(1)
  })

  it('reports the ungated level so the gap is visible', () => {
    const g = gatedLevel(levelCost(1) + levelCost(2), {})
    expect(g.level).toBe(1)
    expect(g.xpLevel).toBe(3)
  })
})
