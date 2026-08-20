import { describe, it, expect } from 'vitest'
import { volumeScale, soundEnabled, play, resetAudio, MASTER_GAIN } from './sound'

describe('volumeScale', () => {
  it('turns a percentage into a multiplier', () => {
    expect(volumeScale(0)).toBe(0)
    expect(volumeScale(60)).toBe(0.6)
    expect(volumeScale(100)).toBe(1)
  })

  it('clamps rather than trusting stored data', () => {
    expect(volumeScale(-40)).toBe(0)
    expect(volumeScale(9000)).toBe(1)
  })

  it('defaults to full scale when the setting is missing or broken', () => {
    // Absent means "not configured yet", not "silent" — the master gain is
    // already low enough that full scale is quiet.
    expect(volumeScale(undefined)).toBe(1)
    expect(volumeScale(NaN)).toBe(1)
  })
})

describe('soundEnabled', () => {
  it('is on unless it was turned off', () => {
    expect(soundEnabled({})).toBe(true)
    expect(soundEnabled({ sounds: true })).toBe(true)
    expect(soundEnabled({ sounds: false })).toBe(false)
  })

  it('is off at zero volume, whatever the toggle says', () => {
    expect(soundEnabled({ sounds: true, soundVolume: 0 })).toBe(false)
  })
})

describe('play', () => {
  it('stays quiet rather than throwing where there is no Web Audio', () => {
    // jsdom has no AudioContext. Audio is a garnish: every failure path here
    // degrades to silence, never to a broken screen.
    expect(() => play('level')).not.toThrow()
    expect(() => play('tick')).not.toThrow()
    expect(() => resetAudio()).not.toThrow()
  })
})

describe('the master level', () => {
  it('is low on purpose', () => {
    // If a cue is ever the loudest thing in the room it is wrong. This pins the
    // intent so a future tweak has to be deliberate.
    expect(MASTER_GAIN).toBeLessThanOrEqual(0.2)
  })
})
