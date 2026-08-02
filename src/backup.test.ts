import { describe, it, expect } from 'vitest'
import { resetKeys, RESET_KEEP, RESET_PROFILE_FIELDS, stripProfile } from './backup'

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

describe('starting over means starting over', () => {
  it('strips every trace of the person from settings', () => {
    const before = JSON.stringify({
      displayName: 'SEIKICHI', gender: 'other', wakeTime: '10:00', sleepTime: '02:00',
      onboardedAt: '2026-08-02T00:00:00.000Z',
      aiApiKey: 'sk-ant-keep-me', accentColor: '#00f5ff',
    })
    const after = JSON.parse(stripProfile(before))
    for (const field of RESET_PROFILE_FIELDS) expect(after[field]).toBeUndefined()
  })

  it('keeps machine setup — a reset should not cost you your API key', () => {
    const after = JSON.parse(stripProfile(JSON.stringify({
      displayName: 'SEIKICHI', aiApiKey: 'sk-ant-keep-me', accentColor: '#ff6b00',
    })))
    expect(after.aiApiKey).toBe('sk-ant-keep-me')
    expect(after.accentColor).toBe('#ff6b00')
  })

  it('drops onboardedAt, so FIRST CONTACT asks again', () => {
    expect(RESET_PROFILE_FIELDS).toContain('onboardedAt')
  })

  it('leaves unparsable settings alone rather than destroying them', () => {
    expect(stripProfile('not json')).toBe('not json')
  })
})

describe('tours', () => {
  it('are wiped by a reset, so a fresh start is a fresh start', () => {
    // The seen-flags live in their own key, and reset keeps only settings+locale
    expect(resetKeys(['warren_tours_v1', ...RESET_KEEP])).toEqual(['warren_tours_v1'])
  })
})
