import { describe, it, expect } from 'vitest'
import { conditionOf, aqiBand, skyLine, isStale, type Sky } from './sky'

const sky = (p: Partial<Sky> = {}): Sky => ({
  place: 'Test', lat: 0, lon: 0,
  tempC: 18, feelsC: 18, code: 0,
  rainChance: 0, rainHour: null, uvMax: 1, aqi: null,
  fetchedAt: new Date().toISOString(),
  ...p,
})

describe('reading WMO codes', () => {
  it('maps the codes that deserve different words', () => {
    expect(conditionOf(0)).toBe('clear')
    expect(conditionOf(3)).toBe('cloud')
    expect(conditionOf(48)).toBe('fog')
    expect(conditionOf(55)).toBe('drizzle')
    expect(conditionOf(65)).toBe('rain')
    expect(conditionOf(75)).toBe('snow')
    expect(conditionOf(86)).toBe('snow')   // snow showers are still snow
    expect(conditionOf(96)).toBe('storm')
  })
})

describe('the air badge', () => {
  it('reports a band and never prescribes', () => {
    expect(aqiBand(12)?.label).toBe('good')
    expect(aqiBand(55)?.level).toBe(3)
    expect(aqiBand(140)?.level).toBe(6)
  })

  it('has nothing to show without a reading', () => {
    expect(aqiBand(null)).toBeNull()
    expect(aqiBand(NaN)).toBeNull()
  })
})

describe('one line about the sky', () => {
  it('says the plain thing when there is nothing to add', () => {
    expect(skyLine(sky({ tempC: 18 }))).toBe('18° and clear')
  })

  it('warns about sun only when it is both high and warm', () => {
    expect(skyLine(sky({ tempC: 33, uvMax: 8 }))).toContain('wear SPF')
    // A high-UV winter day is not an SPF reminder in the way that matters here.
    expect(skyLine(sky({ tempC: 4, uvMax: 8 }))).not.toContain('SPF')
  })

  it('names the hour when it knows it', () => {
    expect(skyLine(sky({ code: 61, rainChance: 70, rainHour: 15 })))
      .toContain('rain likely around 15:00')
  })

  it('gives at most one piece of advice — two is a forecast', () => {
    const line = skyLine(sky({ tempC: 30, uvMax: 9, rainChance: 80, rainHour: 17, code: 61 }))!
    expect(line).toContain('rain likely')
    expect(line).not.toContain('SPF')
  })

  it('lets a storm outrank the rain odds', () => {
    expect(skyLine(sky({ code: 95, rainChance: 90, rainHour: 18 }))).toContain('storms about')
  })

  it('blames the wind when it is the difference', () => {
    expect(skyLine(sky({ tempC: 5, feelsC: -3 }))).toContain('feels like -3°')
  })

  it('has nothing to say without a reading', () => {
    expect(skyLine(null)).toBeNull()
  })
})

describe('staleness', () => {
  it('refetches after two hours, not before', () => {
    const fresh = sky({ fetchedAt: new Date(Date.now() - 60 * 60_000).toISOString() })
    const old   = sky({ fetchedAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString() })
    expect(isStale(fresh)).toBe(false)
    expect(isStale(old)).toBe(true)
    expect(isStale(null)).toBe(true)
  })
})
