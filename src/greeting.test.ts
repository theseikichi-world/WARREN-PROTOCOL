import { describe, it, expect } from 'vitest'
import { awayKind, daysAway, greetingFor, timeGreeting, briefFor, sessionDaysAway, __resetSession } from './greeting'

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString()

describe('noticing that you were gone', () => {
  it('does not call a night away an absence', () => {
    expect(awayKind(0)).toBe('now')
    expect(awayKind(1)).toBe('now')
  })

  it('names the gap once it is worth naming', () => {
    expect(awayKind(2)).toBe('back')
    expect(awayKind(5)).toBe('long')
    expect(awayKind(30)).toBe('ages')
  })

  it('counts whole days, and treats a first visit as no gap', () => {
    expect(daysAway(iso(3))).toBe(3)
    expect(daysAway(null)).toBe(0)
    expect(daysAway('not a date')).toBe(0)
  })

  it('lets the absence outrank the clock', () => {
    expect(greetingFor(20, 0)).toBe(timeGreeting(20))
    expect(greetingFor(20, 6)).not.toBe(timeGreeting(20))
  })
})

describe('measuring the gap once', () => {
  function mockStorage(seed: Record<string, string> = {}) {
    const mem = { ...seed }
    globalThis.localStorage = {
      getItem: (k: string) => mem[k] ?? null,
      setItem: (k: string, v: string) => { mem[k] = v },
      removeItem: (k: string) => { delete mem[k] },
      clear: () => { for (const k of Object.keys(mem)) delete mem[k] },
      key: () => null, length: 0,
    } as Storage
  }

  it('survives a remount, which is what broke the greeting', () => {
    __resetSession()
    mockStorage({ warren_last_seen: iso(6) })
    // First mount reads six days and stamps this visit.
    expect(sessionDaysAway()).toBe(6)
    // A remount must not re-read the stamp it just wrote and see zero.
    expect(sessionDaysAway()).toBe(6)
    __resetSession()
  })
})

describe('the brief', () => {
  const base = { days: 0, due: 0, freeMin: 0, awake: true }

  it('says the day is yours when there is nothing to report', () => {
    expect(briefFor(base)).toBe('Nothing due — the day is yours.')
  })

  it('leads with the absence, then the work, then the room left', () => {
    const line = briefFor({ ...base, days: 5, due: 3, freeMin: 97 })
    expect(line).toBe('5 days since you were last here. 3 things are due. 1h 37m still open.')
  })

  it('agrees with itself about one of a thing', () => {
    expect(briefFor({ ...base, due: 1 })).toContain('1 thing is due')
  })

  it('does not offer free time once the day is over', () => {
    const line = briefFor({ ...base, due: 2, freeMin: 200, awake: false })
    expect(line).toContain('the day is done')
    expect(line).not.toContain('still open')
  })

  it('ignores a scrap of free time rather than reporting 3m', () => {
    expect(briefFor({ ...base, due: 1, freeMin: 3 })).toBe('1 thing is due.')
  })

  it('puts the sky last, when there is one', () => {
    const line = briefFor({ ...base, due: 1, weather: '33° and clear — wear SPF' })
    expect(line.endsWith('33° and clear — wear SPF.')).toBe(true)
  })
})
