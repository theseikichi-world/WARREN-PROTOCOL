import { describe, it, expect } from 'vitest'
import { skipState, lastSkip, buySkip } from './store'
import { SKIP_COST, SKIP_EVERY_DAYS } from './xp'
import { THRESHOLD_UNLOCK_AT } from './types'
import { AUTOMATIC_AT, alphaFor, DEFAULT_FORMATION_DAYS, type Task } from '../scrap7/types'

const NOW = new Date('2026-09-20T10:00:00')

const habit = (patch: Partial<Task> = {}): Task => ({
  id: 'h', text: 'Reading aloud', category: 'G', taskType: 'habit',
  completed: false, createdAt: NOW.toISOString(), origin: 'chain',
  score: 0.4, streak: 5, target: 1, todayCount: 0, lastTrackedDate: null,
  trackingHistory: [], skippedDates: [], ...patch,
})

describe('the two files that must agree about 0.70', () => {
  it('pins the automatic threshold across the module boundary', () => {
    // scrap7 owns the curve, progression owns the slot rule. They cannot import
    // each other's constant without a cycle, so this is what keeps them equal.
    expect(AUTOMATIC_AT).toBe(THRESHOLD_UNLOCK_AT)
  })

  it('derives a rate that reaches the threshold in exactly the days given', () => {
    for (const days of [25, 66, 120, 150]) {
      const alpha = alphaFor(days)
      let s = 0, n = 0
      while (s < AUTOMATIC_AT) { s = s * (1 - alpha) + alpha; n++ }
      expect(n).toBe(days)
    }
  })

  it('leaves a habit that named no pace close to where it always was', () => {
    // The old engine was a flat 0.05 for everything; a basic should not suddenly
    // move at a different speed because routines learned to have tiers.
    expect(alphaFor(undefined)).toBeCloseTo(alphaFor(DEFAULT_FORMATION_DAYS))
    expect(alphaFor(undefined)).toBeCloseTo(0.047, 3)
  })

  it('makes one missed day cost less on a longer project, in both directions', () => {
    expect(alphaFor(150)).toBeLessThan(alphaFor(25))
  })
})

describe('buying a day back', () => {
  it('is available when you can afford it and have not just used one', () => {
    expect(skipState(habit(), SKIP_COST, NOW)).toEqual({ ok: true })
  })

  it('names the shortfall rather than sitting inert', () => {
    const poor = skipState(habit(), SKIP_COST - 15, NOW)
    expect(poor).toMatchObject({ ok: false, reason: 'unaffordable', short: 15 })
  })

  it('holds for a week per habit, whatever the bank says', () => {
    const used = habit({ skippedDates: ['2026-09-18'] })
    const soon = skipState(used, 100_000, NOW)
    expect(soon).toMatchObject({ ok: false, reason: 'too-soon' })
    expect(soon.short).toBe(SKIP_EVERY_DAYS - 2)
  })

  it('opens again once the week has passed', () => {
    const used = habit({ skippedDates: ['2026-09-13'] })
    expect(skipState(used, SKIP_COST, NOW).ok).toBe(true)
  })

  it('reads the last purchase off the record of it, not a second counter', () => {
    expect(lastSkip(habit({ skippedDates: ['2026-09-01', '2026-09-14', '2026-09-07'] })))
      .toBe('2026-09-14')
    expect(lastSkip(habit())).toBeNull()
  })

  it('has nothing to sell for a day already done', () => {
    const done = habit({ lastTrackedDate: '2026-09-20', todayCount: 1 })
    expect(skipState(done, SKIP_COST, NOW)).toMatchObject({ ok: false, reason: 'done-today' })
  })

  it('refuses anything that is not a habit', () => {
    const todo = habit({ taskType: 'todo' })
    expect(skipState(todo, SKIP_COST, NOW)).toMatchObject({ ok: false, reason: 'not-a-habit' })
  })

  it('costs less than a day of a running protocol, and more than any single run', () => {
    // Cheap enough for a day that genuinely went wrong; dear enough that doing
    // the thing stays the better move.
    expect(SKIP_COST).toBeGreaterThan(32)     // a tier-4 run at full price
    expect(SKIP_COST).toBeLessThan(83)        // five tier-2 routines and a basic
  })
})

// The same in-memory storage the other store tests use — see lifeSupportInstall.
function mockStorage(seed: Record<string, unknown> = {}) {
  const mem: Record<string, string> = {}
  for (const [k, v] of Object.entries(seed)) mem[k] = JSON.stringify(v)
  globalThis.localStorage = {
    getItem: (k: string) => mem[k] ?? null,
    setItem: (k: string, v: string) => { mem[k] = v },
    removeItem: (k: string) => { delete mem[k] },
    clear: () => { for (const k of Object.keys(mem)) delete mem[k] },
    key: () => null, length: 0,
  } as Storage
  globalThis.window = { dispatchEvent: () => true } as unknown as Window & typeof globalThis
  globalThis.CustomEvent = class { constructor(public type: string, public init?: unknown) {} } as never
}

describe('spending, against real storage', () => {
  const seed = (xp: number, task: Task) => mockStorage({
    scrap7_v4: { tasks: [task], categories: ['G'], chatHistory: [], lastDailyReset: '2026-09-20' },
    warren_progression_v1: { goals: [], seeded: true, xp, quests: {} },
  })

  const bank = () => JSON.parse(localStorage.getItem('warren_progression_v1')!).xp as number
  const skips = () => (JSON.parse(localStorage.getItem('scrap7_v4')!).tasks[0].skippedDates ?? []) as string[]

  it('takes the XP and records the day', () => {
    seed(500, habit())
    expect(buySkip('h', NOW)).toEqual({ ok: true })
    expect(bank()).toBe(500 - SKIP_COST)
    expect(skips()).toHaveLength(1)
  })

  it('lets the bank fall — a currency you cannot lose is not a currency', () => {
    seed(SKIP_COST, habit())
    buySkip('h', NOW)
    expect(bank()).toBe(0)
  })

  it('charges nothing when it refuses', () => {
    seed(10, habit())
    expect(buySkip('h', NOW)).toMatchObject({ ok: false, reason: 'unaffordable' })
    expect(bank()).toBe(10)
    expect(skips()).toHaveLength(0)
  })
})
