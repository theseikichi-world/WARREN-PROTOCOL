import { describe, it, expect } from 'vitest'
import {
  buildPhases, specHoldSeconds, clock, STATIC_HOLDS, DEFAULT_SPEC,
  type CircuitSpec,
} from './types'
import { clampSec, clampRounds, logSession, deriveVigilante, LOG_CAP } from './store'
import { EMPTY_STATE } from './types'

const spec = (over: Partial<CircuitSpec> = {}): CircuitSpec => ({ ...DEFAULT_SPEC, ...over })
/** Most sequence assertions are about work/rest, so start cold by default. */
const cold = (over: Partial<CircuitSpec> = {}): CircuitSpec => spec({ leadInSec: 0, ...over })

describe('buildPhases', () => {
  it('runs every round of one hold before moving to the next', () => {
    // The set was described as "wall sit 3 rounds, THEN superman 3 rounds" —
    // holding one position repeatedly, not rotating away from it.
    const p = buildPhases(cold({ holdIds: ['a', 'b'], rounds: 2 }))
    expect(p.filter(x => x.kind === 'work').map(x => `${x.holdId}${x.round}`))
      .toEqual(['a1', 'a2', 'b1', 'b2'])
  })

  it('alternates work and rest', () => {
    const p = buildPhases(cold({ holdIds: ['a'], rounds: 2 }))
    expect(p.map(x => x.kind)).toEqual(['work', 'rest', 'work'])
  })

  it('never ends on a rest — the session closes on the last hold', () => {
    const p = buildPhases(spec())
    expect(p[p.length - 1].kind).toBe('work')
  })

  it('carries the configured durations onto each phase', () => {
    const p = buildPhases(cold({ holdIds: ['a'], rounds: 1, workSec: 30, restSec: 45 }))
    expect(p[0]).toMatchObject({ kind: 'work', seconds: 30 })
  })

  it('produces the real session: 4 holds, 3 rounds, 30/45', () => {
    const p = buildPhases(spec())
    expect(STATIC_HOLDS).toHaveLength(4)
    expect(p.filter(x => x.kind === 'work')).toHaveLength(12)  // 4 × 3
    expect(p).toHaveLength(24)                                 // 1 ready + 12 work + 11 rest
    expect(specHoldSeconds(spec())).toBe(360)                  // 6 minutes under tension
  })

  it('is empty for a spec with no holds rather than looping forever', () => {
    // Not even a lead-in: counting you into a session with nothing in it would
    // start a timer that ends the instant it begins.
    expect(buildPhases(spec({ holdIds: [] }))).toEqual([])
  })

  it('opens with a lead-in so the first hold is not short', () => {
    const p = buildPhases(spec({ holdIds: ['a'], rounds: 1, leadInSec: 10 }))
    expect(p[0]).toMatchObject({ kind: 'ready', seconds: 10 })
    expect(p[1].kind).toBe('work')
  })

  it('starts cold when the lead-in is zero', () => {
    expect(buildPhases(cold({ holdIds: ['a'], rounds: 1 }))[0].kind).toBe('work')
  })

  it('does not count the lead-in as time under tension', () => {
    // The lead-in is getting down the wall, not holding the position.
    expect(specHoldSeconds(spec({ holdIds: ['a'], rounds: 1, workSec: 30, leadInSec: 10 })))
      .toBe(30)
  })
})

describe('clamps', () => {
  it('keeps a hold inside 5s–10min', () => {
    expect(clampSec(0, 30)).toBe(5)
    expect(clampSec(9999, 30)).toBe(600)
    expect(clampSec(45, 30)).toBe(45)
  })

  it('falls back on junk rather than producing NaN', () => {
    expect(clampSec('abc', 30)).toBe(30)
    expect(clampSec(undefined, 45)).toBe(45)
    expect(clampRounds('x')).toBe(DEFAULT_SPEC.rounds)
  })

  it('keeps rounds inside 1–10', () => {
    expect(clampRounds(0)).toBe(1)
    expect(clampRounds(99)).toBe(10)
  })
})

describe('logSession', () => {
  it('records an abandoned session as exactly what it was', () => {
    const s = logSession(EMPTY_STATE, {
      holdIds: ['a'], workSec: 30, restSec: 45, rounds: 3,
      doneWork: 1, totalWork: 3, heldSec: 30, finished: false,
    })
    expect(s.log[0]).toMatchObject({ doneWork: 1, totalWork: 3, heldSec: 30, finished: false })
  })

  it('puts the newest session first', () => {
    let s = logSession(EMPTY_STATE, {
      holdIds: ['a'], workSec: 30, restSec: 45, rounds: 1,
      doneWork: 1, totalWork: 1, heldSec: 30, finished: true,
    })
    s = logSession(s, {
      holdIds: ['b'], workSec: 60, restSec: 45, rounds: 1,
      doneWork: 1, totalWork: 1, heldSec: 60, finished: true,
    })
    expect(s.log[0].heldSec).toBe(60)
    expect(s.log).toHaveLength(2)
  })

  it('caps the log so storage cannot grow without limit', () => {
    let s = EMPTY_STATE
    for (let i = 0; i < LOG_CAP + 25; i++) {
      s = logSession(s, {
        holdIds: ['a'], workSec: 30, restSec: 45, rounds: 1,
        doneWork: 1, totalWork: 1, heldSec: 30, finished: true,
      })
    }
    expect(s.log).toHaveLength(LOG_CAP)
  })
})

describe('deriveVigilante', () => {
  it('separates finished sessions from attempted ones', () => {
    let s = logSession(EMPTY_STATE, {
      holdIds: ['a'], workSec: 30, restSec: 45, rounds: 1,
      doneWork: 1, totalWork: 1, heldSec: 30, finished: true,
    })
    s = logSession(s, {
      holdIds: ['a'], workSec: 30, restSec: 45, rounds: 3,
      doneWork: 1, totalWork: 3, heldSec: 30, finished: false,
    })
    const sum = deriveVigilante(s)
    expect(sum.sessions).toBe(2)
    expect(sum.finished).toBe(1)
    expect(sum.heldSec).toBe(60)
    expect(sum.bestHoldSec).toBe(30)
  })

  it('reads zero from an untouched module rather than throwing', () => {
    expect(deriveVigilante(EMPTY_STATE)).toMatchObject({ sessions: 0, finished: 0, heldSec: 0 })
  })
})

describe('clock', () => {
  it('formats as mm:ss', () => {
    expect(clock(0)).toBe('0:00')
    expect(clock(45)).toBe('0:45')
    expect(clock(360)).toBe('6:00')
    expect(clock(605)).toBe('10:05')
  })

  it('never renders a negative clock', () => {
    expect(clock(-10)).toBe('0:00')
  })
})
