// ─── SOLARIS — The Solar System's Kitchen ────────────────────────────────────
// Orbital agri-station. Calculates every crew member's nutrition personally,
// then "delivers" meals calibrated to their body and goal.

export type Sex           = 'male' | 'female'
export type ActivityLevel = 'pod' | 'light' | 'standard' | 'active' | 'pilot'
export type Goal          = 'cut' | 'maintain' | 'bulk'
export type MealSlot      = 'breakfast' | 'lunch' | 'dinner' | 'snack'

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface SolarisProfile {
  weightKg:  number
  heightCm:  number
  age:       number
  sex:       Sex
  activity:  ActivityLevel
  goal:      Goal
  diet:      string        // free-text preference: "vegetarian, no dairy", etc.
}

// ─── Food log ───────────────────────────────────────────────────────────────--

export interface FoodEntry {
  id:        string
  name:      string
  slot:      MealSlot
  calories:  number
  protein:   number        // grams
  carbs:     number        // grams
  fat:       number        // grams
  createdAt: string
}

export interface DayLog {
  date:    string          // YYYY-MM-DD
  entries: FoodEntry[]
}

export interface SolarisState {
  profile: SolarisProfile | null
  days:    Record<string, DayLog>   // keyed by YYYY-MM-DD
}

// ─── Computed nutrition targets ───────────────────────────────────────────────

export interface Targets {
  bmr:      number
  tdee:     number
  calories: number   // daily target after goal adjustment
  protein:  number   // g
  carbs:    number   // g
  fat:      number   // g
}

// ─── Meta / labels ─────────────────────────────────────────────────────────────

export const ACTIVITY_META: Record<ActivityLevel, { label: string; factor: number; sub: string }> = {
  pod:      { label: 'POD REST',  factor: 1.2,   sub: 'mostly stationary' },
  light:    { label: 'LIGHT',     factor: 1.375, sub: 'light duty 1–3×/wk' },
  standard: { label: 'STANDARD',  factor: 1.55,  sub: 'active 3–5×/wk' },
  active:   { label: 'ACTIVE',    factor: 1.725, sub: 'hard duty 6–7×/wk' },
  pilot:    { label: 'PILOT',     factor: 1.9,   sub: 'athlete / 2× daily' },
}

export const GOAL_META: Record<Goal, { label: string; sub: string; kcalAdj: number; color: string }> = {
  cut:      { label: 'BURN',     sub: 'fat loss',      kcalAdj: -500, color: '#ff5470' },
  maintain: { label: 'SUSTAIN',  sub: 'hold mass',     kcalAdj: 0,    color: '#ffb13c' },
  bulk:     { label: 'BUILD',    sub: 'gain muscle',   kcalAdj: +350, color: '#4ade80' },
}

export const SLOT_META: Record<MealSlot, { label: string; icon: string; order: number }> = {
  breakfast: { label: 'DAWN CYCLE',  icon: '🌅', order: 0 },
  lunch:     { label: 'SOLAR NOON',  icon: '☀️', order: 1 },
  dinner:    { label: 'DUSK CYCLE',  icon: '🌆', order: 2 },
  snack:     { label: 'ORBIT SNACK', icon: '✦',  order: 3 },
}

export const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Mifflin–St Jeor BMR + activity TDEE + goal-adjusted target + macro split. */
export function computeTargets(p: SolarisProfile): Targets {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age
  const bmr  = Math.round(base + (p.sex === 'male' ? 5 : -161))
  const tdee = Math.round(bmr * ACTIVITY_META[p.activity].factor)
  const calories = Math.max(1200, tdee + GOAL_META[p.goal].kcalAdj)

  // Protein: higher on cut/bulk to preserve & build lean mass
  const proteinPerKg = p.goal === 'cut' ? 2.2 : p.goal === 'bulk' ? 2.0 : 1.8
  const protein = Math.round(p.weightKg * proteinPerKg)

  // Fat: ~27% of calories
  const fat = Math.round((calories * 0.27) / 9)

  // Carbs: whatever calories remain
  const carbsKcal = Math.max(0, calories - protein * 4 - fat * 9)
  const carbs = Math.round(carbsKcal / 4)

  return { bmr, tdee, calories, protein, carbs, fat }
}

export interface DayTotals {
  calories: number
  protein:  number
  carbs:    number
  fat:      number
}

export function sumDay(log: DayLog | undefined): DayTotals {
  const t: DayTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 }
  if (!log) return t
  for (const e of log.entries) {
    t.calories += e.calories
    t.protein  += e.protein
    t.carbs    += e.carbs
    t.fat      += e.fat
  }
  return {
    calories: Math.round(t.calories),
    protein:  Math.round(t.protein),
    carbs:    Math.round(t.carbs),
    fat:      Math.round(t.fat),
  }
}
