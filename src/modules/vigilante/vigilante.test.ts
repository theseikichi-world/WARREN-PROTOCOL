import { describe, it, expect } from 'vitest'
import {
  buildPhases, specHoldSeconds, clock, STATIC_HOLDS, DEFAULT_SPEC, EMPTY_STATE,
  TIERS, holdsAt, holdSecFor, maxStage, stageFrom, toNextStage, bossBeaten,
  BOSS_SEC, STEP_SEC, SESSIONS_PER_STAGE, PULLUP_UNLOCK_STAGE,
  type CircuitSpec, type Tier,
} from './types'
import { clampSec, clampRounds, logSession, deriveVigilante, LOG_CAP, setTier } from './store'
import { cueFor, countdownAt, prepareCue, PREPARE_AT } from './voice'

const spec = (over: Partial<CircuitSpec> = {}): CircuitSpec => ({ ...DEFAULT_SPEC, ...over })
/** Most sequence assertions are about work/rest, so start cold by default. */
const cold = (over: Partial<CircuitSpec> = {}): CircuitSpec => spec({ leadInSec: 0, ...over })
const TIER_IDS: Tier[] = ['beginner', 'hero', 'superhero']

const entry = (over: Record<string, unknown> = {}) => ({
  holdIds: ['a'], tier: 'beginner' as Tier, stage: 0, maxHoldSec: 30,
  restSec: 45, rounds: 1, doneWork: 1, totalWork: 1, heldSec: 30, finished: true,
  ...over,
})

describe('buildPhases', () => {
  it('runs every round of one hold before moving to the next', () => {
    // "Wall sit 3 rounds, THEN superman 3 rounds" — holding one position
    // repeatedly, not rotating away from it.
    const works = buildPhases(cold({ rounds: 2 }), 0).filter(x => x.kind === 'work')
    expect(works.slice(0, 4).map(x => `${x.holdId}${x.round}`))
      .toEqual(['wall-sit1', 'wall-sit2', 'superman1', 'superman2'])
  })

  it('alternates work and rest', () => {
    expect(buildPhases(cold({ rounds: 1 }), 0).slice(0, 3).map(x => x.kind))
      .toEqual(['work', 'rest', 'work'])
  })

  it('never ends on a rest — the session closes on the last hold', () => {
    expect(buildPhases(spec(), 0).slice(-1)[0].kind).toBe('work')
  })

  it('gives each hold its own earned duration', () => {
    // The push-up hold is harder, so it starts ten seconds shorter.
    const p = buildPhases(cold({ tier: 'beginner' }), 0)
    const secOf = (id: string) => p.find(x => x.kind === 'work' && x.holdId === id)!.seconds
    expect(secOf('wall-sit')).toBe(30)
    expect(secOf('pushup-hold')).toBe(20)
  })

  it('opens with a lead-in so the first hold is not short', () => {
    const p = buildPhases(spec({ leadInSec: 10 }), 0)
    expect(p[0]).toMatchObject({ kind: 'ready', seconds: 10 })
    expect(p[1].kind).toBe('work')
  })

  it('starts cold when the lead-in is zero', () => {
    expect(buildPhases(cold(), 0)[0].kind).toBe('work')
  })

  it('does not count the lead-in as time under tension', () => {
    // The lead-in is getting down the wall, not holding the position.
    expect(specHoldSeconds(spec({ leadInSec: 10 }), 0)).toBe(specHoldSeconds(cold(), 0))
  })

  it('grows the session when the pull-up joins', () => {
    expect(specHoldSeconds(spec(), PULLUP_UNLOCK_STAGE))
      .toBeGreaterThan(specHoldSeconds(spec(), PULLUP_UNLOCK_STAGE - 1))
  })
})

describe('the ladder', () => {
  it('starts on four holds and adds the pull-up in the middle', () => {
    expect(holdsAt(0)).toHaveLength(4)
    expect(holdsAt(0)).not.toContain('pullup-hold')
    expect(holdsAt(PULLUP_UNLOCK_STAGE)).toContain('pullup-hold')
    expect(STATIC_HOLDS).toHaveLength(5)
  })

  it('buys five seconds with every three finished sessions', () => {
    expect(holdSecFor('beginner', 0, 'wall-sit')).toBe(30)
    expect(holdSecFor('beginner', 1, 'wall-sit')).toBe(30 + STEP_SEC)
    expect(holdSecFor('beginner', 4, 'wall-sit')).toBe(30 + 4 * STEP_SEC)
  })

  it('lands the pull-up on thirty seconds the day it arrives', () => {
    // The spec asked for a 30-second dead hang; the entry point is chosen so
    // the ladder produces exactly that rather than needing a special case.
    expect(holdSecFor('beginner', PULLUP_UNLOCK_STAGE, 'pullup-hold')).toBe(30)
  })

  it('caps every hold at the boss, never past it', () => {
    for (const tier of TIER_IDS) {
      const top = maxStage(tier)
      for (const id of holdsAt(top)) {
        expect(holdSecFor(tier, top, id)).toBe(BOSS_SEC)
        expect(holdSecFor(tier, top + 99, id)).toBe(BOSS_SEC)
      }
    }
  })

  it('declares the boss down only when everything is at a minute', () => {
    expect(bossBeaten('beginner', 0)).toBe(false)
    expect(bossBeaten('beginner', maxStage('beginner') - 1)).toBe(false)
    expect(bossBeaten('beginner', maxStage('beginner'))).toBe(true)
  })

  it('is bought with finished sessions only', () => {
    expect(stageFrom(0, 'beginner')).toBe(0)
    expect(stageFrom(SESSIONS_PER_STAGE - 1, 'beginner')).toBe(0)
    expect(stageFrom(SESSIONS_PER_STAGE, 'beginner')).toBe(1)
    expect(stageFrom(SESSIONS_PER_STAGE * 2, 'beginner')).toBe(2)
  })

  it('cannot be pushed past the boss by grinding', () => {
    expect(stageFrom(9999, 'beginner')).toBe(maxStage('beginner'))
  })

  it('counts down the sessions still owed', () => {
    expect(toNextStage(0, 'beginner')).toBe(SESSIONS_PER_STAGE)
    expect(toNextStage(1, 'beginner')).toBe(SESSIONS_PER_STAGE - 1)
    expect(toNextStage(SESSIONS_PER_STAGE, 'beginner')).toBe(SESSIONS_PER_STAGE)
    expect(toNextStage(9999, 'beginner')).toBe(0)   // nothing left to buy
  })

  it('makes a harder tier harder in more than the clock', () => {
    // Less recovery is what "hard" means once the holds are the same length.
    expect(TIERS.superhero.restSec).toBeLessThan(TIERS.beginner.restSec)
    expect(TIERS.superhero.rounds).toBeGreaterThanOrEqual(TIERS.beginner.rounds)
    expect(TIERS.hero.start['wall-sit']).toBeGreaterThan(TIERS.beginner.start['wall-sit'])
  })

  it('sends every tier to the same boss', () => {
    for (const tier of TIER_IDS) expect(bossBeaten(tier, maxStage(tier))).toBe(true)
  })

  it('adopts the new tier rest and rounds when you switch', () => {
    const s = setTier(EMPTY_STATE, 'superhero')
    expect(s.spec.tier).toBe('superhero')
    expect(s.spec.restSec).toBe(TIERS.superhero.restSec)
    expect(s.spec.rounds).toBe(TIERS.superhero.rounds)
  })
})

describe('clamps', () => {
  it('keeps a hold inside 5s-10min', () => {
    expect(clampSec(0, 30)).toBe(5)
    expect(clampSec(9999, 30)).toBe(600)
    expect(clampSec(45, 30)).toBe(45)
  })

  it('falls back on junk rather than producing NaN', () => {
    expect(clampSec('abc', 30)).toBe(30)
    expect(clampSec(undefined, 45)).toBe(45)
    expect(clampRounds('x')).toBe(DEFAULT_SPEC.rounds)
  })

  it('keeps rounds inside 1-10', () => {
    expect(clampRounds(0)).toBe(1)
    expect(clampRounds(99)).toBe(10)
  })
})

describe('logSession', () => {
  it('records an abandoned session as exactly what it was', () => {
    const s = logSession(EMPTY_STATE, entry({ doneWork: 1, totalWork: 3, finished: false }))
    expect(s.log[0]).toMatchObject({ doneWork: 1, totalWork: 3, heldSec: 30, finished: false })
  })

  it('puts the newest session first', () => {
    let s = logSession(EMPTY_STATE, entry())
    s = logSession(s, entry({ maxHoldSec: 60, heldSec: 60 }))
    expect(s.log[0].heldSec).toBe(60)
    expect(s.log).toHaveLength(2)
  })

  it('caps the log so storage cannot grow without limit', () => {
    let s = EMPTY_STATE
    for (let i = 0; i < LOG_CAP + 25; i++) s = logSession(s, entry())
    expect(s.log).toHaveLength(LOG_CAP)
  })
})

describe('deriveVigilante', () => {
  it('separates finished sessions from attempted ones', () => {
    let s = logSession(EMPTY_STATE, entry())
    s = logSession(s, entry({ doneWork: 1, totalWork: 3, finished: false }))
    const sum = deriveVigilante(s)
    expect(sum.sessions).toBe(2)
    expect(sum.finished).toBe(1)
    expect(sum.heldSec).toBe(60)
    expect(sum.bestHoldSec).toBe(30)
  })

  it('reads zero from an untouched module rather than throwing', () => {
    expect(deriveVigilante(EMPTY_STATE))
      .toMatchObject({ sessions: 0, finished: 0, heldSec: 0, stage: 0 })
  })

  it('reports the stage the finished sessions bought', () => {
    let s = EMPTY_STATE
    for (let i = 0; i < SESSIONS_PER_STAGE; i++) s = logSession(s, entry())
    expect(deriveVigilante(s).stage).toBe(1)
  })

  it('does not let abandoned sessions buy a stage', () => {
    // Rule 10 again: walking out halfway did not earn five seconds.
    let s = EMPTY_STATE
    for (let i = 0; i < SESSIONS_PER_STAGE * 2; i++) s = logSession(s, entry({ finished: false }))
    expect(deriveVigilante(s).stage).toBe(0)
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

describe('cueFor (what the corner man says)', () => {
  const phases = buildPhases(spec({ rounds: 2, leadInSec: 10 }), 0)
  // ready, wall1, rest, wall2, rest, super1, rest, super2, ...

  it('opens by naming the position you are getting into', () => {
    expect(cueFor(phases, 0)).toEqual({ kind: 'ready', holdId: 'wall-sit' })
  })

  it('names the hold on its first round', () => {
    expect(cueFor(phases, 1))
      .toMatchObject({ kind: 'work', holdId: 'wall-sit', round: 1, named: true })
  })

  it('says the round number instead of repeating the name', () => {
    // Hearing "Wall sit" twelve times is noise; the round number is the news.
    expect(cueFor(phases, 3)).toMatchObject({ kind: 'work', round: 2, named: false })
  })

  it('names the hold again when the exercise actually changes', () => {
    // Missing this means holding the wrong position for a full round.
    expect(cueFor(phases, 5))
      .toMatchObject({ kind: 'work', holdId: 'superman', round: 1, named: true })
  })

  it('warns during the rest before a new position', () => {
    expect(cueFor(phases, 4)).toEqual({ kind: 'rest', nextHoldId: 'superman' })
  })

  it('stays quiet about what is next when nothing changes', () => {
    expect(cueFor(phases, 2)).toEqual({ kind: 'rest', nextHoldId: null })
  })

  it('returns nothing past the end rather than throwing', () => {
    expect(cueFor(phases, 999)).toBeNull()
  })

  it('names the first hold even with no lead-in', () => {
    expect(cueFor(buildPhases(cold({ rounds: 1 }), 0), 0))
      .toMatchObject({ kind: 'work', named: true })
  })
})

describe('countdownAt', () => {
  it('counts only the last three seconds', () => {
    expect(countdownAt(3.0)).toBe(3)
    expect(countdownAt(2.4)).toBe(3)   // ceil — still inside the third second
    expect(countdownAt(1.2)).toBe(2)
    expect(countdownAt(0.4)).toBe(1)
  })

  it('is silent early in a phase and once it has expired', () => {
    expect(countdownAt(30)).toBeNull()
    expect(countdownAt(3.6)).toBeNull()
    expect(countdownAt(0)).toBeNull()
    expect(countdownAt(-2)).toBeNull()
  })
})

describe('prepareCue (get set before the hold)', () => {
  const phases = buildPhases(cold({ rounds: 2 }), 0)

  it('calls the next position part-way through a rest', () => {
    expect(prepareCue(phases, 1, PREPARE_AT)).toEqual({ kind: 'prepare', holdId: 'wall-sit' })
  })

  it('fires on one second only, so it is said once', () => {
    expect(prepareCue(phases, 1, PREPARE_AT + 1)).toBeNull()
    expect(prepareCue(phases, 1, PREPARE_AT - 1)).toBeNull()
  })

  it('says nothing during a hold — you are already in position', () => {
    expect(prepareCue(phases, 0, PREPARE_AT)).toBeNull()
  })

  it('skips rests too short to leave room for the countdown', () => {
    const tight = buildPhases(cold({ rounds: 2, restSec: 5 }), 0)
    expect(prepareCue(tight, 1, PREPARE_AT)).toBeNull()
  })
})
