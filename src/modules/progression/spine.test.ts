import { describe, it, expect } from 'vitest'
import {
  normalizeRead, normalizeLayer, normalizeInterview, interviewBrief,
  readToDraft, dreamBrief, goalBrief, routineCandidates, mergeLayer,
  type Candidate, type DreamRead,
} from './spine'
import { validateDraft, findCycles } from './draft'
import type { Dream } from '../log/types'
import type { Goal } from './types'

const DREAM = { id: 'dream-1', title: 'Become an actor' }

const good = {
  verdict: 'Fame in the US is downstream of two separate crafts.',
  title: 'CROSSING',
  category: 'Acting',
  acts: [
    { key: 'fluency', title: 'English fluency', pressure: 'critical', intent: 'Sound castable', boss: null },
    { key: 'pipeline', title: 'Self-tape pipeline', pressure: 'high', intent: 'Ship reps', boss: 'A self-tape submitted' },
  ],
  shelf: [
    { key: 'shadow', kind: 'routine', act: 'fluency', title: 'Shadow a scene', why: 'Accent under load',
      cue: 'after coffee', tier: 2, ladder: ['10 min', '20 min'], after: [], tool: null },
    { key: 'monologue', kind: 'routine', act: 'fluency', title: 'Record a monologue', why: 'Hear yourself',
      cue: 'after shadowing', tier: 2, ladder: ['1 take'], after: ['shadow'], tool: 'ardo' },
    { key: 'coach', kind: 'task', act: 'fluency', title: 'Book an English coach', why: 'Outside ear', repeats: false },
    { key: 'sleep', kind: 'basic', act: 'fluency', title: 'Sleep 7h', why: 'Voice needs rest', ladder: ['7h'] },
    { key: 'tape', kind: 'proof', act: 'pipeline', title: 'A self-tape submitted', why: 'The act ends here' },
  ],
}

describe('normalizeRead', () => {
  it('reads a well-formed response', () => {
    const r = normalizeRead(good, DREAM)
    expect(r.title).toBe('CROSSING')
    expect(r.category).toBe('Acting')
    expect(r.acts.map(a => a.key)).toEqual(['fluency', 'pipeline'])
    expect(r.shelf.map(c => c.kind)).toEqual(['routine', 'routine', 'task', 'basic', 'proof'])
    expect(r.shelf[1].after).toEqual(['shadow'])
    expect(r.shelf[1].toolId).toBe('ardo')
  })

  it('survives a completely empty response', () => {
    const r = normalizeRead({}, DREAM)
    expect(r.title).toBe('BECOME AN ACTOR')
    expect(r.shelf).toEqual([])
    expect(r.acts).toHaveLength(1)          // always somewhere for a candidate to go
    expect(r.acts[0].pressure).toBe('critical')
  })

  it('survives garbage in every field', () => {
    const r = normalizeRead({
      verdict: null, title: 42, category: {}, acts: 'nope',
      shelf: [{ key: null, kind: 'weapon', act: 'ghost', title: 7, tier: 'huge', ladder: 'x', after: 'y', tool: 'sword' }],
    } as never, DREAM)
    expect(r.acts).toHaveLength(1)
    expect(r.shelf).toEqual([])             // a candidate with no title is not a candidate
  })

  it('keeps exactly one act critical', () => {
    const r = normalizeRead({
      acts: [
        { key: 'a', title: 'A', pressure: 'critical' },
        { key: 'b', title: 'B', pressure: 'critical' },
        { key: 'c', title: 'C', pressure: 'critical' },
      ],
    }, DREAM)
    expect(r.acts.map(a => a.pressure)).toEqual(['critical', 'high', 'high'])
  })

  it('makes the opening act critical when the model marked none', () => {
    const r = normalizeRead({
      acts: [{ key: 'a', title: 'A', pressure: 'medium' }, { key: 'b', title: 'B', pressure: 'medium' }],
    }, DREAM)
    expect(r.acts.map(a => a.pressure)).toEqual(['critical', 'medium'])
  })

  it('sends a candidate naming an act that does not exist to the opening act', () => {
    const r = normalizeRead({
      acts: [{ key: 'one', title: 'One' }, { key: 'two', title: 'Two' }],
      shelf: [{ key: 'x', kind: 'task', act: 'nowhere', title: 'X' }],
    }, DREAM)
    expect(r.shelf[0].act).toBe('one')
  })

  it('de-duplicates keys across the whole shelf, not just the routines', () => {
    const r = normalizeRead({
      acts: [{ key: 'a', title: 'A' }],
      shelf: [
        { key: 'x', kind: 'routine', act: 'a', title: 'First' },
        { key: 'x', kind: 'task',    act: 'a', title: 'Second' },
      ],
    }, DREAM)
    expect(r.shelf.map(c => c.key)).toEqual(['x', 'x-2'])
  })

  it('only lets routines carry prerequisites', () => {
    const r = normalizeRead({
      acts: [{ key: 'a', title: 'A' }],
      shelf: [
        { key: 'r', kind: 'routine', act: 'a', title: 'R' },
        { key: 't', kind: 'task',    act: 'a', title: 'T', after: ['r'] },
      ],
    }, DREAM)
    expect(r.shelf[1].after).toEqual([])
  })

  it('drops a prerequisite that points at something which is not a routine', () => {
    const r = normalizeRead({
      acts: [{ key: 'a', title: 'A' }],
      shelf: [
        { key: 't', kind: 'task',    act: 'a', title: 'T' },
        { key: 'r', kind: 'routine', act: 'a', title: 'R', after: ['t'] },
      ],
    }, DREAM)
    expect(r.shelf[1].after).toEqual([])
  })

  it('cuts requirement loops rather than producing a graph that cannot lay out', () => {
    const r = normalizeRead({
      acts: [{ key: 'a', title: 'A' }],
      shelf: [
        { key: 'x', kind: 'routine', act: 'a', title: 'X', after: ['z'] },
        { key: 'y', kind: 'routine', act: 'a', title: 'Y', after: ['x'] },
        { key: 'z', kind: 'routine', act: 'a', title: 'Z', after: ['y'] },
      ],
    }, DREAM)
    const nodes = r.shelf.map(c => ({ key: c.key, after: c.after })) as never
    expect(findCycles(nodes).size).toBe(0)
  })

  it('clamps tiers into range', () => {
    const tiers = [0, 1, 4, 9, 2.4].map(t => normalizeRead({
      acts: [{ key: 'a', title: 'A' }],
      shelf: [{ key: 'k', kind: 'routine', act: 'a', title: 'K', tier: t }],
    }, DREAM).shelf[0].tier)
    expect(tiers).toEqual([2, 1, 4, 2, 2])
  })
})

describe('readToDraft', () => {
  it('opens a committable draft carrying only the first act', () => {
    const draft = readToDraft(normalizeRead(good, DREAM), DREAM)
    expect(validateDraft(draft)).toEqual([])
    expect(draft.title).toBe('CROSSING')
    expect(draft.note).toBe('Fame in the US is downstream of two separate crafts.')
    expect(draft.sourceDreamId).toBe('dream-1')
    expect(draft.nodes.map(n => n.key)).toEqual(['shadow', 'monologue'])
  })

  it('names every act but plans the ones after the first', () => {
    const draft = readToDraft(normalizeRead(good, DREAM), DREAM)
    expect(draft.chapters.map(c => c.title)).toEqual(['English fluency', 'Self-tape pipeline'])
    expect(draft.chapters.map(c => c.planned)).toEqual([false, true])
    expect(draft.chapters[1].keys).toEqual([])
    expect(draft.chapters[1].boss).toBe('A self-tape submitted')
  })

  it('does not fail validation for an act that is empty on purpose', () => {
    const draft = readToDraft(normalizeRead(good, DREAM), DREAM)
    expect(validateDraft(draft)).not.toContainEqual({ kind: 'chapter.empty', index: 1 })
  })

  it('keeps the act key so a candidate can find its chapter after a rename', () => {
    const draft = readToDraft(normalizeRead(good, DREAM), DREAM)
    expect(draft.chapters.map(c => c.key)).toEqual(['fluency', 'pipeline'])
  })

  it('leaves a routine the model put in a later act off the tree', () => {
    // Proposing routines for act 3 proposes work that cannot be started. They
    // stay on the shelf, visible, rather than being drawn as available.
    const read = normalizeRead({
      ...good,
      shelf: [...good.shelf, { key: 'late', kind: 'routine', act: 'pipeline', title: 'Late routine' }],
    }, DREAM)
    const draft = readToDraft(read, DREAM)
    expect(draft.nodes.map(n => n.key)).not.toContain('late')
    expect(routineCandidates(read, 'pipeline').map(c => c.key)).toEqual(['late'])
  })

  it('keeps a missing anchor visible rather than inventing one', () => {
    const read = normalizeRead({
      acts: [{ key: 'a', title: 'A' }],
      shelf: [{ key: 'k', kind: 'routine', act: 'a', title: 'K' }],
    }, DREAM)
    const draft = readToDraft(read, DREAM)
    expect(draft.nodes[0].cue).toBe('')
    expect(validateDraft(draft)).toContainEqual({ kind: 'node.cue', key: 'k' })
  })
})

describe('normalizeLayer', () => {
  it('never reuses a key a live routine already holds', () => {
    const out = normalizeLayer({ routines: [{ key: 'shadow', title: 'Shadow again' }] }, 'pipeline', ['shadow'])
    expect(out[0].key).toBe('shadow-2')
    expect(out[0].act).toBe('pipeline')
  })

  it('lets a new routine depend on one that already exists', () => {
    const out = normalizeLayer({ routines: [{ key: 'new', title: 'New', after: ['shadow'] }] }, 'p', ['shadow'])
    expect(out[0].after).toEqual(['shadow'])
  })

  it('drops a dependency on something that is nowhere', () => {
    const out = normalizeLayer({ routines: [{ key: 'new', title: 'New', after: ['ghost'] }] }, 'p', [])
    expect(out[0].after).toEqual([])
  })

  it('cuts loops inside the layer itself', () => {
    const out = normalizeLayer({
      routines: [{ key: 'a', title: 'A', after: ['b'] }, { key: 'b', title: 'B', after: ['a'] }],
    }, 'p', [])
    expect(out[0].after).toEqual([])
    expect(out[1].after).toEqual(['a'])
  })

  it('survives garbage', () => {
    expect(normalizeLayer({}, 'p', [])).toEqual([])
    expect(normalizeLayer({ routines: 'nope' } as never, 'p', [])).toEqual([])
  })
})

describe('normalizeInterview', () => {
  it('reads a well-formed set of questions', () => {
    const iv = normalizeInterview({ questions: [
      { key: 'budget', question: 'What can you spend?', why: 'A coach or free reps.', hint: 'e.g. $100' },
    ] })
    expect(iv.questions).toHaveLength(1)
    expect(iv.questions[0]).toMatchObject({ key: 'budget', question: 'What can you spend?' })
    expect(iv.answers).toEqual({})
    expect(iv.answeredAt).toBeNull()
  })

  it('drops a question with no question in it', () => {
    const iv = normalizeInterview({ questions: [{ key: 'a', why: 'because' }, { question: 'Real?' }] })
    expect(iv.questions.map(q => q.question)).toEqual(['Real?'])
  })

  it('never lets two questions share a key — answers are stored by it', () => {
    const iv = normalizeInterview({ questions: [
      { key: 'x', question: 'First?' }, { key: 'x', question: 'Second?' },
    ] })
    expect(iv.questions.map(q => q.key)).toEqual(['x', 'x-2'])
  })

  it('survives garbage, leaving nothing to ask', () => {
    expect(normalizeInterview({}).questions).toEqual([])
    expect(normalizeInterview({ questions: 'nope' } as never).questions).toEqual([])
  })

  it('caps the ask — an interview is not a form', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ key: `k${i}`, question: `Q${i}?` }))
    expect(normalizeInterview({ questions: many }).questions.length).toBeLessThanOrEqual(6)
  })
})

describe('interviewBrief', () => {
  const iv = normalizeInterview({ questions: [
    { key: 'budget', question: 'What can you spend each month?' },
    { key: 'hours',  question: 'How many hours a week are genuinely free?' },
  ] })

  it('is empty when nothing was answered', () => {
    expect(interviewBrief(iv)).toBe('')
    expect(interviewBrief(null)).toBe('')
  })

  it('carries only the questions that got an answer', () => {
    const brief = interviewBrief({ ...iv, answers: { budget: 'nothing right now' } })
    expect(brief).toContain('What can you spend each month?')
    expect(brief).toContain('nothing right now')
    expect(brief).not.toContain('genuinely free')
  })

  it('treats a blank or whitespace answer as skipped', () => {
    expect(interviewBrief({ ...iv, answers: { budget: '   ' } })).toBe('')
  })

  it('tells the guide these are constraints rather than preferences', () => {
    const brief = interviewBrief({ ...iv, answers: { hours: '4' } })
    expect(brief).toContain('constraints, not preferences')
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

  it('no longer feeds it a category, because it infers one', () => {
    expect(dreamBrief(dream)).not.toContain('CATEGORY')
  })

  it('says so plainly when there are no missions', () => {
    expect(dreamBrief({ ...dream, missions: [] })).toContain('No missions defined yet')
  })
})

describe('goalBrief', () => {
  const goal: Goal = {
    id: 'goal-x', title: 'CROSSING', slot: 'primary', createdAt: '', lastSlotChangeAt: '',
    chapters: [],
    nodes: [
      { id: 'goal-x:shadow', goalId: 'goal-x', title: 'Shadow a scene', cue: 'c', tier: 2,
        thresholds: ['a'], thresholdIndex: 0, unlocksAt: 0.6, prerequisiteIds: [],
        unlockedAt: null, toolId: null, scrapTaskId: 'chain:goal-x:shadow' },
      { id: 'goal-x:later', goalId: 'goal-x', title: 'Later', cue: 'c', tier: 3,
        thresholds: ['a'], thresholdIndex: 0, unlocksAt: 0.6, prerequisiteIds: [],
        unlockedAt: null, toolId: null, scrapTaskId: '' },
    ],
  }

  it('tells the guide what is running and how automatic it has become', () => {
    const brief = goalBrief(goal, id => id.endsWith('shadow') ? 0.42 : 0)
    expect(brief).toContain('shadow — Shadow a scene')
    expect(brief).toContain('automatism 0.42')
    expect(brief).toContain('not installed')      // a node with no habit says so
  })
})

describe('deepening an act', () => {
  const read = (shelf: Partial<Candidate>[]): DreamRead => normalizeRead({
    verdict: 'v', title: 'T', category: 'c',
    acts: [{ key: 'one', title: 'One', pressure: 'critical', intent: '', boss: null },
           { key: 'two', title: 'Two', pressure: 'high', intent: '', boss: 'The exam' }],
    shelf: shelf.map(c => ({ kind: 'routine', act: 'one', cue: 'after coffee', tier: 2,
                             ladder: ['10 min'], after: [], ...c })),
  }, { title: 'T' })

  const layer = (keys: string[]): Candidate[] =>
    normalizeLayer({ routines: keys.map(k => ({ key: k, title: k, cue: 'after coffee', tier: 2,
                                                ladder: ['10 min'], after: [] })) }, 'two', [])

  it('adds the act’s routines to the shelf the read already holds', () => {
    const merged = mergeLayer(read([{ key: 'a', title: 'A' }]), layer(['b', 'c']))

    expect(merged.shelf.map(c => c.key)).toEqual(['a', 'b', 'c'])
    // They belong to the act that was deepened, which is what makes them
    // deployable into its chapter — see `applyToGoal`.
    expect(merged.shelf.filter(c => c.act === 'two')).toHaveLength(2)
  })

  it('leaves the opening act untouched', () => {
    const before = read([{ key: 'a', title: 'A' }])
    expect(mergeLayer(before, layer(['b'])).shelf[0]).toEqual(before.shelf[0])
  })

  it('does not shelve the same routine twice', () => {
    // A second press must not counter-suffix a key: the key is permanent, and a
    // duplicate would quietly claim a slot the first one already owns (rule 13).
    const once  = mergeLayer(read([]), layer(['b', 'c']))
    const twice = mergeLayer(once, layer(['b', 'c']))
    expect(twice.shelf.map(c => c.key)).toEqual(['b', 'c'])
    expect(twice).toBe(once)          // nothing changed, so nothing is rewritten
  })

  it('never reuses a key a live routine already holds', () => {
    const taken = normalizeLayer({ routines: [{ key: 'reading', title: 'R', cue: 'x', tier: 2,
                                               ladder: ['1'], after: [] }] }, 'two', ['reading'])
    expect(taken[0].key).not.toBe('reading')
  })
})
