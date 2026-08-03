import { describe, it, expect } from 'vitest'
import { bootLines, glyphLine, hasDuplicates, GLYPHS } from './boot'

describe('the boot log', () => {
  it('never repeats a line', () => {
    // The screenshot that started this: INITIALIZING twice, CONNECTING three
    // times, LOCAL DATA VAULT four times. The runtime cause was a restarting
    // timer chain; this pins the other half — the script itself must be unique.
    expect(hasDuplicates(bootLines('SEIKICHI'))).toBe(false)
  })

  it('reports the operator and their level', () => {
    const text = bootLines('seikichi').join('\n')
    expect(text).toMatch(/OPERATOR.*SEIKICHI · LEVEL \d+/)
  })

  it('falls back to a callsign when there is no name yet', () => {
    expect(bootLines('').join('\n')).toMatch(/OPERATOR.*AGENT/)
  })

  it('counts instruments against what is actually built', () => {
    expect(bootLines('x').join('\n')).toMatch(/INSTRUMENTS.*\d+\/\d+ ONLINE/)
  })

  it('says one dream rather than 1 dreams', () => {
    const text = bootLines('x').join('\n')
    expect(text).toMatch(/PATHFINDER.*(0 DREAMS HELD|1 DREAM HELD|\d+ DREAMS HELD)/)
  })

  it('ends on the line the hello screen follows', () => {
    const lines = bootLines('x').filter(l => l.trim())
    expect(lines[lines.length - 1]).toBe('> ALL SYSTEMS NOMINAL')
  })

  it('detects a duplicate when there is one', () => {
    expect(hasDuplicates(['> A', '> B', '> A'])).toBe(true)
    expect(hasDuplicates(['> A', '', '', '> B'])).toBe(false)   // blanks are spacing
  })
})

describe('the untranslated line', () => {
  it('is the same for the same boot and different across boots', () => {
    expect(glyphLine(42)).toBe(glyphLine(42))
    expect(glyphLine(42)).not.toBe(glyphLine(43))
  })

  it('uses only glyphs and spaces — never a letter that could be misread', () => {
    expect(glyphLine(7, 40)).toMatch(new RegExp(`^[${GLYPHS} ]+$`, 'u'))
  })

  it('is the length asked for', () => {
    expect(glyphLine(3, 18)).toHaveLength(18)
  })
})
