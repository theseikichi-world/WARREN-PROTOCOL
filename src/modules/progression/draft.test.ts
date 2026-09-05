import { describe, it, expect } from 'vitest'
import {
  slugify, uniqueKey, newGoalId, blankDraft, goalToDraft, draftToGoal, draftToNodes,
  applyDraft, validateDraft, findCycles, TEMPLATES, nodeId,
  type ChainDraft, type DraftNode,
} from './draft'
import type { Goal } from './types'

const node = (key: string, patch: Partial<DraftNode> = {}): DraftNode => ({
  key, title: key.toUpperCase(), cue: 'after coffee', tier: 2, ladder: ['10 min'],
  after: [], toolId: null, ...patch,
})

const draft = (nodes: DraftNode[], patch: Partial<ChainDraft> = {}): ChainDraft => ({
  goalId: null, title: 'TEST', nodes, sourceDreamId: null, note: '',
  chapters: [{ title: 'One', keys: nodes.map(n => n.key), boss: null }],
  ...patch,
})

describe('keys', () => {
  it('slugs a title down to something id-safe', () => {
    expect(slugify('Reading aloud')).toBe('reading-aloud')
    expect(slugify('  Self-Tape!!  ')).toBe('self-tape')
  })

  it('falls back rather than producing an empty key', () => {
    expect(slugify('Чтение вслух')).toBe('')
    expect(uniqueKey('Чтение вслух', [])).toBe('routine')
    expect(uniqueKey('', ['routine'])).toBe('routine-2')
  })

  it('never collides', () => {
    expect(uniqueKey('Reading', ['reading'])).toBe('reading-2')
    expect(uniqueKey('Reading', ['reading', 'reading-2'])).toBe('reading-3')
    expect(newGoalId('Actor', ['goal-actor'])).toBe('goal-actor-2')
  })
})

describe('validation', () => {
  it('accepts a complete draft', () => {
    expect(validateDraft(draft([node('a'), node('b', { after: ['a'] })]))).toEqual([])
  })

  it('demands an anchor — a routine without a cue does not automate', () => {
    const problems = validateDraft(draft([node('a', { cue: '  ' })]))
    expect(problems).toContainEqual({ kind: 'node.cue', key: 'a' })
  })

  it('rejects a prerequisite that is not in the chain', () => {
    const problems = validateDraft(draft([node('a', { after: ['ghost'] })]))
    expect(problems).toContainEqual({ kind: 'node.prereq', key: 'a', missing: 'ghost' })
  })

  it('rejects a routine that requires itself', () => {
    expect(validateDraft(draft([node('a', { after: ['a'] })])))
      .toContainEqual({ kind: 'node.self', key: 'a' })
  })

  it('rejects a node that belongs to no chapter', () => {
    const d = draft([node('a'), node('b')])
    d.chapters = [{ title: 'One', keys: ['a'], boss: null }]
    expect(validateDraft(d)).toContainEqual({ kind: 'node.unchaptered', key: 'b' })
  })

  it('finds every key on a requirement loop', () => {
    const cycles = findCycles([
      node('a', { after: ['c'] }), node('b', { after: ['a'] }), node('c', { after: ['b'] }),
      node('free'),
    ])
    expect([...cycles].sort()).toEqual(['a', 'b', 'c'])
  })

  it('a draft with no routines cannot commit', () => {
    const d = blankDraft('X')
    expect(validateDraft(d)).toContainEqual({ kind: 'nodes.empty' })
  })
})

describe('draft → goal', () => {
  it('derives ids from keys so habit ids stay stable', () => {
    const g = draftToGoal(draft([node('reading')]), [])
    expect(g.id).toBe('goal-test')
    expect(g.nodes[0].id).toBe('goal-test:reading')
  })

  it('opens entry nodes and leaves the rest locked', () => {
    const g = draftToGoal(draft([node('a'), node('b', { after: ['a'] })]), [])
    expect(g.nodes.find(n => n.id.endsWith(':a'))!.unlockedAt).not.toBeNull()
    expect(g.nodes.find(n => n.id.endsWith(':b'))!.unlockedAt).toBeNull()
  })

  it('keeps goal ids unique', () => {
    expect(draftToGoal(draft([node('a')]), ['goal-test']).id).toBe('goal-test-2')
  })

  it('round-trips a goal through a draft unchanged', () => {
    const original = draftToGoal(draft([node('a'), node('b', { after: ['a'] })],
      { chapters: [{ title: 'One', keys: ['a'], boss: null },
                   { title: 'Two', keys: ['b'], boss: 'A real event' }] }), [])
    const again = applyDraft(original, goalToDraft(original)).goal
    expect(again.nodes).toEqual(original.nodes)
    expect(again.chapters).toEqual(original.chapters)
  })

  it('drops prerequisites the draft no longer contains', () => {
    const d = draft([node('b', { after: ['a'] })])
    expect(draftToNodes(d)[0].prerequisiteIds).toEqual([])
  })
})

describe('editing a live uplink', () => {
  const live = (): Goal => {
    const g = draftToGoal(draft([node('a'), node('b', { after: ['a'] })]), [])
    return {
      ...g,
      nodes: g.nodes.map(n => n.id.endsWith(':a')
        ? { ...n, scrapTaskId: 'chain:goal-test:a', thresholdIndex: 2 }
        : n),
    }
  }

  it('keeps the habit, the unlock date and the rung when a routine is renamed', () => {
    const before = live()
    const d = goalToDraft(before)
    d.nodes[0].title = 'Something else entirely'
    d.nodes[0].ladder = ['1', '2', '3']

    const after = applyDraft(before, d).goal.nodes[0]
    expect(after.id).toBe('goal-test:a')
    expect(after.title).toBe('Something else entirely')
    expect(after.scrapTaskId).toBe('chain:goal-test:a')
    expect(after.unlockedAt).toBe(before.nodes[0].unlockedAt)
    expect(after.thresholdIndex).toBe(2)
  })

  it('clamps the rung when the ladder gets shorter', () => {
    const before = live()
    const d = goalToDraft(before)
    d.nodes[0].ladder = ['only one']
    expect(applyDraft(before, d).goal.nodes[0].thresholdIndex).toBe(0)
  })

  it('never re-locks a routine that gained a prerequisite', () => {
    const before = live()
    const d = goalToDraft(before)
    d.nodes[0].after = ['b']          // 'a' is already open and installed
    expect(applyDraft(before, d).goal.nodes[0].unlockedAt).not.toBeNull()
  })

  it('opens a routine that lost its last prerequisite', () => {
    const before = live()
    const d = goalToDraft(before)
    d.nodes[1].after = []
    expect(applyDraft(before, d).goal.nodes[1].unlockedAt).not.toBeNull()
  })

  it('reports a dropped routine as detached rather than deleting it', () => {
    const before = live()
    const d = goalToDraft(before)
    d.nodes = d.nodes.filter(n => n.key !== 'a')
    d.chapters = [{ title: 'One', keys: ['b'], boss: null }]

    const { goal, detached } = applyDraft(before, d)
    expect(detached).toEqual(['chain:goal-test:a'])
    expect(goal.nodes.map(n => n.id)).toEqual(['goal-test:b'])
  })

  it('does not report a dropped routine that never had a habit', () => {
    const before = live()
    const d = goalToDraft(before)
    d.nodes = d.nodes.filter(n => n.key !== 'b')
    d.chapters = [{ title: 'One', keys: ['a'], boss: null }]
    expect(applyDraft(before, d).detached).toEqual([])
  })

  it('keeps a cleared breach cleared, but not when the event itself changed', () => {
    const g = draftToGoal(draft([node('a')], {
      chapters: [{ title: 'One', keys: ['a'], boss: 'A real event' }],
    }), [])
    const cleared: Goal = {
      ...g,
      chapters: [{ ...g.chapters[0], boss: { ...g.chapters[0].boss!, completedAt: '2026-01-01T00:00:00.000Z' } }],
    }

    const same = applyDraft(cleared, goalToDraft(cleared)).goal
    expect(same.chapters[0].boss!.completedAt).toBe('2026-01-01T00:00:00.000Z')

    const renamed = goalToDraft(cleared)
    renamed.chapters[0].boss = 'A different event'
    expect(applyDraft(cleared, renamed).goal.chapters[0].boss!.completedAt).toBeNull()
  })

  it('carries the source dream through an edit', () => {
    const g = draftToGoal({ ...draft([node('a')]), sourceDreamId: 'dream-1' }, [])
    expect(g.sourceDreamId).toBe('dream-1')
    expect(applyDraft(g, goalToDraft(g)).goal.sourceDreamId).toBe('dream-1')
  })
})

describe('templates', () => {
  it('offers the reference chains with no goal id, so committing creates a fresh one', () => {
    expect(TEMPLATES.length).toBeGreaterThan(0)
    for (const t of TEMPLATES) {
      expect(t.goalId).toBeNull()
      expect(validateDraft(t)).toEqual([])
    }
  })

  it('is fully editable — a committed template is an ordinary uplink', () => {
    const t = structuredClone(TEMPLATES[0])
    t.title = 'MINE'
    t.nodes[0].title = 'My own routine'
    const g = draftToGoal(t, [])
    expect(g.title).toBe('MINE')
    expect(g.nodes[0].title).toBe('My own routine')
    expect(g.nodes[0].id).toBe(nodeId('goal-mine', t.nodes[0].key))
  })
})

describe('a breach with a date', () => {
  const dated = (boss: string | null, due: string | null): ChainDraft =>
    draft([node('a')], { chapters: [{ title: 'One', keys: ['a'], boss, due }] })

  it('stores the date on the milestone', () => {
    const goal = draftToGoal(dated('The exam', '2026-06-12'), [])
    expect(goal.chapters[0].boss).toMatchObject({ title: 'The exam', due: '2026-06-12' })
  })

  it('drops a half-typed one, so a stored date is always a real day', () => {
    const goal = draftToGoal(dated('The exam', '2026-06'), [])
    expect(goal.chapters[0].boss?.due).toBeUndefined()
  })

  it('keeps no date without an event — a deadline for nothing is nothing', () => {
    const goal = draftToGoal(dated(null, '2026-06-12'), [])
    expect(goal.chapters[0].boss).toBeNull()
  })

  it('survives the round trip back into the forge', () => {
    const goal = draftToGoal(dated('The exam', '2026-06-12'), [])
    expect(goalToDraft(goal).chapters[0].due).toBe('2026-06-12')
  })

  it('lets the date move without un-clearing an event that happened', () => {
    const goal = draftToGoal(dated('The exam', '2026-06-12'), [])
    const sat  = { ...goal, chapters: [{ ...goal.chapters[0],
      boss: { ...goal.chapters[0].boss!, completedAt: '2026-06-12T09:00:00Z' } }] }
    const moved = applyDraft(sat, dated('The exam', '2026-07-01')).goal
    expect(moved.chapters[0].boss).toMatchObject({ due: '2026-07-01', completedAt: '2026-06-12T09:00:00Z' })
  })
})
