import { describe, it, expect } from 'vitest'
import {
  LIFE_SUPPORT, baselineTaskId, customTaskId, findTemplate, templateForTask,
  availableTemplates, offerTemplates, lifeSupportSlots, nextSlotGate,
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

  it('cannot out-earn goal work — the slot ceiling, not the shelf, is what bounds it', () => {
    // The template shelf is deliberately larger than anyone can run. What has to
    // stay bounded is what can actually be installed at once.
    const maxSlots   = lifeSupportSlots(Number.MAX_SAFE_INTEGER)
    const wholeFloor = maxSlots * baseXp({ kind: 'baseline.run' })
    expect(wholeFloor).toBeLessThanOrEqual(baseXp({ kind: 'routine.run', tier: 4 }))
    expect(maxSlots).toBeLessThan(LIFE_SUPPORT.length)
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

describe('slots', () => {
  it('gives exactly one at level 1 — a floor, not a list to abandon', () => {
    expect(lifeSupportSlots(1)).toBe(1)
  })

  it('widens at the in-between levels and never narrows', () => {
    const seen = Array.from({ length: 20 }, (_, i) => lifeSupportSlots(i + 1))
    expect(seen[1]).toBe(2)                       // level 2
    expect(seen[3]).toBe(3)                       // level 4
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1])
  })

  it('never offers more slots than there are templates to fill them', () => {
    expect(lifeSupportSlots(99)).toBeLessThanOrEqual(LIFE_SUPPORT.length)
  })

  it('names the next widening, and stops naming one at the ceiling', () => {
    expect(nextSlotGate(1)?.level).toBe(2)
    expect(nextSlotGate(99)).toBeNull()
  })

  it('is zero below level 1 rather than negative', () => {
    expect(lifeSupportSlots(0)).toBe(0)
  })
})

describe('the picker', () => {
  it('shows a handful rather than the whole shelf', () => {
    expect(offerTemplates([], 0)).toHaveLength(4)
  })

  it('shows something different on refresh', () => {
    const first  = offerTemplates([], 0).map(t => t.id)
    const second = offerTemplates([], 4).map(t => t.id)
    expect(second).not.toEqual(first)
  })

  it('wraps, so refreshing forever always finds something', () => {
    const big = offerTemplates([], LIFE_SUPPORT.length * 3 + 1)
    expect(big).toHaveLength(4)
    expect(new Set(big.map(t => t.id)).size).toBe(4)
  })

  it('never offers what is already running', () => {
    const installed = LIFE_SUPPORT.slice(0, 3).map(t => baselineTaskId(t.id))
    for (let offset = 0; offset < LIFE_SUPPORT.length; offset++) {
      for (const t of offerTemplates(installed, offset)) {
        expect(installed).not.toContain(baselineTaskId(t.id))
      }
    }
  })

  it('offers nothing at all once every template is running', () => {
    expect(offerTemplates(LIFE_SUPPORT.map(t => baselineTaskId(t.id)), 0)).toEqual([])
  })
})

describe('your own basics', () => {
  it('keeps custom ids inside the life-support namespace', () => {
    expect(customTaskId('feed-the-cat')).toBe('life:own-feed-the-cat')
    expect(customTaskId('feed-the-cat').startsWith('life:')).toBe(true)
  })

  it('is not mistaken for a template', () => {
    expect(templateForTask(customTaskId('feed-the-cat'))).toBeNull()
  })
})
