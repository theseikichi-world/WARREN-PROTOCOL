import { describe, it, expect } from 'vitest'
import {
  seedIfEmpty, primaryGoal, secondaryGoal, archivedGoals, bandwidthFull, bandwidthUsed,
  cooldownRemaining, canReassignPrimary, promoteSecondary, assignPrimary, assignSecondary,
  archiveGoal, addGoal,
} from './store'
import { TEMPLATES, draftToGoal } from './draft'
import { estimateDays, xpRateForSlot, type Goal, type ProgressionState } from './types'

const NOW = new Date('2026-08-01T10:00:00.000Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

const goal = (id: string, slot: Goal['slot'], changed = daysAgo(30)): Goal => ({
  id, title: id.toUpperCase(), slot, chapters: [], nodes: [],
  createdAt: daysAgo(60), lastSlotChangeAt: changed,
})

const state = (...goals: Goal[]): ProgressionState => ({ goals, seeded: true, xp: 0, quests: {} })

describe('seeding', () => {
  it('never installs a goal — an uplink you did not choose is not yours', () => {
    const fresh = seedIfEmpty({ goals: [], seeded: false, xp: 0, quests: {} })
    expect(fresh.goals).toHaveLength(0)
    expect(fresh.seeded).toBe(true)
  })

  it('leaves an already-seeded state exactly as it found it', () => {
    const existing = state(goal('a', 'primary'))
    expect(seedIfEmpty(existing)).toBe(existing)
  })
})

// The reference chains that used to seed themselves now live as templates. The
// structural guarantees they carried are still guarantees.
describe('reference templates', () => {
  const goals = TEMPLATES.map(t => draftToGoal(t, []))

  it('offers ACTOR and CAPOEIRA', () => {
    expect(goals.map(g => g.title)).toEqual(['ACTOR', 'CAPOEIRA'])
  })

  it('every routine has a cue and an ordered threshold ladder', () => {
    const nodes = goals.flatMap(g => g.nodes)
    expect(nodes.length).toBeGreaterThan(10)
    expect(nodes.every(n => n.cue.trim().length > 0)).toBe(true)
    expect(nodes.every(n => n.thresholds.length >= 2)).toBe(true)
    for (const g of goals) {
      expect(g.nodes.filter(n => n.prerequisiteIds.length === 0)).toHaveLength(1)
    }
  })

  it('points every prerequisite and chapter at a real node', () => {
    for (const g of goals) {
      const ids = new Set(g.nodes.map(n => n.id))
      for (const n of g.nodes) for (const p of n.prerequisiteIds) expect(ids.has(p)).toBe(true)
      for (const c of g.chapters) for (const nid of c.nodeIds) expect(ids.has(nid)).toBe(true)
    }
  })
})

describe('bandwidth', () => {
  it('counts allocation and reports when full', () => {
    expect(bandwidthUsed(state(goal('a', 'primary')))).toBe(1)
    expect(bandwidthFull(state(goal('a', 'primary')))).toBe(false)
    expect(bandwidthFull(state(goal('a', 'primary'), goal('b', 'secondary')))).toBe(true)
  })

  it('sends a third goal to the archive rather than a third slot', () => {
    const s = addGoal(state(goal('a', 'primary'), goal('b', 'secondary')), goal('c', 'archived'), NOW)
    expect(bandwidthUsed(s)).toBe(2)
    expect(archivedGoals(s).map(g => g.id)).toEqual(['c'])
  })

  it('fills a free slot when one exists', () => {
    expect(primaryGoal(addGoal(state(), goal('a', 'archived'), NOW))?.id).toBe('a')
    expect(secondaryGoal(addGoal(state(goal('a', 'primary')), goal('b', 'archived'), NOW))?.id).toBe('b')
  })
})

describe('swap cooldown', () => {
  it('blocks a fresh reassignment and reports the days left', () => {
    const s = state(goal('a', 'primary', daysAgo(2)), goal('c', 'archived'))
    expect(cooldownRemaining(s, NOW)).toBe(5)
    expect(canReassignPrimary(s, NOW)).toBe(false)
    expect(assignPrimary(s, 'c', NOW)).toBe(s)          // unchanged
  })

  it('allows it once the cooldown has passed, archiving the outgoing goal', () => {
    const s = state(goal('a', 'primary', daysAgo(8)), goal('c', 'archived'))
    expect(canReassignPrimary(s, NOW)).toBe(true)
    const next = assignPrimary(s, 'c', NOW)
    expect(primaryGoal(next)?.id).toBe('c')
    expect(archivedGoals(next).map(g => g.id)).toEqual(['a'])   // preserved, not deleted
  })
})

describe('promotion', () => {
  it('exchanges the slots for free, even inside the cooldown', () => {
    const s = state(goal('a', 'primary', daysAgo(1)), goal('b', 'secondary'))
    const next = promoteSecondary(s, NOW)
    expect(primaryGoal(next)?.id).toBe('b')
    expect(secondaryGoal(next)?.id).toBe('a')
    expect(archivedGoals(next)).toHaveLength(0)         // nothing froze
  })

  it('routes assignPrimary through the free path for the secondary', () => {
    const s = state(goal('a', 'primary', daysAgo(1)), goal('b', 'secondary'))
    expect(primaryGoal(assignPrimary(s, 'b', NOW))?.id).toBe('b')
  })

  it('treats demoting the primary as a swap', () => {
    const fresh = state(goal('a', 'primary', daysAgo(1)))
    expect(assignSecondary(fresh, 'a', NOW)).toBe(fresh)          // still cooling down
    const ready = state(goal('a', 'primary', daysAgo(9)))
    expect(secondaryGoal(assignSecondary(ready, 'a', NOW))?.id).toBe('a')
  })
})

describe('archiving', () => {
  it('parks a goal without discarding it', () => {
    const s = archiveGoal(state(goal('a', 'primary'), goal('b', 'secondary')), 'b', NOW)
    expect(secondaryGoal(s)).toBeNull()
    expect(archivedGoals(s).map(g => g.id)).toEqual(['b'])
    expect(s.goals).toHaveLength(2)
  })
})

describe('rates and estimates', () => {
  it('pays the secondary slot less and the archive nothing', () => {
    expect(xpRateForSlot('primary')).toBe(1)
    expect(xpRateForSlot('secondary')).toBe(0.6)
    expect(xpRateForSlot('archived')).toBe(0)
  })

  it('shrinks the day estimate as integration rises', () => {
    expect(estimateDays(0, 2)).toBe(66)
    expect(estimateDays(0.5, 2)).toBe(33)
    expect(estimateDays(1, 2)).toBe(0)
    expect(estimateDays(0, 1)).toBe(25)
    expect(estimateDays(0, 4)).toBe(150)
  })
})
