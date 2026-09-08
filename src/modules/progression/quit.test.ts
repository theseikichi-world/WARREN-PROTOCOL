import { describe, it, expect } from 'vitest'
import { trackHabit, slipHabit, applyDailyReset, SLIP_COST } from '../scrap7/store'
import { alphaFor, todayKey, shiftDateKey, type Scrap7State, type Task } from '../scrap7/types'
import { draftToGoal, goalToDraft } from './draft'
import type { ChainDraft, DraftNode } from './draft'

// The app's own local-date keys, not UTC ones. Rolling my own put the test a
// day behind the store either side of midnight.
const TODAY = todayKey()
const shift = (n: number) => shiftDateKey(TODAY, n)

const quitting = (patch: Partial<Task> = {}): Task => ({
  id: 'h', text: 'No cigarettes', category: 'G', taskType: 'habit', completed: false,
  createdAt: shift(-30), origin: 'chain', direction: 'negative',
  score: 0.5, streak: 10, target: 1, todayCount: 0, lastTrackedDate: shift(-1),
  trackingHistory: [], skippedDates: [], slips: [], formationDays: 66, ...patch,
})

const state = (t: Task): Scrap7State =>
  ({ tasks: [t], categories: ['G'], chatHistory: [], lastDailyReset: TODAY })

const only = (s: Scrap7State) => s.tasks[0]

describe('a tap means the good outcome, whichever way the habit runs', () => {
  it('builds the score on a habit you are quitting', () => {
    // It used to do the opposite: a tap was a cigarette and the score fell, so
    // the good day had nothing to press and a clean week decayed to zero.
    const after = only(trackHabit(state(quitting()), 'h').state)
    const a = alphaFor(66)

    expect(after.score).toBeCloseTo(0.5 * (1 - a) + a, 6)
    expect(after.score).toBeGreaterThan(0.5)
    expect(after.streak).toBe(11)
  })

  it('records the held day as showing up, because it is', () => {
    const after = only(trackHabit(state(quitting()), 'h').state)
    expect(after.trackingHistory).toContain(TODAY)
  })
})

describe('slipping', () => {
  it('costs three days of progress and the run', () => {
    const after = only(slipHabit(state(quitting()), 'h'))
    expect(after.score).toBeCloseTo(0.5 - alphaFor(66) * SLIP_COST, 6)
    expect(after.streak).toBe(0)
    expect(after.slips).toEqual([TODAY])
  })

  it('never drives the score below zero', () => {
    expect(only(slipHabit(state(quitting({ score: 0.01 })), 'h')).score).toBe(0)
  })

  it('is not written down as showing up', () => {
    // Every reader of trackingHistory — UPTIME, STEADY HAND, the week strip —
    // would otherwise count a cigarette as a day's work.
    const after = only(slipHabit(state(quitting()), 'h'))
    expect(after.trackingHistory).not.toContain(TODAY)
    expect(after.trackingHistory).toEqual([])
  })

  it('charges once for the same day', () => {
    const once  = slipHabit(state(quitting()), 'h')
    const twice = slipHabit(once, 'h')
    expect(only(twice).score).toBe(only(once).score)
    expect(only(twice).slips).toHaveLength(1)
  })

  it('marks the day accounted for, so the decay pass does not charge again', () => {
    // The slip already cost three times the rate. Letting the nightly walk see
    // an untracked day would bill it a fourth.
    const slipped = slipHabit(state(quitting()), 'h')
    const rolled  = applyDailyReset({ ...slipped, lastDailyReset: shift(-1) })
    expect(only(rolled).score).toBe(only(slipped).score)
  })
})

describe('the direction reaches the habit through the tree', () => {
  const node = (direction?: 'positive' | 'negative'): DraftNode => ({
    key: 'hold', title: 'Hold the line', cue: 'when the craving lands',
    tier: 2, ladder: ['one day'], after: [], toolId: null,
    ...(direction ? { direction } : {}),
  })
  const draft = (n: DraftNode): ChainDraft => ({
    goalId: null, title: 'QUIT', nodes: [n], sourceDreamId: null, note: '',
    chapters: [{ title: 'One', keys: [n.key], boss: null }],
  })

  it('carries a quit routine all the way to the live node', () => {
    expect(draftToGoal(draft(node('negative')), []).nodes[0].direction).toBe('negative')
  })

  it('survives the round trip back into the forge', () => {
    const goal = draftToGoal(draft(node('negative')), [])
    expect(goalToDraft(goal).nodes[0].direction).toBe('negative')
  })

  it('leaves a routine written before any of this alone', () => {
    // Absent means positive. Stamping every old node would be a migration that
    // rewrites history to say something it never said.
    expect(draftToGoal(draft(node()), []).nodes[0].direction).toBeUndefined()
  })
})
