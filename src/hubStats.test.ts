import { describe, it, expect, beforeEach } from 'vitest'
import { getHubStats } from './hubStats'

// Minimal localStorage mock so the module loaders read our seeded keys.
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
}

const today = new Date().toISOString().slice(0, 10)

describe('getHubStats', () => {
  beforeEach(() => mockStorage())

  it('returns zeros and null calories on empty storage', () => {
    expect(getHubStats()).toEqual({ tasksDue: 0, activeGoals: 0, caloriesLeft: null, streak: 0 })
  })

  it('counts open tasks, active goals, kcal left and the best streak', () => {
    mockStorage({
      scrap7_v3: { tasks: [
        { id: 'a', text: 'todo', taskType: 'todo', completed: false },
        { id: 'b', text: 'done todo', taskType: 'todo', completed: true },
        { id: 'c', text: 'daily', taskType: 'daily', completed: false, schedule: { type: 'everyday' }, streak: 4 },
        { id: 'd', text: 'habit', taskType: 'habit', direction: 'positive', schedule: { type: 'everyday' }, streak: 9, todayCount: 0, target: 1, lastTrackedDate: null },
      ], categories: [], chatHistory: [], lastDailyReset: today },
      log_v1: { categories: [], dreams: [{ id: 'd1', title: 'D', description: '', category: '', createdAt: today, missions: [
        { id: 'm1', title: 'A', status: 'active' }, { id: 'm2', title: 'B', status: 'active' }, { id: 'm3', title: 'C', status: 'completed' },
      ] }] },
      solaris_v1: { members: [{ id: 'me', name: 'Me', emoji: '🧑', profile: { weightKg: 80, heightCm: 180, age: 30, sex: 'male', activity: 'standard', goal: 'maintain', diet: '' }, days: {}, water: {} }], activeMemberId: 'me', pantry: [], favorites: [], kitchen: { equipment: [], prefs: '' } },
    })
    const s = getHubStats()
    expect(s.tasksDue).toBe(3)        // open todo + due daily + due habit
    expect(s.activeGoals).toBe(2)     // two active missions
    expect(s.streak).toBe(9)          // best of 4 / 9
    expect(s.caloriesLeft).toBeGreaterThan(0)  // maintain target, nothing eaten
  })
})
