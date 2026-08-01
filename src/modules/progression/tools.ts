// ─── Instrument tiers (FIRMWARE) ──────────────────────────────────────────────
// An instrument arrives doing one thing completely. Depth appears only once the
// simple version starts to chafe.
//
// The governing rule is GATE COMPLEXITY, NEVER UTILITY. Tier 0 of any instrument
// must fully solve the problem it exists for — SOLARIS at v0 really does keep
// you hydrated. What's locked is surface area, never the thing you came for.
//
// Tiers are DERIVED from use, never stored and never bought. There is no way to
// grind a tier open: you get calories when you've actually been drinking water
// for a week, because that's when a second number stops being noise.

import type { SolarisState } from '../solaris/store'

export type Firmware = 0 | 1 | 2 | 3

export interface SolarisUsage {
  hydrationDays: number   // distinct days with at least one drink logged
  mealsLogged:   number   // food entries across every day
}

/** Read the instrument's own record. Counts the whole crew — it's one kitchen. */
export function solarisUsage(state: SolarisState): SolarisUsage {
  let hydrationDays = 0
  let mealsLogged   = 0

  for (const member of state.members ?? []) {
    for (const drinks of Object.values(member.water ?? {})) {
      if (Array.isArray(drinks) && drinks.length > 0) hydrationDays++
    }
    for (const day of Object.values(member.days ?? {})) {
      mealsLogged += day?.entries?.length ?? 0
    }
  }
  return { hydrationDays, mealsLogged }
}

export const SOLARIS_STEPS: {
  tier:   Firmware
  opens:  string
  opensRu: string
  needs:  string
  needsRu: string
  test:   (u: SolarisUsage) => boolean
}[] = [
  {
    tier: 1, opens: 'Calories & meal log', opensRu: 'Калории и журнал еды',
    needs: '5 days of hydration logged', needsRu: '5 дней с записанной водой',
    test: u => u.hydrationDays >= 5,
  },
  {
    tier: 2, opens: 'Macro targets', opensRu: 'Цели по макросам',
    needs: '15 meals logged', needsRu: '15 записанных приёмов пищи',
    test: u => u.mealsLogged >= 15,
  },
  {
    tier: 3, opens: 'Pantry, analyser & dish ideas', opensRu: 'Кладовая, анализ и идеи блюд',
    needs: '40 meals logged', needsRu: '40 записанных приёмов пищи',
    test: u => u.mealsLogged >= 40,
  },
]

/**
 * Current firmware. Steps are ordered, so a later condition met early doesn't
 * skip a tier — the kitchen opens in the order that makes sense to learn.
 */
export function solarisTier(usage: SolarisUsage): Firmware {
  let tier: Firmware = 0
  for (const step of SOLARIS_STEPS) {
    if (!step.test(usage)) break
    tier = step.tier
  }
  return tier
}

export interface NextStep {
  tier:    Firmware
  opens:   string
  opensRu: string
  needs:   string
  needsRu: string
  have:    number
  need:    number
}

/** What the instrument opens next, and how close it is. Null at full firmware. */
export function solarisNext(usage: SolarisUsage): NextStep | null {
  const tier = solarisTier(usage)
  const step = SOLARIS_STEPS.find(s => s.tier === tier + 1)
  if (!step) return null

  const [have, need] = step.tier === 1
    ? [usage.hydrationDays, 5]
    : step.tier === 2
      ? [usage.mealsLogged, 15]
      : [usage.mealsLogged, 40]

  return { tier: step.tier, opens: step.opens, opensRu: step.opensRu,
           needs: step.needs, needsRu: step.needsRu, have: Math.min(have, need), need }
}

/** Does this firmware expose a given surface? */
export const solarisHas = (tier: Firmware, surface: 'calories' | 'macros' | 'kitchen'): boolean =>
  surface === 'calories' ? tier >= 1 : surface === 'macros' ? tier >= 2 : tier >= 3
