import {
  type SolarisState, type SolarisProfile, type FoodEntry, type DayLog,
  type MealSlot, todayKey,
} from './types'

export type { SolarisState }

const KEY = 'solaris_v1'
const INITIAL: SolarisState = { profile: null, days: {} }

// ─── Persistence ──────────────────────────────────────────────────────────────

export function loadSolarisState(): SolarisState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...INITIAL }
    const parsed = JSON.parse(raw)
    return { profile: parsed.profile ?? null, days: parsed.days ?? {} }
  } catch {
    return { ...INITIAL }
  }
}

export function saveSolarisState(s: SolarisState): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export function setProfile(state: SolarisState, profile: SolarisProfile): SolarisState {
  return { ...state, profile }
}

// ─── Day helpers ──────────────────────────────────────────────────────────────

export function getDay(state: SolarisState, date: string = todayKey()): DayLog {
  return state.days[date] ?? { date, entries: [] }
}

// ─── Food entries ─────────────────────────────────────────────────────────────

export interface NewFoodData {
  name:     string
  slot:     MealSlot
  calories: number
  protein:  number
  carbs:    number
  fat:      number
}

export function addEntry(state: SolarisState, date: string, data: NewFoodData): SolarisState {
  const entry: FoodEntry = {
    id: crypto.randomUUID(),
    name: data.name,
    slot: data.slot,
    calories: Math.max(0, Math.round(data.calories)),
    protein:  Math.max(0, Math.round(data.protein)),
    carbs:    Math.max(0, Math.round(data.carbs)),
    fat:      Math.max(0, Math.round(data.fat)),
    createdAt: new Date().toISOString(),
  }
  const day = getDay(state, date)
  const updated: DayLog = { ...day, entries: [...day.entries, entry] }
  return { ...state, days: { ...state.days, [date]: updated } }
}

export function removeEntry(state: SolarisState, date: string, entryId: string): SolarisState {
  const day = state.days[date]
  if (!day) return state
  const updated: DayLog = { ...day, entries: day.entries.filter(e => e.id !== entryId) }
  return { ...state, days: { ...state.days, [date]: updated } }
}

// ─── Streak (consecutive days with at least one logged entry, ending today) ───

export function getStreak(state: SolarisState): number {
  let streak = 0
  const d = new Date()
  for (;;) {
    const key = d.toISOString().slice(0, 10)
    const day = state.days[key]
    if (day && day.entries.length > 0) {
      streak++
      d.setDate(d.getDate() - 1)
    } else if (key === todayKey()) {
      // today not logged yet — keep checking yesterday so an unlogged "today" doesn't break the streak
      d.setDate(d.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}
