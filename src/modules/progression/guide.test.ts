import { describe, it, expect } from 'vitest'
import { normalizeProposal, dreamBrief } from './guide'
import { validateDraft, findCycles } from './draft'
import type { Dream } from '../log/types'

const DREAM = { id: 'dream-1', title: 'Become an actor' }

const good = {
  note: 'Voice first.',
  title: 'ACTOR',
  chapters: [{ title: 'Voice', keys: ['reading', 'diction'], boss: null }],
  nodes: [
    { key: 'reading', title: 'Reading aloud', cue: 'after coffee', tier: 2, ladder: ['30 min', '45 min'], after: [], tool: null },
    { key: 'diction', title: 'Diction drills', cue: 'after reading', tier: 2, ladder: ['10 min'], after: ['reading'], tool: 'ardo' },
  ],
}

describe('normalizeProposal', () => {
  it('turns a well-formed proposal into a committable draft', () => {
    const d = normalizeProposal(good, DREAM)
    expect(validateDraft(d)).toEqual([])
    expect(d.title).toBe('ACTOR')
    expect(d.note).toBe('Voice first.')
    expect(d.sourceDreamId).toBe('dream-1')
    expect(d.nodes[1].after).toEqual(['reading'])
    expect(d.nodes[1].toolId).toBe('ardo')
  })

  it('survives a completely empty response', () => {
    const d = normalizeProposal({}, DREAM)
    expect(d.title).toBe('BECOME AN ACTOR')
    expect(d.nodes).toEqual([])
    expect(d.chapters).toHaveLength(1)
  })

  it('survives garbage in every field', () => {
    const d = normalizeProposal({
      title: 42, note: null, chapters: 'nope',
      nodes: [{ key: null, title: 7, cue: {}, tier: 'huge', ladder: 'x', after: 'y', tool: 'weapon' }],
    } as never, DREAM)
    expect(d.nodes).toHaveLength(1)
    expect(d.nodes[0].tier).toBe(2)
    expect(d.nodes[0].after).toEqual([])
    expect(d.nodes[0].toolId).toBeNull()
    expect(d.chapters[0].keys).toEqual([d.nodes[0].key])
  })

  it('clamps tiers into range', () => {
    const tiers = [0, 1, 4, 9, 2.4].map(t =>
      normalizeProposal({ nodes: [{ key: 'a', title: 'A', tier: t }] }, DREAM).nodes[0].tier)
    expect(tiers).toEqual([2, 1, 4, 2, 2])
  })

  it('de-duplicates keys instead of silently merging two routines', () => {
    const d = normalizeProposal({
      nodes: [{ key: 'a', title: 'First' }, { key: 'a', title: 'Second' }],
    }, DREAM)
    expect(d.nodes.map(n => n.key)).toEqual(['a', 'a-2'])
  })

  it('drops prerequisites pointing at keys that do not exist', () => {
    const d = normalizeProposal({
      nodes: [{ key: 'a', title: 'A', after: ['ghost'] }],
    }, DREAM)
    expect(d.nodes[0].after).toEqual([])
  })

  it('cuts requirement loops rather than producing a chain that cannot lay out', () => {
    const d = normalizeProposal({
      nodes: [
        { key: 'a', title: 'A', after: ['c'] },
        { key: 'b', title: 'B', after: ['a'] },
        { key: 'c', title: 'C', after: ['b'] },
      ],
    }, DREAM)
    expect(findCycles(d.nodes).size).toBe(0)
    expect(d.nodes.some(n => n.after.length === 0)).toBe(true)
  })

  it('gives a home to every node the model forgot to place in a chapter', () => {
    const d = normalizeProposal({
      chapters: [{ title: 'One', keys: ['a'] }],
      nodes: [{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }],
    }, DREAM)
    expect(d.chapters).toHaveLength(1)
    expect(d.chapters[0].keys).toEqual(['a', 'b'])
  })

  it('places a node claimed by two chapters exactly once', () => {
    const d = normalizeProposal({
      chapters: [{ title: 'One', keys: ['a'] }, { title: 'Two', keys: ['a', 'b'] }],
      nodes: [{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }],
    }, DREAM)
    expect(d.chapters.map(c => c.keys)).toEqual([['a'], ['b']])
  })

  it('keeps a missing anchor visible rather than inventing one', () => {
    const d = normalizeProposal({ nodes: [{ key: 'a', title: 'A' }] }, DREAM)
    expect(d.nodes[0].cue).toBe('')
    expect(validateDraft(d)).toContainEqual({ kind: 'node.cue', key: 'a' })
  })
})

describe('dreamBrief', () => {
  const dream: Dream = {
    id: 'd', title: 'Become an actor', description: 'On stage by 30.',
    category: 'Acting', createdAt: '', missions: [{
      id: 'm', title: 'VOICE', description: 'Build the instrument', priority: 'high',
      status: 'active', deadline: null, signals: [], createdAt: '', completedAt: null,
      tasks: [{ id: 't', text: 'Read aloud', type: 'habit', done: false, createdAt: '' }],
    }],
  }

  it('hands the guide the dream and the work already under it', () => {
    const brief = dreamBrief(dream)
    expect(brief).toContain('Become an actor')
    expect(brief).toContain('On stage by 30.')
    expect(brief).toContain('VOICE')
    expect(brief).toContain('Read aloud')
  })

  it('says so plainly when there are no missions', () => {
    expect(dreamBrief({ ...dream, missions: [] })).toContain('No missions defined yet')
  })
})
