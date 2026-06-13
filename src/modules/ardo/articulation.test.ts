import { describe, it, expect } from 'vitest'
import { suggestTwisters, warmupLang, EXERCISES } from './articulation'

describe('articulation content', () => {
  it('suggests Russian скороговорки for RU and English for everything else', () => {
    expect(suggestTwisters('RU', 6).every(t => t.lang === 'RU')).toBe(true)
    expect(suggestTwisters('EN', 6).every(t => t.lang === 'EN')).toBe(true)
    expect(suggestTwisters('CN', 6).every(t => t.lang === 'EN')).toBe(true)   // fallback
  })

  it('returns at most the requested count of distinct twisters', () => {
    const list = suggestTwisters('RU', 4)
    expect(list).toHaveLength(4)
    expect(new Set(list.map(t => t.id)).size).toBe(4)
  })

  it('warmupLang collapses to RU or EN', () => {
    expect(warmupLang('RU')).toBe('RU')
    expect(warmupLang('CN')).toBe('EN')
    expect(warmupLang('other')).toBe('EN')
  })

  it('ships a non-empty exercise set', () => {
    expect(EXERCISES.length).toBeGreaterThan(0)
    expect(EXERCISES.every(e => e.name && e.instruction && e.seconds > 0)).toBe(true)
  })
})
