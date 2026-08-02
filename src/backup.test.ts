import { describe, it, expect } from 'vitest'
import { resetKeys, RESET_KEEP } from './backup'

const ALL = [
  'warren_settings', 'warren_locale',
  'warren_progression_v1', 'scrap7_v4', 'scrap7_v3',
  'log_v1', 'ardo_v1', 'solaris_v1', 'journal_v1', 'pictures_v1', 'infinity8_v1',
  'bigscreen_favs_v1', 'bigscreen_launches_v1', 'pictures_discover_2026',
]

describe('start over', () => {
  it('keeps settings and locale, and nothing else', () => {
    const kept = ALL.filter(k => !resetKeys(ALL).includes(k))
    expect(kept).toEqual([...RESET_KEEP])
  })

  it('takes every module record', () => {
    const gone = resetKeys(ALL)
    for (const key of ['warren_progression_v1', 'scrap7_v4', 'log_v1', 'ardo_v1',
                       'solaris_v1', 'journal_v1', 'pictures_v1', 'infinity8_v1']) {
      expect(gone).toContain(key)
    }
  })

  it('takes scrap7_v3 too, or the migration resurrects every old task', () => {
    expect(resetKeys(ALL)).toContain('scrap7_v3')
  })

  it('sweeps keys it has never heard of — a later module cannot survive a reset', () => {
    expect(resetKeys([...ALL, 'otty_v1', 'kana_v2'])).toEqual(
      expect.arrayContaining(['otty_v1', 'kana_v2']))
  })

  it('is a no-op on a machine that only has settings', () => {
    expect(resetKeys([...RESET_KEEP])).toEqual([])
  })
})
