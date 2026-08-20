import { describe, it, expect } from 'vitest'
import { computeDepths, layoutTree, fitScale, NODE_W, NODE_H, GAP_X, GAP_Y } from './layout'
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
    // A prerequisite that isn't in this set doesn't indent anything: it used to
    // leave a phantom row above the node. Bands rely on this — a routine whose
    // requirement sits in the act above starts at the top of its own act.
    expect(computeDepths([node('a', ['ghost'])]).get('a')).toBe(0)
  })
})

describe('layoutTree', () => {
  it('is empty for an empty chain', () => {
    expect(layoutTree([])).toEqual({ placed: [], edges: [], bands: [], width: 0, height: 0 })
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

describe('layoutTree — acts as bands', () => {
  const chapters = (planned = false) => [
    { title: 'FLUENCY',  nodeIds: ['a', 'b'] },
    { title: 'PIPELINE', nodeIds: planned ? [] : ['c'], planned },
  ]

  it('stacks each act below the one before it', () => {
    const { placed, bands } = layoutTree([node('a'), node('b'), node('c')], chapters())
    const a = placed.find(p => p.node.id === 'a')!
    const c = placed.find(p => p.node.id === 'c')!

    expect(bands.map(b => b.title)).toEqual(['FLUENCY', 'PIPELINE'])
    expect(a.y).toBeLessThan(c.y)                    // act 1 sits above act 2
    expect(bands[0].y).toBeLessThan(bands[1].y)
  })

  it('does not indent an act just because it needs the one above', () => {
    // `c` requires `a`, but they are in different acts — c starts at the top of
    // its own band. The edge between them is what shows the handover.
    const { placed, edges } = layoutTree([node('a'), node('b'), node('c', ['a'])], chapters())
    const b = placed.find(p => p.node.id === 'b')!
    const c = placed.find(p => p.node.id === 'c')!

    expect(c.depth).toBe(0)
    expect(edges).toHaveLength(1)
    expect(c.y).toBeGreaterThan(b.y)
  })

  it('gives a planned act a band of its own with nothing in it', () => {
    const { placed, bands } = layoutTree([node('a'), node('b')], chapters(true))
    expect(placed).toHaveLength(2)
    expect(bands[1]).toMatchObject({ title: 'PIPELINE', planned: true })
    expect(bands[1].height).toBeGreaterThan(0)
  })

  it('never loses a node that belongs to no act', () => {
    const { placed } = layoutTree([node('a'), node('orphan')], [{ title: 'FLUENCY', nodeIds: ['a'] }])
    expect(placed.map(p => p.node.id).sort()).toEqual(['a', 'orphan'])
  })

  it('claims each node once when two acts name it', () => {
    const { placed } = layoutTree([node('a')], [
      { title: 'ONE', nodeIds: ['a'] },
      { title: 'TWO', nodeIds: ['a'] },
    ])
    expect(placed).toHaveLength(1)
  })
})

describe('fitScale', () => {
  it('shrinks to fit and never grows', () => {
    expect(fitScale(1000, 800)).toBe(0.8)
    expect(fitScale(200, 500)).toBe(1)
  })

  it('stops shrinking before the labels stop being readable', () => {
    expect(fitScale(10000, 100)).toBe(0.6)
  })

  it('is 1 when there is nothing to measure', () => {
    expect(fitScale(0, 500)).toBe(1)
    expect(fitScale(500, 0)).toBe(1)
  })
})
