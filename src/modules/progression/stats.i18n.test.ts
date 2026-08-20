import { describe, it, expect, afterEach } from 'vitest'
import { setLocale } from '../../i18n'
import { deriveStats } from './stats'
import type { Goal } from './types'
import type { Task } from '../scrap7/types'
import type { ModuleSummaries } from '../bigscreen/moduleStats'

// The character sheet renders `stat.detail` directly. It used to be English on
// every path while `label`/`ru` was translated, so a Russian sheet read
// "STREAK / 3 day best run". These pin the detail line to the active locale.

const noGoals: Goal[] = []
const noTasks: Task[] = []
const noSums = {} as ModuleSummaries

afterEach(() => setLocale('en'))

describe('character stat details follow the locale', () => {
  it('reads Russian with nothing installed', () => {
    setLocale('ru')
    const byKey = Object.fromEntries(deriveStats(noGoals, noTasks, noSums).map(s => [s.key, s]))
    expect(byKey.automatism.detail).toBe('рутины не установлены')
    expect(byKey.streak.detail).toBe('пока ничего не запущено')
    expect(byKey.resolve.detail).toBe('пока нечего держать')
    expect(byKey.recall.detail).toBe('тексты не загружены')
    expect(byKey.insight.detail).toBe('журнал не открывали')
  })

  it('still reads English when the locale is English', () => {
    setLocale('en')
    const byKey = Object.fromEntries(deriveStats(noGoals, noTasks, noSums).map(s => [s.key, s]))
    expect(byKey.automatism.detail).toBe('no routines installed')
    expect(byKey.streak.detail).toBe('nothing running yet')
  })
})
