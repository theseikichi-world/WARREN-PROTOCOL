import { describe, it, expect } from 'vitest'
import {
  toMin, fmtClock, fmtDur, classifyPeriod, sleepHours, buildDay,
  type Anchors, type Commitment,
} from './store'

describe('time helpers', () => {
  it('toMin parses HH:MM', () => {
    expect(toMin('07:30')).toBe(450)
    expect(toMin('00:00')).toBe(0)
    expect(toMin('23:59')).toBe(1439)
  })
  it('fmtClock round-trips and wraps past midnight', () => {
    expect(fmtClock(450)).toBe('07:30')
    expect(fmtClock(1440)).toBe('00:00')  // wraps
  })
  it('fmtDur formats minutes vs hours', () => {
    expect(fmtDur(20)).toBe('20m')
    expect(fmtDur(60)).toBe('1h')
    expect(fmtDur(90)).toBe('1h 30m')
  })
})

describe('sleepHours', () => {
  it('measures wake − bedtime across midnight', () => {
    const a = { wake: '07:30', sleep: '23:30' } as Anchors
    expect(sleepHours(a)).toBe(8)
  })
})

describe('classifyPeriod (circadian keywords)', () => {
  it('routes workouts to afternoon', () => {
    expect(classifyPeriod('Strength session')).toBe('afternoon')
    expect(classifyPeriod('Capoeira drill')).toBe('afternoon')
  })
  it('routes focus/learning to morning', () => {
    expect(classifyPeriod('Read 10 pages')).toBe('morning')
    expect(classifyPeriod('Practice scales')).toBe('morning')
  })
  it('falls back to midday', () => {
    expect(classifyPeriod('Random unmatched thing')).toBe('midday')
  })
})

const anchors: Anchors = {
  wake: '08:00', sleep: '23:00', breakMin: 0,
  breakfast: null, lunch: null, dinner: null,
  workEnabled: false, workStart: '10:00', workEnd: '18:00',
}
const mk = (id: string, label: string, duration: number, period: Commitment['period'] = 'midday'): Commitment =>
  ({ id, label, kind: 'daily', done: false, duration, period })

describe('buildDay honours a routine anchor', () => {
  // The timeline used to decide when a routine happened by regex-matching
  // keywords in its title. These are the three answers a protocol can now give
  // it instead — see progression/anchor.ts.

  it('pins an AT routine to its clock time, not to the first free gap', () => {
    const plan = buildDay(anchors, [
      { ...mk('early', 'Filler', 60) },
      { ...mk('pinned', 'Evening lines', 30), at: '21:00' },
    ], [])
    const pinned = plan.blocks.find(b => b.taskId === 'pinned')!
    expect(pinned.start).toBe(toMin('21:00'))
    expect(pinned.end).toBe(toMin('21:00') + 30)
  })

  it('never schedules anything else over a pinned routine', () => {
    const plan = buildDay(anchors, [
      { ...mk('pinned', 'Evening lines', 30), at: '21:00' },
      ...Array.from({ length: 6 }, (_, i) => mk(`f${i}`, 'Filler', 120)),
    ], [])
    const pinned = plan.blocks.find(b => b.taskId === 'pinned')!
    const clash = plan.blocks.filter(b =>
      b.taskId && b.taskId !== 'pinned' && b.start < pinned.end && b.end > pinned.start)
    expect(clash).toEqual([])
  })

  it('places it exactly once', () => {
    const plan = buildDay(anchors, [{ ...mk('pinned', 'Lines', 30), at: '21:00' }], [])
    expect(plan.blocks.filter(b => b.taskId === 'pinned')).toHaveLength(1)
  })

  it('runs an AFTER routine immediately, with no break between', () => {
    const plan = buildDay({ ...anchors, breakMin: 15 }, [
      mk('base', 'Reading aloud', 30),
      { ...mk('stacked', 'Record a take', 20), after: 'base' },
    ], [])
    const base    = plan.blocks.find(b => b.taskId === 'base')!
    const stacked = plan.blocks.find(b => b.taskId === 'stacked')!
    expect(stacked.start).toBe(base.end)     // touching, no rest block between
  })

  it('stacks onto its anchor even when the circadian order disagrees', () => {
    // The follower says "evening", which would normally sort it to the very end.
    // Stacking wins: that is what "straight after" means.
    const plan = buildDay(anchors, [
      mk('base', 'Reading aloud', 30, 'morning'),
      { ...mk('stacked', 'Record a take', 20, 'evening'), after: 'base' },
      mk('other', 'Something midday', 30, 'midday'),
    ], [])
    const base    = plan.blocks.find(b => b.taskId === 'base')!
    const stacked = plan.blocks.find(b => b.taskId === 'stacked')!
    expect(stacked.start).toBe(base.end)
  })

  it('still places a follower whose anchor is nowhere', () => {
    // A dangling anchor must not make the routine vanish from the day.
    const plan = buildDay(anchors, [{ ...mk('orphan', 'Stacked on a ghost', 20), after: 'gone' }], [])
    expect(plan.blocks.find(b => b.taskId === 'orphan')).toBeDefined()
  })

  it('leaves a plain commitment exactly where it was', () => {
    const plan = buildDay(anchors, [mk('a', 'Task', 30)], [])
    expect(plan.blocks.find(b => b.taskId === 'a')!.start).toBe(toMin('08:00'))
  })
})

describe('buildDay scheduler', () => {
  it('places a single commitment at wake, fills the rest as free', () => {
    const plan = buildDay(anchors, [mk('a', 'Task', 30)], [])
    const commit = plan.blocks.find(b => b.kind === 'commitment')!
    expect(commit.start).toBe(toMin('08:00'))
    expect(commit.end).toBe(toMin('08:00') + 30)
    // free time = whole awake window minus the 30-min task
    expect(plan.freeMinutes).toBe((toMin('23:00') - toMin('08:00')) - 30)
    expect(plan.committedCount).toBe(1)
    expect(plan.doneCount).toBe(0)
  })

  it('orders commitments by circadian period (morning before afternoon)', () => {
    const plan = buildDay(anchors, [
      mk('w', 'Strength', 20, 'afternoon'),
      mk('m', 'Read', 20, 'morning'),
    ], [])
    const commits = plan.blocks.filter(b => b.kind === 'commitment')
    expect(commits[0].label).toBe('Read')      // morning lands first
    expect(commits[1].label).toBe('Strength')
  })

  it('inserts rest breaks between activities when breakMin > 0', () => {
    const plan = buildDay({ ...anchors, breakMin: 10 },
      [mk('a', 'A', 20), mk('b', 'B', 20)], [])
    expect(plan.blocks.some(b => b.kind === 'break')).toBe(true)
  })

  it('places meals as fixed blocks and counts done commitments', () => {
    const withLunch: Anchors = { ...anchors, lunch: '13:00' }
    const plan = buildDay(withLunch, [
      { ...mk('a', 'A', 20), done: true },
    ], [])
    expect(plan.blocks.some(b => b.kind === 'meal' && b.label === 'Lunch')).toBe(true)
    expect(plan.doneCount).toBe(1)
  })

  it('keeps blocks sorted by start time', () => {
    const plan = buildDay({ ...anchors, lunch: '13:00', dinner: '19:00' },
      [mk('a', 'A', 30), mk('b', 'B', 30)], [])
    const starts = plan.blocks.map(b => b.start)
    expect(starts).toEqual([...starts].sort((x, y) => x - y))
  })

  it('handles an overnight schedule (wake 11:00, sleep 03:00) — 16h awake, not collapsed', () => {
    const night: Anchors = { ...anchors, wake: '11:00', sleep: '03:00', lunch: '13:00', dinner: '19:00' }
    const plan = buildDay(night, [mk('a', 'Task', 30)], [])
    expect(plan.awakeMinutes).toBe(16 * 60)                 // 11:00 → 27:00
    expect(plan.freeMinutes).toBeGreaterThan(12 * 60)       // lots of free time, not ~30 min
    // lunch (13:00) and dinner (19:00) land inside the window
    expect(plan.blocks.some(b => b.kind === 'meal' && b.start === toMin('13:00'))).toBe(true)
    expect(plan.blocks.some(b => b.kind === 'meal' && b.start === toMin('19:00'))).toBe(true)
  })

  // ── Live plan (nowMin given): the day must never claim free time it doesn't have ──
  it('live: reschedules undone commitments from now, so "now" is not free', () => {
    const evening = toMin('21:00')
    const plan = buildDay(anchors, [mk('a', 'Sing', 20), mk('b', 'Stretch', 20)], [], evening)
    const atNow = plan.blocks.find(b => evening >= b.start && evening < b.end)!
    expect(atNow.kind).toBe('commitment')
    expect(atNow.label).toBe('Sing')
  })

  it('live: free minutes count only the time still ahead', () => {
    const evening = toMin('21:00')                       // 2h left before 23:00 bedtime
    const plan = buildDay(anchors, [], [], evening)
    expect(plan.freeMinutes).toBe(120)
    // the static view still sees the whole awake window
    expect(buildDay(anchors, [], []).freeMinutes).toBe(15 * 60)
  })

  it('live: finished commitments are not rescheduled', () => {
    const evening = toMin('21:00')
    const plan = buildDay(anchors, [{ ...mk('a', 'Done thing', 20), done: true }], [], evening)
    expect(plan.blocks.some(b => b.kind === 'commitment')).toBe(false)
    expect(plan.doneCount).toBe(1)
    expect(plan.committedCount).toBe(1)
  })

  it('live: overdue work that no longer fits overflows past bedtime', () => {
    const late = toMin('22:30')                          // 30 min left, 3 × 30-min tasks
    const plan = buildDay(anchors, [mk('a', 'A', 30), mk('b', 'B', 30), mk('c', 'C', 30)], [], late)
    expect(plan.blocks.some(b => b.kind === 'commitment' && b.start >= toMin('23:00'))).toBe(true)
    expect(plan.freeMinutes).toBe(0)
  })

  it('places a post-midnight meal in the overnight tail', () => {
    const night: Anchors = { ...anchors, wake: '11:00', sleep: '03:00', dinner: '01:00' } // 1 AM supper
    const plan = buildDay(night, [], [])
    expect(plan.blocks.some(b => b.kind === 'meal' && b.start === toMin('01:00') + 1440)).toBe(true)
  })
})
