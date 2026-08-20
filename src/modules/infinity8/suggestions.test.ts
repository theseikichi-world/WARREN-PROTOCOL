import { describe, it, expect } from 'vitest'
import {
  suggestionsForGap, topSuggestion, assignToFreeBlocks, suggestionAllowed,
  caughtUp, watchMinutes, TV_FALLBACK_MIN, COMEDY_FALLBACK_MIN, MOVIE_FALLBACK_MIN,
  type Suggestion,
} from './suggestions'
import { MODULE_LEVEL } from '../../moduleAccess'

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

// Rule 30: a locked door names what opens it — it does not knock from the other
// side. The owl was inviting you to write tonight's page at level 1, while
// CAPTAIN'S JOURNAL stays locked until level 3.
describe('suggestionAllowed (no invitation from a shut door)', () => {
  const journalLevel = MODULE_LEVEL.hoot ?? 1

  it('keeps the journal quiet until its module opens', () => {
    for (let lv = 1; lv < journalLevel; lv++)
      expect(suggestionAllowed('journal', lv)).toBe(false)
    expect(suggestionAllowed('journal', journalLevel)).toBe(true)
  })

  it('lets ungated utilities speak from level 1', () => {
    expect(suggestionAllowed('pictures', 1)).toBe(true)
    expect(suggestionAllowed('ardo', 1)).toBe(true)
  })

  it('opens every door under unlockAll', () => {
    expect(suggestionAllowed('journal', 1, true)).toBe(true)
  })

  it('stays silent for a module that is not built', () => {
    // PATHFINDER is retired — built:false — so it invites nobody, at any level
    // and even with every door forced open.
    expect(suggestionAllowed('log', 99)).toBe(false)
    expect(suggestionAllowed('log', 99, true)).toBe(false)
  })
})

// A show you are caught up on is not an invitation — the next episode is a date
// in the future, so "pick up where you left off" is simply false. And a 22-min
// comedy is not a 45-min drama: the timeline sizes free gaps off these numbers.
describe('caughtUp', () => {
  it('is caught up when every aired episode is watched', () => {
    expect(caughtUp(3, 3)).toBe(true)     // S01 E03/10, 3 watched — waiting on E04
    expect(caughtUp(3, 4)).toBe(true)     // ahead somehow; still nothing to offer
  })

  it('is not caught up with episodes still waiting', () => {
    expect(caughtUp(5, 3)).toBe(false)
  })

  it('is not caught up when the release count is unknown', () => {
    // No data is not the same as nothing to watch — keep the soft nudge.
    expect(caughtUp(null, 3)).toBe(false)
    expect(caughtUp(undefined, 3)).toBe(false)
    expect(caughtUp(0, 0)).toBe(false)
  })
})

describe('watchMinutes', () => {
  it('uses the real runtime whenever we have one', () => {
    expect(watchMinutes({ runtime: 22, genre: ['Drama'] }, TV_FALLBACK_MIN)).toBe(22)
    expect(watchMinutes({ runtime: 96 }, MOVIE_FALLBACK_MIN)).toBe(96)
  })

  it('guesses a half-hour for comedies with no runtime stored', () => {
    expect(watchMinutes({ genre: ['Comedy', 'Sci-Fi & Fantasy'] }, TV_FALLBACK_MIN))
      .toBe(COMEDY_FALLBACK_MIN)
  })

  it('falls back to the type default otherwise', () => {
    expect(watchMinutes({ genre: ['Drama'] }, TV_FALLBACK_MIN)).toBe(TV_FALLBACK_MIN)
    expect(watchMinutes({}, MOVIE_FALLBACK_MIN)).toBe(MOVIE_FALLBACK_MIN)
    // A zero or negative runtime is bad data, not a zero-minute episode.
    expect(watchMinutes({ runtime: 0 }, TV_FALLBACK_MIN)).toBe(TV_FALLBACK_MIN)
  })

  it('does not shrink a movie just because it is a comedy', () => {
    expect(watchMinutes({ genre: ['Comedy'] }, MOVIE_FALLBACK_MIN)).toBe(MOVIE_FALLBACK_MIN)
  })
})

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
