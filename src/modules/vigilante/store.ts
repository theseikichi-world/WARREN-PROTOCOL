// ─── VIGILANTE store — localStorage, like every other module ──────────────────

import {
  EMPTY_STATE, DEFAULT_SPEC, TIERS, todayKey, stageFrom,
  type VigilanteState, type SessionLog, type CircuitSpec, type Tier,
} from './types'

const KEY = 'vigilante_v1'

const uid = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? `vg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)

export function loadState(): VigilanteState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...EMPTY_STATE, spec: { ...DEFAULT_SPEC } }
    const parsed = JSON.parse(raw) as Partial<VigilanteState>
    const spec = parsed.spec
    return {
      ...EMPTY_STATE,
      ...parsed,
      // A tier we do not recognise (hand-edited storage, or a future build read
      // by an older one) falls back rather than producing a session with no
      // holds and a timer that ends the instant it starts.
      spec: spec
        ? {
            tier:      isTier(spec.tier) ? spec.tier : DEFAULT_SPEC.tier,
            restSec:   clampSec(spec.restSec, DEFAULT_SPEC.restSec),
            rounds:    clampRounds(spec.rounds),
            leadInSec: clampLeadIn(spec.leadInSec),
          }
        : { ...DEFAULT_SPEC },
      log: Array.isArray(parsed.log) ? parsed.log : [],
      voiceOn: typeof parsed.voiceOn === 'boolean' ? parsed.voiceOn : true,
      habitId: typeof parsed.habitId === 'string' ? parsed.habitId : null,
      habitDays: Array.isArray(parsed.habitDays) ? parsed.habitDays : [],
    }
  } catch {
    return { ...EMPTY_STATE, spec: { ...DEFAULT_SPEC } }
  }
}

export function saveState(s: VigilanteState): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* quota — nothing to do */ }
}

/** 5s–10min. Below five seconds is not a hold; above ten it is a different sport. */
export const isTier = (v: unknown): v is Tier =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(TIERS, v)

/**
 * Switching tier keeps the ladder position you earned.
 *
 * Stage is bought with finished sessions, and moving to a harder tier does not
 * un-do that work — it raises the floor under it, which is what choosing a
 * harder tier is supposed to mean.
 */
export function setTier(s: VigilanteState, tier: Tier): VigilanteState {
  return { ...s, spec: { ...s.spec, tier, restSec: TIERS[tier].restSec, rounds: TIERS[tier].rounds } }
}

export function clampSec(v: unknown, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(5, Math.min(600, Math.round(n)))
}

/** 0–120s. Zero is legal: some people want the clock to start the instant they press. */
export function clampLeadIn(v: unknown): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return DEFAULT_SPEC.leadInSec
  return Math.max(0, Math.min(120, Math.round(n)))
}

export function clampRounds(v: unknown): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return DEFAULT_SPEC.rounds
  return Math.max(1, Math.min(10, Math.round(n)))
}

export function setSpec(s: VigilanteState, spec: CircuitSpec): VigilanteState {
  return { ...s, spec }
}

export function setMusicName(s: VigilanteState, musicName: string): VigilanteState {
  return { ...s, musicName }
}

export function setVoiceOn(s: VigilanteState, voiceOn: boolean): VigilanteState {
  return { ...s, voiceOn }
}

export function setHabit(s: VigilanteState, habitId: string | null, habitDays: string[]): VigilanteState {
  return { ...s, habitId, habitDays }
}

/**
 * Record a finished — or abandoned — session.
 *
 * Newest first, capped: a training log is read from the top and nobody scrolls
 * to session 300. The cap keeps localStorage from growing without limit.
 */
export const LOG_CAP = 200

export function logSession(
  s: VigilanteState,
  entry: Omit<SessionLog, 'id' | 'date' | 'startedAt'> & { startedAt?: string },
): VigilanteState {
  const row: SessionLog = {
    id: uid(),
    date: todayKey(),
    startedAt: entry.startedAt ?? new Date().toISOString(),
    ...entry,
  }
  return { ...s, log: [row, ...s.log].slice(0, LOG_CAP) }
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export const sessionsOn = (s: VigilanteState, date: string): SessionLog[] =>
  s.log.filter(r => r.date === date)

/** Longest single hold you have ever completed, in seconds. */
export const bestHoldSec = (s: VigilanteState): number =>
  s.log.reduce((m, r) => (r.doneWork > 0 ? Math.max(m, r.maxHoldSec ?? 0) : m), 0)

/** Sessions actually finished — the only thing that buys a stage. */
export const finishedCount = (s: VigilanteState): number =>
  s.log.filter(r => r.finished).length

/** Where the ladder currently sits, read off the log. */
export const currentStage = (s: VigilanteState): number =>
  stageFrom(finishedCount(s), s.spec.tier)

/** Total time under tension across every logged session. */
export const totalHeldSec = (s: VigilanteState): number =>
  s.log.reduce((sum, r) => sum + r.heldSec, 0)

export interface VigilanteSummary {
  sessions:    number
  finished:    number
  heldSec:     number
  bestHoldSec: number
  todayCount:  number
  tier:        Tier
  stage:       number
}

export function deriveVigilante(s: VigilanteState, today = todayKey()): VigilanteSummary {
  return {
    sessions:    s.log.length,
    finished:    s.log.filter(r => r.finished).length,
    heldSec:     totalHeldSec(s),
    bestHoldSec: bestHoldSec(s),
    todayCount:  sessionsOn(s, today).length,
    tier:        s.spec.tier,
    stage:       currentStage(s),
  }
}
