// ─── Sound — the app stops being completely silent ────────────────────────────
// Every cue here is SYNTHESISED at play time. No audio files: the CSP is strict
// (see tauri.conf.json / vercel.json), shipped samples would be dead weight in a
// bundle this size, and a short filtered blip is the sound anyway — a cyberpunk
// UI is oscillators, not orchestras.
//
// The rules this follows are the same ones the rest of the app follows:
//
//   QUIET BY DEFAULT. Master gain is 0.12. This is meant to sit under the
//   thinking, not announce itself. If a cue is ever the loudest thing in the
//   room it is wrong.
//   INFORMATIONAL, NOT CELEBRATORY (rule 10). A level-up gets three notes, not a
//   fanfare. Nothing here applauds; it reports that something moved.
//   NEVER THROW. Audio is a garnish. A browser with no Web Audio, a context the
//   OS refused, a tab that has not been clicked yet — all of it degrades to
//   silence and never to a broken screen.
//
// The context is created lazily on the first cue, because browsers refuse to
// start one before a user gesture and creating it at import would leave a
// permanently suspended context behind.

import { loadSettings } from './settings'

export type Cue =
  | 'tick'     // a control was pressed
  | 'check'    // something was completed
  | 'xp'       // a reward was banked
  | 'level'    // a threshold was crossed
  | 'quest'    // a quest cleared
  | 'deny'     // locked, refused, or impossible
  | 'open'     // a panel or module opened

interface Note {
  /** Hz. */
  freq:  number
  /** Seconds from the cue's start. */
  at:    number
  /** Seconds. */
  dur:   number
  type:  OscillatorType
  /** Relative to the master gain, 0–1. */
  gain:  number
  /** Slides to this frequency across `dur` when set — the cyberpunk part. */
  glide?: number
}

/**
 * The palette. Deliberately small: seven cues covering every kind of thing that
 * happens, so nothing needs inventing at a call site and the app never develops
 * an accent it didn't mean to.
 */
const CUES: Record<Cue, Note[]> = {
  tick:  [{ freq: 1180, at: 0,     dur: 0.035, type: 'square',   gain: 0.22 }],
  check: [{ freq: 660,  at: 0,     dur: 0.055, type: 'triangle', gain: 0.5 },
          { freq: 990,  at: 0.045, dur: 0.075, type: 'triangle', gain: 0.42 }],
  xp:    [{ freq: 880,  at: 0,     dur: 0.11,  type: 'triangle', gain: 0.4, glide: 1180 }],
  level: [{ freq: 523,  at: 0,     dur: 0.13,  type: 'triangle', gain: 0.5 },
          { freq: 659,  at: 0.1,   dur: 0.13,  type: 'triangle', gain: 0.5 },
          { freq: 784,  at: 0.2,   dur: 0.24,  type: 'triangle', gain: 0.55 },
          { freq: 1568, at: 0.2,   dur: 0.24,  type: 'sine',     gain: 0.18 }],
  quest: [{ freq: 784,  at: 0,     dur: 0.08,  type: 'square',   gain: 0.28 },
          { freq: 1046, at: 0.07,  dur: 0.16,  type: 'triangle', gain: 0.42 }],
  deny:  [{ freq: 160,  at: 0,     dur: 0.18,  type: 'sawtooth', gain: 0.3, glide: 104 }],
  open:  [{ freq: 320,  at: 0,     dur: 0.14,  type: 'sine',     gain: 0.3, glide: 880 }],
}

/** Master level. Low on purpose — see the header. */
export const MASTER_GAIN = 0.12

/** 0–100 in settings becomes a 0–1 multiplier, clamped. */
export function volumeScale(percent: number | undefined): number {
  if (typeof percent !== 'number' || Number.isNaN(percent)) return 1
  return Math.max(0, Math.min(100, percent)) / 100
}

/** Whether a cue should make any sound at all, from stored settings. */
export function soundEnabled(s: { sounds?: boolean; soundVolume?: number }): boolean {
  return s.sounds !== false && volumeScale(s.soundVolume) > 0
}

let ctx: AudioContext | null = null
let master: GainNode | null = null

/**
 * The shared context, created on first use.
 *
 * Returns null rather than throwing when audio is unavailable — every caller
 * treats that as "stay silent", which is always an acceptable outcome here.
 */
function audio(): { ctx: AudioContext; master: GainNode } | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
      master = ctx.createGain()
      master.gain.value = MASTER_GAIN
      // One shared low-pass takes the fizz off every cue at once, which is most
      // of what makes a synthesised blip sound designed rather than beeped.
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 2600
      master.connect(filter)
      filter.connect(ctx.destination)
    }
    // A context created before the first gesture starts suspended; resuming is
    // a no-op once it is already running.
    if (ctx.state === 'suspended') void ctx.resume()
    return master ? { ctx, master } : null
  } catch {
    return null
  }
}

/**
 * Play a cue. Silent when sounds are off, when audio is unavailable, or when the
 * browser has not yet allowed it. Never throws, never awaits.
 */
export function play(cue: Cue): void {
  let settings: { sounds?: boolean; soundVolume?: number }
  try { settings = loadSettings() } catch { return }
  if (!soundEnabled(settings)) return

  const a = audio()
  if (!a) return

  const scale = volumeScale(settings.soundVolume)
  const now   = a.ctx.currentTime

  for (const n of CUES[cue]) {
    try {
      const osc  = a.ctx.createOscillator()
      const gain = a.ctx.createGain()
      osc.type = n.type
      osc.frequency.setValueAtTime(n.freq, now + n.at)
      if (n.glide) osc.frequency.exponentialRampToValueAtTime(n.glide, now + n.at + n.dur)

      // A short attack and an exponential tail. A raw gate on a square wave
      // clicks; this is the difference between a cue and a pop.
      const peak = Math.max(0.0001, n.gain * scale)
      gain.gain.setValueAtTime(0.0001, now + n.at)
      gain.gain.exponentialRampToValueAtTime(peak, now + n.at + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.at + n.dur)

      osc.connect(gain)
      gain.connect(a.master)
      osc.start(now + n.at)
      osc.stop(now + n.at + n.dur + 0.02)
    } catch { /* one dud note never silences the rest */ }
  }
}

/** Release the context. Used by tests and by a full reset. */
export function resetAudio(): void {
  try { void ctx?.close() } catch { /* already gone */ }
  ctx = null
  master = null
}
