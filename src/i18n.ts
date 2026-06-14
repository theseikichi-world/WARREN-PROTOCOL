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
  window.dispatchEvent(new CustomEvent('warren:locale', { detail: l }))
}

/** Pick the string for the active locale. */
export function t(en: string, ru: string): string {
  return current === 'ru' ? ru : en
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
