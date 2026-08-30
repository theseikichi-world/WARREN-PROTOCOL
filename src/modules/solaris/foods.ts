import type { NewFoodData } from './store'
import type { MealSlot } from './types'

// ─── The shelf you actually eat from ──────────────────────────────────────────
// Every meal logged through the model costs a request. Most days are the same
// dozen foods, so the dozen live here: matched locally, logged instantly, and
// free. Anything this table does not know still goes to the model, which is
// where the interesting cases belong — a restaurant plate, a packet, a label.
//
// Figures are the usual reference values per 100 g raw/dry unless the entry
// says otherwise, rounded to whole grams. They are close enough to steer a day
// and are not a substitute for the number printed on a packet — which is
// exactly why photographing the label goes to the model instead.

export interface FoodRef {
  id: string
  en: string
  ru: string
  /** Lowercase fragments that identify it. The longest match wins. */
  aliases: string[]
  /**
   * `per100g` — a bare number in the input means grams.
   * `perUnit`  — a bare number means how many, and the figures are for ONE.
   */
  basis: 'per100g' | 'perUnit'
  unit?: { en: string; ru: string; grams: number }
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export const FOODS: FoodRef[] = [
  // ── Protein ──
  { id: 'egg', en: 'Egg', ru: 'Яйцо', basis: 'perUnit',
    unit: { en: 'egg', ru: 'яйцо', grams: 50 },
    aliases: ['egg', 'eggs', 'яйцо', 'яйца', 'яиц'],
    kcal: 72, protein: 6, carbs: 0, fat: 5 },

  { id: 'chicken-breast', en: 'Chicken breast', ru: 'Куриная грудка', basis: 'per100g',
    aliases: ['chicken breast', 'куриная грудка', 'грудка', 'курогрудка'],
    kcal: 120, protein: 23, carbs: 0, fat: 3 },

  { id: 'chicken-leg', en: 'Chicken leg', ru: 'Куриная ножка', basis: 'per100g',
    aliases: ['chicken leg', 'chicken legs', 'drumstick', 'куриные ножки', 'куриная ножка', 'ножки', 'ножка', 'голень'],
    kcal: 172, protein: 18, carbs: 0, fat: 11 },

  { id: 'tuna-can', en: 'Tin of tuna', ru: 'Банка тунца', basis: 'perUnit',
    unit: { en: 'tin', ru: 'банка', grams: 100 },
    aliases: ['tin of tuna', 'can of tuna', 'canned tuna', 'банка тунца', 'тунец', 'tuna'],
    kcal: 116, protein: 26, carbs: 0, fat: 1 },

  // ── Grains, dry and cooked. The difference is roughly threefold, so both
  //    forms are here rather than making you remember which one you meant. ──
  { id: 'rice-cooked', en: 'Rice, cooked', ru: 'Рис, варёный', basis: 'per100g',
    aliases: ['cooked rice', 'rice cooked', 'варёный рис', 'вареный рис', 'рис варёный', 'рис вареный'],
    kcal: 130, protein: 3, carbs: 28, fat: 0 },
  { id: 'rice-dry', en: 'Rice, dry', ru: 'Рис, сухой', basis: 'per100g',
    aliases: ['rice', 'рис'],
    kcal: 360, protein: 7, carbs: 79, fat: 1 },

  { id: 'buckwheat-cooked', en: 'Buckwheat, cooked', ru: 'Гречка, варёная', basis: 'per100g',
    aliases: ['cooked buckwheat', 'варёная гречка', 'вареная гречка', 'гречка варёная', 'гречка вареная'],
    kcal: 110, protein: 4, carbs: 21, fat: 1 },
  { id: 'buckwheat-dry', en: 'Buckwheat, dry', ru: 'Гречка, сухая', basis: 'per100g',
    aliases: ['buckwheat', 'гречка', 'гречневая крупа', 'греча'],
    kcal: 343, protein: 13, carbs: 72, fat: 3 },

  { id: 'potato', en: 'Potato', ru: 'Картофель', basis: 'per100g',
    aliases: ['potato', 'potatoes', 'картофель', 'картошка'],
    kcal: 77, protein: 2, carbs: 17, fat: 0 },

  // ── Vegetables ──
  { id: 'cucumber', en: 'Cucumber', ru: 'Огурец', basis: 'per100g',
    aliases: ['cucumber', 'огурец', 'огурцы'],
    kcal: 15, protein: 1, carbs: 4, fat: 0 },
  { id: 'tomato', en: 'Tomato', ru: 'Помидор', basis: 'per100g',
    aliases: ['tomato', 'tomatoes', 'помидор', 'помидоры', 'томат'],
    kcal: 18, protein: 1, carbs: 4, fat: 0 },
  { id: 'carrot', en: 'Carrot', ru: 'Морковь', basis: 'per100g',
    aliases: ['carrot', 'carrots', 'морковь', 'морковка'],
    kcal: 41, protein: 1, carbs: 10, fat: 0 },
  { id: 'broccoli', en: 'Broccoli', ru: 'Брокколи', basis: 'per100g',
    aliases: ['broccoli', 'брокколи'],
    kcal: 34, protein: 3, carbs: 7, fat: 0 },
  { id: 'onion', en: 'Onion', ru: 'Лук', basis: 'per100g',
    aliases: ['onion', 'onions', 'лук'],
    kcal: 40, protein: 1, carbs: 9, fat: 0 },
  { id: 'pepper', en: 'Bell pepper', ru: 'Болгарский перец', basis: 'per100g',
    aliases: ['bell pepper', 'болгарский перец', 'перец'],
    kcal: 26, protein: 1, carbs: 6, fat: 0 },

  // ── Fruit ──
  { id: 'banana', en: 'Banana', ru: 'Банан', basis: 'perUnit',
    unit: { en: 'banana', ru: 'банан', grams: 118 },
    aliases: ['banana', 'bananas', 'банан', 'бананы', 'банана'],
    kcal: 105, protein: 1, carbs: 27, fat: 0 },
  { id: 'apple', en: 'Apple', ru: 'Яблоко', basis: 'perUnit',
    unit: { en: 'apple', ru: 'яблоко', grams: 180 },
    aliases: ['apple', 'apples', 'яблоко', 'яблока', 'яблоки'],
    kcal: 95, protein: 1, carbs: 25, fat: 0 },
]

/** Grams, or a count for a `perUnit` food. Null when the text says no number. */
function readQuantity(text: string): { value: number; explicitGrams: boolean } | null {
  // "200g", "200 г", "200 грамм" — an explicit weight, whatever the food is.
  const grams = text.match(/(\d+(?:[.,]\d+)?)\s*(g\b|gr\b|grams?\b|г\b|гр\b|грамм\w*)/i)
  if (grams) return { value: parseFloat(grams[1].replace(',', '.')), explicitGrams: true }

  const bare = text.match(/(\d+(?:[.,]\d+)?)/)
  if (bare) return { value: parseFloat(bare[1].replace(',', '.')), explicitGrams: false }
  return null
}

/**
 * Read one line of food into an entry, without asking a model.
 *
 * Longest alias wins so "cooked rice" beats "rice" and "chicken breast" beats
 * nothing else by accident. Returns null when the shelf does not know it —
 * that is the signal to fall through to the parser that does.
 */
export function matchFood(input: string, slot: MealSlot): NewFoodData | null {
  const text = input.toLowerCase().trim()
  if (!text) return null

  let best: { food: FoodRef; alias: string } | null = null
  for (const food of FOODS) {
    for (const alias of food.aliases) {
      if (!text.includes(alias)) continue
      if (!best || alias.length > best.alias.length) best = { food, alias }
    }
  }
  if (!best) return null

  const { food } = best
  const qty = readQuantity(text)

  // A number with no unit means grams for a weighed food and a count for a
  // countable one — "200 rice" is a portion, "3 eggs" is three eggs.
  let factor: number
  let label: string
  if (food.basis === 'perUnit' && !qty?.explicitGrams) {
    const n = Math.max(1, Math.round(qty?.value ?? 1))
    factor = n
    label = n === 1 ? food.en : `${food.en} ×${n}`
  } else {
    const g = qty?.explicitGrams ? qty.value
      : food.basis === 'perUnit' ? (food.unit?.grams ?? 100)
      : (qty?.value ?? 100)
    const per = food.basis === 'perUnit' ? (food.unit?.grams ?? 100) : 100
    factor = g / per
    label = `${food.en}, ${Math.round(g)}g`
  }

  const round = (n: number) => Math.max(0, Math.round(n * factor))
  return {
    name:     label,
    slot,
    calories: round(food.kcal),
    protein:  round(food.protein),
    carbs:    round(food.carbs),
    fat:      round(food.fat),
  }
}

/**
 * Split a line on commas / "and" / "+" and match each part.
 * Returns null unless EVERY part is known — one unknown item means the whole
 * line should go to the model, or the entry would be quietly incomplete.
 */
export function matchMeal(input: string, slot: MealSlot): NewFoodData[] | null {
  const parts = input.split(/[,+]|\band\b|\bи\b/i).map(p => p.trim()).filter(Boolean)
  if (!parts.length) return null
  const out: NewFoodData[] = []
  for (const part of parts) {
    const hit = matchFood(part, slot)
    if (!hit) return null
    out.push(hit)
  }
  return out
}
