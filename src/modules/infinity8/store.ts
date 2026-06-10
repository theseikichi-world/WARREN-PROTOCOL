// ─── INFINITY-8 PROTOCOL — the day that flows endlessly ───────────────────────
// A conductor module: it owns no tasks. It reads commitments from the other
// modules (SCRAP-7 today), lays them on a timeline around fixed life-anchors,
// and surfaces the FREE TIME that's left — so you can relax without guilt.

import { loadState as loadScrap7, todayScheduledDailies } from '../scrap7/store'
import type { Task } from '../scrap7/types'

// ─── State ──────────────────────────────────────────────────────────────────

export interface Anchors {
  wake:        string         // "07:30"
  sleep:       string         // "23:00" (bed time)
  breakMin:    number         // rest buffer inserted between activities (minutes)
  breakfast:   string | null  // null = skip
  lunch:       string | null
  dinner:      string | null
  workEnabled: boolean
  workStart:   string
  workEnd:     string
}

export type Period = 'morning' | 'midday' | 'afternoon' | 'evening'
const PERIOD_RANK: Record<Period, number> = { morning: 0, midday: 1, afternoon: 2, evening: 3 }

export interface DayEvent {
  id:    string
  title: string
  start: string   // "15:00"
  end:   string   // "16:00"
}

export interface DayOverride { wake?: string; sleep?: string }

export interface Inf8State {
  anchors:   Anchors
  durations: Record<string, number>      // taskId → minutes override
  prefTime:  Record<string, Period>      // taskId → best time-of-day (from OPTIMIZE)
  events:    Record<string, DayEvent[]>  // YYYY-MM-DD → events
  overrides: Record<string, DayOverride> // YYYY-MM-DD → today-only wake/sleep tweaks
}

const KEY = 'infinity8_v1'

const DEFAULT_ANCHORS: Anchors = {
  wake: '07:30', sleep: '23:00', breakMin: 10,
  breakfast: '08:00', lunch: '13:00', dinner: '19:00',
  workEnabled: false, workStart: '10:00', workEnd: '18:00',
}

const INITIAL: Inf8State = { anchors: DEFAULT_ANCHORS, durations: {}, prefTime: {}, events: {}, overrides: {} }

export function loadInf8State(): Inf8State {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return structuredClone(INITIAL)
    const p = JSON.parse(raw)
    return {
      anchors:   { ...DEFAULT_ANCHORS, ...(p.anchors ?? {}) },
      durations: p.durations ?? {},
      prefTime:  p.prefTime ?? {},
      events:    p.events ?? {},
      overrides: p.overrides ?? {},
    }
  } catch {
    return structuredClone(INITIAL)
  }
}

/** Anchors merged with any today-only override (oversleep, late night). */
export function effectiveAnchors(state: Inf8State, date: string): Anchors {
  const o = state.overrides[date]
  return o ? { ...state.anchors, ...(o.wake ? { wake: o.wake } : {}), ...(o.sleep ? { sleep: o.sleep } : {}) } : state.anchors
}

/** Hours of sleep implied by wake & bedtime. */
export function sleepHours(a: Anchors): number {
  const diff = ((toMin(a.wake) - toMin(a.sleep)) + 1440) % 1440
  return Math.round((diff / 60) * 10) / 10
}

// ─── Circadian classifier (deterministic) ─────────────────────────────────────
const PERIOD_KEYWORDS: [Period, RegExp][] = [
  ['afternoon', /\b(workout|exercise|gym|strength|run|cardio|lift|sport|capoeira|hiit|train|swim|spine|mobility flow|core)\b/i],
  ['morning',   /\b(stretch|mobility|yoga|meditat|journal|plan|read|study|learn|memor|flashcard|scales|warm.?up|breath|write|record|practice|focus|language|drill)\b/i],
  ['midday',    /\b(speak|english|call|email|social|network|errand|shop|chore)\b/i],
  ['evening',   /\b(relax|wind|family|reflect|review|gratitude|read before bed)\b/i],
]
export function classifyPeriod(label: string): Period {
  for (const [p, re] of PERIOD_KEYWORDS) if (re.test(label)) return p
  return 'midday'
}

export function saveInf8State(s: Inf8State): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}

export function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

export const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
export const fmtClock = (min: number): string => {
  const t = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
export const fmtDur = (min: number): string => {
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  if (h <= 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// ─── Commitments (read from SCRAP-7) ──────────────────────────────────────────

export type CommitKind = 'daily' | 'habit'

export interface Commitment {
  id:       string
  label:    string
  kind:     CommitKind
  done:     boolean
  duration: number   // minutes
  period:   Period
}

const DEFAULT_DURATION = 20

/** Today's schedulable commitments from SCRAP-7: due dailies + positive habits. */
export function getTodayCommitments(durations: Record<string, number>, prefTime: Record<string, Period> = {}): Commitment[] {
  let tasks: Task[] = []
  try { tasks = loadScrap7().tasks } catch { tasks = [] }
  const today = todayKey()
  const period = (id: string, label: string): Period => prefTime[id] ?? classifyPeriod(label)

  const dailies = todayScheduledDailies(tasks).map<Commitment>(t => ({
    id: t.id, label: t.text, kind: 'daily',
    done: !!t.completed,
    duration: durations[t.id] ?? DEFAULT_DURATION,
    period: period(t.id, t.text),
  }))

  const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()]
  const dueToday = (t: Task): boolean => {
    const s = t.schedule
    if (!s || s.type === 'everyday') return true
    return s.type === 'weekly' && !!s.days?.includes(dayKey)
  }

  const habits = tasks
    .filter(t => t.taskType === 'habit' && (t.direction ?? 'positive') === 'positive' && dueToday(t))
    .map<Commitment>(t => ({
      id: t.id, label: t.text, kind: 'habit',
      done: t.lastTrackedDate === today && (t.todayCount ?? 0) >= (t.target ?? 1),
      duration: durations[t.id] ?? DEFAULT_DURATION,
      period: period(t.id, t.text),
    }))

  return [...dailies, ...habits]
}

// ─── Day schedule builder ─────────────────────────────────────────────────────

export type BlockKind = 'meal' | 'work' | 'event' | 'commitment' | 'break' | 'free'

export interface Block {
  id:     string
  kind:   BlockKind
  label:  string
  start:  number          // minutes from 00:00
  end:    number
  done?:  boolean         // commitments
  taskId?: string
  commitKind?: CommitKind
}

export interface DayPlan {
  blocks:         Block[]
  freeMinutes:    number
  awakeMinutes:   number
  committedCount: number
  doneCount:      number
}

interface Busy { start: number; end: number; block: Block }

/** Lay meals/work/events as fixed, fill gaps with commitments (circadian-ordered,
 *  with rest breaks between them), surface free time. */
export function buildDay(anchors: Anchors, commitments: Commitment[], events: DayEvent[]): DayPlan {
  const wake  = toMin(anchors.wake)
  let   sleep = toMin(anchors.sleep)
  if (sleep <= wake) sleep = wake + 60 // guard against bad input
  const brk   = Math.max(0, anchors.breakMin ?? 0)

  const fixed: Busy[] = []
  const addFixed = (kind: BlockKind, label: string, start: number, end: number, extra: Partial<Block> = {}) => {
    const s = Math.max(wake, start), e = Math.min(sleep, end)
    if (e <= s) return
    fixed.push({ start: s, end: e, block: { id: `${kind}-${start}`, kind, label, start: s, end: e, ...extra } })
  }

  if (anchors.breakfast) addFixed('meal', 'Breakfast', toMin(anchors.breakfast), toMin(anchors.breakfast) + 30)
  if (anchors.lunch)     addFixed('meal', 'Lunch',     toMin(anchors.lunch),     toMin(anchors.lunch) + 45)
  if (anchors.dinner)    addFixed('meal', 'Dinner',    toMin(anchors.dinner),    toMin(anchors.dinner) + 45)
  if (anchors.workEnabled) addFixed('work', 'Work', toMin(anchors.workStart), toMin(anchors.workEnd))
  for (const ev of events) addFixed('event', ev.title, toMin(ev.start), toMin(ev.end), { id: ev.id })

  fixed.sort((a, b) => a.start - b.start)

  // Free gaps between fixed blocks within [wake, sleep]
  const gaps: { start: number; end: number }[] = []
  let cursor = wake
  for (const f of fixed) {
    if (f.start > cursor) gaps.push({ start: cursor, end: f.start })
    cursor = Math.max(cursor, f.end)
  }
  if (cursor < sleep) gaps.push({ start: cursor, end: sleep })

  // Circadian order: morning-suited first → they land in earlier gaps
  const queue = [...commitments].sort((a, b) => PERIOD_RANK[a.period] - PERIOD_RANK[b.period])

  const placed: Block[] = []
  for (const g of gaps) {
    let c = g.start
    let placedInGap = 0
    while (queue.length && c + queue[0].duration <= g.end) {
      // insert a rest break between consecutive activities (not before the first)
      if (placedInGap > 0 && brk > 0 && c + brk + queue[0].duration <= g.end) {
        placed.push({ id: `brk-${c}`, kind: 'break', label: 'Break', start: c, end: c + brk })
        c += brk
      }
      const cm = queue.shift()!
      placed.push({
        id: `c-${cm.id}`, kind: 'commitment', label: cm.label,
        start: c, end: c + cm.duration, done: cm.done, taskId: cm.id, commitKind: cm.kind,
      })
      c += cm.duration
      placedInGap++
    }
    if (c < g.end) placed.push({ id: `free-${g.start}`, kind: 'free', label: 'Free', start: c, end: g.end })
  }
  // Overflow commitments that didn't fit — stack them at the end (compressed)
  let ofs = sleep
  for (const cm of queue) {
    placed.push({ id: `c-${cm.id}`, kind: 'commitment', label: cm.label,
      start: ofs, end: ofs + cm.duration, done: cm.done, taskId: cm.id, commitKind: cm.kind })
    ofs += cm.duration
  }

  const blocks = [...fixed.map(f => f.block), ...placed].sort((a, b) => a.start - b.start)
  const freeMinutes = placed.filter(b => b.kind === 'free').reduce((s, b) => s + (b.end - b.start), 0)

  return {
    blocks,
    freeMinutes,
    awakeMinutes: sleep - wake,
    committedCount: commitments.length,
    doneCount: commitments.filter(c => c.done).length,
  }
}

// ─── Anchor / event mutations ─────────────────────────────────────────────────

export function setAnchors(state: Inf8State, patch: Partial<Anchors>): Inf8State {
  return { ...state, anchors: { ...state.anchors, ...patch } }
}

export function addEvent(state: Inf8State, date: string, ev: Omit<DayEvent, 'id'>): Inf8State {
  const e: DayEvent = { id: crypto.randomUUID(), ...ev }
  return { ...state, events: { ...state.events, [date]: [...(state.events[date] ?? []), e] } }
}

export function removeEvent(state: Inf8State, date: string, id: string): Inf8State {
  return { ...state, events: { ...state.events, [date]: (state.events[date] ?? []).filter(e => e.id !== id) } }
}

export function setDuration(state: Inf8State, taskId: string, minutes: number): Inf8State {
  return { ...state, durations: { ...state.durations, [taskId]: Math.max(5, minutes) } }
}

export function setOverride(state: Inf8State, date: string, patch: DayOverride): Inf8State {
  return { ...state, overrides: { ...state.overrides, [date]: { ...state.overrides[date], ...patch } } }
}

export function clearOverride(state: Inf8State, date: string): Inf8State {
  const next = { ...state.overrides }
  delete next[date]
  return { ...state, overrides: next }
}

export function setPrefTimes(state: Inf8State, map: Record<string, Period>): Inf8State {
  return { ...state, prefTime: { ...state.prefTime, ...map } }
}

// ─── Hub snapshot: what's happening right now ─────────────────────────────────
export interface NowSnapshot {
  current:        Block | null   // block containing "now" (may be free)
  next:           Block | null   // next commitment / meal / event after now
  freeMinutes:    number
  committedCount: number
  doneCount:      number
  awake:          boolean
}

export function getNowSnapshot(): NowSnapshot {
  const state = loadInf8State()
  const today = todayKey()
  const anchors = effectiveAnchors(state, today)
  const commitments = getTodayCommitments(state.durations, state.prefTime)
  const plan = buildDay(anchors, commitments, state.events[today] ?? [])
  const d = new Date()
  const now = d.getHours() * 60 + d.getMinutes()

  const current = plan.blocks.find(b => now >= b.start && now < b.end) ?? null
  const next = plan.blocks.find(b => b.start >= now &&
    (b.kind === 'commitment' || b.kind === 'meal' || b.kind === 'event')) ?? null

  return {
    current, next,
    freeMinutes: plan.freeMinutes,
    committedCount: plan.committedCount,
    doneCount: plan.doneCount,
    awake: now >= toMin(anchors.wake) && now < toMin(anchors.sleep),
  }
}
