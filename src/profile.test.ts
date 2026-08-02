import { describe, it, expect } from 'vitest'
import {
  parseHm, formatHm, sleepDuration, midsleep, chronotype, dayShape, profileBrief,
} from './profile'

describe('clock parsing', () => {
  it('reads a time into minutes and back', () => {
    expect(parseHm('07:30')).toBe(450)
    expect(parseHm('00:00')).toBe(0)
    expect(parseHm('23:59')).toBe(1439)
    expect(formatHm(450)).toBe('07:30')
    expect(formatHm(0)).toBe('00:00')
  })

  it('refuses what isn\'t a time', () => {
    for (const bad of ['', 'morning', '25:00', '07:60', '7.30', '07-30']) {
      expect(parseHm(bad)).toBeNull()
    }
  })
})

describe('the night', () => {
  it('measures across midnight', () => {
    expect(sleepDuration('23:00', '07:00')).toBe(480)   // 8h
    expect(sleepDuration('01:30', '09:00')).toBe(450)   // 7.5h
    expect(sleepDuration('22:00', '05:00')).toBe(420)   // 7h
  })

  it('handles a day-shift worker sleeping through daylight', () => {
    expect(sleepDuration('08:00', '16:00')).toBe(480)
  })

  it('finds the midpoint of the night, not of the clock', () => {
    expect(midsleep('23:00', '07:00')).toBe(3 * 60)     // 03:00
    expect(midsleep('02:00', '10:00')).toBe(6 * 60)     // 06:00
  })

  it('gives up cleanly on nonsense rather than guessing', () => {
    expect(sleepDuration('nope', '07:00')).toBeNull()
    expect(midsleep('23:00', '')).toBeNull()
    expect(chronotype('', '')).toBe('unknown')
  })
})

describe('chronotype', () => {
  it('calls an early riser a lark', () => {
    expect(chronotype('22:30', '06:30')).toBe('lark')
    expect(chronotype('23:00', '07:00')).toBe('lark')
  })

  it('calls a late riser an owl', () => {
    expect(chronotype('02:00', '10:00')).toBe('owl')
    expect(chronotype('03:00', '11:00')).toBe('owl')
  })

  it('leaves the middle alone', () => {
    expect(chronotype('00:00', '08:00')).toBe('neutral')
  })

  it('reads the same person the same way whatever their sleep length', () => {
    // Both wake at 07:00; one sleeps six hours, one nine. Still not owls.
    expect(chronotype('01:00', '07:00')).not.toBe('owl')
    expect(chronotype('22:00', '07:00')).not.toBe('owl')
  })
})

describe('what the guide is told', () => {
  it('states the hours and the lean', () => {
    const brief = profileBrief(dayShape('02:00', '10:00'))
    expect(brief).toContain('wakes 10:00')
    expect(brief).toContain('sleeps 02:00')
    expect(brief).toContain('NIGHT OWL')
  })

  it('warns the guide off early mornings for an owl, and toward them for a lark', () => {
    expect(profileBrief(dayShape('02:00', '10:00'))).toMatch(/not build this chain on early mornings/)
    expect(profileBrief(dayShape('22:30', '06:30'))).toMatch(/first hours/)
  })

  it('says nothing at all when the hours are unreadable', () => {
    expect(profileBrief(dayShape('', ''))).toBe('')
  })

  it('reports the night in hours, rounded to something a person would say', () => {
    expect(dayShape('23:00', '07:00').hours).toBe(8)
    expect(dayShape('23:30', '07:00').hours).toBe(7.5)
  })
})
