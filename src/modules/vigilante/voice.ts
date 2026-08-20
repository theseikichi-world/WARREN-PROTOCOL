// ─── The corner man ───────────────────────────────────────────────────────────
// The real problem during a plank is not tapping the screen — it is LOOKING at
// it. Turning your head to read a countdown breaks the line from heel to head,
// which is the one thing the hold is about. So the session says itself out loud
// and you never look.
//
// Speech synthesis is the safe half of the voice story: it is supported in
// WebView2 and in iOS Safari, needs no permission, and never sends anything
// anywhere. (Speech *recognition* is the half that uploads your microphone to a
// server and is missing from WebView2 — deliberately not used here.)

import type { Phase } from './types'

export const voiceSupported = (): boolean =>
  typeof window !== 'undefined' && 'speechSynthesis' in window

// Voices load asynchronously and the first getVoices() is usually empty, so the
// list is warmed here and refreshed when the engine says it changed.
let cachedVoices: SpeechSynthesisVoice[] = []

function voices(): SpeechSynthesisVoice[] {
  if (!voiceSupported()) return []
  if (!cachedVoices.length) cachedVoices = window.speechSynthesis.getVoices()
  return cachedVoices
}

if (voiceSupported()) {
  try {
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      cachedVoices = window.speechSynthesis.getVoices()
    })
  } catch { /* older engines expose no event — the lazy read still works */ }
}

/**
 * Say one line, dropping anything still queued.
 *
 * `interrupt` matters more than it looks: a cue that arrives after the phase it
 * described has ended is worse than silence, because you act on it. Phase cues
 * supersede; short countdown numbers do not.
 */
export function speak(text: string, lang: 'en' | 'ru', interrupt = true): void {
  if (!voiceSupported() || !text.trim()) return
  try {
    if (interrupt) window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    const want = lang === 'ru' ? 'ru' : 'en'
    const v = voices().find(x => x.lang?.toLowerCase().startsWith(want))
    if (v) u.voice = v
    u.lang = v?.lang ?? (want === 'ru' ? 'ru-RU' : 'en-US')
    u.rate = 1.05          // a shade brisk — this is a cue, not a paragraph
    window.speechSynthesis.speak(u)
  } catch { /* the session runs silent rather than breaking */ }
}

export function silence(): void {
  if (!voiceSupported()) return
  try { window.speechSynthesis.cancel() } catch { /* nothing queued */ }
}

// ─── What to say, decided without knowing any language ────────────────────────
// The descriptor is pure so it can be tested; the component turns it into words
// through the same t() every other string goes through.

export type Cue =
  | { kind: 'ready';    holdId: string }
  /** `named` = this is a hold you have not just been doing, so say its name. */
  | { kind: 'work';     holdId: string; round: number; named: boolean }
  | { kind: 'rest';     nextHoldId: string | null }
  | { kind: 'done' }

/**
 * The cue for entering the phase at `index`.
 *
 * Naming logic is the point: hearing "Wall sit" twelve times is noise, and
 * hearing nothing when the exercise changes means you hold the wrong position.
 * So the name is spoken when the hold CHANGES, and the round number when it
 * does not.
 */
export function cueFor(phases: Phase[], index: number): Cue | null {
  const p = phases[index]
  if (!p) return null

  if (p.kind === 'ready') return { kind: 'ready', holdId: p.holdId }

  if (p.kind === 'work') {
    const prev = index > 0 ? phases[index - 1] : null
    const named = !prev || prev.kind === 'ready' || prev.holdId !== p.holdId
    return { kind: 'work', holdId: p.holdId, round: p.round, named }
  }

  const next = phases[index + 1]
  return { kind: 'rest', nextHoldId: next && next.holdId !== p.holdId ? next.holdId : null }
}

/** Seconds remaining at which the corner man counts you down. */
export const COUNTDOWN_FROM = 3

/** Does this tick cross a whole second inside the countdown window? */
export function countdownAt(remaining: number): number | null {
  const s = Math.ceil(remaining)
  return s >= 1 && s <= COUNTDOWN_FROM ? s : null
}
