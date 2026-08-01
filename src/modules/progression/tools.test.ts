import { describe, it, expect } from 'vitest'
import { solarisUsage, solarisTier, solarisNext, solarisHas, SOLARIS_STEPS } from './tools'
import type { SolarisState } from '../solaris/store'

const member = (water: Record<string, unknown[]>, days: Record<string, { entries: unknown[] }>) =>
  ({ id: 'm', name: 'You', emoji: '🧑‍🚀', profile: {}, days, water }) as unknown as SolarisState['members'][0]

const state = (...members: SolarisState['members']): SolarisState =>
  ({ members, activeMemberId: 'm', pantry: [], favorites: [], kitchen: { equipment: [], prefs: '' } })

const days = (n: number) => Object.fromEntries(
  Array.from({ length: n }, (_, i) => [`2026-07-${String(i + 1).padStart(2, '0')}`, [{ id: 'd', kind: 'water', ml: 250 }]]))

const meals = (n: number) => ({ '2026-07-01': { entries: Array.from({ length: n }, () => ({ id: 'f' })) } })

describe('solarisUsage', () => {
  it('counts hydration days and meals across the whole crew', () => {
    const s = state(member(days(3), meals(4)), member(days(2), meals(1)))
    expect(solarisUsage(s)).toEqual({ hydrationDays: 5, mealsLogged: 5 })
  })

  it('ignores days logged with no drinks', () => {
    const s = state(member({ '2026-07-01': [], '2026-07-02': [{ id: 'd' }] }, {}))
    expect(solarisUsage(s).hydrationDays).toBe(1)
  })

  it('survives an empty or malformed record', () => {
    expect(solarisUsage(state())).toEqual({ hydrationDays: 0, mealsLogged: 0 })
    expect(solarisUsage({ members: undefined } as unknown as SolarisState).hydrationDays).toBe(0)
  })
})

describe('solarisTier', () => {
  it('starts at v0 — hydration only', () => {
    expect(solarisTier({ hydrationDays: 0, mealsLogged: 0 })).toBe(0)
    expect(solarisTier({ hydrationDays: 4, mealsLogged: 0 })).toBe(0)
  })

  it('opens calories after five days of actually drinking water', () => {
    expect(solarisTier({ hydrationDays: 5, mealsLogged: 0 })).toBe(1)
  })

  it('will not skip a tier when a later condition is met first', () => {
    // 100 meals logged but hydration was never used: still v0
    expect(solarisTier({ hydrationDays: 0, mealsLogged: 100 })).toBe(0)
  })

  it('climbs to full firmware in order', () => {
    expect(solarisTier({ hydrationDays: 5, mealsLogged: 15 })).toBe(2)
    expect(solarisTier({ hydrationDays: 5, mealsLogged: 40 })).toBe(3)
  })
})

describe('solarisNext', () => {
  it('names the next surface and how close it is', () => {
    const n = solarisNext({ hydrationDays: 2, mealsLogged: 0 })!
    expect(n.tier).toBe(1)
    expect(n.opens).toBe('Calories & meal log')
    expect([n.have, n.need]).toEqual([2, 5])
  })

  it('never reports progress beyond the requirement', () => {
    expect(solarisNext({ hydrationDays: 5, mealsLogged: 99 })).toBeNull()   // full firmware
    expect(solarisNext({ hydrationDays: 5, mealsLogged: 14 })!.have).toBe(14)
  })
})

describe('solarisHas', () => {
  it('locks complexity, never the thing the instrument is for', () => {
    // v0 still hydrates — that is the whole point
    expect(solarisHas(0, 'calories')).toBe(false)
    expect(solarisHas(0, 'macros')).toBe(false)
    expect(solarisHas(0, 'kitchen')).toBe(false)

    expect(solarisHas(1, 'calories')).toBe(true)
    expect(solarisHas(1, 'macros')).toBe(false)
    expect(solarisHas(2, 'macros')).toBe(true)
    expect(solarisHas(3, 'kitchen')).toBe(true)
  })
})

describe('step table', () => {
  it('is ordered and complete', () => {
    expect(SOLARIS_STEPS.map(s => s.tier)).toEqual([1, 2, 3])
    expect(SOLARIS_STEPS.every(s => s.opens && s.opensRu && s.needs && s.needsRu)).toBe(true)
  })
})
