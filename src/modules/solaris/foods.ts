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

  { id: 'oatmeal-cooked', en: 'Oatmeal, cooked', ru: 'Овсянка, варёная', basis: 'per100g',
    aliases: ['cooked oatmeal', 'porridge', 'варёная овсянка', 'вареная овсянка', 'овсяная каша', 'овсянка варёная'],
    kcal: 71, protein: 3, carbs: 12, fat: 2 },
  { id: 'oatmeal-dry', en: 'Oats, dry', ru: 'Овсянка, сухая', basis: 'per100g',
    aliases: ['oatmeal', 'oats', 'rolled oats', 'овсянка', 'овёс', 'геркулес'],
    kcal: 389, protein: 17, carbs: 66, fat: 7 },

  { id: 'pasta-cooked', en: 'Pasta, cooked', ru: 'Паста, варёная', basis: 'per100g',
    aliases: ['cooked pasta', 'варёная паста', 'вареные макароны', 'варёные макароны'],
    kcal: 131, protein: 5, carbs: 25, fat: 1 },
  { id: 'pasta-dry', en: 'Pasta, dry', ru: 'Паста, сухая', basis: 'per100g',
    aliases: ['pasta', 'spaghetti', 'паста', 'макароны', 'спагетти'],
    kcal: 371, protein: 13, carbs: 75, fat: 2 },

  { id: 'bread', en: 'Bread', ru: 'Хлеб', basis: 'per100g',
    aliases: ['bread', 'toast', 'хлеб', 'тост'],
    kcal: 265, protein: 9, carbs: 49, fat: 3 },

  // ── More protein ──
  { id: 'beef', en: 'Beef', ru: 'Говядина', basis: 'per100g',
    aliases: ['beef', 'steak', 'говядина', 'стейк'],
    kcal: 250, protein: 26, carbs: 0, fat: 15 },
  { id: 'salmon', en: 'Salmon', ru: 'Лосось', basis: 'per100g',
    aliases: ['salmon', 'лосось', 'сёмга', 'семга'],
    kcal: 208, protein: 20, carbs: 0, fat: 13 },
  { id: 'cottage-cheese', en: 'Cottage cheese', ru: 'Творог', basis: 'per100g',
    aliases: ['cottage cheese', 'творог'],
    kcal: 121, protein: 17, carbs: 3, fat: 5 },
  { id: 'yogurt', en: 'Greek yogurt', ru: 'Греческий йогурт', basis: 'per100g',
    aliases: ['greek yogurt', 'yogurt', 'йогурт'],
    kcal: 59, protein: 10, carbs: 4, fat: 1 },
  { id: 'milk', en: 'Milk', ru: 'Молоко', basis: 'per100g',
    aliases: ['milk', 'молоко'],
    kcal: 52, protein: 3, carbs: 5, fat: 3 },

  // ── More vegetables ──
  { id: 'cabbage', en: 'Cabbage', ru: 'Капуста', basis: 'per100g',
    aliases: ['cabbage', 'капуста'],
    kcal: 25, protein: 1, carbs: 6, fat: 0 },
  { id: 'spinach', en: 'Spinach', ru: 'Шпинат', basis: 'per100g',
    aliases: ['spinach', 'шпинат'],
    kcal: 23, protein: 3, carbs: 4, fat: 0 },
  { id: 'zucchini', en: 'Zucchini', ru: 'Кабачок', basis: 'per100g',
    aliases: ['zucchini', 'courgette', 'кабачок', 'кабачки'],
    kcal: 17, protein: 1, carbs: 3, fat: 0 },
  { id: 'beetroot', en: 'Beetroot', ru: 'Свёкла', basis: 'per100g',
    aliases: ['beetroot', 'beet', 'свёкла', 'свекла'],
    kcal: 43, protein: 2, carbs: 10, fat: 0 },
  { id: 'avocado', en: 'Avocado', ru: 'Авокадо', basis: 'per100g',
    aliases: ['avocado', 'авокадо'],
    kcal: 160, protein: 2, carbs: 9, fat: 15 },

  { id: 'olive-oil', en: 'Olive oil', ru: 'Оливковое масло', basis: 'perUnit',
    unit: { en: 'tbsp', ru: 'ст. л.', grams: 14 },
    aliases: ['olive oil', 'оливковое масло', 'растительное масло'],
    kcal: 124, protein: 0, carbs: 0, fat: 14 },

  // ── Fruit ──
  { id: 'peach', en: 'Peach', ru: 'Персик', basis: 'per100g',
    aliases: ['peach', 'peaches', 'персик', 'персики', 'персиков'],
    kcal: 39, protein: 1, carbs: 10, fat: 0 },
  { id: 'orange', en: 'Orange', ru: 'Апельсин', basis: 'per100g',
    aliases: ['orange', 'oranges', 'апельсин', 'апельсины'],
    kcal: 47, protein: 1, carbs: 12, fat: 0 },
  { id: 'pear', en: 'Pear', ru: 'Груша', basis: 'per100g',
    aliases: ['pear', 'pears', 'груша', 'груши'],
    kcal: 57, protein: 0, carbs: 15, fat: 0 },
  { id: 'grapes', en: 'Grapes', ru: 'Виноград', basis: 'per100g',
    aliases: ['grape', 'grapes', 'виноград'],
    kcal: 69, protein: 1, carbs: 18, fat: 0 },
  { id: 'watermelon', en: 'Watermelon', ru: 'Арбуз', basis: 'per100g',
    aliases: ['watermelon', 'арбуз'],
    kcal: 30, protein: 1, carbs: 8, fat: 0 },
  { id: 'plum', en: 'Plum', ru: 'Слива', basis: 'per100g',
    aliases: ['plum', 'plums', 'слива', 'сливы'],
    kcal: 46, protein: 1, carbs: 11, fat: 0 },
  { id: 'apricot', en: 'Apricot', ru: 'Абрикос', basis: 'per100g',
    aliases: ['apricot', 'apricots', 'абрикос', 'абрикосы'],
    kcal: 48, protein: 1, carbs: 11, fat: 0 },
  { id: 'mandarin', en: 'Mandarin', ru: 'Мандарин', basis: 'per100g',
    aliases: ['mandarin', 'tangerine', 'мандарин', 'мандарины'],
    kcal: 53, protein: 1, carbs: 13, fat: 0 },
  { id: 'strawberry', en: 'Strawberries', ru: 'Клубника', basis: 'per100g',
    aliases: ['strawberry', 'strawberries', 'клубника'],
    kcal: 32, protein: 1, carbs: 8, fat: 0 },
  { id: 'blueberry', en: 'Blueberries', ru: 'Черника', basis: 'per100g',
    aliases: ['blueberry', 'blueberries', 'черника', 'голубика'],
    kcal: 57, protein: 1, carbs: 14, fat: 0 },
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
 *
 * Returns null unless EVERY part is known. One unknown item means the whole
 * line goes to the model — logging three of four items would silently
 * under-count the day, which is worse than spending a request.
 *
 * Null is a HAND-OFF, not a refusal. Whoever calls this owes the user the
 * model; a caller that just says "no" turns a shelf miss into a dead end.
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
