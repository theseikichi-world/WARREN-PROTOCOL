// ─── Boot sequence ────────────────────────────────────────────────────────────
import { GUILD } from './guild'
import { moduleLevel } from './moduleAccess'
import { loadProgression } from './modules/progression/store'
import { gatedLevel } from './modules/progression/xp'
import { loadLogState } from './modules/log/store'

// Read off the real machine rather than hard-coded, so the boot log tells you
// something on the way in: your level, how many instruments are open, what the
// vault is actually holding. The two glyph lines are the one bit of pure
// theatre — a scanner that isn't speaking English yet, and translates itself on
// the next line.

export const GLYPHS = '⌇⟟⌇⏁⟒⋔⌰☊⏃⋏⍜⌿⟒⋏⟟⋏☌⏚⎍⏁⋔⏃⌇☍⌇⊑⟒⎅'

/** A line of untranslated scanner output. Deterministic per boot, not per render. */
export function glyphLine(seed: number, length = 22): string {
  let out = ''
  let x = seed || 7
  for (let i = 0; i < length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    out += i > 0 && x % 7 === 0 ? ' ' : GLYPHS[x % GLYPHS.length]
  }
  return out
}

const pad = (label: string, value: string): string =>
  `> ${label} ${'.'.repeat(Math.max(2, 26 - label.length))} ${value}`

export function bootLines(name: string): string[] {
  const p       = loadProgression()
  const level   = gatedLevel(p.xp, p.quests).level
  const open    = GUILD.filter(m => m.built && moduleLevel(m.id) <= level).length
  const total   = GUILD.filter(m => m.built).length
  const dreams  = (() => { try { return loadLogState().dreams.length } catch { return 0 } })()
  const live    = p.goals.filter(g => g.slot !== 'archived').length
  const seed    = Math.floor(Date.now() / 1000)

  return [
    '> WARREN PROTOCOL v1.0.0',
    '> BIO-SIGN ACQUIRED · ONE OCCUPANT',
    `> ${glyphLine(seed)}`,
    '> ...TRANSLATING ... THE OCCUPANT IS EXPECTED',
    pad('THERMAL SWEEP', 'CLEAR'),
    pad('OPERATOR', `${(name || 'AGENT').toUpperCase()} · LEVEL ${level}`),
    pad('INSTRUMENTS', `${open}/${total} ONLINE`),
    pad('PATHFINDER', dreams === 1 ? '1 DREAM HELD' : `${dreams} DREAMS HELD`),
    pad('UPLINKS', live === 0 ? 'NONE ALLOCATED' : `${live}/2 ALLOCATED`),
    pad('LOCAL DATA VAULT', 'SEALED'),
    '> ALL SYSTEMS NOMINAL',
    '',
  ]
}


/** Every boot line is distinct — a repeated line reads as a stuck terminal. */
export const hasDuplicates = (lines: string[]): boolean => {
  const real = lines.filter(l => l.trim())
  return new Set(real).size !== real.length
}
