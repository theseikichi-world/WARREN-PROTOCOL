import { describe, it, expect } from 'vitest'
import { ERRAND_XP, ERRAND_DAILY_CAP, awardErrandXp, baseXp } from './xp'
import { recordErrand } from './store'
import { isErrand } from '../scrap7/types'
import type { ProgressionState } from './types'
import type { Task } from '../scrap7/types'

const NOW = new Date('2026-06-01T10:00:00')
const state = (patch: Partial<ProgressionState> = {}): ProgressionState =>
  ({ goals: [], seeded: true, xp: 0, quests: {}, ...patch })

const task = (patch: Partial<Task>): Task => ({
  id: 'x', text: 'x', category: 'x', taskType: 'todo', completed: false,
  createdAt: NOW.toISOString(), origin: 'manual', ...patch,
})

describe('what the parallel lane pays for', () => {
  it('takes a one-off you set yourself', () => {
    expect(isErrand(task({}))).toBe(true)
  })

  it('refuses a repeating task — paying per tick is a faucet', () => {
    expect(isErrand(task({ taskType: 'daily' }))).toBe(false)
    expect(isErrand(task({ taskType: 'habit' }))).toBe(false)
  })

  it('refuses anything that belongs to a system already', () => {
    expect(isErrand(task({ origin: 'chain' }))).toBe(false)
    expect(isErrand(task({ origin: 'baseline' }))).toBe(false)
    expect(isErrand(task({ origin: undefined, logDream: 'Become an actor' }))).toBe(false)
  })
})

describe('the weight', () => {
  it('rises with the priority already authored on the row', () => {
    expect(ERRAND_XP.trivial).toBeLessThan(ERRAND_XP.easy)
    expect(ERRAND_XP.easy).toBeLessThan(ERRAND_XP.medium)
    expect(ERRAND_XP.medium).toBeLessThan(ERRAND_XP.hard)
  })

  it('never out-earns the work you picked a goal to do', () => {
    // A tier-4 routine run is 32. The heaviest errand is worth half of it, and
    // a whole day of them is worth less than one.
    expect(ERRAND_XP.hard).toBeLessThan(baseXp({ kind: 'routine.run', tier: 4 }))
    expect(ERRAND_DAILY_CAP).toBeLessThan(baseXp({ kind: 'routine.integrated' }))
  })

  it('pays only what is left of the day', () => {
    const hard = { kind: 'errand.done', priority: 'hard' } as const
    expect(awardErrandXp(hard, 0)).toBe(16)
    expect(awardErrandXp(hard, ERRAND_DAILY_CAP - 5)).toBe(5)
    expect(awardErrandXp(hard, ERRAND_DAILY_CAP)).toBe(0)
  })
})

describe('the day ledger', () => {
  it('banks the first errand and remembers the day', () => {
    const r = recordErrand(state(), 'medium', NOW)
    expect(r.gained).toBe(8)
    expect(r.state.xp).toBe(8)
    expect(r.state.errands).toEqual({ date: '2026-06-01', xp: 8 })
    expect(r.capped).toBe(false)
  })

  it('stops paying at the cap, and says so rather than going quiet', () => {
    let s = state()
    for (let i = 0; i < 3; i++) s = recordErrand(s, 'hard', NOW).state
    expect(s.xp).toBe(ERRAND_DAILY_CAP)

    const over = recordErrand(s, 'hard', NOW)
    expect(over.gained).toBe(0)
    expect(over.capped).toBe(true)
    expect(over.state.xp).toBe(ERRAND_DAILY_CAP)
  })

  it('rolls over on its own the first time a new day is seen', () => {
    const spent = state({ xp: 24, errands: { date: '2026-05-31', xp: 24 } })
    const r = recordErrand(spent, 'hard', NOW)
    expect(r.gained).toBe(16)
    expect(r.state.errands).toEqual({ date: '2026-06-01', xp: 16 })
  })

  it('defaults an unpriced row to medium rather than to nothing', () => {
    expect(recordErrand(state(), 'medium', NOW).gained).toBe(ERRAND_XP.medium)
  })
})
