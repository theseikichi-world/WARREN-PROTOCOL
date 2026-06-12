import { describe, it, expect, beforeEach } from 'vitest'
import { computeBmi, recommendedWaterMl, effectiveHydration, type SolarisProfile, type SolarisState } from './types'
import {
  loadSolarisState, addMember, addEntry, removeEntry, addDrink, removeDrink, getDrinks,
  removeMember, setActiveMember, activeMember, updateMemberProfile,
  addPantryItem, addPantryItems, removePantryItem,
} from './store'

const profile: SolarisProfile = {
  weightKg: 80, heightCm: 180, age: 30, sex: 'male',
  activity: 'standard', goal: 'maintain', diet: '',
}
const empty: SolarisState = { members: [], activeMemberId: null, pantry: [] }

describe('computeBmi', () => {
  it('classifies a healthy BMI with a sensible range', () => {
    const info = computeBmi({ weightKg: 80, heightCm: 180 }) // 24.7
    expect(info.bmi).toBeCloseTo(24.7, 1)
    expect(info.label).toBe('Healthy')
    expect(info.advise).toBe('maintain')
    expect(info.healthyKg[0]).toBeLessThan(80)
    expect(info.healthyKg[1]).toBeGreaterThan(80)
  })
  it('flags underweight → bulk', () => {
    const info = computeBmi({ weightKg: 50, heightCm: 180 }) // 15.4
    expect(info.label).toBe('Underweight')
    expect(info.advise).toBe('bulk')
  })
  it('flags overweight → cut and obese → cut', () => {
    expect(computeBmi({ weightKg: 90, heightCm: 178 }).label).toBe('Overweight') // 28.4
    expect(computeBmi({ weightKg: 110, heightCm: 175 }).label).toBe('Obese')     // 35.9
    expect(computeBmi({ weightKg: 110, heightCm: 175 }).advise).toBe('cut')
  })
  it('guards a zero height', () => {
    expect(computeBmi({ weightKg: 80, heightCm: 0 }).bmi).toBe(0)
  })
})

describe('recommendedWaterMl', () => {
  it('scales with activity and rounds to 50 ml', () => {
    const pod    = recommendedWaterMl({ ...profile, activity: 'pod' })    // 80*31 = 2480 → 2500
    const pilot  = recommendedWaterMl({ ...profile, activity: 'pilot' })  // 80*40 = 3200
    expect(pod % 50).toBe(0)
    expect(pilot).toBeGreaterThan(pod)
    expect(pilot).toBe(3200)
  })
})

describe('member CRUD', () => {
  it('adds a member and focuses them', () => {
    const s = addMember(empty, 'You', '🧑‍🚀', profile)
    expect(s.members).toHaveLength(1)
    expect(s.activeMemberId).toBe(s.members[0].id)
    expect(activeMember(s)?.name).toBe('You')
  })

  it('keeps each member’s food log isolated', () => {
    let s = addMember(empty, 'You', '🧑‍🚀', profile)
    s = addMember(s, 'Wife', '👩‍🚀', { ...profile, sex: 'female' })
    const [me, wife] = s.members
    s = addEntry(s, me.id, '2026-06-12', { name: 'Oats', slot: 'breakfast', calories: 300, protein: 10, carbs: 50, fat: 5 })
    expect(s.members[0].days['2026-06-12'].entries).toHaveLength(1)
    expect(s.members[1].days['2026-06-12']).toBeUndefined() // wife's log untouched
    const eid = s.members[0].days['2026-06-12'].entries[0].id
    s = removeEntry(s, me.id, '2026-06-12', eid)
    expect(s.members[0].days['2026-06-12'].entries).toHaveLength(0)
    expect(wife.name).toBe('Wife')
  })

  it('logs drinks and weights hydration by type', () => {
    let s = addMember(empty, 'You', '🧑‍🚀', profile)
    const id = s.members[0].id
    s = addDrink(s, id, '2026-06-12', 'water', 250)
    s = addDrink(s, id, '2026-06-12', 'coffee', 200) // 200 * 0.8 = 160 effective
    const list = getDrinks(s, id, '2026-06-12')
    expect(list).toHaveLength(2)
    expect(effectiveHydration(list)).toBe(410) // 250 + 160
    s = removeDrink(s, id, '2026-06-12', list[1].id)
    expect(effectiveHydration(getDrinks(s, id, '2026-06-12'))).toBe(250)
  })

  it('reassigns active when the active member is removed', () => {
    let s = addMember(empty, 'You', '🧑‍🚀', profile)
    s = addMember(s, 'Wife', '👩‍🚀', profile)  // active is now Wife
    s = setActiveMember(s, s.members[0].id)      // active = You
    s = removeMember(s, s.members[0].id)         // remove You
    expect(s.members).toHaveLength(1)
    expect(s.activeMemberId).toBe(s.members[0].id) // falls to remaining member
  })

  it('updates a member’s profile in place', () => {
    let s = addMember(empty, 'You', '🧑‍🚀', profile)
    const id = s.members[0].id
    s = updateMemberProfile(s, id, { ...profile, weightKg: 75 })
    expect(s.members[0].profile.weightKg).toBe(75)
  })
})

describe('shared pantry', () => {
  it('adds, bulk-adds (skipping blanks + case-insensitive dupes), and removes', () => {
    let s = addPantryItem(empty, 'Eggs', '6')
    s = addPantryItems(s, [{ name: 'eggs' }, { name: '  ' }, { name: 'Spinach', qty: '1 bag' }, { name: 'Cheddar' }])
    expect(s.pantry.map(i => i.name).sort()).toEqual(['Cheddar', 'Eggs', 'Spinach']) // "eggs" dupe + blank dropped
    const spinach = s.pantry.find(i => i.name === 'Spinach')!
    expect(spinach.qty).toBe('1 bag')
    s = removePantryItem(s, spinach.id)
    expect(s.pantry.some(i => i.name === 'Spinach')).toBe(false)
  })
})

describe('migration from the old single-profile shape', () => {
  beforeEach(() => {
    const mem: Record<string, string> = {}
    globalThis.localStorage = {
      getItem: (k: string) => mem[k] ?? null,
      setItem: (k: string, v: string) => { mem[k] = v },
      removeItem: (k: string) => { delete mem[k] },
      clear: () => { for (const k of Object.keys(mem)) delete mem[k] },
      key: () => null, length: 0,
    } as Storage
  })

  it('wraps a legacy { profile, days } into a single crew member', () => {
    localStorage.setItem('solaris_v1', JSON.stringify({
      profile, days: { '2026-06-11': { date: '2026-06-11', entries: [] } },
    }))
    const s = loadSolarisState()
    expect(s.members).toHaveLength(1)
    expect(s.members[0].name).toBe('You')
    expect(s.activeMemberId).toBe(s.members[0].id)
    expect(s.members[0].days['2026-06-11']).toBeDefined()
    expect(s.pantry).toEqual([])
  })

  it('returns an empty crew when nothing is stored', () => {
    const s = loadSolarisState()
    expect(s.members).toEqual([])
    expect(s.activeMemberId).toBeNull()
  })

  it('converts a legacy numeric water total into a water drink entry', () => {
    localStorage.setItem('solaris_v1', JSON.stringify({
      members: [{ id: 'm', name: 'You', emoji: '🧑‍🚀', profile, days: {}, water: { '2026-06-11': 750 } }],
      activeMemberId: 'm', pantry: [],
    }))
    const s = loadSolarisState()
    const drinks = s.members[0].water['2026-06-11']
    expect(drinks).toHaveLength(1)
    expect(drinks[0]).toMatchObject({ kind: 'water', ml: 750 })
  })
})
