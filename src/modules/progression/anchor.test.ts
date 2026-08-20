import { describe, it, expect } from 'vitest'
import { anchorLabel, anchorPeriod, parseAnchor, anchorIsLive, isClock } from './anchor'

const habits = [
  { id: 'chain:g:reading', text: 'Reading aloud' },
  { id: 'life:water',      text: 'Drink water' },
]

describe('anchorLabel', () => {
  it('names the habit it follows, so a rename carries', () => {
    expect(anchorLabel({ kind: 'after', taskId: 'chain:g:reading' }, () => 'Reading aloud'))
      .toBe('after Reading aloud')
  })

  it('does not pretend to know a habit that is gone', () => {
    expect(anchorLabel({ kind: 'after', taskId: 'ghost' })).toBe('after your last routine')
  })

  it('shows a clock time as itself', () => {
    expect(anchorLabel({ kind: 'at', time: '19:00' })).toBe('19:00')
  })

  it('names the part of the day', () => {
    expect(anchorLabel({ kind: 'period', period: 'evening' })).toBe('evening')
  })

  it('is empty with no anchor', () => {
    expect(anchorLabel(undefined)).toBe('')
  })
})

describe('anchorPeriod', () => {
  it('takes a period straight', () => {
    expect(anchorPeriod({ kind: 'period', period: 'midday' })).toBe('midday')
  })

  it('reads a clock time into the part of the day it lands in', () => {
    expect(anchorPeriod({ kind: 'at', time: '07:30' })).toBe('morning')
    expect(anchorPeriod({ kind: 'at', time: '12:00' })).toBe('midday')
    expect(anchorPeriod({ kind: 'at', time: '17:00' })).toBe('afternoon')
    expect(anchorPeriod({ kind: 'at', time: '22:00' })).toBe('evening')
  })

  it('leaves "after" unplaced — it inherits from what it follows', () => {
    expect(anchorPeriod({ kind: 'after', taskId: 'x' })).toBeNull()
  })
})

describe('parseAnchor', () => {
  it('takes a clock time as the most specific thing in the line', () => {
    expect(parseAnchor('Mon/Wed/Fri 19:00')).toEqual({ kind: 'at', time: '19:00' })
    expect(parseAnchor('after morning coffee · 07:15')).toEqual({ kind: 'at', time: '07:15' })
  })

  it('pads a single-digit hour so it sorts and renders straight', () => {
    expect(parseAnchor('at 9:05')).toEqual({ kind: 'at', time: '09:05' })
  })

  it('follows a habit it can actually find', () => {
    expect(parseAnchor('straight after Reading aloud', habits))
      .toEqual({ kind: 'after', taskId: 'chain:g:reading' })
  })

  it('refuses to anchor to a habit that does not exist', () => {
    // Better no anchor than one pointing at nothing.
    expect(parseAnchor('straight after shadow boxing', habits)).toBeNull()
  })

  it('reads the part of the day out of the wording', () => {
    expect(parseAnchor('after morning coffee')).toEqual({ kind: 'period', period: 'morning' })
    expect(parseAnchor('once you are already in bed')).toEqual({ kind: 'period', period: 'evening' })
    expect(parseAnchor('right after lunch')).toEqual({ kind: 'period', period: 'midday' })
  })

  it('reads Russian wording too', () => {
    expect(parseAnchor('утром после кофе')).toEqual({ kind: 'period', period: 'morning' })
  })

  it('gives up rather than guessing', () => {
    expect(parseAnchor('whenever I feel like it')).toBeNull()
    expect(parseAnchor('')).toBeNull()
    expect(parseAnchor('   ')).toBeNull()
  })

  it('never reads an impossible clock as a time', () => {
    expect(parseAnchor('25:00')).toBeNull()
    expect(parseAnchor('12:99')).toBeNull()
  })
})

describe('anchorIsLive', () => {
  it('holds for a habit that is still there', () => {
    expect(anchorIsLive({ kind: 'after', taskId: 'a' }, new Set(['a']))).toBe(true)
  })

  it('fails for one that is gone — a dangling anchor is not an anchor', () => {
    expect(anchorIsLive({ kind: 'after', taskId: 'a' }, new Set())).toBe(false)
  })

  it('does not care about tasks for the other two kinds', () => {
    expect(anchorIsLive({ kind: 'at', time: '19:00' }, new Set())).toBe(true)
    expect(anchorIsLive({ kind: 'period', period: 'morning' }, new Set())).toBe(true)
  })

  it('is false with no anchor at all', () => {
    expect(anchorIsLive(undefined, new Set())).toBe(false)
  })
})

describe('isClock', () => {
  it('accepts a real time and nothing else', () => {
    expect(isClock('19:00')).toBe(true)
    expect(isClock('7:05')).toBe(true)
    expect(isClock('24:00')).toBe(false)
    expect(isClock('after coffee')).toBe(false)
  })
})
