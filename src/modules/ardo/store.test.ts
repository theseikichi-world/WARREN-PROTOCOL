import { describe, it, expect } from 'vitest'
import { applyReview } from './store'
import type { ReviewCard } from './types'

const card = (over: Partial<ReviewCard> = {}): ReviewCard => ({
  id: 'c1', chunkId: 'ch1', textId: 't1',
  nextReviewDate: '2026-06-10', intervalDays: 0,
  easeFactor: 2.5, lastScore: 0, reviewCount: 0,
  ...over,
})

describe('applyReview (SM-2)', () => {
  it('a new card scored "remember" uses the first init interval (medium = 1 day)', () => {
    const r = applyReview(card(), 3, 'medium')
    expect(r.intervalDays).toBe(1)
    expect(r.reviewCount).toBe(1)
  })

  it('"forgot" (score 1) always resets to 1 day', () => {
    const r = applyReview(card({ reviewCount: 5, intervalDays: 30 }), 1, 'medium')
    expect(r.intervalDays).toBe(1)
  })

  it('raises ease factor on a perfect score (4)', () => {
    // 2.5 + 0.1*4 - 0.08*(4-4)^2 = 2.9
    expect(applyReview(card(), 4, 'medium').easeFactor).toBeCloseTo(2.9, 5)
  })

  it('lowers ease factor on a poor score and never below 1.3', () => {
    // score 2 from EF 1.35: 1.35 + 0.2 - 0.08*4 = 1.23 → clamped to 1.3
    expect(applyReview(card({ easeFactor: 1.35 }), 2, 'medium').easeFactor).toBe(1.3)
  })

  it('compounds interval by ease × pace once past the init phase', () => {
    // reviewCount 3 (past init), interval 10, EF→2.9 (score 4), fast pace 1.4
    const r = applyReview(card({ reviewCount: 3, intervalDays: 10 }), 4, 'fast')
    expect(r.intervalDays).toBe(Math.round(10 * 2.9 * 1.4)) // 41
  })

  it('caps the interval at 90 days', () => {
    const r = applyReview(card({ reviewCount: 8, intervalDays: 80 }), 4, 'fast')
    expect(r.intervalDays).toBeLessThanOrEqual(90)
  })

  it('nextReviewDate moves forward by the new interval', () => {
    const r = applyReview(card(), 3, 'medium')
    const today = new Date(); today.setDate(today.getDate() + r.intervalDays)
    expect(r.nextReviewDate).toBe(today.toISOString().slice(0, 10))
  })
})
