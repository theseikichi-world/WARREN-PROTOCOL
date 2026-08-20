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

describe('VIGILANTE survives a backup', () => {
  it('carries the training record and the ladder position', async () => {
    // The log IS the ladder — stage is derived from it — so losing this file
    // does not just lose history, it silently resets you to stage 0.
    // A tiny in-memory shim: this suite runs in node, where the other cases
    // only ever touch pure functions.
    const store = new Map<string, string>()
    ;(globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() { return store.size },
    }

    const { exportAllJson, importBackup } = await import('./backup')
    localStorage.setItem('vigilante_v1', JSON.stringify({
      spec: { tier: 'hero', restSec: 30, rounds: 3, leadInSec: 10 },
      log: [{ id: 'a', date: '2026-08-20', finished: true, heldSec: 360 }],
      voiceOn: true, habitId: 'life:own-statics', habitDays: ['mon'], version: 1,
    }))

    const json = exportAllJson()
    localStorage.clear()
    importBackup(json)

    const back = JSON.parse(localStorage.getItem('vigilante_v1')!)
    expect(back.spec.tier).toBe('hero')
    expect(back.log).toHaveLength(1)
    expect(back.habitId).toBe('life:own-statics')
  })
})

describe('a backup round-trips values that are not JSON', () => {
  const shim = () => {
    const store = new Map<string, string>()
    ;(globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() { return store.size },
    }
  }

  it('accepts the locale, which is a bare string and not JSON', async () => {
    // The regression: import demanded every value parse as JSON, so a single
    // "ru" rejected the entire file — every backup made after the language had
    // been set was unimportable.
    shim()
    const { exportAllJson, importBackup } = await import('./backup')
    localStorage.setItem('warren_locale', 'ru')
    localStorage.setItem('scrap7_v4', JSON.stringify({ tasks: [] }))

    const json = exportAllJson()
    localStorage.clear()
    expect(() => importBackup(json)).not.toThrow()
    expect(localStorage.getItem('warren_locale')).toBe('ru')
  })

  it('still refuses a JSON store that has been truncated', async () => {
    // The check has to keep earning its place: mangled JSON must not restore.
    shim()
    const { importBackup } = await import('./backup')
    const bad = JSON.stringify({
      app: 'warren', version: 1, exportedAt: '', data: { scrap7_v4: '{"tasks":[' },
    })
    expect(() => importBackup(bad)).toThrow()
  })
})

describe('secrets travel sealed, never in the file', () => {
  const shim = () => {
    const store = new Map<string, string>()
    ;(globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() { return store.size },
    }
  }
  const seed = () => localStorage.setItem('warren_settings', JSON.stringify({
    userName: 'V', aiApiKey: 'sk-ant-real', tmdbApiKey: 'tmdb', rawgApiKey: 'rawg',
    syncPassphrase: 'correct horse', syncBypass: 'tok',
  }))

  it('keeps every key out of the downloadable file', async () => {
    // The file gets mailed and dropped in shared folders. A billable key in it
    // is a key anyone who sees the file can spend.
    shim(); const { exportAllJson } = await import('./backup'); seed()
    const out = exportAllJson()
    for (const secret of ['sk-ant-real', 'tmdb', 'rawg', 'correct horse', 'tok'])
      expect(out).not.toContain(secret)
  })

  it('carries the API keys when the payload is going to be sealed', async () => {
    shim(); const { exportAll } = await import('./backup'); seed()
    const s = JSON.parse(exportAll({ secrets: true }).data['warren_settings'])
    expect(s.aiApiKey).toBe('sk-ant-real')
    expect(s.tmdbApiKey).toBe('tmdb')
  })

  it('never carries the passphrase, even sealed', async () => {
    // The key to the vault does not go inside the vault, and a device that can
    // open the blob already has the passphrase by definition.
    shim(); const { exportAll } = await import('./backup'); seed()
    const s = JSON.parse(exportAll({ secrets: true }).data['warren_settings'])
    expect(s.syncPassphrase).toBeUndefined()
    expect(s.syncBypass).toBeUndefined()
  })

  it('leaves a device its own key when the incoming blob has none', async () => {
    shim(); const { importBackup } = await import('./backup')
    localStorage.setItem('warren_settings', JSON.stringify({ aiApiKey: 'sk-ant-mine' }))
    importBackup(JSON.stringify({
      app: 'warren', version: 1, exportedAt: '',
      data: { warren_settings: JSON.stringify({ userName: 'V' }) },
    }))
    expect(JSON.parse(localStorage.getItem('warren_settings')!).aiApiKey).toBe('sk-ant-mine')
  })
})
