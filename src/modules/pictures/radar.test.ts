import { describe, it, expect } from 'vitest'
import { buildRadar, countdown, dayDiff } from './radar'
import type { MediaItem } from './types'

const NOW = new Date('2026-07-28T09:00:00.000Z')

/** YYYY-MM-DD n days from NOW. */
const at = (offset: number): string =>
  new Date(Date.parse('2026-07-28T12:00:00.000Z') + offset * 86_400_000).toISOString().slice(0, 10)

const item = (p: Partial<MediaItem>): MediaItem => ({
  id: 'x', title: 'Thing', type: 'movie', status: 'watchlist',
  progress: { season: 1, episode: 0 }, emoji: '🎬', ...p,
}) as MediaItem

describe('dayDiff', () => {
  it('counts whole days regardless of time of day', () => {
    expect(dayDiff(at(0), NOW)).toBe(0)
    expect(dayDiff(at(5), NOW)).toBe(5)
    expect(dayDiff(at(-2), NOW)).toBe(-2)
  })
  it('rejects a malformed date', () => {
    expect(dayDiff('not-a-date', NOW)).toBeNull()
  })
})

describe('buildRadar', () => {
  it('lists upcoming soonest-first and caps the count', () => {
    const { upcoming } = buildRadar([
      item({ id: 'a', title: 'Far',   release_date: at(30) }),
      item({ id: 'b', title: 'Soon',  release_date: at(2) }),
      item({ id: 'c', title: 'Mid',   release_date: at(9) }),
      item({ id: 'd', title: 'Later', release_date: at(40) }),
    ], NOW, 3)
    expect(upcoming.map(i => i.title)).toEqual(['Soon', 'Mid', 'Far'])
  })

  it('prefers the next episode for a tracked show', () => {
    const { upcoming } = buildRadar([
      item({ id: 'tv', title: 'Show', type: 'tv', status: 'watching',
        release_date: at(100), next_episode_date: at(3) }),
    ], NOW)
    expect(upcoming[0].kind).toBe('episode')
    expect(upcoming[0].days).toBe(3)
  })

  it('separates things that dropped in the last week', () => {
    const { upcoming, recent } = buildRadar([
      item({ id: 'a', title: 'Just out', release_date: at(-2) }),
      item({ id: 'b', title: 'Old news', release_date: at(-20) }),
      item({ id: 'c', title: 'Coming',   release_date: at(4) }),
    ], NOW)
    expect(recent.map(i => i.title)).toEqual(['Just out'])
    expect(recent[0].isNew).toBe(true)
    expect(upcoming.map(i => i.title)).toEqual(['Coming'])
  })

  it('ignores finished titles and anything without a date', () => {
    const { upcoming, recent } = buildRadar([
      item({ id: 'a', status: 'watched', release_date: at(3) }),
      item({ id: 'b', release_date: undefined }),
    ], NOW)
    expect(upcoming).toHaveLength(0)
    expect(recent).toHaveLength(0)
  })

  it('survives an empty library', () => {
    expect(buildRadar([], NOW)).toEqual({ upcoming: [], recent: [] })
  })
})

describe('countdown', () => {
  it('names the near dates and marks them hot', () => {
    expect(countdown(0)).toEqual({ text: 'TODAY', hot: true })
    expect(countdown(1)).toEqual({ text: 'TOMORROW', hot: true })
    expect(countdown(-1)).toEqual({ text: 'YESTERDAY', hot: true })
    expect(countdown(4).hot).toBe(true)
  })
  it('cools off and coarsens as the date recedes', () => {
    expect(countdown(20)).toEqual({ text: 'in 20d', hot: false })
    expect(countdown(35).text).toBe('in 5w')
    expect(countdown(120).text).toBe('in 4mo')
    expect(countdown(-5).text).toBe('5d ago')
  })
})
