import {
  type SolarisState, type SolarisProfile, type FoodEntry, type DayLog,
  type MealSlot, type Member, type PantryItem, type DrinkEntry, type DrinkKind,
  todayKey,
} from './types'

export type { SolarisState }

const KEY = 'solaris_v1'
const INITIAL: SolarisState = { members: [], activeMemberId: null, pantry: [] }

// ─── Persistence (+ migration from the old single-profile shape) ──────────────

export function loadSolarisState(): SolarisState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return structuredClone(INITIAL)
    const p = JSON.parse(raw)

    // New shape — already a crew
    if (Array.isArray(p.members)) {
      return {
        members: p.members.map((m: Partial<Member>) => ({
          id: m.id ?? crypto.randomUUID(), name: m.name ?? 'Crew', emoji: m.emoji ?? '🧑‍🚀',
          profile: m.profile as SolarisProfile, days: m.days ?? {}, water: normalizeWater(m.water),
        })),
        activeMemberId: p.activeMemberId ?? p.members[0]?.id ?? null,
        pantry: Array.isArray(p.pantry) ? p.pantry : [],
      }
    }

    // Old shape { profile, days } → wrap the lone profile as the first crew member
    if (p.profile) {
      const member: Member = {
        id: crypto.randomUUID(), name: 'You', emoji: '🧑‍🚀',
        profile: p.profile, days: p.days ?? {}, water: {},
      }
      return { members: [member], activeMemberId: member.id, pantry: [] }
    }

    return structuredClone(INITIAL)
  } catch {
    return structuredClone(INITIAL)
  }
}

export function saveSolarisState(s: SolarisState): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}

// ─── Member CRUD ──────────────────────────────────────────────────────────────

export function activeMember(state: SolarisState): Member | null {
  return state.members.find(m => m.id === state.activeMemberId) ?? state.members[0] ?? null
}

export function newMember(name: string, emoji: string, profile: SolarisProfile): Member {
  return { id: crypto.randomUUID(), name: name.trim() || 'Crew', emoji, profile, days: {}, water: {} }
}

/** Add a member and focus them (you just created them). */
export function addMember(state: SolarisState, name: string, emoji: string, profile: SolarisProfile): SolarisState {
  const m = newMember(name, emoji, profile)
  return { ...state, members: [...state.members, m], activeMemberId: m.id }
}

function mapMember(state: SolarisState, memberId: string, fn: (m: Member) => Member): SolarisState {
  return { ...state, members: state.members.map(m => m.id === memberId ? fn(m) : m) }
}

export function updateMemberProfile(state: SolarisState, memberId: string, profile: SolarisProfile): SolarisState {
  return mapMember(state, memberId, m => ({ ...m, profile }))
}

export function renameMember(state: SolarisState, memberId: string, name: string, emoji: string): SolarisState {
  return mapMember(state, memberId, m => ({ ...m, name: name.trim() || m.name, emoji }))
}

export function removeMember(state: SolarisState, memberId: string): SolarisState {
  const members = state.members.filter(m => m.id !== memberId)
  const activeMemberId = state.activeMemberId === memberId
    ? (members[0]?.id ?? null)
    : state.activeMemberId
  return { ...state, members, activeMemberId }
}

export function setActiveMember(state: SolarisState, memberId: string): SolarisState {
  return { ...state, activeMemberId: memberId }
}

// ─── Day helpers (per member) ─────────────────────────────────────────────────

export function getDay(state: SolarisState, memberId: string, date: string = todayKey()): DayLog {
  const m = state.members.find(x => x.id === memberId)
  return m?.days[date] ?? { date, entries: [] }
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

export function addEntry(state: SolarisState, memberId: string, date: string, data: NewFoodData): SolarisState {
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
  return mapMember(state, memberId, m => {
    const day = m.days[date] ?? { date, entries: [] }
    return { ...m, days: { ...m.days, [date]: { ...day, entries: [...day.entries, entry] } } }
  })
}

export function removeEntry(state: SolarisState, memberId: string, date: string, entryId: string): SolarisState {
  return mapMember(state, memberId, m => {
    const day = m.days[date]
    if (!day) return m
    return { ...m, days: { ...m.days, [date]: { ...day, entries: day.entries.filter(e => e.id !== entryId) } } }
  })
}

// ─── Water / drinks (per member, per day) ─────────────────────────────────────

/** Coerce any stored water shape (legacy number, or drink array) into a drink log. */
function normalizeWater(w: unknown): Record<string, DrinkEntry[]> {
  if (!w || typeof w !== 'object') return {}
  const out: Record<string, DrinkEntry[]> = {}
  for (const [date, v] of Object.entries(w as Record<string, unknown>)) {
    if (Array.isArray(v)) {
      out[date] = v.filter((d): d is DrinkEntry => !!d && typeof (d as DrinkEntry).ml === 'number')
    } else if (typeof v === 'number' && v > 0) {
      out[date] = [{ id: crypto.randomUUID(), kind: 'water', ml: v, at: '' }]   // legacy total → one water entry
    }
  }
  return out
}

export function getDrinks(state: SolarisState, memberId: string, date: string = todayKey()): DrinkEntry[] {
  const m = state.members.find(x => x.id === memberId)
  return m?.water[date] ?? []
}

export function addDrink(state: SolarisState, memberId: string, date: string, kind: DrinkKind, ml: number): SolarisState {
  const vol = Math.max(0, Math.round(ml))
  if (!vol) return state
  const entry: DrinkEntry = { id: crypto.randomUUID(), kind, ml: vol, at: new Date().toISOString() }
  return mapMember(state, memberId, m => ({
    ...m, water: { ...m.water, [date]: [...(m.water[date] ?? []), entry] },
  }))
}

export function removeDrink(state: SolarisState, memberId: string, date: string, drinkId: string): SolarisState {
  return mapMember(state, memberId, m => {
    const list = m.water[date]
    if (!list) return m
    return { ...m, water: { ...m.water, [date]: list.filter(d => d.id !== drinkId) } }
  })
}

// ─── Pantry (shared across the crew) ──────────────────────────────────────────

export function addPantryItem(state: SolarisState, name: string, qty: string): SolarisState {
  const clean = name.trim()
  if (!clean) return state
  const item: PantryItem = { id: crypto.randomUUID(), name: clean, qty: qty.trim(), addedAt: new Date().toISOString() }
  return { ...state, pantry: [item, ...state.pantry] }
}

/** Bulk-add items (e.g. read from a grocery photo), skipping blanks and case-insensitive dupes. */
export function addPantryItems(state: SolarisState, items: { name: string; qty?: string }[]): SolarisState {
  const have = new Set(state.pantry.map(i => i.name.toLowerCase()))
  const fresh: PantryItem[] = []
  for (const it of items) {
    const clean = it.name.trim()
    if (!clean || have.has(clean.toLowerCase())) continue
    have.add(clean.toLowerCase())
    fresh.push({ id: crypto.randomUUID(), name: clean, qty: (it.qty ?? '').trim(), addedAt: new Date().toISOString() })
  }
  return fresh.length ? { ...state, pantry: [...fresh, ...state.pantry] } : state
}

export function removePantryItem(state: SolarisState, id: string): SolarisState {
  return { ...state, pantry: state.pantry.filter(i => i.id !== id) }
}

// ─── Streak (consecutive days with ≥1 logged entry for this member, ending today) ─

export function getStreak(state: SolarisState, memberId: string): number {
  const m = state.members.find(x => x.id === memberId)
  if (!m) return 0
  let streak = 0
  const d = new Date()
  for (;;) {
    const key = d.toISOString().slice(0, 10)
    const day = m.days[key]
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
