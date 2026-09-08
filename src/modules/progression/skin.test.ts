import { describe, it, expect } from 'vitest'
import { nodeSkin, STRONG_AT } from './skin'
import { THRESHOLD_UNLOCK_AT, type ChainNode } from './types'
import type { Task } from '../scrap7/types'

const node = (patch: Partial<ChainNode> = {}): ChainNode => ({
  id: 'g:a', goalId: 'g', title: 'a', cue: 'after coffee', tier: 2,
  thresholds: ['10 min', '25 min', 'an hour'], thresholdIndex: 0, unlocksAt: 0.6,
  prerequisiteIds: [], unlockedAt: '2026-01-01T00:00:00Z', toolId: null,
  scrapTaskId: 'chain:g:a', ...patch,
})

const at = (score: number): Task[] => [{
  id: 'chain:g:a', text: 'a', category: 'G', taskType: 'habit',
  completed: false, createdAt: '', origin: 'chain', score,
} as Task]

describe('the ring — how little it still costs you', () => {
  it('walks the whole way as the score climbs', () => {
    expect(nodeSkin(node({ unlockedAt: null }), at(0)).ring).toBe('locked')
    expect(nodeSkin(node({ scrapTaskId: '' }), at(0)).ring).toBe('open')
    expect(nodeSkin(node(), at(0.2)).ring).toBe('training')
    expect(nodeSkin(node(), at(STRONG_AT)).ring).toBe('strong')
    expect(nodeSkin(node(), at(THRESHOLD_UNLOCK_AT)).ring).toBe('integrated')
  })

  it('keeps a locked routine locked however high anything else reads', () => {
    expect(nodeSkin(node({ unlockedAt: null }), at(1)).ring).toBe('locked')
  })

  it('does not call an uninstalled routine trained', () => {
    // No habit means no score to have. A node waiting on your decision is OPEN,
    // and its ring says so rather than reading as a routine at zero.
    expect(nodeSkin(node({ scrapTaskId: '' }), []).ring).toBe('open')
  })
})

describe('the stars — how much it asks', () => {
  it('counts rungs above the first', () => {
    expect(nodeSkin(node({ thresholdIndex: 0 }), at(0.8)).stars).toBe(0)
    expect(nodeSkin(node({ thresholdIndex: 1 }), at(0.8)).stars).toBe(1)
    expect(nodeSkin(node({ thresholdIndex: 2 }), at(0.8)).stars).toBe(2)
  })

  it('never draws more than a frame can carry', () => {
    const long = node({ thresholds: ['a', 'b', 'c', 'd', 'e', 'f'], thresholdIndex: 5 })
    expect(nodeSkin(long, at(0.8)).stars).toBe(2)
  })

  it('is independent of the ring — that is the whole point', () => {
    // A star is bought with automatism (see `raiseThreshold`), which drops the
    // score. So a raised routine is briefly high-standard and low-automatism,
    // and the picture has to be able to say both at once.
    const raised = nodeSkin(node({ thresholdIndex: 1 }), at(0.5))
    expect(raised).toMatchObject({ ring: 'training', stars: 1 })
  })
})

describe('held — both axes at their end', () => {
  it('needs the top rung and the threshold together', () => {
    expect(nodeSkin(node({ thresholdIndex: 2 }), at(0.9)).held).toBe(true)
    expect(nodeSkin(node({ thresholdIndex: 2 }), at(0.5)).held).toBe(false)
    expect(nodeSkin(node({ thresholdIndex: 1 }), at(0.9)).held).toBe(false)
  })

  it('is not handed to a routine that never had a ladder to climb', () => {
    // One rung is the default for anything written without standards. Reaching
    // 0.70 on it is INTEGRATED and no more — the mark has to cost something.
    const flat = node({ thresholds: ['once'], thresholdIndex: 0 })
    expect(nodeSkin(flat, at(0.9))).toMatchObject({ ring: 'integrated', held: false })
  })
})
