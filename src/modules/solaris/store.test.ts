import { describe, it, expect } from 'vitest'
import { computeTargets, sumDay, type SolarisProfile, type DayLog } from './types'

const base: SolarisProfile = {
  weightKg: 80, heightCm: 180, age: 30, sex: 'male',
  activity: 'standard', goal: 'maintain', diet: '',
}

describe('computeTargets (Mifflin–St Jeor)', () => {
  it('computes BMR for a male correctly', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
    expect(computeTargets(base).bmr).toBe(1780)
  })

  it('computes BMR for a female (−161 offset)', () => {
    // 1780 - 5 (male) - 161 (female delta from male) → base = 800+1125-150 = 1775; female = 1775-161 = 1614
    expect(computeTargets({ ...base, sex: 'female' }).bmr).toBe(1614)
  })

  it('applies the standard activity factor (1.55) to TDEE', () => {
    expect(computeTargets(base).tdee).toBe(Math.round(1780 * 1.55)) // 2759
  })

  it('cut subtracts 500 kcal from TDEE', () => {
    const t = computeTargets({ ...base, goal: 'cut' })
    expect(t.calories).toBe(t.tdee - 500)
  })

  it('bulk adds 350 kcal', () => {
    const t = computeTargets({ ...base, goal: 'bulk' })
    expect(t.calories).toBe(t.tdee + 350)
  })

  it('never drops below the 1200 kcal floor', () => {
    const tiny: SolarisProfile = { ...base, weightKg: 35, heightCm: 140, age: 80, sex: 'female', activity: 'pod', goal: 'cut' }
    expect(computeTargets(tiny).calories).toBeGreaterThanOrEqual(1200)
  })

  it('scales protein by goal (cut 2.2 / maintain 1.8 / bulk 2.0 g·kg)', () => {
    expect(computeTargets({ ...base, goal: 'cut' }).protein).toBe(Math.round(80 * 2.2))      // 176
    expect(computeTargets({ ...base, goal: 'maintain' }).protein).toBe(Math.round(80 * 1.8)) // 144
    expect(computeTargets({ ...base, goal: 'bulk' }).protein).toBe(Math.round(80 * 2.0))     // 160
  })

  it('macro calories reconcile to roughly the target', () => {
    const t = computeTargets(base)
    const macroKcal = t.protein * 4 + t.carbs * 4 + t.fat * 9
    // rounding of grams means a few kcal of slack
    expect(Math.abs(macroKcal - t.calories)).toBeLessThanOrEqual(10)
  })
})

describe('sumDay', () => {
  it('returns zeros for an undefined day', () => {
    expect(sumDay(undefined)).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  })

  it('sums and rounds entry macros', () => {
    const log: DayLog = {
      date: '2026-06-10',
      entries: [
        { id: 'a', name: 'Oats', slot: 'breakfast', calories: 300.4, protein: 10.2, carbs: 50.1, fat: 6.3, createdAt: '' },
        { id: 'b', name: 'Chicken', slot: 'lunch', calories: 450.6, protein: 40.8, carbs: 0, fat: 12.7, createdAt: '' },
      ],
    }
    expect(sumDay(log)).toEqual({ calories: 751, protein: 51, carbs: 50, fat: 19 })
  })
})
