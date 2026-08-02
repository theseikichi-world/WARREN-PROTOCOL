import { describe, it, expect } from 'vitest'
import {
  LIFE_SUPPORT, baselineTaskId, findTemplate, templateForTask, availableTemplates,
} from './lifeSupport'
import { baseXp, awardBaselineXp } from './xp'
import { taskOrigin, feedsProgression, isRoutine, isBaseline, isUnbound } from '../scrap7/types'

describe('life support templates', () => {
  it('has a unique id, an anchor and a target for every template', () => {
    const ids = LIFE_SUPPORT.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of LIFE_SUPPORT) {
      expect(t.cue.trim()).not.toBe('')
      expect(t.cueRu.trim()).not.toBe('')
      expect(t.target).toBeGreaterThan(0)
    }
  })

  it('never duplicates an instrument — water, food and writing are not basics', () => {
    const titles = LIFE_SUPPORT.map(t => t.title.toLowerCase()).join(' ')
    expect(titles).not.toMatch(/water|drink|calorie|meal|journal|write/)
  })

  it('derives a stable habit id from the template', () => {
    expect(baselineTaskId('sleep')).toBe('life:sleep')
    expect(templateForTask('life:sleep')).toBe(findTemplate('sleep'))
  })

  it('does not mistake a chain routine for a template', () => {
    expect(templateForTask('chain:goal-actor:reading')).toBeNull()
    expect(templateForTask('life:not-a-template')).toBeNull()
  })

  it('offers only what is not already installed', () => {
    const offered = availableTemplates(['life:sleep', 'chain:goal-actor:reading'])
    expect(offered.map(t => t.id)).not.toContain('sleep')
    expect(offered).toHaveLength(LIFE_SUPPORT.length - 1)
  })
})

describe('baseline economy', () => {
  it('pays a fraction of the cheapest routine run', () => {
    expect(baseXp({ kind: 'baseline.run' })).toBeLessThan(baseXp({ kind: 'routine.run', tier: 1 }))
  })

  it('pays less for going automatic than a routine does', () => {
    expect(baseXp({ kind: 'baseline.automatic' }))
      .toBeLessThan(baseXp({ kind: 'routine.integrated' }))
  })

  it('is flat — no slot rate, because it belongs to no uplink', () => {
    expect(awardBaselineXp({ kind: 'baseline.run' })).toBe(baseXp({ kind: 'baseline.run' }))
  })

  it('cannot out-earn goal work: a full day of every basic is under one tier-2 run', () => {
    const wholeFloor = LIFE_SUPPORT.length * baseXp({ kind: 'baseline.run' })
    expect(wholeFloor).toBeLessThanOrEqual(baseXp({ kind: 'routine.run', tier: 4 }))
  })
})

describe('task origin', () => {
  const of = (origin?: 'manual' | 'log' | 'chain' | 'baseline') => ({ origin })

  it('routines and life support earn; hand-made and L.O.G do not', () => {
    expect(feedsProgression(of('chain'))).toBe(true)
    expect(feedsProgression(of('baseline'))).toBe(true)
    expect(feedsProgression(of('manual'))).toBe(false)
    expect(feedsProgression(of('log'))).toBe(false)
  })

  it('separates the two earning kinds', () => {
    expect(isRoutine(of('chain'))).toBe(true)
    expect(isRoutine(of('baseline'))).toBe(false)
    expect(isBaseline(of('baseline'))).toBe(true)
  })

  it('lists only hand-made habits as yours', () => {
    expect(isUnbound(of('manual'))).toBe(true)
    expect(isUnbound(of('baseline'))).toBe(false)
    expect(isUnbound(of('chain'))).toBe(false)
  })

  it('still infers a legacy task with no origin field', () => {
    expect(taskOrigin({})).toBe('manual')
    expect(taskOrigin({ logDream: 'Become an actor' })).toBe('log')
  })
})
