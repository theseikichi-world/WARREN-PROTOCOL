import {
  type Task, type Scrap7State, type ChatMessage, type Schedule, type Priority, type Direction,
  type TaskOrigin,
  DEFAULT_CATEGORIES, HABIT_MILESTONES, todayKey, taskOrigin,
} from './types'

// v4 adds Task.origin. The v3 record is read once and then left untouched, so
// it stays as an automatic rollback point — accumulated `score` is the single
// most valuable thing in this app and must never depend on one migration.
const KEY        = 'scrap7_v4'
const LEGACY_KEY = 'scrap7_v3'

// Exponential smoothing factor — matches Loop Habit Tracker's curve:
// ~5% after day 1, ~30% after 1 week, ~80% after 1 month, ~96% after 2 months
const ALPHA = 0.05
/** Frozen routines decay at half rate — see Task.frozen. */
const FROZEN_DECAY = 0.5

function makeInitialGreeting(): ChatMessage {
  return {
    id: crypto.randomUUID(),
    text: "SCRAP-7 online. Systems operational. Tell me what needs to get done.",
    sender: 'scrap7',
    ts: new Date().toISOString(),
  }
}

const INITIAL: Scrap7State = {
  tasks: [],
  categories: DEFAULT_CATEGORIES,
  chatHistory: [makeInitialGreeting()],
  lastDailyReset: todayKey(),
}

// ─── Persistence ──────────────────────────────────────────────────────────────

export function loadState(): Scrap7State {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY)
    if (!raw) return { ...INITIAL, chatHistory: [makeInitialGreeting()] }
    const parsed = JSON.parse(raw)

    const tasks = (parsed.tasks ?? []).map((t: Task & { strength?: number }) => {
      let next = t
      // Migrate old strength (0-100 int) → score (0.0-1.0 float)
      if (next.taskType === 'habit' && next.score === undefined) {
        next = { ...next, score: (next.strength ?? 0) / 100, strength: undefined }
      }
      // Stamp provenance on tasks that predate the field
      if (!next.origin) next = { ...next, origin: taskOrigin(next) }
      return next
    })

    return { ...INITIAL, ...parsed, tasks }
  } catch {
    return { ...INITIAL, chatHistory: [makeInitialGreeting()] }
  }
}

export function saveState(s: Scrap7State): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}

// ─── Daily reset ──────────────────────────────────────────────────────────────

export function applyDailyReset(state: Scrap7State): Scrap7State {
  const today = todayKey()
  if (state.lastDailyReset === today) return state

  const todayDate = new Date(today)

  const tasks = state.tasks.map(t => {
    if (t.taskType === 'daily') {
      return { ...t, completed: false }
    }

    if (t.taskType === 'habit') {
      const last    = t.lastTrackedDate
      const skipped = new Set(t.skippedDates ?? [])

      if (last && last !== today) {
        const lastDate  = new Date(last)
        const totalDays = Math.round((todayDate.getTime() - lastDate.getTime()) / 86400000)

        let newScore  = t.score ?? 0
        let streakBroken = false

        // A frozen routine belongs to a goal you set aside — it bleeds at half
        // rate and keeps its streak, because you were never asked to do it.
        const decay = t.frozen ? ALPHA * FROZEN_DECAY : ALPHA

        // Apply decay for each day between last tracked and today
        for (let d = 1; d < totalDays; d++) {
          const missed = new Date(lastDate)
          missed.setDate(lastDate.getDate() + d)
          const missedKey = missed.toISOString().slice(0, 10)
          if (!skipped.has(missedKey)) {
            newScore = newScore * (1 - decay)      // decay: outcome = 0
            if (!t.frozen) streakBroken = true
          }
        }

        return {
          ...t,
          score:      newScore,
          streak:     streakBroken ? 0 : (t.streak ?? 0),
          todayCount: 0,
        }
      }

      return { ...t, todayCount: 0 }
    }

    return t
  })

  return { ...state, tasks, lastDailyReset: today }
}

// ─── Task creation ────────────────────────────────────────────────────────────

export interface NewTaskData {
  text:       string
  category:   string
  taskType:   'habit' | 'daily' | 'todo'
  // habit
  direction?: Direction
  target?:    number
  unit?:      string
  // daily
  schedule?:  Schedule
  // todo
  priority?:  Priority
  dueDate?:   string | null
}

/** The single place that knows each task type's full field set. */
function buildTask(data: NewTaskData, overrides: Partial<Task> = {}): Task {
  const base: Task = {
    id:        crypto.randomUUID(),
    text:      data.text,
    category:  data.category,
    taskType:  data.taskType,
    completed: false,
    createdAt: new Date().toISOString(),
    origin:    'manual',
  }

  if (data.taskType === 'habit') {
    Object.assign(base, {
      direction:       data.direction ?? 'positive',
      streak:          0,
      score:           0,
      todayCount:      0,
      lastTrackedDate: null,
      trackingHistory: [],
      skippedDates:    [],
      target:          data.target ?? 1,
      unit:            data.unit ?? 'times',
    })
  } else if (data.taskType === 'daily') {
    Object.assign(base, {
      schedule:          data.schedule ?? { type: 'everyday' },
      streak:            0,
      completionHistory: [],
    })
  } else {
    Object.assign(base, {
      priority: data.priority ?? 'medium',
      dueDate:  data.dueDate ?? null,
    })
  }

  return { ...base, ...overrides }
}

export function createTask(state: Scrap7State, data: NewTaskData): Scrap7State {
  return { ...state, tasks: [buildTask(data), ...state.tasks] }
}

// ─── External task intake (cross-module sync) ─────────────────────────────────
// Other modules (L.O.G, INFINITY-8, …) create SCRAP-7 tasks through this
// function so the Task shape lives in exactly one place. It loads via
// loadState (so migrations apply), upserts by id, saves, and fires
// warren:sync — safe to call while SCRAP-7 isn't mounted.

export interface ExternalTaskData extends NewTaskData {
  /** Reuse the caller's id so completion state can be cross-referenced (upsert key). */
  id?:        string
  completed?: boolean
  createdAt?: string
  /** Provenance shown/stored on the task (e.g. mission + dream titles). */
  logMission?: string
  logDream?:   string
  /** Who owns this task. Defaults to 'log' — the only caller today is L.O.G sync. */
  origin?:     TaskOrigin
}

export function createExternalTask(data: ExternalTaskData): void {
  try {
    const state = loadState()
    const task = buildTask(data, {
      ...(data.id ? { id: data.id } : {}),
      ...(data.completed !== undefined ? { completed: data.completed } : {}),
      ...(data.createdAt ? { createdAt: data.createdAt } : {}),
      ...(data.logMission ? { logMission: data.logMission } : {}),
      ...(data.logDream ? { logDream: data.logDream } : {}),
      origin: data.origin ?? 'log',
    })

    const idx = state.tasks.findIndex(t => t.id === task.id)
    const tasks = idx >= 0
      ? state.tasks.map((t, i) => i === idx ? task : t)
      : [task, ...state.tasks]

    const categories = state.categories.includes(task.category)
      ? state.categories
      : [...state.categories, task.category]

    saveState({ ...state, tasks, categories })
    window.dispatchEvent(new CustomEvent('warren:sync', { detail: { type: 'task_synced', taskId: task.id } }))
  } catch (e) {
    console.error('[scrap7] createExternalTask failed', e)
  }
}

// ─── Track habit ──────────────────────────────────────────────────────────────

export interface TrackResult {
  state:     Scrap7State
  milestone: typeof HABIT_MILESTONES[0] | null
}

export function trackHabit(state: Scrap7State, id: string, dir: 1 | -1 = 1): TrackResult {
  const today = todayKey()
  let milestone: typeof HABIT_MILESTONES[0] | null = null

  const tasks = state.tasks.map(t => {
    if (t.id !== id || t.taskType !== 'habit') return t

    const target        = t.target ?? 1
    const todayCount    = t.todayCount ?? 0
    const score         = t.score ?? 0
    const isNewDay      = t.lastTrackedDate !== today
    const wasAlreadyDone = todayCount >= target

    if (dir > 0) {
      const newCount   = todayCount + 1
      const trackHist  = [...(t.trackingHistory ?? [])]
      let   newScore   = score
      let   newStreak  = t.streak ?? 0

      if (isNewDay && !trackHist.includes(today)) trackHist.push(today)

      if (t.direction === 'negative') {
        // Tracked a bad habit: penalize score
        newScore = Math.max(0, score - ALPHA * 3)
      } else if (!wasAlreadyDone && newCount >= target) {
        // Just hit daily target for the first time: reward
        newScore = Math.min(1, score * (1 - ALPHA) + ALPHA)
        if (isNewDay) {
          newStreak++
          for (const m of HABIT_MILESTONES) {
            if (newStreak === m.days) { milestone = m; break }
          }
        }
      }
      // Over-achieve (count > target) or partial dose: just increment, no score change

      return {
        ...t,
        todayCount:      newCount,
        score:           newScore,
        streak:          newStreak,
        lastTrackedDate: today,
        trackingHistory: trackHist,
      }
    } else {
      // Decrease count only — score is forward-only per day
      return { ...t, todayCount: Math.max(0, todayCount - 1) }
    }
  })

  return { state: { ...state, tasks }, milestone }
}

// ─── Skip habit day ───────────────────────────────────────────────────────────

export function skipHabitDay(state: Scrap7State, id: string): Scrap7State {
  const today = todayKey()
  const tasks = state.tasks.map(t => {
    if (t.id !== id || t.taskType !== 'habit') return t
    const skipped = t.skippedDates ?? []
    if (skipped.includes(today)) return t
    return { ...t, skippedDates: [...skipped, today] }
  })
  return { ...state, tasks }
}

// ─── Complete daily / todo ────────────────────────────────────────────────────

export function completeTask(state: Scrap7State, id: string): Scrap7State {
  const today = todayKey()

  const tasks = state.tasks.map(t => {
    if (t.id !== id || t.completed) return t
    if (t.taskType === 'daily') {
      const newStreak = (t.streak ?? 0) + 1
      const history   = [...(t.completionHistory ?? [])]
      if (!history.includes(today)) history.push(today)
      return { ...t, completed: true, streak: newStreak, completionHistory: history, lastCompleted: new Date().toISOString() }
    }
    return { ...t, completed: true }
  })

  return { ...state, tasks }
}

export function uncompleteTask(state: Scrap7State, id: string): Scrap7State {
  const tasks = state.tasks.map(t =>
    t.id === id ? { ...t, completed: false } : t
  )
  return { ...state, tasks }
}

export function deleteTask(state: Scrap7State, id: string): Scrap7State {
  return { ...state, tasks: state.tasks.filter(t => t.id !== id) }
}

export function updateTask(state: Scrap7State, id: string, patch: Partial<Task>): Scrap7State {
  const tasks = state.tasks.map(t => t.id === id ? { ...t, ...patch } : t)
  return { ...state, tasks }
}

export function addCategory(state: Scrap7State, name: string): Scrap7State {
  if (state.categories.includes(name)) return state
  return { ...state, categories: [...state.categories, name] }
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export function addMessage(state: Scrap7State, msg: Omit<ChatMessage, 'id' | 'ts'>): Scrap7State {
  const full: ChatMessage = { ...msg, id: crypto.randomUUID(), ts: new Date().toISOString() }
  const history = [...state.chatHistory, full].slice(-60)
  return { ...state, chatHistory: history }
}

// ─── Helpers used by command parser ──────────────────────────────────────────

export function fuzzyMatchTask(tasks: Task[], query: string): Task | null {
  const q = query.toLowerCase().trim()
  if (!q) return null
  let m = tasks.find(t => t.text.toLowerCase() === q)
  if (m) return m
  m = tasks.find(t => t.text.toLowerCase().includes(q))
  if (m) return m
  m = tasks.find(t => q.includes(t.text.toLowerCase()))
  if (m) return m
  const qWords = q.split(/\s+/)
  let best = 0, bestMatch: Task | null = null
  for (const t of tasks) {
    const tWords = t.text.toLowerCase().split(/\s+/)
    const overlap = qWords.filter(w => tWords.some(tw => tw.includes(w) || w.includes(tw))).length
    const score = overlap / Math.max(qWords.length, tWords.length)
    if (score > best && score >= 0.4) { best = score; bestMatch = t }
  }
  return bestMatch
}

export function todayScheduledDailies(tasks: Task[]): Task[] {
  const daysMap: Record<number, string> = { 0:'sun',1:'mon',2:'tue',3:'wed',4:'thu',5:'fri',6:'sat' }
  const todayDayKey = daysMap[new Date().getDay()]
  return tasks.filter(t => {
    if (t.taskType !== 'daily') return false
    const s = t.schedule
    if (!s || s.type === 'everyday') return true
    if (s.type === 'weekly' && s.days?.includes(todayDayKey)) return true
    return false
  })
}

/**
 * Categories another system owns, and which must never be offered here.
 *
 * A task's category is only a label — picking "BECOME A SUPERMAN" for a to-do
 * does NOT attach it to that uplink, and picking "Life support" does not make
 * it a basic. Offering them implied a connection the data doesn't have, which
 * is worse than not offering them at all: routines are created by the forge and
 * basics by the character sheet, never from this modal.
 */
export const SYSTEM_CATEGORIES = ['Life support', 'Goals', 'Constellation']

/**
 * What the category picker may show: the user's own categories, minus anything
 * another system stamped on its own tasks (a goal title arrives as a category
 * when a routine is installed).
 */
export function pickableCategories(state: Scrap7State): string[] {
  const owned = new Set<string>(SYSTEM_CATEGORIES)
  for (const t of state.tasks) {
    if (t.taskType === 'habit' && t.category) owned.add(t.category)
  }
  const usable = state.categories.filter(c => !owned.has(c))
  return usable.length ? usable : ['Personal']
}

export function taskSummaryStats(tasks: Task[]) {
  const dailies        = todayScheduledDailies(tasks)
  const habits         = tasks.filter(t => t.taskType === 'habit')
  const todos          = tasks.filter(t => t.taskType === 'todo')
  const dailiesPending = dailies.filter(t => !t.completed).length
  const todosPending   = todos.filter(t => !t.completed).length
  return { habits: habits.length, dailiesPending, todosPending, dailies: dailies.length, todos: todos.length }
}
