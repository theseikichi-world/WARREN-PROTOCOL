import { describe, it, expect } from 'vitest'
import {
  TITLES, titleById, evaluateTitles, heldTitles, wornTitle,
  breachesCleared, uplinksFinished, atTopRung, type TitleContext,
} from './titles'
import { wearTitle } from './store'
import type { Chapter, ChainNode, Goal, ProgressionState } from './types'
import type { ModuleSummaries } from '../bigscreen/moduleStats'

const NOW = new Date('2026-09-09T10:00:00Z')
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

const EMPTY_SUMS: ModuleSummaries = {
  scrap7: null, log: null, ardo: null, solaris: null, pictures: null, journal: null, vigilante: null,
}

const node = (rungs: number, at: number): ChainNode => ({
  id: 'g:a', goalId: 'g', title: 'a', cue: 'c', tier: 2,
  thresholds: Array.from({ length: rungs }, (_, i) => `r${i}`), thresholdIndex: at,
  unlocksAt: 0.6, prerequisiteIds: [], unlockedAt: ago(30), toolId: null, scrapTaskId: 't',
})
const chapter = (index: number, cleared: boolean): Chapter => ({
  index, title: `A${index}`, nodeIds: [],
  boss: { title: 'e', requirement: { minScore: 0.7 }, completedAt: cleared ? ago(1) : null },
})
const goal = (patch: Partial<Goal> = {}): Goal => ({
  id: 'g', title: 'G', slot: 'primary', chapters: [], nodes: [],
  createdAt: ago(60), lastSlotChangeAt: ago(60), ...patch,
})

const ctx = (over: Partial<TitleContext> = {}): TitleContext =>
  ({ goals: [], ascendedAt: null, initiatedAt: null, sums: EMPTY_SUMS, now: NOW, ...over })

const state = (over: Partial<ProgressionState> = {}): ProgressionState =>
  ({ goals: [], seeded: true, xp: 0, quests: {}, titles: {}, title: null, ...over })

describe('the set', () => {
  it('gives every title a unique id and both languages', () => {
    expect(new Set(TITLES.map(t => t.id)).size).toBe(TITLES.length)
    for (const t of TITLES) {
      expect(t.en).not.toBe('')
      expect(t.ru).not.toBe(t.en)
      expect(t.needEn.length).toBeGreaterThan(0)
      expect(t.needRu.length).toBeGreaterThan(0)
    }
  })

  it('hands out nothing on a fresh record', () => {
    // Not one of these is a participation award — a new operator wears none.
    expect(evaluateTitles({}, ctx()).newly).toEqual([])
  })

  it('reads no streak and no score — those are STANDING’s job and they fall', () => {
    // A title you can lose is not a record of anything. Nothing in the set may
    // depend on a number that goes down.
    const full = ctx({
      goals: [goal({ chapters: [chapter(1, true), chapter(2, true), chapter(3, true)] })],
    })
    const first = evaluateTitles({}, full, NOW)
    expect(first.newly.map(t => t.id)).toContain('breacher')

    // Everything current wiped out; the ledger does not care.
    const later = evaluateTitles(first.earned, ctx(), NOW)
    expect(later.earned.breacher).toBe(first.earned.breacher)
  })
})

describe('what each one counts', () => {
  it('counts a cleared breach in any uplink, finished or not', () => {
    expect(breachesCleared([
      goal({ chapters: [chapter(1, true), chapter(2, false)] }),
      goal({ id: 'h', completedAt: ago(2), chapters: [chapter(1, true)] }),
    ])).toBe(2)
  })

  it('counts only uplinks that actually ended', () => {
    expect(uplinksFinished([goal(), goal({ id: 'h', completedAt: ago(2) })])).toBe(1)
  })

  it('counts a routine on the last rung of a ladder worth climbing', () => {
    expect(atTopRung([goal({ nodes: [node(3, 2)] })])).toBe(1)
    expect(atTopRung([goal({ nodes: [node(3, 1)] })])).toBe(0)
    // One rung is the default for a routine written without standards. Reaching
    // the "top" of it cost nothing, so it earns nothing.
    expect(atTopRung([goal({ nodes: [node(1, 0)] })])).toBe(0)
  })
})

describe('the ledger', () => {
  it('stamps the day it happened, once', () => {
    const first = evaluateTitles({}, ctx({ ascendedAt: ago(1) }), NOW)
    expect(first.newly.map(t => t.id)).toEqual(['unsupervised'])
    expect(first.earned.unsupervised).toBe(NOW.toISOString())

    const again = evaluateTitles(first.earned, ctx({ ascendedAt: ago(1) }), new Date('2026-10-01'))
    expect(again.newly).toEqual([])
    expect(again.earned.unsupervised).toBe(NOW.toISOString())
  })

  it('never takes one back when the thing behind it is deleted', () => {
    // A hundred journal entries earns CHRONICLER. Deleting ninety of them does
    // not un-write the ones you wrote.
    const wrote = { ...EMPTY_SUMS, journal: { streak: 0, writtenToday: false, stickers: 0, entries: 100 } }
    const first = evaluateTitles({}, ctx({ sums: wrote }), NOW)
    expect(first.earned.chronicler).toBeTruthy()

    const deleted = { ...EMPTY_SUMS, journal: { streak: 0, writtenToday: false, stickers: 0, entries: 10 } }
    expect(evaluateTitles(first.earned, ctx({ sums: deleted }), NOW).earned.chronicler)
      .toBe(first.earned.chronicler)
  })
})

describe('wearing one', () => {
  const held = state({ titles: { breacher: ago(3), 'seen-through': ago(1) } })

  it('lists what has been earned, and nothing else', () => {
    expect(heldTitles(held).map(t => t.id)).toEqual(['seen-through', 'breacher'])
  })

  it('puts on and takes off', () => {
    const on = wearTitle(held, 'breacher')
    expect(wornTitle(on)?.id).toBe('breacher')
    expect(wornTitle(wearTitle(on, null))).toBeNull()
  })

  it('refuses one that was never earned', () => {
    // The worn id is the only part the operator sets by hand, so it is the only
    // part that can be wrong.
    expect(wearTitle(held, 'twice-over')).toBe(held)
    expect(wornTitle(state({ titles: {}, title: 'breacher' }))).toBeNull()
  })

  it('shows nothing rather than a title that left the set', () => {
    expect(wornTitle(state({ titles: { gone: ago(1) }, title: 'gone' }))).toBeNull()
    expect(titleById('gone')).toBeNull()
  })
})
