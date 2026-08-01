import { describe, it, expect } from 'vitest'
import { computeDepths, layoutTree, NODE_W, NODE_H, GAP_X, GAP_Y } from './layout'
import type { ChainNode } from './types'

const node = (id: string, after: string[] = []): ChainNode => ({
  id, goalId: 'g', title: id, cue: 'cue', tier: 2,
  thresholds: ['a', 'b'], thresholdIndex: 0, unlocksAt: 0.6,
  prerequisiteIds: after, unlockedAt: null, toolId: null, scrapTaskId: '',
})

describe('computeDepths', () => {
  it('puts entry points at the top', () => {
    const d = computeDepths([node('a'), node('b')])
    expect(d.get('a')).toBe(0)
    expect(d.get('b')).toBe(0)
  })

  it('places a routine below everything it needs', () => {
    const d = computeDepths([node('a'), node('b', ['a']), node('c', ['b'])])
    expect([d.get('a'), d.get('b'), d.get('c')]).toEqual([0, 1, 2])
  })

  it('uses the longest path when prerequisites disagree', () => {
    // roda needs berimbau (depth 2) and cardio (depth 1) → must sit at 3
    const d = computeDepths([
      node('training'), node('mobility', ['training']),
      node('ginga', ['mobility']), node('cardio', ['mobility']),
      node('berimbau', ['ginga']),
      node('roda', ['berimbau', 'cardio']),
    ])
    expect(d.get('cardio')).toBe(2)
    expect(d.get('berimbau')).toBe(3)
    expect(d.get('roda')).toBe(4)
  })

  it('does not hang on a cyclic or dangling graph', () => {
    expect(() => computeDepths([node('a', ['b']), node('b', ['a'])])).not.toThrow()
    expect(computeDepths([node('a', ['ghost'])]).get('a')).toBe(1)
  })
})

describe('layoutTree', () => {
  it('is empty for an empty chain', () => {
    expect(layoutTree([])).toEqual({ placed: [], edges: [], width: 0, height: 0 })
  })

  it('stacks rows by depth and centres them', () => {
    const { placed, width, height } = layoutTree([node('a'), node('b', ['a']), node('c', ['a'])])
    const a = placed.find(p => p.node.id === 'a')!
    const b = placed.find(p => p.node.id === 'b')!

    expect(width).toBe(2 * NODE_W + GAP_X)          // widest row has two nodes
    expect(height).toBe(2 * NODE_H + GAP_Y)         // two depths
    expect(a.y).toBeLessThan(b.y)                   // prerequisite sits above
    expect(a.x).toBeCloseTo(width / 2)              // single node in its row is centred
  })

  it('emits one edge per prerequisite, pointing downward', () => {
    const { edges } = layoutTree([node('a'), node('b'), node('c', ['a', 'b'])])
    expect(edges).toHaveLength(2)
    for (const e of edges) {
      expect(e.to.node.id).toBe('c')
      expect(e.from.y).toBeLessThan(e.to.y)
    }
  })

  it('drops edges whose prerequisite is missing from the chain', () => {
    expect(layoutTree([node('a', ['ghost'])]).edges).toHaveLength(0)
  })
})
