// ─── GUILD SUGGESTS — what every module would whisper into your free time ─────
// INFINITY-8 owns no tasks; it only surfaces the FREE TIME left in a day.
// This module turns that emptiness into gentle, natural INVITATIONS — never
// obligations. Each guild member offers what it has to give:
//   • PICTURES — the episode you're mid-binge on, a film off the watchlist
//   • A.R.D.O   — lines that are due before the memory fades
//   • JOURNAL   — tonight's page, still blank, the owl waiting
//   • VIGILANTE — the statics you have not held today
//   • L.O.G     — retired with PATHFINDER; the gate below keeps it quiet
// Entertainment is a FIRST-CLASS citizen here: catching an episode is a valid,
// guilt-free way to spend a free block — exactly the point of the module.
//
// Only a module that is BUILT AND OPEN may invite you — see suggestionAllowed.
//
// All functions are pure reads (localStorage via each module's own loader),
// so they're trivially testable and never mutate anything.

import { loadLib } from '../pictures/types'
import { loadArdoState, getTotalDue } from '../ardo/store'
import { loadLogState } from '../log/store'
import { loadJournal, todayKey as journalToday } from '../journal/store'
import { loadState as loadVigilante, sessionsOn, currentStage } from '../vigilante/store'
import { specHoldSeconds, holdsAt, todayKey as vigilanteToday } from '../vigilante/types'
import { GUILD, type ModuleId } from '../../guild'
import { moduleUnlocked } from '../../moduleAccess'
import { loadProgression } from '../progression/store'
import { gatedLevel } from '../progression/xp'
import { loadSettings } from '../../settings'
import { t as tr } from '../../i18n'

export type SuggestTone = 'play' | 'grow' | 'care'

export interface Suggestion {
  id:      string
  module:  'pictures' | 'ardo' | 'log' | 'journal' | 'vigilante'
  icon:    string
  label:   string          // the invitation, phrased warmly
  detail?: string          // a soft second line
  minutes: number          // rough size — used to fit a free gap
  path:    string          // where the chip navigates
  tone:    SuggestTone     // play = entertainment, grow = progress, care = wellbeing
  weight:  number          // higher = surfaced first
}

const safe = (fn: () => Suggestion[]): Suggestion[] => { try { return fn() } catch { return [] } }

// ─── PICTURES — entertainment, unashamed ──────────────────────────────────────

/**
 * How long one sitting actually costs.
 *
 * TMDB knows (`runtime`), so use it whenever we have it — a 22-minute comedy
 * and a 60-minute drama are not the same invitation, and the timeline sizes
 * gaps off this number. Items added before the field existed have no runtime,
 * so genre carries the guess: a half-hour comedy really is half an hour.
 */
export const TV_FALLBACK_MIN = 45
export const COMEDY_FALLBACK_MIN = 22
export const MOVIE_FALLBACK_MIN = 120

export function watchMinutes(
  m: { runtime?: number | null; genre?: string[] }, fallback: number,
): number {
  if (m.runtime && m.runtime > 0) return m.runtime
  if (fallback === TV_FALLBACK_MIN && (m.genre ?? []).some(g => /comedy|animation|комеди/i.test(g)))
    return COMEDY_FALLBACK_MIN
  return fallback
}

/**
 * Have you seen everything that has aired?
 *
 * Only answerable when we know the release count. Unknown is NOT caught up —
 * a show mid-watch with no release data still deserves the soft nudge.
 */
export function caughtUp(released: number | null | undefined, seen: number): boolean {
  return typeof released === 'number' && released > 0 && released - seen <= 0
}

function picturesSuggestions(): Suggestion[] {
  const lib = loadLib()
  const out: Suggestion[] = []

  // Shows you're mid-binge — the strongest pull (you're already invested)
  for (const m of lib.filter(x => x.type === 'tv' && x.status === 'watching')) {
    const seen = m.progress?.episode ?? 0
    // Caught up is not an invitation. When we know how many have aired and you
    // have seen them all, there is nothing to watch — the next one is a date in
    // the future, and "pick up where you left off" is simply false.
    if (caughtUp(m.episodes_released, seen)) continue
    const behind = (m.episodes_released ?? 0) - seen
    const fresh  = behind > 0 && behind < 100
    out.push({
      id: `pic-tv-${m.id}`, module: 'pictures', icon: m.emoji || '📺',
      label: `${tr('Watch', 'Смотреть')} ${m.title}`,
      detail: fresh
        ? `${behind} ${behind === 1 ? tr('new episode waiting', 'новый эп. ждёт') : tr('new episodes waiting', 'нов. эп. ждут')}`
        : tr('pick up where you left off', 'продолжите с места остановки'),
      minutes: watchMinutes(m, TV_FALLBACK_MIN), path: '/pictures', tone: 'play',
      weight: fresh ? 9 : 6,
    })
  }

  // A game in progress
  for (const m of lib.filter(x => x.type === 'game' && x.status === 'watching').slice(0, 1)) {
    out.push({
      id: `pic-gm-${m.id}`, module: 'pictures', icon: m.emoji || '🎮',
      label: `${tr('Play', 'Играть')} ${m.title}`, detail: tr('jump back in', 'вернуться в игру'), minutes: 60,
      path: '/pictures', tone: 'play', weight: 7,
    })
  }

  // A film off the watchlist — needs a bigger block
  for (const m of lib.filter(x => x.type === 'movie' && x.status === 'watchlist').slice(0, 2)) {
    out.push({
      id: `pic-mv-${m.id}`, module: 'pictures', icon: m.emoji || '🎬',
      label: `${tr('Movie night:', 'Киновечер:')} ${m.title}`,
      detail: m.year ? `${m.year} · ${tr('from your watchlist', 'из списка к просмотру')}` : tr('from your watchlist', 'из списка к просмотру'),
      minutes: watchMinutes(m, MOVIE_FALLBACK_MIN), path: '/pictures', tone: 'play', weight: 5,
    })
  }

  return out
}

// ─── A.R.D.O — catch the lines before they fade ───────────────────────────────
function ardoSuggestions(): Suggestion[] {
  const due = getTotalDue(loadArdoState())
  if (due <= 0) return []
  const minutes = Math.min(40, Math.max(10, due * 2))   // ~2 min per due card
  return [{
    id: 'ardo-due', module: 'ardo', icon: '🧠',
    label: tr('Drill your due lines', 'Повторите строки к сроку'),
    detail: `${due} ${tr('cards ripe for recall — catch them before they fade', 'карт. готовы к повтору — успейте, пока не забылись')}`,
    minutes, path: '/ardo', tone: 'grow', weight: 8,
  }]
}

// ─── L.O.G — one concrete step toward a dream ─────────────────────────────────
function logSuggestions(): Suggestion[] {
  const st = loadLogState()
  const out: Suggestion[] = []

  // The next open one-off step per dream (recurring tasks already live in ORBIT)
  for (const d of st.dreams) {
    if (out.length >= 2) break
    for (const m of d.missions) {
      if (m.status !== 'active') continue
      const next = m.tasks.find(t => !t.done && t.type === 'todo' && !t.scrap7Id)
      if (next) {
        out.push({
          id: `log-${next.id}`, module: 'log', icon: '✦',
          label: next.text, detail: `${tr('advances', 'двигает')} “${d.title}”`,
          minutes: 30, path: '/log', tone: 'grow', weight: 6,
        })
        break
      }
    }
  }

  // Constellation plan items waiting to be deployed
  for (const p of (st.constellation?.plan ?? []).filter(x => !x.deployed).slice(0, 1)) {
    out.push({
      id: `log-plan-${p.text}`, module: 'log', icon: '✦',
      label: p.text, detail: `${tr('serves', 'служит цели')} ${p.serves}`,
      minutes: 30, path: '/log', tone: 'grow', weight: 5,
    })
  }

  return out
}

// ─── VIGILANTE — the position is not going to hold itself ─────────────────────
function vigilanteSuggestions(): Suggestion[] {
  const st = loadVigilante()
  // Once a day. A second invitation on a day you already trained is nagging,
  // and statics need the recovery more than they need the volume.
  if (sessionsOn(st, vigilanteToday()).length > 0) return []
  const stage = currentStage(st)
  const holds = holdsAt(stage)
  const holdSec = specHoldSeconds(st.spec, stage)
  if (holdSec <= 0) return []
  const minutes = Math.max(5, Math.round(
    (holdSec + holds.length * st.spec.rounds * st.spec.restSec) / 60))
  return [{
    id: 'vigilante-session', module: 'vigilante', icon: '⧗',
    label: tr('Hold the statics', 'Отработать статику'),
    detail: tr(`${holds.length} positions · ${st.spec.rounds} rounds`,
               `${holds.length} позиции · ${st.spec.rounds} круга`),
    minutes, path: '/vigilante', tone: 'grow', weight: 7,
  }]
}

// ─── JOURNAL — tonight's page is still blank ───────────────────────────────────
function journalSuggestions(): Suggestion[] {
  const st = loadJournal()
  if (st.entries.some(e => e.date === journalToday())) return []
  return [{
    id: 'journal-today', module: 'journal', icon: '🦉',
    label: tr("Write today's page", 'Написать сегодняшнюю страницу'),
    // The owl was the mascot-era voice. The fact is what is useful.
    detail: tr('tonight is still blank', 'сегодня ещё пусто'),
    minutes: 15, path: '/journal', tone: 'care', weight: 7,
  }]
}

// ─── Who is actually allowed to speak ─────────────────────────────────────────
// An invitation is a door, and rule 30 says a locked door names what opens it —
// it does not knock from the other side. The owl offering tonight's page while
// CAPTAIN'S JOURNAL is still locked at level 3 was the app advertising a room
// you cannot enter, which reads as a broken promise rather than a tease.
//
// The same gate retires PATHFINDER's invitations for free: `log` is built:false
// now, so its chips stop appearing without deleting the collector (rule 12).
// If it is ever rebuilt, note that its `path` still points at the old /log
// route, which redirects to /uplinks.

/** Which guild member each invitation actually comes from. */
export const SUGGEST_MODULE: Record<Suggestion['module'], ModuleId> = {
  pictures: 'foxy',
  ardo:     'ardo',
  log:      'log',
  journal:  'hoot',
  vigilante: 'vigil',
}

const isBuilt = (id: ModuleId): boolean => GUILD.find(m => m.id === id)?.built ?? false

/** Can this module invite you anywhere yet? Pure — the level comes from above. */
export function suggestionAllowed(
  module: Suggestion['module'], level: number, unlockAll = false,
): boolean {
  const id = SUGGEST_MODULE[module]
  return isBuilt(id) && moduleUnlocked(id, level, unlockAll)
}

/** Every invitation the guild has to offer right now, strongest first. */
export function gatherSuggestions(): Suggestion[] {
  // A read that fails leaves every gated door shut. Guessing open would put the
  // locked chip back on the screen, which is the bug this exists to prevent.
  let level = 1
  let unlockAll = false
  try {
    const p = loadProgression()
    level = gatedLevel(p.xp, p.quests).level
    unlockAll = loadSettings().unlockAll
  } catch { /* defaults above */ }

  const from = (module: Suggestion['module'], collect: () => Suggestion[]): Suggestion[] =>
    suggestionAllowed(module, level, unlockAll) ? safe(collect) : []

  return [
    ...from('pictures', picturesSuggestions),
    ...from('ardo',     ardoSuggestions),
    ...from('log',      logSuggestions),
    ...from('journal',  journalSuggestions),
    ...from('vigilante', vigilanteSuggestions),
  ].sort((a, b) => b.weight - a.weight)
}

// A suggestion fits a gap if it isn't much longer than the gap (small slack so a
// 45-min episode still fits a 40-min window).
const fits = (s: Suggestion, gapMin: number): boolean => s.minutes <= gapMin + 10

/** Pick the strongest invitations that fit a single gap, one per module for variety. */
export function suggestionsForGap(all: Suggestion[], gapMin: number, max = 2): Suggestion[] {
  const picks: Suggestion[] = []
  const used = new Set<string>()
  for (const s of all) {
    if (picks.length >= max) break
    if (!fits(s, gapMin) || used.has(s.module)) continue
    picks.push(s); used.add(s.module)
  }
  return picks
}

/** The single best invitation for the time left right now (for the Hub NOW card). */
export function topSuggestion(all: Suggestion[], gapMin: number): Suggestion | null {
  return all.find(s => fits(s, gapMin)) ?? all[0] ?? null
}

/**
 * Spread invitations across a day's free blocks (chronological), consuming each
 * as it's placed so the same one never repeats. Big blocks naturally draw the
 * film; little gaps draw a drill or a journal page.
 */
export function assignToFreeBlocks(
  freeBlocks: { id: string; minutes: number }[],
  all: Suggestion[],
  perBlock = 2,
): Record<string, Suggestion[]> {
  const pool = [...all]
  const result: Record<string, Suggestion[]> = {}
  for (const fb of freeBlocks) {
    const picks: Suggestion[] = []
    const used = new Set<string>()
    for (const s of pool) {
      if (picks.length >= perBlock) break
      if (!fits(s, fb.minutes) || used.has(s.module)) continue
      picks.push(s); used.add(s.module)
    }
    for (const p of picks) pool.splice(pool.indexOf(p), 1)
    if (picks.length) result[fb.id] = picks
  }
  return result
}
