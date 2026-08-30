import { t, plural } from './i18n'

// ─── What the app says when it sees you ───────────────────────────────────────
// "Good evening" every single time is a clock with a name attached. Someone who
// has been gone a week should not be greeted identically to someone who was
// here twenty minutes ago — noticing the gap is most of what makes a greeting
// read as addressed to a person rather than printed at one.
//
// Everything here is pure. The absence comes in as a number of days so the
// wording can be tested without a clock or a store.

const KEY = 'warren_last_seen'

/** ISO timestamp of the previous visit, or null the first time ever. */
export function readLastSeen(): string | null {
  try { return localStorage.getItem(KEY) } catch { return null }
}

/**
 * Stamp this visit — but only once the gap has been read, and only when it is
 * big enough to matter. Writing on every render would erase the very gap the
 * greeting is about.
 */
export function markSeen(now = new Date()): void {
  try { localStorage.setItem(KEY, now.toISOString()) } catch { /* private mode */ }
}

/** Whole days between the last visit and now. 0 when there was no last visit. */
export function daysAway(lastSeen: string | null, now = new Date()): number {
  if (!lastSeen) return 0
  const then = new Date(lastSeen).getTime()
  if (Number.isNaN(then)) return 0
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000))
}

/**
 * The gap, measured ONCE per app session and then stamped over.
 *
 * This cannot live in a component. Reading the last visit and writing this one
 * has to happen exactly once, and a component gets mounted more than once —
 * StrictMode does it deliberately in development, and coming back to the hub
 * does it in production. Every remount after the first would read the stamp we
 * had just written and conclude you had never been away. A module-level memo
 * survives all of that, because there is only one app session.
 */
let sessionAway: number | null = null

export function sessionDaysAway(now = new Date()): number {
  if (sessionAway === null) {
    sessionAway = daysAway(readLastSeen(), now)
    markSeen(now)
  }
  return sessionAway
}

/** Tests only — there is no way to start a second session in one page. */
export function __resetSession(): void { sessionAway = null }

export type GreetKind = 'now' | 'back' | 'long' | 'ages'

/**
 * Four bands, not a curve. A day away is not an absence — you slept. Two is
 * worth noticing, a working week is worth naming, a fortnight is worth saying
 * plainly.
 */
export function awayKind(days: number): GreetKind {
  if (days >= 14) return 'ages'
  if (days >= 4)  return 'long'
  if (days >= 2)  return 'back'
  return 'now'
}

/** The time-of-day greeting, when there is no absence to lead with. */
export function timeGreeting(hour: number): string {
  if (hour < 5)  return t('still up?', 'ещё не спите?')
  if (hour < 12) return t('good morning', 'доброе утро')
  if (hour < 17) return t('good afternoon', 'добрый день')
  return t('good evening', 'добрый вечер')
}

/** The headline. Absence wins over the clock when there is one. */
export function greetingFor(hour: number, days: number): string {
  switch (awayKind(days)) {
    case 'back': return t('good to see you back',  'рад видеть снова')
    case 'long': return t('long time no see',      'давно не виделись')
    case 'ages': return t('it has been a while',   'давно вас не было')
    default:     return timeGreeting(hour)
  }
}

export interface BriefFacts {
  /** Whole days since the last visit. */
  days:      number
  /** Things due today and not yet done. */
  due:       number
  /** Minutes of the day still unspoken for. */
  freeMin:   number
  /** Whether the day is over as far as the schedule is concerned. */
  awake:     boolean
  /** One line about the sky, when there is one to give. */
  weather?:  string | null
}

const hhmm = (min: number): string => {
  const h = Math.floor(min / 60), m = min % 60
  if (h && m) return `${h}h ${m}m`
  if (h)      return `${h}h`
  return `${m}m`
}

/**
 * The brief under the greeting: what is true right now, in the order a person
 * would want it. States facts and stops — it does not tell you to do anything,
 * because the suggestion below it already does that job once.
 */
export function briefFor(f: BriefFacts): string {
  const parts: string[] = []

  if (f.days >= 2) {
    parts.push(t(
      `${f.days} days since you were last here`,
      `${f.days} ${plural(f.days, 'день', 'дня', 'дней')} с прошлого визита`,
    ))
  }

  if (f.due > 0) {
    parts.push(t(
      `${f.due} ${f.due === 1 ? 'thing is' : 'things are'} due`,
      `${f.due} ${plural(f.due, 'задача', 'задачи', 'задач')} на сегодня`,
    ))
  }

  if (!f.awake) {
    parts.push(t('the day is done', 'день закрыт'))
  } else if (f.freeMin >= 15) {
    parts.push(t(`${hhmm(f.freeMin)} still open`, `${hhmm(f.freeMin)} ещё свободно`))
  }

  if (f.due === 0 && parts.length === 0) {
    parts.push(t('nothing due — the day is yours', 'ничего не запланировано — день ваш'))
  }

  if (f.weather) parts.push(f.weather)

  // Sentence case, single spine. Joining on " · " reads as a dashboard; joining
  // on a full stop reads as someone telling you where things stand.
  const line = parts.join('. ')
  return line ? `${line.charAt(0).toUpperCase()}${line.slice(1)}.` : ''
}
