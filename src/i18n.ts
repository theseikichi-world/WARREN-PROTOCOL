// ─── Warren i18n — lightweight inline-pair localisation ───────────────────────
// Strings are translated at the call site: t('Save', 'Сохранить'). No key files
// to maintain; an untranslated call just shows English until its pair is added.
// Proper names (The Warren, SOLARIS, A.R.D.O, guild codenames) stay as-is.

import { useEffect, useReducer } from 'react'

export type Locale = 'en' | 'ru'

const KEY = 'warren_locale'
let current: Locale = load()

function load(): Locale {
  try { return localStorage.getItem(KEY) === 'ru' ? 'ru' : 'en' } catch { return 'en' }
}

export function getLocale(): Locale {
  return current
}

export function setLocale(l: Locale): void {
  current = l
  try { localStorage.setItem(KEY, l) } catch { /* ignore */ }
  // Guarded like the write above: the switch itself must work anywhere the
  // strings are read, including a test runner with no DOM.
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent('warren:locale', { detail: l }))
}

/** Pick the string for the active locale. */
export function t(en: string, ru: string): string {
  return current === 'ru' ? ru : en
}

/**
 * Russian plural agreement — the thing that gives a machine translation away.
 *
 * Russian picks one of three forms by the *last* digits, not by "1 vs many":
 *   1, 21, 31 …            → одна рутина      (one)
 *   2–4, 22–24 …           → две рутины       (few)
 *   0, 5–20, 25–30 …       → пять рутин       (many)
 * The 11–14 range is the trap: it takes `many` despite ending in 1–4.
 *
 * English callers can ignore this and keep using t() — this is only reached
 * when a count is being rendered into Russian copy.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return many
  if (last === 1) return one
  if (last >= 2 && last <= 4) return few
  return many
}

/** Subscribe a component to language changes (re-renders on toggle). */
export function useLocale(): Locale {
  const [, force] = useReducer((c: number) => c + 1, 0)
  useEffect(() => {
    const h = () => force()
    window.addEventListener('warren:locale', h)
    return () => window.removeEventListener('warren:locale', h)
  }, [])
  return current
}

/** Suffix appended to AI system prompts so responses come back in the active language. */
export function aiLangSuffix(): string {
  return current === 'ru'
    ? '\n\nIMPORTANT: Write your entire response to the user in Russian (Русский язык). Keep any JSON keys and enum values exactly as specified in English.'
    : ''
}
