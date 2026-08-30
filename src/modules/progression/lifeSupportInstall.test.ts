import { describe, it, expect, beforeEach } from 'vitest'
import { installCustomLifeSupport, installLifeSupport, lifeSupportFree } from './store'
import { LIFE_SUPPORT } from './lifeSupport'
import { loadState as loadScrap7 } from '../scrap7/store'
import { isBaseline } from '../scrap7/types'

// The slot cap and the duplicate guard used to live in LifeSupportPanel's UI,
// which meant they held only for callers that happened to go through that
// screen. VIGILANTE did not, and produced two "Static workout" basics and a
// 4-of-3 slot count. These tests pin the rules to the store instead.

function mockStorage(seed: Record<string, unknown> = {}) {
  const mem: Record<string, string> = {}
  for (const [k, v] of Object.entries(seed)) mem[k] = JSON.stringify(v)
  globalThis.localStorage = {
    getItem: (k: string) => mem[k] ?? null,
    setItem: (k: string, v: string) => { mem[k] = v },
    removeItem: (k: string) => { delete mem[k] },
    clear: () => { for (const k of Object.keys(mem)) delete mem[k] },
    key: () => null, length: 0,
  } as Storage
  // The store announces changes; nothing is listening in a test.
  globalThis.window = {
    dispatchEvent: () => true,
  } as unknown as Window & typeof globalThis
  globalThis.CustomEvent = class { constructor(public type: string, public init?: unknown) {} } as never
}

const basics = () => loadScrap7().tasks.filter(t => t.taskType === 'habit' && isBaseline(t))

describe('life support install', () => {
  beforeEach(() => mockStorage())

  it('gives level 1 exactly one slot', () => {
    expect(lifeSupportFree()).toBe(1)
  })

  it('hands back the existing basic instead of making a numbered twin', () => {
    const first  = installCustomLifeSupport('Static workout', 1, 'session')
    const second = installCustomLifeSupport('Static workout', 1, 'session')

    expect(first).toBeTruthy()
    expect(second).toBe(first)
    expect(basics()).toHaveLength(1)
  })

  it('matches the twin on title, not on the slug — Cyrillic reduces to nothing', () => {
    // Both of these slug to the same 'basic' id, and they are NOT the same habit.
    const a = installCustomLifeSupport('Статика', 1, 'раз')
    expect(a).toBeTruthy()
    // The cap is what stops the second one here, not a false twin match.
    expect(installCustomLifeSupport('Зарядка', 1, 'раз')).toBeNull()
    expect(basics()).toHaveLength(1)
  })

  it('refuses a custom basic once the slots are full', () => {
    expect(installCustomLifeSupport('Sleep by midnight', 1, 'night')).toBeTruthy()
    expect(lifeSupportFree()).toBe(0)
    expect(installCustomLifeSupport('Walk outside', 1, 'time')).toBeNull()
    expect(basics()).toHaveLength(1)
  })

  it('refuses a template basic once the slots are full', () => {
    const [one, two] = LIFE_SUPPORT
    expect(installLifeSupport(one, one.title, one.unit)).toBe(true)
    expect(installLifeSupport(two, two.title, two.unit)).toBe(false)
    expect(basics()).toHaveLength(1)
  })

  it('still reports false for a template already installed, not a new slot burn', () => {
    const [one] = LIFE_SUPPORT
    expect(installLifeSupport(one, one.title, one.unit)).toBe(true)
    expect(installLifeSupport(one, one.title, one.unit)).toBe(false)
    expect(basics()).toHaveLength(1)
  })
})
