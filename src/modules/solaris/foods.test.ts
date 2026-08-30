import { describe, it, expect } from 'vitest'
import { matchFood, matchMeal, FOODS } from './foods'

describe('the local shelf', () => {
  it('counts a countable food and weighs a weighed one', () => {
    const eggs = matchFood('3 eggs', 'breakfast')!
    expect(eggs.calories).toBe(216)          // 3 × 72
    expect(eggs.name).toBe('Egg ×3')

    const rice = matchFood('200 rice', 'lunch')!
    expect(rice.calories).toBe(720)          // 2 × 360, dry
    expect(rice.name).toBe('Rice, dry, 200g')
  })

  it('lets an explicit weight override a count', () => {
    // Two eggs' worth by weight, not two eggs.
    const byWeight = matchFood('100g egg', 'breakfast')!
    expect(byWeight.calories).toBe(144)      // 2 × 72
    expect(byWeight.name).toBe('Egg, 100g')
  })

  it('defaults to one unit and to 100g', () => {
    expect(matchFood('banana', 'snack')!.calories).toBe(105)
    expect(matchFood('broccoli', 'dinner')!.calories).toBe(34)
  })

  it('prefers the longest alias, so cooked beats dry', () => {
    expect(matchFood('cooked rice 200', 'lunch')!.calories).toBe(260)
    expect(matchFood('варёная гречка 200', 'lunch')!.calories).toBe(220)
    // and a longer name is not swallowed by a shorter one
    expect(matchFood('chicken breast 150', 'dinner')!.name).toBe('Chicken breast, 150g')
  })

  it('reads Russian as well as English', () => {
    expect(matchFood('2 яйца', 'breakfast')!.calories).toBe(144)
    expect(matchFood('банка тунца', 'lunch')!.protein).toBe(26)
    expect(matchFood('гречка 100 г', 'lunch')!.calories).toBe(343)
  })

  it('says nothing rather than guessing', () => {
    expect(matchFood('pad thai', 'dinner')).toBeNull()
    expect(matchFood('', 'dinner')).toBeNull()
  })

  it('knows the staples that sent the first real line to the model', () => {
    // "3 eggs, 200 gr oatmeal, 100 gr peaches" came back unreadable because the
    // shelf had neither oatmeal nor peaches, and one miss forfeits the line.
    const meal = matchMeal('3 eggs, 200 gr oatmeal, 100 gr peaches', 'breakfast')!
    expect(meal).toHaveLength(3)
    expect(meal.map(m => m.name)).toEqual(['Egg ×3', 'Oats, dry, 200g', 'Peach, 100g'])
    expect(meal.reduce((n, m) => n + m.calories, 0)).toBe(216 + 778 + 39)
  })

  it('reads "gr" as grams, not as a count', () => {
    expect(matchFood('200 gr oatmeal', 'breakfast')!.name).toBe('Oats, dry, 200g')
  })

  it('splits a line, and refuses the whole line if one part is unknown', () => {
    const known = matchMeal('3 eggs and 200 rice', 'breakfast')!
    expect(known).toHaveLength(2)
    expect(known[0].calories + known[1].calories).toBe(936)

    // "protein bar" is a packet — its label is the accurate source, so the
    // whole line goes to the model rather than being logged half-known.
    expect(matchMeal('3 eggs and a protein bar', 'breakfast')).toBeNull()
  })

  it('keeps every entry self-consistent', () => {
    for (const f of FOODS) {
      expect(f.aliases.length).toBeGreaterThan(0)
      expect(f.kcal).toBeGreaterThan(0)
      if (f.basis === 'perUnit') expect(f.unit?.grams).toBeGreaterThan(0)
      // Macros should roughly account for the calories: 4/4/9 kcal per gram.
      const fromMacros = f.protein * 4 + f.carbs * 4 + f.fat * 9
      expect(Math.abs(fromMacros - f.kcal)).toBeLessThanOrEqual(Math.max(12, f.kcal * 0.25))
    }
  })
})
