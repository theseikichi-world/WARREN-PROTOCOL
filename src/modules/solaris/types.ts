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

// ─── Crew members (a household) ───────────────────────────────────────────────
// SOLARIS tracks a whole crew, not just one person. Each member carries their own
// profile, food log and water intake; the pantry is shared across the station.

export interface Member {
  id:      string
  name:    string
  emoji:   string                          // avatar glyph
  profile: SolarisProfile
  days:    Record<string, DayLog>          // keyed by YYYY-MM-DD
  water:   Record<string, DrinkEntry[]>    // YYYY-MM-DD → drinks logged that day
}

// ─── Drinks (hydration log) ───────────────────────────────────────────────────
export type DrinkKind = 'water' | 'coffee' | 'tea' | 'juice' | 'milk'

export interface DrinkEntry {
  id:   string
  kind: DrinkKind
  ml:   number       // actual volume drunk
  at:   string       // ISO timestamp
}

// ─── Shared pantry (grocery inventory) ────────────────────────────────────────
export interface PantryItem {
  id:      string
  name:    string
  qty:     string          // free text — "2", "500g", "a bunch"
  addedAt: string
}

export interface SolarisState {
  members:        Member[]
  activeMemberId: string | null
  pantry:         PantryItem[]        // shared across the crew
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

// ─── BMI (body-mass index + healthy-weight read) ──────────────────────────────

export interface BmiInfo {
  bmi:    number          // rounded to 1 decimal
  label:  string          // Underweight | Healthy | Overweight | Obese
  color:  string
  advise: Goal            // the goal this BMI gently points toward
  healthyKg: [number, number]  // healthy weight range for this height (kg)
}

export function computeBmi(p: { weightKg: number; heightCm: number }): BmiInfo {
  const m = p.heightCm / 100
  const bmi = m > 0 ? p.weightKg / (m * m) : 0
  const r = Math.round(bmi * 10) / 10
  const healthyKg: [number, number] = [
    Math.round(18.5 * m * m), Math.round(24.9 * m * m),
  ]
  if (bmi < 18.5)  return { bmi: r, label: 'Underweight', color: '#38bdf8', advise: 'bulk',     healthyKg }
  if (bmi < 25)    return { bmi: r, label: 'Healthy',     color: '#4ade80', advise: 'maintain', healthyKg }
  if (bmi < 30)    return { bmi: r, label: 'Overweight',  color: '#ffb13c', advise: 'cut',      healthyKg }
  return                  { bmi: r, label: 'Obese',       color: '#ff5470', advise: 'cut',      healthyKg }
}

// ─── Water intake ─────────────────────────────────────────────────────────────
// Per-kg targets scaled by how hard the crew member works (sweat loss). Rounded
// to a tidy 50 ml. One cup = 250 ml.

export const CUP_ML = 250
export const HALF_LITER_ML = 500        // default quick-add (½ litre)

const WATER_PER_KG: Record<ActivityLevel, number> = {
  pod: 31, light: 33, standard: 35, active: 37, pilot: 40,
}

export function recommendedWaterMl(p: SolarisProfile): number {
  return Math.round((p.weightKg * WATER_PER_KG[p.activity]) / 50) * 50
}

// Each drink type counts toward the daily goal by its hydration FACTOR — plain
// water is 100%, caffeinated/sugary drinks a little less. `serveMl` is the
// default serving the quick-add chip pours.
export const DRINKS: Record<DrinkKind, { label: string; emoji: string; serveMl: number; factor: number }> = {
  water:  { label: 'Water',  emoji: '💧', serveMl: 250, factor: 1.0  },
  coffee: { label: 'Coffee', emoji: '☕', serveMl: 200, factor: 0.8  },
  tea:    { label: 'Tea',    emoji: '🍵', serveMl: 200, factor: 0.9  },
  juice:  { label: 'Juice',  emoji: '🧃', serveMl: 200, factor: 0.85 },
  milk:   { label: 'Milk',   emoji: '🥛', serveMl: 250, factor: 0.9  },
}

export const DRINK_ORDER: DrinkKind[] = ['water', 'coffee', 'tea', 'juice', 'milk']

/** Effective hydration (ml) a day's drinks contribute, after per-drink weighting. */
export function effectiveHydration(drinks: DrinkEntry[] | undefined): number {
  if (!drinks) return 0
  return Math.round(drinks.reduce((s, d) => s + d.ml * (DRINKS[d.kind]?.factor ?? 1), 0))
}

// ─── Member avatars ───────────────────────────────────────────────────────────
export const MEMBER_EMOJI = ['🧑‍🚀', '👩‍🚀', '🧑‍🔬', '👶', '🧒', '👵', '👴', '🐱']

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
