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
})
