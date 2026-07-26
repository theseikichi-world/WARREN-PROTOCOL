import { describe, it, expect } from 'vitest'
import {
  filterApps, monogram, tileNeon, groupByLetter, toggleFav,
  recordLaunch, mostUsed, recentlyUsed, fmtAgo, normalizeName, isRunning,
  type AppEntry, type LaunchStats,
} from './apps'

const APPS: AppEntry[] = [
  { name: 'Steam', path: 'C:\\sm\\Steam.lnk' },
  { name: 'Visual Studio Code', path: 'C:\\sm\\Code.lnk' },
  { name: 'OBS Studio', path: 'C:\\sm\\OBS.lnk' },
  { name: '7-Zip File Manager', path: 'C:\\sm\\7zip.lnk' },
]

describe('filterApps', () => {
  it('returns everything for an empty query', () => {
    expect(filterApps(APPS, '  ')).toHaveLength(4)
  })
  it('matches case-insensitive substrings', () => {
    expect(filterApps(APPS, 'studio').map(a => a.name)).toEqual(['Visual Studio Code', 'OBS Studio'])
  })
  it('returns empty for no match', () => {
    expect(filterApps(APPS, 'zzz')).toHaveLength(0)
  })
})

describe('monogram', () => {
  it('takes initials of the first two words', () => {
    expect(monogram('Visual Studio Code')).toBe('VS')
  })
  it('takes two letters of a single word', () => {
    expect(monogram('Steam')).toBe('ST')
  })
  it('handles hyphenated names and empties', () => {
    expect(monogram('7-Zip File Manager')).toBe('7Z')
    expect(monogram('   ')).toBe('?')
  })
})

describe('tileNeon', () => {
  it('is deterministic and returns a hex color', () => {
    expect(tileNeon('Steam')).toBe(tileNeon('Steam'))
    expect(tileNeon('Steam')).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('toggleFav', () => {
  it('appends a missing path and removes a present one', () => {
    const once = toggleFav([], 'a.lnk')
    expect(once).toEqual(['a.lnk'])
    expect(toggleFav(once, 'a.lnk')).toEqual([])
  })
  it('preserves order of the others', () => {
    expect(toggleFav(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })
})

describe('launch history', () => {
  const T0 = new Date('2026-07-26T20:00:00.000Z')

  it('records the first launch and increments later ones', () => {
    const once = recordLaunch({}, 'C:\\sm\\Steam.lnk', T0)
    expect(once['C:\\sm\\Steam.lnk']).toEqual({ count: 1, last: T0.toISOString() })
    const twice = recordLaunch(once, 'C:\\sm\\Steam.lnk', new Date('2026-07-26T21:00:00.000Z'))
    expect(twice['C:\\sm\\Steam.lnk'].count).toBe(2)
  })

  it('does not mutate the stats it is given', () => {
    const before: LaunchStats = {}
    recordLaunch(before, 'x', T0)
    expect(before).toEqual({})
  })

  it('ranks by launch count, and separately by recency', () => {
    const stats: LaunchStats = {
      'C:\\sm\\Steam.lnk': { count: 10, last: '2026-07-20T10:00:00.000Z' },
      'C:\\sm\\Code.lnk':  { count: 2,  last: '2026-07-26T19:00:00.000Z' },
    }
    expect(mostUsed(APPS, stats, 5).map(a => a.name)).toEqual(['Steam', 'Visual Studio Code'])
    expect(recentlyUsed(APPS, stats, 5).map(a => a.name)).toEqual(['Visual Studio Code', 'Steam'])
  })

  it('ignores programs that were never launched', () => {
    expect(mostUsed(APPS, {}, 5)).toHaveLength(0)
    expect(recentlyUsed(APPS, {}, 5)).toHaveLength(0)
  })
})

describe('fmtAgo', () => {
  const now = new Date('2026-07-26T20:00:00.000Z')
  it('scales from minutes to weeks', () => {
    expect(fmtAgo('2026-07-26T19:59:30.000Z', now)).toBe('now')
    expect(fmtAgo('2026-07-26T19:30:00.000Z', now)).toBe('30m')
    expect(fmtAgo('2026-07-26T17:00:00.000Z', now)).toBe('3h')
    expect(fmtAgo('2026-07-24T20:00:00.000Z', now)).toBe('2d')
    expect(fmtAgo('2026-07-05T20:00:00.000Z', now)).toBe('3w')
  })
  it('never shows a negative age', () => {
    expect(fmtAgo('2026-07-27T20:00:00.000Z', now)).toBe('now')
  })
})

describe('isRunning', () => {
  it('matches an exact process name', () => {
    expect(isRunning('Discord', ['discord', 'chrome'])).toBe(true)
  })
  it('matches a shortcut whose exe is named differently', () => {
    expect(isRunning('Visual Studio Code', ['code'])).toBe(true)
    expect(isRunning('Steam', ['steamwebhelper'])).toBe(true)
  })
  it('will not match on a too-short fragment', () => {
    expect(isRunning('OBS Studio', ['ob'])).toBe(false)
    expect(normalizeName('7-Zip File Manager')).toBe('7zipfilemanager')
  })
  it('returns false when nothing is running', () => {
    expect(isRunning('Steam', [])).toBe(false)
  })
})

describe('groupByLetter', () => {
  it('groups alphabetically with digits under #', () => {
    const groups = groupByLetter(APPS)
    expect(groups[0].letter).toBe('#')
    expect(groups[0].apps[0].name).toBe('7-Zip File Manager')
    expect(groups.map(g => g.letter)).toEqual(['#', 'O', 'S', 'V'])
  })
})
