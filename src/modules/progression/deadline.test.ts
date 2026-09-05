import { describe, it, expect } from 'vitest'
import { isDueDate, daysUntil, bandOf, countdown, shortfalls, scheduleLine } from './deadline'
import type { Chapter, Goal, ChainNode } from './types'
import type { Task } from '../scrap7/types'

const NOW = new Date('2026-06-01T21:00:00')

const node = (key: string, tier: 1 | 2 | 3 | 4): ChainNode => ({
  id: `g:${key}`, goalId: 'g', title: key, cue: 'after coffee', tier,
  thresholds: ['once'], thresholdIndex: 0, unlocksAt: 0.6, prerequisiteIds: [],
  unlockedAt: null, toolId: null, scrapTaskId: `chain:g:${key}`,
})

const habit = (key: string, score: number): Task => ({
  id: `chain:g:${key}`, text: key, category: 'x', taskType: 'habit',
  completed: false, createdAt: NOW.toISOString(), score,
})

const goal = (nodes: ChainNode[]): Goal => ({
  id: 'g', title: 'G', slot: 'primary', chapters: [], nodes,
  createdAt: NOW.toISOString(), lastSlotChangeAt: NOW.toISOString(),
})

const chapter = (nodes: ChainNode[], due: string | null): Chapter => ({
  index: 1, title: 'Act 1', nodeIds: nodes.map(n => n.id),
  boss: { title: 'The exam', requirement: { minScore: 0.7 }, completedAt: null, ...(due ? { due } : {}) },
})

describe('reading a due date', () => {
  it('takes only a real calendar day', () => {
    expect(isDueDate('2026-06-12')).toBe(true)
    expect(isDueDate('2026-02-30')).toBe(false)   // not a day that exists
    expect(isDueDate('2026-13-01')).toBe(false)
    expect(isDueDate('12 June')).toBe(false)
    expect(isDueDate(undefined)).toBe(false)
  })

  it('counts whole days, so an evening never eats a day you have', () => {
    expect(daysUntil('2026-06-12', NOW)).toBe(11)
    expect(daysUntil('2026-06-01', NOW)).toBe(0)
    expect(daysUntil('2026-05-29', NOW)).toBe(-3)
    expect(daysUntil('sometime', NOW)).toBeNull()
  })

  it('bands the distance', () => {
    expect(bandOf(-1)).toBe('overdue')
    expect(bandOf(0)).toBe('tight')
    expect(bandOf(7)).toBe('tight')
    expect(bandOf(8)).toBe('near')
    expect(bandOf(31)).toBe('clear')
  })

  it('says the number and nothing about how you are doing', () => {
    expect(countdown('2026-06-01', NOW)?.en).toBe('TODAY')
    expect(countdown('2026-06-12', NOW)?.en).toBe('11D LEFT')
    expect(countdown('2026-05-29', NOW)?.en).toBe('3D PAST')
    expect(countdown('2026-05-29', NOW)?.ru).toBe('3 дня НАЗАД')
    expect(countdown('nope', NOW)).toBeNull()
  })
})

describe('will the routines be ready', () => {
  it('finds the ones that project past the date', () => {
    // tier 3 baseline is 120 days; at score 0 that is the full 120.
    const slow = node('slow', 3)
    const fast = node('fast', 1)
    const ch = chapter([slow, fast], '2026-07-01')   // 30 days out
    const late = shortfalls(ch, goal([slow, fast]), [habit('slow', 0), habit('fast', 0)], NOW)

    expect(late.map(l => l.title)).toEqual(['slow'])
    expect(late[0]).toMatchObject({ needDays: 120, haveDays: 30, short: 90 })
  })

  it('stays silent when the plan fits', () => {
    const fast = node('fast', 1)
    const ch = chapter([fast], '2027-01-01')
    expect(shortfalls(ch, goal([fast]), [habit('fast', 0)], NOW)).toEqual([])
    expect(scheduleLine(ch, goal([fast]), [habit('fast', 0)], NOW)).toBeNull()
  })

  it('counts an already-automatic routine as ready, never as late', () => {
    const slow = node('slow', 4)
    const ch = chapter([slow], '2026-06-02')
    expect(shortfalls(ch, goal([slow]), [habit('slow', 1)], NOW)).toEqual([])
  })

  it('has nothing to say without a date', () => {
    const slow = node('slow', 4)
    expect(shortfalls(chapter([slow], null), goal([slow]), [habit('slow', 0)], NOW)).toEqual([])
  })

  it('names the worst and counts the rest, without telling you what to drop', () => {
    const a = node('a', 4), b = node('b', 3)
    const ch = chapter([a, b], '2026-06-08')
    const line = scheduleLine(ch, goal([a, b]), [habit('a', 0), habit('b', 0)], NOW)!

    expect(line.en).toContain('a projects 150d to automatic, 7d remain')
    expect(line.en).toContain('1 more')
    expect(line.en).not.toMatch(/drop|remove|should/i)
  })
})
