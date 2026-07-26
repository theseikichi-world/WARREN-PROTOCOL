import { describe, it, expect } from 'vitest'
import { filterApps, monogram, tileNeon, groupByLetter, toggleFav, type AppEntry } from './apps'

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

describe('groupByLetter', () => {
  it('groups alphabetically with digits under #', () => {
    const groups = groupByLetter(APPS)
    expect(groups[0].letter).toBe('#')
    expect(groups[0].apps[0].name).toBe('7-Zip File Manager')
    expect(groups.map(g => g.letter)).toEqual(['#', 'O', 'S', 'V'])
  })
})
