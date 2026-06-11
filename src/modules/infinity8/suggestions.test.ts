import { describe, it, expect } from 'vitest'
import { suggestionsForGap, topSuggestion, assignToFreeBlocks, type Suggestion } from './suggestions'

const mk = (over: Partial<Suggestion>): Suggestion => ({
  id: 'x', module: 'pictures', icon: '★', label: 'L', minutes: 30,
  path: '/x', tone: 'play', weight: 5, ...over,
})

// A realistic mixed pool, strongest first (gatherSuggestions returns sorted)
const pool: Suggestion[] = [
  mk({ id: 'tv',  module: 'pictures', minutes: 45,  weight: 9, tone: 'play' }),
  mk({ id: 'due', module: 'ardo',     minutes: 20,  weight: 8, tone: 'grow' }),
  mk({ id: 'jrn', module: 'journal',  minutes: 15,  weight: 7, tone: 'care' }),
  mk({ id: 'mv',  module: 'pictures', minutes: 120, weight: 5, tone: 'play' }),
]

describe('suggestionsForGap', () => {
  it('drops anything that does not fit the gap (with small slack)', () => {
    const picks = suggestionsForGap(pool, 20)
    expect(picks.map(s => s.id)).toEqual(['due', 'jrn']) // tv(45) & mv(120) too long
  })

  it('lets a 45-min episode into a 40-min gap via slack', () => {
    expect(suggestionsForGap(pool, 40).some(s => s.id === 'tv')).toBe(true)
  })

  it('never picks two from the same module (variety)', () => {
    const picks = suggestionsForGap(pool, 999, 4)
    const modules = picks.map(s => s.module)
    expect(new Set(modules).size).toBe(modules.length)
  })

  it('honours the max count', () => {
    expect(suggestionsForGap(pool, 999, 1)).toHaveLength(1)
  })
})

describe('topSuggestion', () => {
  it('returns the strongest that fits the time left', () => {
    expect(topSuggestion(pool, 20)?.id).toBe('due')
  })
  it('falls back to the strongest overall when nothing fits', () => {
    expect(topSuggestion(pool, 0)?.id).toBe('tv')  // even jrn(15) needs a 5-min gap
  })
  it('returns null on an empty pool', () => {
    expect(topSuggestion([], 60)).toBeNull()
  })
})

describe('assignToFreeBlocks', () => {
  it('puts the long film in the long block, drills in the short one', () => {
    const tailored: Suggestion[] = [
      mk({ id: 'drill', module: 'ardo',     minutes: 20 }),
      mk({ id: 'film',  module: 'pictures', minutes: 120 }),
    ]
    const map = assignToFreeBlocks([{ id: 'short', minutes: 30 }, { id: 'long', minutes: 150 }], tailored)
    expect(map.short.map(s => s.id)).not.toContain('film')      // 120 can't fit 30
    expect(map.long.some(s => s.id === 'film')).toBe(true)      // 120 fits 150
  })

  it('never repeats the same suggestion across blocks', () => {
    const blocks = [{ id: 'a', minutes: 60 }, { id: 'b', minutes: 60 }]
    const all = Object.values(assignToFreeBlocks(blocks, pool)).flat().map(s => s.id)
    expect(new Set(all).size).toBe(all.length)
  })

  it('omits blocks that get no fitting suggestion', () => {
    const map = assignToFreeBlocks([{ id: 'tiny', minutes: 3 }], pool)
    expect(map.tiny).toBeUndefined()
  })
})
