import { describe, it, expect } from 'vitest'
import { getHabitTier } from './types'

describe('getHabitTier (exponential-smoothing score → tier)', () => {
  it('a fresh habit (score 0) is "new"', () => {
    expect(getHabitTier(0).tier).toBe('new')
  })

  it('climbs tiers as score rises', () => {
    expect(getHabitTier(0.1).tier).toBe('spark')
    expect(getHabitTier(0.3).tier).toBe('forming')
    expect(getHabitTier(0.5).tier).toBe('building')
    expect(getHabitTier(0.8).tier).toBe('strong')
    expect(getHabitTier(0.9).tier).toBe('hardened')
  })

  it('a maxed habit (score 1) is "forged"', () => {
    expect(getHabitTier(1).tier).toBe('forged')
  })

  it('boundary: exactly 0.01 leaves "new" for "spark"', () => {
    expect(getHabitTier(0.009).tier).toBe('new')
    expect(getHabitTier(0.01).tier).toBe('spark')
  })

  it('every tier carries a label and color', () => {
    const t = getHabitTier(0.5)
    expect(t.label).toBeTruthy()
    expect(t.color).toMatch(/^#[0-9a-f]{6}$/i)
  })
})
