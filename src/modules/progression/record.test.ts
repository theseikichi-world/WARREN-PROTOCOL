import { describe, it, expect } from 'vitest'
import { operatorRecord, recordBrief, STALE_AFTER_DAYS, SETTLE_DAYS } from './record'
import type { Task } from '../scrap7/types'

const NOW = new Date('2026-08-08T12:00:00.000Z')
const daysAgo = (n: number): string =>
  new Date(NOW.getTime() - n * 86400000).toISOString().slice(0, 10)

const habit = (over: Partial<Task> = {}): Task => ({
  id: 'h', text: 'A habit', category: 'x', taskType: 'habit', completed: false,
  createdAt: new Date(NOW.getTime() - 60 * 86400000).toISOString(),
  origin: 'chain', score: 0.5, streak: 3,
  lastTrackedDate: daysAgo(0), trackingHistory: [daysAgo(1), daysAgo(0)],
  ...over,
} as Task)

describe('operatorRecord', () => {
  it('files an automatic routine under holding', () => {
    const r = operatorRecord([habit({ score: 0.72 })], NOW)
    expect(r.holding.map(e => e.title)).toEqual(['A habit'])
    expect(r.struggling).toEqual([])
    expect(r.abandoned).toEqual([])
  })

  it('files an untouched one under abandoned, however good its score was', () => {
    const r = operatorRecord([habit({ score: 0.8, lastTrackedDate: daysAgo(STALE_AFTER_DAYS + 1) })], NOW)
    expect(r.abandoned.map(e => e.title)).toEqual(['A habit'])
    expect(r.holding).toEqual([])
  })

  it('does not call something struggling before it has had time to bed in', () => {
    const young = habit({
      score: 0.1,
      createdAt: new Date(NOW.getTime() - (SETTLE_DAYS - 5) * 86400000).toISOString(),
    })
    expect(operatorRecord([young], NOW).struggling).toEqual([])
  })

  it('files a long-running low score under struggling', () => {
    const r = operatorRecord([habit({ score: 0.12 })], NOW)
    expect(r.struggling.map(e => e.title)).toEqual(['A habit'])
  })

  it('ignores a habit that was never once tracked — it proved nothing', () => {
    const r = operatorRecord([habit({ trackingHistory: [], lastTrackedDate: null })], NOW)
    expect(r).toEqual({ holding: [], struggling: [], abandoned: [] })
  })

  it('ignores a frozen routine — it stopped by decision, not by failure', () => {
    // Rule 3: archiving a goal freezes its habits. That is not an abandonment
    // and telling the guide otherwise would make it timid about a whole goal.
    const r = operatorRecord([habit({ frozen: true, lastTrackedDate: daysAgo(40) })], NOW)
    expect(r.abandoned).toEqual([])
  })

  it('ignores todos and dailies — only habits carry a score to read', () => {
    const r = operatorRecord([
      habit({ taskType: 'todo' }), habit({ taskType: 'daily' }),
    ], NOW)
    expect(r).toEqual({ holding: [], struggling: [], abandoned: [] })
  })

  it('ignores tasks belonging to no system', () => {
    expect(operatorRecord([habit({ origin: 'manual' })], NOW).holding).toEqual([])
    expect(operatorRecord([habit({ origin: 'log' })], NOW).holding).toEqual([])
  })

  it('tells a routine from a basic', () => {
    const r = operatorRecord([
      habit({ id: 'a', text: 'Routine', score: 0.9, origin: 'chain' }),
      habit({ id: 'b', text: 'Basic',   score: 0.9, origin: 'baseline' }),
    ], NOW)
    expect(r.holding.map(e => e.kind).sort()).toEqual(['basic', 'routine'])
  })

  it('puts the clearest cases first, so a truncated brief keeps them', () => {
    const r = operatorRecord([
      habit({ id: 'a', text: 'Low',  score: 0.65 }),
      habit({ id: 'b', text: 'High', score: 0.95 }),
    ], NOW)
    expect(r.holding.map(e => e.title)).toEqual(['High', 'Low'])
  })

  it('survives a habit with no dates at all', () => {
    expect(() => operatorRecord([habit({ createdAt: '', lastTrackedDate: null })], NOW)).not.toThrow()
  })
})

describe('recordBrief', () => {
  it('says nothing at all for a new operator', () => {
    // With no record there is nothing to avoid and nothing to build on.
    // Inventing caution would be worse than silence.
    expect(recordBrief({ holding: [], struggling: [], abandoned: [] })).toBe('')
  })

  it('tells the guide to anchor to what is already holding', () => {
    const brief = recordBrief(operatorRecord([habit({ text: 'Reading aloud', score: 0.8 })], NOW))
    expect(brief).toContain('ALREADY HOLDING')
    expect(brief).toContain('Reading aloud')
    expect(brief).toContain('Anchor new routines to them')
  })

  it('tells it not to re-propose what already stopped, in the same shape', () => {
    const brief = recordBrief(operatorRecord([
      habit({ text: 'Morning run', lastTrackedDate: daysAgo(30) }),
    ], NOW))
    expect(brief).toContain('ALREADY TRIED AND STOPPED')
    expect(brief).toContain('Morning run')
    expect(brief).toContain('Say what you changed')
  })

  it('names it as real tracking rather than something the operator claimed', () => {
    const brief = recordBrief(operatorRecord([habit({ score: 0.9 })], NOW))
    expect(brief).toContain('not self-report')
  })
})
