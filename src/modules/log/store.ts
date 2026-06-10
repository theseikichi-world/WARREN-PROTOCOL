import {
  type Dream, type Mission, type LogTask, type Signal, type LogState,
  type MissionPriority, type LogTaskType, type DreamAnalysis,
  type Constellation, type PlanItem,
  DEFAULT_CATEGORIES,
} from './types'

export type { LogState }

const KEY = 'log_v1'
const INITIAL: LogState = { dreams: [], categories: DEFAULT_CATEGORIES }

// ─── Persistence ──────────────────────────────────────────────────────────────

export function loadLogState(): LogState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...INITIAL }
    return { ...INITIAL, ...JSON.parse(raw) }
  } catch {
    return { ...INITIAL }
  }
}

export function saveLogState(s: LogState): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}

// ─── Dream CRUD ───────────────────────────────────────────────────────────────

export function createDream(state: LogState, title: string, description: string, category: string): LogState {
  const d: Dream = {
    id: crypto.randomUUID(), title, description, category,
    missions: [], createdAt: new Date().toISOString(),
  }
  return { ...state, dreams: [d, ...state.dreams] }
}

export function updateDream(state: LogState, id: string, patch: Partial<Omit<Dream, 'id' | 'missions' | 'createdAt'>>): LogState {
  return { ...state, dreams: state.dreams.map(d => d.id === id ? { ...d, ...patch } : d) }
}

export function deleteDream(state: LogState, id: string): LogState {
  return { ...state, dreams: state.dreams.filter(d => d.id !== id) }
}

/** Move a dream one slot up (-1, higher priority) or down (+1) the list. */
export function moveDream(state: LogState, id: string, dir: -1 | 1): LogState {
  const arr = [...state.dreams]
  const i = arr.findIndex(d => d.id === id)
  if (i === -1) return state
  const j = i + dir
  if (j < 0 || j >= arr.length) return state
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
  return { ...state, dreams: arr }
}

// ─── Persisted AI analysis ────────────────────────────────────────────────────

export function setDreamAnalysis(state: LogState, dreamId: string, analysis: DreamAnalysis): LogState {
  return { ...state, dreams: state.dreams.map(d => d.id === dreamId ? { ...d, analysis } : d) }
}

export function clearDreamAnalysis(state: LogState, dreamId: string): LogState {
  return { ...state, dreams: state.dreams.map(d => {
    if (d.id !== dreamId) return d
    const { analysis: _drop, ...rest } = d
    return rest
  })}
}

export function setConstellation(state: LogState, constellation: Constellation): LogState {
  return { ...state, constellation }
}

export function clearConstellation(state: LogState): LogState {
  const { constellation: _drop, ...rest } = state
  return rest as LogState
}

// ─── Mission CRUD ─────────────────────────────────────────────────────────────

export interface NewMissionData {
  title:       string
  description: string
  priority:    MissionPriority
  deadline?:   string | null
}

export function addMission(state: LogState, dreamId: string, data: NewMissionData): LogState {
  const m: Mission = {
    id: crypto.randomUUID(), title: data.title, description: data.description,
    priority: data.priority, status: 'active',
    deadline: data.deadline ?? null, tasks: [], signals: [],
    createdAt: new Date().toISOString(), completedAt: null,
  }
  return { ...state, dreams: state.dreams.map(d =>
    d.id !== dreamId ? d : { ...d, missions: [...d.missions, m] }
  )}
}

export function updateMission(state: LogState, dreamId: string, missionId: string, patch: Partial<Mission>): LogState {
  return { ...state, dreams: state.dreams.map(d => {
    if (d.id !== dreamId) return d
    return { ...d, missions: d.missions.map(m => m.id !== missionId ? m : { ...m, ...patch }) }
  })}
}

export function completeMission(state: LogState, dreamId: string, missionId: string): LogState {
  return updateMission(state, dreamId, missionId, {
    status: 'completed', completedAt: new Date().toISOString(),
  })
}

export function deleteMission(state: LogState, dreamId: string, missionId: string): LogState {
  return { ...state, dreams: state.dreams.map(d => {
    if (d.id !== dreamId) return d
    return { ...d, missions: d.missions.filter(m => m.id !== missionId) }
  })}
}

// ─── Task CRUD ────────────────────────────────────────────────────────────────

export function addTask(state: LogState, dreamId: string, missionId: string, text: string, type: LogTaskType): LogState {
  const t: LogTask = { id: crypto.randomUUID(), text, type, done: false, createdAt: new Date().toISOString() }
  return { ...state, dreams: state.dreams.map(d => {
    if (d.id !== dreamId) return d
    return { ...d, missions: d.missions.map(m => {
      if (m.id !== missionId) return m
      return { ...m, tasks: [...m.tasks, t] }
    })}
  })}
}

export function toggleTask(state: LogState, dreamId: string, missionId: string, taskId: string): LogState {
  return { ...state, dreams: state.dreams.map(d => {
    if (d.id !== dreamId) return d
    return { ...d, missions: d.missions.map(m => {
      if (m.id !== missionId) return m
      return { ...m, tasks: m.tasks.map(t => t.id !== taskId ? t : { ...t, done: !t.done }) }
    })}
  })}
}

export function deleteTask(state: LogState, dreamId: string, missionId: string, taskId: string): LogState {
  return { ...state, dreams: state.dreams.map(d => {
    if (d.id !== dreamId) return d
    return { ...d, missions: d.missions.map(m => {
      if (m.id !== missionId) return m
      return { ...m, tasks: m.tasks.filter(t => t.id !== taskId) }
    })}
  })}
}

export function markTaskSynced(state: LogState, dreamId: string, missionId: string, taskId: string): LogState {
  return { ...state, dreams: state.dreams.map(d => {
    if (d.id !== dreamId) return d
    return { ...d, missions: d.missions.map(m => {
      if (m.id !== missionId) return m
      return { ...m, tasks: m.tasks.map(t => t.id !== taskId ? t : { ...t, scrap7Id: t.id }) }
    })}
  })}
}

// ─── Signals (field log) ─────────────────────────────────────────────────────

export function addSignal(state: LogState, dreamId: string, missionId: string, text: string): LogState {
  const s: Signal = { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() }
  return { ...state, dreams: state.dreams.map(d => {
    if (d.id !== dreamId) return d
    return { ...d, missions: d.missions.map(m => {
      if (m.id !== missionId) return m
      return { ...m, signals: [s, ...m.signals] }
    })}
  })}
}

export function deleteSignal(state: LogState, dreamId: string, missionId: string, signalId: string): LogState {
  return { ...state, dreams: state.dreams.map(d => {
    if (d.id !== dreamId) return d
    return { ...d, missions: d.missions.map(m => {
      if (m.id !== missionId) return m
      return { ...m, signals: m.signals.filter(s => s.id !== signalId) }
    })}
  })}
}

export function addCategory(state: LogState, name: string): LogState {
  if (state.categories.includes(name)) return state
  return { ...state, categories: [...state.categories, name] }
}

/** Push a constellation plan item straight into SCRAP-7 with its clean name. */
export function syncPlanItemToScrap7(item: PlanItem): string {
  const pseudo: LogTask = {
    id: crypto.randomUUID(), text: item.text, type: item.type,
    done: false, createdAt: new Date().toISOString(),
  }
  syncTaskToScrap7(pseudo, 'Constellation', item.serves)
  return pseudo.id
}

// ─── SCRAP-7 sync ─────────────────────────────────────────────────────────────
// Writes a task into SCRAP-7's localStorage so it appears in the Tasks module.
// Uses the same ID so completion state can be cross-referenced.

export function syncTaskToScrap7(task: LogTask, missionTitle: string, dreamTitle: string): void {
  try {
    const SCRAP7_KEY = 'scrap7_v3'
    const raw   = localStorage.getItem(SCRAP7_KEY)
    const state = raw ? JSON.parse(raw) : {
      tasks: [], categories: ['Goals'], chatHistory: [], lastDailyReset: new Date().toISOString().slice(0, 10),
    }

    const base = {
      id:        task.id,
      text:      `${task.text}`,
      category:  'Goals',
      taskType:  task.type,
      completed: task.done,
      createdAt: task.createdAt,
      // metadata visible in SCRAP-7
      logMission: missionTitle,
      logDream:   dreamTitle,
    }

    const extra: Record<string, unknown> = {}
    if (task.type === 'habit') {
      Object.assign(extra, {
        direction: 'positive', streak: 0, score: 0,
        todayCount: 0, lastTrackedDate: null,
        trackingHistory: [], skippedDates: [],
        target: 1, unit: 'times',
      })
    } else if (task.type === 'daily') {
      Object.assign(extra, {
        schedule: { type: 'everyday' }, streak: 0, completionHistory: [],
      })
    } else {
      // todo
      Object.assign(extra, { priority: 'medium', dueDate: null })
    }

    const fullTask = { ...base, ...extra }

    // Upsert (replace if exists, otherwise prepend)
    const idx = (state.tasks as Array<{ id: string }>).findIndex(t => t.id === task.id)
    if (idx >= 0) state.tasks[idx] = fullTask
    else state.tasks.unshift(fullTask)

    if (!(state.categories as string[]).includes('Goals')) state.categories.push('Goals')

    localStorage.setItem(SCRAP7_KEY, JSON.stringify(state))

    // Notify SCRAP-7 if it's mounted (custom event on window)
    window.dispatchEvent(new CustomEvent('warren:sync', { detail: { type: 'task_synced', taskId: task.id } }))
  } catch (e) {
    console.error('[L.O.G] syncTaskToScrap7 failed', e)
  }
}
