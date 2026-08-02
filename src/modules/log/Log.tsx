import { useState, useRef, useEffect, useCallback } from 'react'
import {
  type Dream, type Mission, type LogTask, type LogTaskType, type MissionPriority,
  type DreamAnalysis, type AnalyzedMission, type AnalyzedTask, type Constellation, type PlanItem,
  PRIORITY_COLORS, PRIORITY_LABELS, TASK_TYPE_COLOR, TASK_TYPE_LABEL,
  calcMissionProgress, calcDreamProgress, daysUntil, formatEta, etaColor,
} from './types'
import {
  loadLogState, saveLogState, type LogState,
  createDream, updateDream, deleteDream, moveDream,
  addMission, completeMission, deleteMission, type NewMissionData,
  addTask, toggleTask, deleteTask, markTaskSynced,
  addSignal, deleteSignal, syncTaskToScrap7,
  setDreamAnalysis, clearDreamAnalysis, setConstellation, clearConstellation,
  syncPlanItemToScrap7,
} from './store'
import { aiJson, loadSettings, modelForTask, type AiMessage } from '../../settings'
import { NewUplink } from '../progression/NewUplink'
import { loadProgression } from '../progression/store'
import { t as tr } from '../../i18n'

// L.O.G was frozen while the progression system landed, on the assumption that
// goal chains replaced dreams. They don't: dreams are the layer *above* — the
// unlimited list, from which two are chosen. So this is the inbox again, and a
// dream is where an UPLINK comes from.
const LOG_FROZEN = false

const LOG_NEON  = '#c084fc'
const LOG_DIM   = 'rgba(192,132,252,0.1)'
const S7_NEON   = '#00b4ff'  // SCRAP-7 blue for sync badges

const LOG_ANALYSIS_SYSTEM = `You are L.O.G — Long-range Objective Graph, a cyberpunk beaver goal scientist.
Your mission: take ONE dream and generate a precise, actionable breakdown.

Respond with ONLY a valid JSON object — no markdown, no explanation, no code fences.

Format:
{
  "analysis": "1-2 sentence scientific read on this dream's trajectory",
  "missions": [
    {
      "title": "MISSION TITLE (max 5 words, uppercase)",
      "description": "What achieving this mission means",
      "priority": "critical|high|medium|low",
      "deadline_days": <integer days to complete>,
      "tasks": [
        { "text": "Buy a desk", "type": "todo" },
        { "text": "Practice scales 20 min", "type": "daily" },
        { "text": "Read before bed", "type": "habit" }
      ]
    }
  ]
}

Rules:
- 3-5 missions, ordered by importance
- 3-5 tasks per mission — mix of todo, daily, habit
- Be specific to the dream. Avoid vague tasks.
- TASK NAMES must be SHORT, natural, imperative (2-5 words) — these go straight into a task tracker.
  Good: "Record one audition tape". Bad: "I want to record one audition tape per week to improve".
- todo = finite one-time action; daily = repeat every day; habit = behavior built over time (streak)`

// ─── Constellation (cross-dream synthesis) ────────────────────────────────────
const CONSTELLATION_SYSTEM = `You are L.O.G, a goal scientist analysing a whole CONSTELLATION of dreams together.
The dreams are given in PRIORITY ORDER (dream #1 is the user's highest priority).

Find how the dreams interconnect — shared skills, habits or resources that advance several at once — then design ONE unified action set that moves the most important dreams forward with the least effort.

Respond with ONLY a valid JSON object — no markdown, no code fences:
{
  "synthesis": "2-3 sentence read on how these dreams reinforce or compete with each other, weighted toward the top priorities",
  "links": [
    { "dreams": ["Dream title A", "Dream title B"], "insight": "one concrete way these connect / a shared lever" }
  ],
  "plan": [
    { "text": "Short natural task name (2-5 words)", "type": "habit|daily|todo", "serves": "which dream(s) this advances" }
  ]
}

Rules:
- 2-4 links, only REAL connections (skip if dreams are unrelated).
- 5-9 plan items total. Prefer actions that serve MULTIPLE dreams or the top-priority dream.
- "text" must be SHORT, natural, imperative — it goes straight into the SCRAP-7 task tracker. Never paste a whole sentence.
- type: habit = behavior to build (streak) · daily = repeat each day · todo = finite one-off.`

// ─── Helper: apply suggested task in one state transaction ────────────────────
function applySuggestedTask(
  state: LogState, dreamId: string,
  m: AnalyzedMission, t: AnalyzedTask,
  existingMissionId: string | null,
): { state: LogState; missionId: string; task: LogTask } {
  let s = state
  let missionId = existingMissionId

  if (!missionId) {
    missionId = crypto.randomUUID()
    const deadline = m.deadline_days > 0
      ? new Date(Date.now() + m.deadline_days * 86400000).toISOString().slice(0, 10)
      : null
    const nm: Mission = {
      id: missionId, title: m.title, description: m.description,
      priority: m.priority, status: 'active', deadline,
      tasks: [], signals: [], createdAt: new Date().toISOString(), completedAt: null,
    }
    s = { ...s, dreams: s.dreams.map(d =>
      d.id !== dreamId ? d : { ...d, missions: [...d.missions, nm] }
    )}
  }

  const task: LogTask = {
    id: crypto.randomUUID(), text: t.text, type: t.type,
    done: false, createdAt: new Date().toISOString(),
  }
  s = { ...s, dreams: s.dreams.map(d => {
    if (d.id !== dreamId) return d
    return { ...d, missions: d.missions.map(mm =>
      mm.id !== missionId ? mm : { ...mm, tasks: [...mm.tasks, task] }
    )}
  })}

  return { state: s, missionId: missionId!, task }
}

// ─── Task row ────────────────────────────────────────────────────────────────
function TaskRow({ task, onToggle, onDelete, onSync }: {
  task:     LogTask
  onToggle: () => void
  onDelete: () => void
  onSync:   () => void
}) {
  const [hov, setHov] = useState(false)
  const canSync = !task.scrap7Id && (task.type === 'daily' || task.type === 'habit')
  const typeColor = TASK_TYPE_COLOR[task.type]

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
        opacity: task.done ? 0.5 : 1, transition: 'opacity 0.15s' }}>

      {/* Checkbox */}
      <button onClick={onToggle} style={{
        width: 14, height: 14, borderRadius: 3, flexShrink: 0, cursor: 'pointer',
        border: `1.5px solid ${task.done ? LOG_NEON : 'rgba(192,132,252,0.3)'}`,
        background: task.done ? LOG_DIM : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}>
        {task.done && <div style={{ width: 6, height: 6, borderRadius: 1, background: LOG_NEON }} />}
      </button>

      {/* Text */}
      <p style={{
        flex: 1, fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)',
        color: task.done ? 'rgba(148,163,184,0.3)' : 'rgba(220,210,255,0.85)',
        textDecoration: task.done ? 'line-through' : 'none',
        letterSpacing: '0.02em', minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{task.text}</p>

      {/* Type badge */}
      <span style={{
        fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700,
        letterSpacing: '0.12em', color: typeColor, flexShrink: 0,
        padding: '1px 5px', borderRadius: 3,
        border: `1px solid ${typeColor}30`,
        background: `${typeColor}08`,
      }}>{TASK_TYPE_LABEL[task.type]}</span>

      {/* S-7 synced badge */}
      {task.scrap7Id && (
        <span title={tr('Synced to SCRAP-7', 'Синхронизировано со SCRAP-7')} style={{
          fontFamily: 'var(--font)', fontSize: 7, fontWeight: 800,
          color: S7_NEON, letterSpacing: '0.1em', flexShrink: 0,
          padding: '1px 5px', borderRadius: 3,
          border: `1px solid ${S7_NEON}35`, background: `${S7_NEON}0c`,
        }}>S-7 ✦</span>
      )}

      {/* Sync button (hover, daily/habit only, not yet synced) */}
      {hov && canSync && (
        <button onClick={e => { e.stopPropagation(); onSync() }} title={tr('Send to SCRAP-7', 'Отправить в SCRAP-7')} style={{
          fontFamily: 'var(--font)', fontSize: 7, fontWeight: 800,
          color: S7_NEON, letterSpacing: '0.08em', flexShrink: 0,
          padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
          border: `1px solid ${S7_NEON}40`, background: `${S7_NEON}0c`,
          transition: 'background 0.12s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = `${S7_NEON}18`}
          onMouseLeave={e => e.currentTarget.style.background = `${S7_NEON}0c`}
        >→ S7</button>
      )}

      {/* Delete */}
      {hov && (
        <button onClick={e => { e.stopPropagation(); onDelete() }} style={{
          fontSize: 13, color: 'rgba(255,0,51,0.25)', flexShrink: 0,
          padding: '0 3px', transition: 'color 0.12s',
        }}
          onMouseEnter={e => e.currentTarget.style.color = '#ff0033'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,0,51,0.25)'}
        >×</button>
      )}
    </div>
  )
}

// ─── Analysis panel ──────────────────────────────────────────────────────────
function AnalysisPanel({ result, dream, state, onChange, onClose }: {
  result:   DreamAnalysis
  dream:    Dream
  state:    LogState
  onChange: (s: LogState) => void
  onClose:  () => void
}) {
  // Idempotent: a suggestion counts as "added" if the dream already holds a
  // mission with that title containing a task with that text. Survives remounts.
  const isAdded = (m: AnalyzedMission, t: AnalyzedTask): boolean => {
    const mm = dream.missions.find(x => x.title === m.title)
    return !!mm && mm.tasks.some(x => x.text === t.text)
  }
  const missionIdFor = (m: AnalyzedMission): string | null =>
    dream.missions.find(x => x.title === m.title)?.id ?? null

  const addTask = (m: AnalyzedMission, t: AnalyzedTask) => {
    if (isAdded(m, t)) return
    const { state: ns, missionId, task } = applySuggestedTask(
      state, dream.id, m, t, missionIdFor(m),
    )
    onChange(ns)
    if (t.type === 'daily' || t.type === 'habit') {
      syncTaskToScrap7(task, m.title, dream.title)
    }
  }

  const addAll = () => {
    let s = state
    const ids = new Map<string, string>()
    for (const m of result.missions) {
      for (const t of m.tasks) {
        const existing = ids.get(m.title) ?? missionIdFor(m)
        // skip if this exact task already exists under that mission
        const mm = s.dreams.find(d => d.id === dream.id)?.missions.find(x => x.title === m.title)
        if (mm && mm.tasks.some(x => x.text === t.text)) { ids.set(m.title, mm.id); continue }
        const { state: ns, missionId, task } = applySuggestedTask(s, dream.id, m, t, existing)
        s = ns; ids.set(m.title, missionId)
        if (t.type === 'daily' || t.type === 'habit') syncTaskToScrap7(task, m.title, dream.title)
      }
    }
    onChange(s)
  }

  const allDone = result.missions.every(m => m.tasks.every(t => isAdded(m, t)))

  return (
    <div style={{
      margin: '0 0 4px', borderRadius: 10, overflow: 'hidden',
      background: 'rgba(6,2,16,0.92)',
      border: `1px solid ${LOG_NEON}30`,
      boxShadow: `0 0 24px rgba(192,132,252,0.12)`,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '9px 12px', borderBottom: `1px solid ${LOG_NEON}20`,
        background: `${LOG_NEON}08`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, filter: `drop-shadow(0 0 5px ${LOG_NEON})` }}>🦫</span>
          <div>
            <p style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 900,
              color: LOG_NEON, letterSpacing: '0.2em' }}>L.O.G ANALYSIS</p>
            <p style={{ fontFamily: 'var(--font)', fontSize: 7,
              color: `${LOG_NEON}50`, letterSpacing: '0.1em' }}>{tr('TRAJECTORY COMPUTED', 'ТРАЕКТОРИЯ ГОТОВА')}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!allDone && (
            <button onClick={addAll} style={{
              fontFamily: 'var(--font)', fontSize: 8, fontWeight: 800,
              color: LOG_NEON, letterSpacing: '0.12em', cursor: 'pointer',
              padding: '4px 10px', borderRadius: 4,
              border: `1px solid ${LOG_NEON}40`, background: LOG_DIM,
              transition: 'background 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(192,132,252,0.18)'}
              onMouseLeave={e => e.currentTarget.style.background = LOG_DIM}
            >{tr('DEPLOY ALL', 'СОЗДАТЬ ВСЁ')}</button>
          )}
          <button onClick={onClose} style={{ fontSize: 13, color: 'rgba(192,132,252,0.3)', cursor: 'pointer',
            transition: 'color 0.12s' }}
            onMouseEnter={e => e.currentTarget.style.color = '#ff0033'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(192,132,252,0.3)'}
          >×</button>
        </div>
      </div>

      {/* Analysis text */}
      <div style={{ padding: '10px 12px 6px',
        borderBottom: `1px solid ${LOG_NEON}12`, background: `${LOG_NEON}04` }}>
        <p style={{
          fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)',
          color: `${LOG_NEON}70`, lineHeight: 1.7, letterSpacing: '0.02em',
          borderLeft: `2px solid ${LOG_NEON}30`, paddingLeft: 8,
          fontStyle: 'italic',
        }}>{result.analysis}</p>
      </div>

      {/* Mission proposals */}
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {result.missions.map((m, mi) => {
          const pColor    = PRIORITY_COLORS[m.priority] ?? LOG_NEON
          const mAdded    = missionIdFor(m) !== null
          const tasksDone = m.tasks.filter(t => isAdded(m, t)).length
          return (
            <div key={mi} style={{
              borderRadius: 8, overflow: 'hidden',
              background: 'rgba(192,132,252,0.03)',
              border: `1px solid ${mAdded ? `${LOG_NEON}25` : 'rgba(192,132,252,0.12)'}`,
              borderLeft: `2px solid ${pColor}`,
            }}>
              {/* Mission header */}
              <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8,
                borderBottom: '1px solid rgba(192,132,252,0.08)' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: pColor,
                  boxShadow: `0 0 5px ${pColor}`, flexShrink: 0 }} />
                <p style={{ flex: 1, fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 700,
                  color: 'rgba(220,210,255,0.88)', letterSpacing: '0.06em' }}>{m.title}</p>
                <span style={{ fontFamily: 'var(--font)', fontSize: 7, color: pColor,
                  fontWeight: 700, letterSpacing: '0.1em', flexShrink: 0 }}>
                  {PRIORITY_LABELS[m.priority]}
                </span>
                {m.deadline_days > 0 && (
                  <span style={{ fontFamily: 'var(--font)', fontSize: 7,
                    color: 'rgba(148,163,184,0.4)', letterSpacing: '0.08em', flexShrink: 0 }}>
                    T-{m.deadline_days}d
                  </span>
                )}
                <span style={{ fontFamily: 'var(--font)', fontSize: 7,
                  color: `${LOG_NEON}50`, flexShrink: 0 }}>
                  {tasksDone}/{m.tasks.length}
                </span>
              </div>

              {/* Task rows */}
              <div style={{ padding: '4px 10px 6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {m.tasks.map((t, ti) => {
                  const isDone  = isAdded(m, t)
                  const tColor  = TASK_TYPE_COLOR[t.type]
                  const toScrap = t.type === 'daily' || t.type === 'habit'
                  return (
                    <div key={ti} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 0', opacity: isDone ? 0.45 : 1, transition: 'opacity 0.2s',
                    }}>
                      {/* Add button */}
                      <button
                        onClick={() => addTask(m, t)}
                        disabled={isDone}
                        title={isDone ? tr('Added','Добавлено') : toScrap ? tr('Add to dream & sync to SCRAP-7','В мечту и в SCRAP-7') : tr('Add to dream','Добавить в мечту')}
                        style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: isDone ? 'default' : 'pointer',
                          border: `1.5px solid ${isDone ? `${LOG_NEON}30` : `${LOG_NEON}60`}`,
                          background: isDone ? LOG_DIM : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, color: isDone ? LOG_NEON : `${LOG_NEON}80`,
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { if (!isDone) e.currentTarget.style.background = LOG_DIM }}
                        onMouseLeave={e => { if (!isDone) e.currentTarget.style.background = 'transparent' }}
                      >
                        {isDone ? '✓' : '+'}
                      </button>

                      {/* Task text */}
                      <p style={{
                        flex: 1, fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)',
                        color: isDone ? 'rgba(148,163,184,0.3)' : 'rgba(210,200,255,0.8)',
                        letterSpacing: '0.02em', minWidth: 0,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        textDecoration: isDone ? 'line-through' : 'none',
                      }}>{t.text}</p>

                      {/* Type chip */}
                      <span style={{
                        fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700,
                        color: tColor, letterSpacing: '0.1em', flexShrink: 0,
                        padding: '1px 5px', borderRadius: 3,
                        border: `1px solid ${tColor}30`, background: `${tColor}08`,
                      }}>{TASK_TYPE_LABEL[t.type]}</span>

                      {/* SCRAP-7 indicator */}
                      {toScrap && (
                        <span style={{
                          fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700,
                          color: isDone ? `${S7_NEON}50` : `${S7_NEON}80`,
                          letterSpacing: '0.08em', flexShrink: 0,
                          padding: '1px 5px', borderRadius: 3,
                          border: `1px solid ${S7_NEON}${isDone ? '20' : '40'}`,
                          background: `${S7_NEON}08`,
                        }}>{isDone ? 'S-7 ✦' : '→ S7'}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {allDone && (
        <div style={{ padding: '8px 12px', borderTop: `1px solid ${LOG_NEON}15`,
          textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 8, color: `${LOG_NEON}60`,
            letterSpacing: '0.15em' }}>✦ ALL NODES CONNECTED · CHECK SCRAP-7 FOR YOUR NEW TASKS</p>
        </div>
      )}
    </div>
  )
}

// ─── Mission block ────────────────────────────────────────────────────────────
function MissionBlock({ mission, dream, state, onChange }: {
  mission: Mission
  dream:   Dream
  state:   LogState
  onChange:(s: LogState) => void
}) {
  const [addingTask,  setAddingTask]  = useState(false)
  const [taskText,    setTaskText]    = useState('')
  const [taskType,    setTaskType]    = useState<LogTaskType>('todo')
  const [showSignals, setShowSignals] = useState(false)
  const [signalText,  setSignalText]  = useState('')
  const [hov,         setHov]         = useState(false)
  const taskRef   = useRef<HTMLInputElement>(null)
  const signalRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (addingTask) setTimeout(() => taskRef.current?.focus(), 30) }, [addingTask])

  const progress  = calcMissionProgress(mission)
  const days      = daysUntil(mission.deadline)
  const pColor    = PRIORITY_COLORS[mission.priority]
  const completed = mission.status === 'completed'

  const saveTask = () => {
    if (!taskText.trim()) return
    onChange(addTask(state, dream.id, mission.id, taskText.trim(), taskType))
    setTaskText('')
    setTaskType('todo')
    setAddingTask(false)
  }

  const doSync = (task: LogTask) => {
    syncTaskToScrap7(task, mission.title, dream.title)
    onChange(markTaskSynced(state, dream.id, mission.id, task.id))
  }

  const inp: React.CSSProperties = {
    background: 'rgba(192,132,252,0.04)', border: `1px solid rgba(192,132,252,0.15)`,
    borderRadius: 4, outline: 'none', padding: '5px 8px',
    fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)',
    color: 'rgba(220,210,255,0.85)', letterSpacing: '0.03em',
    userSelect: 'text', WebkitUserSelect: 'text',
    transition: 'border-color 0.15s',
  }

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        margin: '4px 0', borderRadius: 8,
        background: completed ? 'rgba(245,158,11,0.03)' : 'rgba(10,4,26,0.5)',
        border: `1px solid ${completed ? 'rgba(245,158,11,0.15)' : 'rgba(192,132,252,0.1)'}`,
        borderLeft: `2px solid ${completed ? '#f59e0b' : pColor}`,
        transition: 'all 0.15s',
      }}>

      {/* Mission header */}
      <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Status dot */}
        <div style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: completed ? '#f59e0b' : pColor,
          boxShadow: `0 0 6px ${completed ? '#f59e0b' : pColor}70`,
        }} />

        {/* Title */}
        <p style={{
          flex: 1, fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 700,
          color: completed ? 'rgba(245,158,11,0.6)' : 'rgba(220,210,255,0.88)',
          letterSpacing: '0.06em', textTransform: 'uppercase',
          textDecoration: completed ? 'line-through' : 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          minWidth: 0,
        }}>{mission.title}</p>

        {/* Meta chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700,
            color: pColor, letterSpacing: '0.1em' }}>{PRIORITY_LABELS[mission.priority]}</span>
          {days !== null && (
            <span style={{ fontFamily: 'var(--font)', fontSize: 7,
              color: etaColor(days), letterSpacing: '0.08em' }}>{formatEta(days)}</span>
          )}
          <span style={{ fontFamily: 'var(--font)', fontSize: 8, fontWeight: 800,
            color: completed ? '#f59e0b' : `${LOG_NEON}80` }}>{progress}%</span>
        </div>

        {/* Actions (hover) */}
        {hov && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {!completed && (
              <button title={tr('Mark mission complete', 'Отметить миссию выполненной')}
                onClick={() => onChange(completeMission(state, dream.id, mission.id))}
                style={{ fontSize: 11, color: 'rgba(245,158,11,0.35)', transition: 'color 0.12s' }}
                onMouseEnter={e => e.currentTarget.style.color = '#f59e0b'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(245,158,11,0.35)'}
              >✦</button>
            )}
            <button onClick={() => setAddingTask(v => !v)} title={tr('Add task', 'Добавить задачу')}
              style={{ fontSize: 13, color: `${LOG_NEON}50`, transition: 'color 0.12s' }}
              onMouseEnter={e => e.currentTarget.style.color = LOG_NEON}
              onMouseLeave={e => e.currentTarget.style.color = `${LOG_NEON}50`}
            >+</button>
            <button onClick={() => onChange(deleteMission(state, dream.id, mission.id))} title={tr('Delete mission', 'Удалить миссию')}
              style={{ fontSize: 13, color: 'rgba(255,0,51,0.2)', transition: 'color 0.12s' }}
              onMouseEnter={e => e.currentTarget.style.color = '#ff0033'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,0,51,0.2)'}
            >×</button>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ margin: '0 10px', height: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 1, marginBottom: 8 }}>
        <div style={{
          height: '100%', width: `${progress}%`,
          background: completed ? '#f59e0b' : LOG_NEON,
          boxShadow: `0 0 6px ${completed ? '#f59e0b' : LOG_NEON}60`,
          borderRadius: 1, transition: 'width 0.5s ease',
        }} />
      </div>

      {/* Task list */}
      {mission.tasks.length > 0 && (
        <div style={{ padding: '0 10px 4px', borderTop: '1px solid rgba(192,132,252,0.06)' }}>
          {mission.tasks.map(t => (
            <TaskRow key={t.id} task={t}
              onToggle={() => onChange(toggleTask(state, dream.id, mission.id, t.id))}
              onDelete={() => onChange(deleteTask(state, dream.id, mission.id, t.id))}
              onSync={() => doSync(t)}
            />
          ))}
        </div>
      )}

      {/* Add task form */}
      {addingTask && (
        <div style={{ display: 'flex', gap: 5, padding: '6px 10px',
          borderTop: '1px solid rgba(192,132,252,0.07)', alignItems: 'center' }}>
          {/* Type selector */}
          <select value={taskType} onChange={e => setTaskType(e.target.value as LogTaskType)}
            style={{ ...inp, padding: '4px 6px', width: 62, flexShrink: 0, appearance: 'none', cursor: 'pointer' }}>
            <option value="todo">{tr('todo','задача')}</option>
            <option value="daily">{tr('daily','ежедневная')}</option>
            <option value="habit">{tr('habit','привычка')}</option>
          </select>
          <input ref={taskRef} value={taskText} onChange={e => setTaskText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveTask(); if (e.key === 'Escape') setAddingTask(false) }}
            placeholder={tr('Task description...', 'Описание задачи...')}
            style={{ ...inp, flex: 1 }}
            onFocus={e => e.target.style.borderColor = `${LOG_NEON}50`}
            onBlur={e => e.target.style.borderColor = 'rgba(192,132,252,0.15)'}
          />
          <button onClick={saveTask} disabled={!taskText.trim()} style={{
            padding: '4px 8px', borderRadius: 4, cursor: 'pointer', flexShrink: 0,
            fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700,
            color: taskText.trim() ? LOG_NEON : 'rgba(192,132,252,0.2)',
            border: `1px solid ${taskText.trim() ? `${LOG_NEON}40` : 'rgba(192,132,252,0.08)'}`,
            background: taskText.trim() ? LOG_DIM : 'transparent',
          }}>+</button>
          <button onClick={() => setAddingTask(false)} style={{
            fontSize: 13, color: 'rgba(148,163,184,0.3)', cursor: 'pointer',
          }}>×</button>
        </div>
      )}

      {!addingTask && (
        <button onClick={() => setAddingTask(true)} style={{
          display: 'block', width: '100%', padding: '4px 10px',
          textAlign: 'left', fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)',
          color: `${LOG_NEON}30`, letterSpacing: '0.08em', cursor: 'pointer',
          borderTop: mission.tasks.length > 0 ? '1px solid rgba(192,132,252,0.05)' : 'none',
          transition: 'color 0.12s',
        }}
          onMouseEnter={e => e.currentTarget.style.color = `${LOG_NEON}70`}
          onMouseLeave={e => e.currentTarget.style.color = `${LOG_NEON}30`}
        >+ add task</button>
      )}

      {/* Signals (field log) — collapsible */}
      {mission.signals.length > 0 || showSignals ? (
        <div style={{ borderTop: '1px solid rgba(192,132,252,0.05)', padding: '6px 10px' }}>
          <button onClick={() => setShowSignals(v => !v)} style={{
            fontFamily: 'var(--font)', fontSize: 7, color: `${LOG_NEON}40`,
            letterSpacing: '0.15em', cursor: 'pointer', transition: 'color 0.12s', marginBottom: showSignals ? 6 : 0,
          }}
            onMouseEnter={e => e.currentTarget.style.color = `${LOG_NEON}80`}
            onMouseLeave={e => e.currentTarget.style.color = `${LOG_NEON}40`}
          >{showSignals ? '▾' : '▸'} SIGNALS {mission.signals.length > 0 ? `(${mission.signals.length})` : ''}</button>

          {showSignals && (
            <>
              {mission.signals.map(s => (
                <div key={s.id} style={{
                  padding: '5px 8px', marginBottom: 4, borderRadius: 5,
                  background: 'rgba(192,132,252,0.03)',
                  borderLeft: `2px solid ${LOG_NEON}20`,
                  display: 'flex', gap: 8,
                }}>
                  <p style={{ flex: 1, fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)',
                    color: 'rgba(220,210,255,0.5)', lineHeight: 1.5 }}>{s.text}</p>
                  <button onClick={() => onChange(deleteSignal(state, dream.id, mission.id, s.id))}
                    style={{ fontSize: 12, color: 'rgba(255,0,51,0.2)', flexShrink: 0, transition: 'color 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#ff0033'}
                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,0,51,0.2)'}
                  >×</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 5 }}>
                <input ref={signalRef} value={signalText} onChange={e => setSignalText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && signalText.trim()) {
                    onChange(addSignal(state, dream.id, mission.id, signalText.trim()))
                    setSignalText('')
                  }}}
                  placeholder={tr('Transmit signal...', 'Передать сигнал...')}
                  style={{ ...inp, flex: 1 }}
                  onFocus={e => e.target.style.borderColor = `${LOG_NEON}50`}
                  onBlur={e => e.target.style.borderColor = 'rgba(192,132,252,0.15)'}
                />
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

// ─── Dream card (star node) ───────────────────────────────────────────────────
function DreamCard({ dream, rank, total, expanded, onToggleExpand, state, onChange, onEdit, onMove,
                     promoted, onPromote }: {
  dream:          Dream
  rank:           number
  total:          number
  expanded:       boolean
  onToggleExpand: () => void
  state:          LogState
  onChange:       (s: LogState) => void
  onEdit:         () => void
  onMove:         (dir: -1 | 1) => void
  /** This dream already drives an uplink. */
  promoted:       boolean
  onPromote:      () => void
}) {
  const [missionModal,  setMissionModal]    = useState(false)
  const [hovHeader,     setHovHeader]       = useState(false)
  const [analyzing,     setAnalyzing]       = useState(false)
  const [analyzeError,  setAnalyzeError]    = useState('')

  const analyze = async () => {
    setAnalyzing(true); setAnalyzeError('')
    try {
      const settings = loadSettings()
      const msgs: AiMessage[] = [
        { role: 'system', content: LOG_ANALYSIS_SYSTEM },
        { role: 'user',   content: `Dream: ${dream.title}\n\n${dream.description || 'No description provided.'}` },
      ]
      const parsed = await aiJson<Record<string, unknown>>(msgs, settings, { model: modelForTask(settings, 'log.analysis'), maxTokens: 2048 })
      const result: DreamAnalysis = {
        analysis: typeof parsed.analysis === 'string' ? parsed.analysis : '',
        missions: Array.isArray(parsed.missions) ? parsed.missions : [],
        generatedAt: new Date().toISOString(),
      }
      onChange(setDreamAnalysis(state, dream.id, result))   // persisted — survives tab switch
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : tr('Analysis failed. Check AI settings.', 'Анализ не удался. Проверьте настройки ИИ.'))
    }
    setAnalyzing(false)
  }

  const progress = calcDreamProgress(dream)
  const active   = dream.missions.filter(m => m.status === 'active').length
  const done     = dream.missions.filter(m => m.status === 'completed').length

  return (
    <div style={{
      margin: '6px 10px', borderRadius: 12,
      background: 'rgba(10,4,26,0.75)',
      border: `1px solid ${expanded ? `${LOG_NEON}28` : `${LOG_NEON}14`}`,
      boxShadow: expanded ? `0 4px 28px rgba(192,132,252,0.07)` : 'none',
      overflow: 'hidden', transition: 'all 0.2s',
      // Space grid bg
      backgroundImage: 'repeating-linear-gradient(0deg, rgba(192,132,252,0.012) 0px, rgba(192,132,252,0.012) 1px, transparent 1px, transparent 44px), repeating-linear-gradient(90deg, rgba(192,132,252,0.012) 0px, rgba(192,132,252,0.012) 1px, transparent 1px, transparent 44px)',
    }}>

      {/* Star header */}
      <div
        onMouseEnter={() => setHovHeader(true)}
        onMouseLeave={() => setHovHeader(false)}
        style={{ padding: '12px 14px', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          {/* Priority rank + up/down controls */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
            flexShrink: 0, paddingTop: 1, userSelect: 'none' }}
            onClick={e => e.stopPropagation()}>
            <button onClick={() => onMove(-1)} disabled={rank === 1} title={tr('Raise priority', 'Повысить приоритет')}
              style={{ fontSize: 9, lineHeight: 1, padding: '1px 3px', cursor: rank === 1 ? 'default' : 'pointer',
                color: rank === 1 ? 'rgba(192,132,252,0.15)' : `${LOG_NEON}70`, transition: 'color 0.12s' }}
              onMouseEnter={e => { if (rank !== 1) e.currentTarget.style.color = LOG_NEON }}
              onMouseLeave={e => { if (rank !== 1) e.currentTarget.style.color = `${LOG_NEON}70` }}
            >▲</button>
            <span style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 900,
              color: rank === 1 ? '#ff6b00' : LOG_NEON, lineHeight: 1,
              textShadow: rank === 1 ? '0 0 6px #ff6b0080' : 'none' }}>#{rank}</span>
            <button onClick={() => onMove(1)} disabled={rank === total} title={tr('Lower priority', 'Понизить приоритет')}
              style={{ fontSize: 9, lineHeight: 1, padding: '1px 3px', cursor: rank === total ? 'default' : 'pointer',
                color: rank === total ? 'rgba(192,132,252,0.15)' : `${LOG_NEON}70`, transition: 'color 0.12s' }}
              onMouseEnter={e => { if (rank !== total) e.currentTarget.style.color = LOG_NEON }}
              onMouseLeave={e => { if (rank !== total) e.currentTarget.style.color = `${LOG_NEON}70` }}
            >▼</button>
          </div>

          {/* Pulsing star */}
          <div onClick={onToggleExpand} style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: `${LOG_NEON}12`,
            border: `1px solid ${LOG_NEON}35`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, transition: 'all 0.2s',
            boxShadow: expanded ? `0 0 14px ${LOG_NEON}30` : 'none',
          }}>
            <span style={{ filter: `drop-shadow(0 0 5px ${LOG_NEON})` }}>
              {progress === 100 ? '✦' : '✧'}
            </span>
          </div>

          {/* Title + meta */}
          <div style={{ flex: 1, minWidth: 0 }} onClick={onToggleExpand}>
            <p style={{
              fontFamily: 'var(--font)', fontSize: 11, fontWeight: 800,
              color: 'rgba(230,220,255,0.92)', letterSpacing: '0.05em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{dream.title}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font)', fontSize: 7,
                color: `${LOG_NEON}55`, letterSpacing: '0.1em' }}>{dream.category}</span>
              {active > 0 && (
                <span style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${LOG_NEON}45` }}>
                  {active} active
                </span>
              )}
              {done > 0 && (
                <span style={{ fontFamily: 'var(--font)', fontSize: 7, color: 'rgba(245,158,11,0.5)' }}>
                  {done} done
                </span>
              )}
            </div>
          </div>

          {/* Right side: progress + controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontFamily: 'var(--font)', fontSize: 16, fontWeight: 900,
                color: progress === 100 ? '#f59e0b' : LOG_NEON,
                textShadow: `0 0 10px ${progress === 100 ? '#f59e0b' : LOG_NEON}60`,
                lineHeight: 1 }}>{progress}%</p>
              <p style={{ fontFamily: 'var(--font)', fontSize: 6,
                color: `${LOG_NEON}40`, letterSpacing: '0.1em', marginTop: 1 }}>{tr('TRAJ.', 'ТРАЕКТ.')}</p>
            </div>

            {hovHeader && (
              <div style={{ display: 'flex', gap: 3 }}>
                <button onClick={e => { e.stopPropagation(); onEdit() }} title={tr('Edit dream', 'Изменить мечту')}
                  style={{ fontSize: 12, color: `${LOG_NEON}45`, padding: '2px 4px', transition: 'color 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.color = LOG_NEON}
                  onMouseLeave={e => e.currentTarget.style.color = `${LOG_NEON}45`}
                >✎</button>
                <button onClick={e => { e.stopPropagation(); onChange(deleteDream(state, dream.id)) }}
                  title={tr('Delete dream', 'Удалить мечту')}
                  style={{ fontSize: 13, color: 'rgba(255,0,51,0.2)', padding: '2px 4px', transition: 'color 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#ff0033'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,0,51,0.2)'}
                >×</button>
              </div>
            )}

            <button onClick={onToggleExpand} style={{
              fontSize: 11, color: `${LOG_NEON}50`, padding: '2px 4px', transition: 'all 0.15s',
              transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            }}>▾</button>
          </div>
        </div>

        {/* Dream progress bar */}
        <div style={{ marginTop: 8, height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1 }}>
          <div style={{
            height: '100%', width: `${progress}%`,
            background: progress === 100
              ? 'linear-gradient(90deg, #f59e0b, #fcd34d)'
              : `linear-gradient(90deg, ${LOG_NEON}, rgba(192,132,252,0.5))`,
            borderRadius: 1, transition: 'width 0.6s ease',
            boxShadow: `0 0 8px ${progress === 100 ? '#f59e0b' : LOG_NEON}50`,
          }} />
        </div>
      </div>

      {/* Expanded: description + missions */}
      {expanded && (
        <div style={{ borderTop: `1px solid rgba(192,132,252,0.1)`, padding: '10px 12px 12px' }}>

          {/* Description */}
          {dream.description && (
            <p style={{
              fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)',
              color: 'rgba(192,132,252,0.45)', lineHeight: 1.65,
              marginBottom: 10, letterSpacing: '0.02em',
              borderLeft: `2px solid ${LOG_NEON}20`, paddingLeft: 8,
            }}>{dream.description}</p>
          )}

          {/* Promote — a dream is where an uplink comes from. Missions plan the
              work; a PROTOCOL is the daily behaviour that actually produces it. */}
          <button onClick={onPromote} disabled={promoted} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            width: '100%', marginBottom: 10, padding: '8px 12px', borderRadius: 8,
            cursor: promoted ? 'default' : 'pointer',
            background: promoted ? 'rgba(0,245,255,0.04)' : 'rgba(0,245,255,0.07)',
            border: `1px solid rgba(0,245,255,${promoted ? 0.16 : 0.32})`,
            opacity: promoted ? 0.65 : 1, transition: 'all 0.18s',
          }}>
            <span style={{ fontSize: 13, filter: 'drop-shadow(0 0 4px #00f5ff)' }}>◈</span>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <p style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 800,
                color: '#00f5ff', letterSpacing: '0.15em' }}>
                {promoted ? tr('ALREADY AN UPLINK', 'УЖЕ КАНАЛ') : tr('PROMOTE TO UPLINK', 'ПРОДВИНУТЬ В КАНАЛ')}
              </p>
              <p style={{ fontFamily: 'var(--font)', fontSize: 7,
                color: 'rgba(0,245,255,0.5)', letterSpacing: '0.06em', marginTop: 1 }}>
                {promoted
                  ? tr('Its protocol lives in UPLINKS', 'Его протокол — в UPLINKS')
                  : tr('The guide proposes a chain of routines — you edit every node', 'Гид предложит цепь рутин — вы правите каждый узел')}
              </p>
            </div>
          </button>

          {/* Analyze button */}
          {!dream.analysis && !analyzing && (
            <button onClick={analyze} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              width: '100%', marginBottom: 10, padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
              background: `${LOG_NEON}07`, border: `1px solid ${LOG_NEON}30`,
              transition: 'all 0.18s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = `${LOG_NEON}12`; e.currentTarget.style.borderColor = `${LOG_NEON}55` }}
              onMouseLeave={e => { e.currentTarget.style.background = `${LOG_NEON}07`; e.currentTarget.style.borderColor = `${LOG_NEON}30` }}
            >
              <span style={{ fontSize: 14, filter: `drop-shadow(0 0 4px ${LOG_NEON})` }}>🦫</span>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <p style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 800,
                  color: LOG_NEON, letterSpacing: '0.15em' }}>{tr('ANALYZE WITH L.O.G', 'АНАЛИЗ С L.O.G')}</p>
                <p style={{ fontFamily: 'var(--font)', fontSize: 7,
                  color: `${LOG_NEON}50`, letterSpacing: '0.08em', marginTop: 1 }}>
                  AI will plot missions, tasks, dailies & habits
                </p>
              </div>
              <span style={{ fontFamily: 'var(--font)', fontSize: 9, color: `${LOG_NEON}50` }}>↯</span>
            </button>
          )}

          {/* Loading state */}
          {analyzing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', marginBottom: 10, borderRadius: 8,
              background: `${LOG_NEON}06`, border: `1px solid ${LOG_NEON}20` }}>
              <span style={{ fontSize: 14, animation: 'pulse 1.5s ease-in-out infinite',
                filter: `drop-shadow(0 0 6px ${LOG_NEON})` }}>🦫</span>
              <div>
                <p style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 800,
                  color: LOG_NEON, letterSpacing: '0.15em' }}>{tr('COMPUTING TRAJECTORY...', 'ВЫЧИСЛЯЮ ТРАЕКТОРИЮ...')}</p>
                <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${LOG_NEON}45`,
                  letterSpacing: '0.08em', marginTop: 1 }}>{tr('Connecting all the dots', 'Соединяю все точки')}</p>
              </div>
              <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: LOG_NEON,
                    animation: 'pulse 1.2s ease-in-out infinite', animationDelay: `${i*0.2}s` }} />
                ))}
              </div>
            </div>
          )}

          {/* Error state */}
          {analyzeError && (
            <div style={{ padding: '8px 10px', marginBottom: 10, borderRadius: 7,
              background: 'rgba(255,0,51,0.05)', border: '1px solid rgba(255,0,51,0.2)' }}>
              <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: '#ff4444' }}>
                {analyzeError}
              </p>
              <button onClick={analyze} style={{ fontFamily: 'var(--font)', fontSize: 8,
                color: LOG_NEON, letterSpacing: '0.1em', cursor: 'pointer', marginTop: 4 }}>
                RETRY ↺
              </button>
            </div>
          )}

          {/* Analysis panel (persisted on the dream) */}
          {dream.analysis && (
            <AnalysisPanel
              result={dream.analysis}
              dream={dream}
              state={state}
              onChange={onChange}
              onClose={() => onChange(clearDreamAnalysis(state, dream.id))}
            />
          )}

          {/* Mission tree */}
          {dream.missions.length === 0 && !dream.analysis && !analyzing && (
            <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)',
              color: 'rgba(192,132,252,0.15)', letterSpacing: '0.1em',
              textAlign: 'center', padding: '4px 0 4px' }}>
              NO MISSIONS PLOTTED
            </p>
          )}

          {dream.missions.map(m => (
            <MissionBlock key={m.id} mission={m} dream={dream} state={state} onChange={onChange} />
          ))}

          {/* Add mission button / inline quick-add */}
          <button
            onClick={() => setMissionModal(true)}
            style={{
              display: 'block', width: '100%', marginTop: 8,
              padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700,
              letterSpacing: '0.1em', color: `${LOG_NEON}55`,
              border: `1px dashed ${LOG_NEON}25`, background: `${LOG_NEON}04`,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = LOG_NEON; e.currentTarget.style.borderColor = `${LOG_NEON}50`; e.currentTarget.style.background = `${LOG_NEON}08` }}
            onMouseLeave={e => { e.currentTarget.style.color = `${LOG_NEON}55`; e.currentTarget.style.borderColor = `${LOG_NEON}25`; e.currentTarget.style.background = `${LOG_NEON}04` }}
          >+ Deploy Mission</button>
        </div>
      )}

      {/* Mission modal */}
      {missionModal && (
        <MissionModal
          onSave={data => { onChange(addMission(state, dream.id, data)); setMissionModal(false) }}
          onCancel={() => setMissionModal(false)}
        />
      )}
    </div>
  )
}

// ─── Mission modal (bottom sheet) ─────────────────────────────────────────────
function MissionModal({ initial, onSave, onCancel }: {
  initial?: Mission
  onSave:   (d: NewMissionData) => void
  onCancel: () => void
}) {
  const [title,    setTitle]    = useState(initial?.title ?? '')
  const [desc,     setDesc]     = useState(initial?.description ?? '')
  const [priority, setPriority] = useState<MissionPriority>(initial?.priority ?? 'medium')
  const [deadline, setDeadline] = useState(initial?.deadline ?? '')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { setTimeout(() => ref.current?.focus(), 50) }, [])

  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 5,
    background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(192,132,252,0.15)',
    outline: 'none', fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)',
    color: 'rgba(220,210,255,0.88)', letterSpacing: '0.03em',
    userSelect: 'text', WebkitUserSelect: 'text', transition: 'border-color 0.15s',
  }
  const chip = (on: boolean, color: string): React.CSSProperties => ({
    padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
    fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    color: on ? color : 'rgba(148,163,184,0.35)',
    background: on ? `${color}12` : 'transparent',
    border: `1px solid ${on ? `${color}35` : 'rgba(255,255,255,0.05)'}`,
    transition: 'all 0.12s',
  })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'flex-end' }}
      onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', background: 'rgba(8,3,22,0.98)',
        borderTop: `1px solid ${LOG_NEON}30`,
        backdropFilter: 'blur(20px)', padding: '16px',
        display: 'flex', flexDirection: 'column', gap: 9,
        maxHeight: '80%', overflowY: 'auto',
      }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 700,
          color: LOG_NEON, letterSpacing: '0.2em', marginBottom: 2 }}>
          {initial ? tr('UPDATE MISSION','ОБНОВИТЬ МИССИЮ') : tr('DEPLOY MISSION','СОЗДАТЬ МИССИЮ')}
        </p>
        <input ref={ref} value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && title.trim()) onSave({ title: title.trim(), description: desc.trim(), priority, deadline: deadline || null }); if (e.key === 'Escape') onCancel() }}
          placeholder={tr('Mission objective...', 'Цель миссии...')} style={inp}
          onFocus={e => e.target.style.borderColor = `${LOG_NEON}50`}
          onBlur={e => e.target.style.borderColor = 'rgba(192,132,252,0.15)'}
        />
        <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
          placeholder={tr('Briefing / description...', 'Бриф / описание...')}
          style={{ ...inp, resize: 'none' }}
          onFocus={e => e.target.style.borderColor = `${LOG_NEON}50`}
          onBlur={e => e.target.style.borderColor = 'rgba(192,132,252,0.15)'}
        />
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {(['critical','high','medium','low'] as MissionPriority[]).map(p => (
            <button key={p} onClick={() => setPriority(p)} style={chip(priority === p, PRIORITY_COLORS[p])}>
              {PRIORITY_LABELS[p]}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)',
            color: 'rgba(192,132,252,0.45)', flexShrink: 0 }}>{tr('DEADLINE', 'СРОК')}</span>
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
            style={{ ...inp }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { if (title.trim()) onSave({ title: title.trim(), description: desc.trim(), priority, deadline: deadline || null }) }} style={{
            flex: 1, padding: '9px', borderRadius: 5, cursor: 'pointer',
            fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 800,
            letterSpacing: '0.12em', color: LOG_NEON,
            background: LOG_DIM, border: `1px solid ${LOG_NEON}40`,
          }}>{tr('LOCK TARGET', 'ЗАФИКСИРОВАТЬ ЦЕЛЬ')}</button>
          <button onClick={onCancel} style={{
            padding: '9px 16px', borderRadius: 5, cursor: 'pointer',
            fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)',
            color: 'rgba(148,163,184,0.35)', border: '1px solid rgba(255,255,255,0.06)',
          }}>ABORT</button>
        </div>
      </div>
    </div>
  )
}

// ─── Dream modal (bottom sheet) ────────────────────────────────────────────────
function DreamModal({ categories, initial, onSave, onCancel }: {
  categories: string[]
  initial?:   Dream
  onSave:     (title: string, desc: string, cat: string) => void
  onCancel:   () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [desc,  setDesc]  = useState(initial?.description ?? '')
  const [cat,   setCat]   = useState(initial?.category ?? (categories[0] ?? 'Personal'))
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { setTimeout(() => ref.current?.focus(), 50) }, [])

  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 5,
    background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(192,132,252,0.15)',
    outline: 'none', fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)',
    color: 'rgba(220,210,255,0.88)', letterSpacing: '0.03em',
    userSelect: 'text', WebkitUserSelect: 'text', transition: 'border-color 0.15s',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'flex-end' }}
      onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', background: 'rgba(8,3,22,0.98)',
        borderTop: `1px solid ${LOG_NEON}40`,
        backdropFilter: 'blur(20px)', padding: '16px',
        display: 'flex', flexDirection: 'column', gap: 9,
        maxHeight: '70%', overflowY: 'auto',
      }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 700,
          color: LOG_NEON, letterSpacing: '0.2em', marginBottom: 2 }}>
          {initial ? tr('UPDATE DREAM','ОБНОВИТЬ МЕЧТУ') : tr('✧ NEW DREAM','✧ НОВАЯ МЕЧТА')}
        </p>
        <input ref={ref} value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
          placeholder={tr('Your dream, vision, purpose...', 'Ваша мечта, видение, цель...')} style={inp}
          onFocus={e => e.target.style.borderColor = `${LOG_NEON}55`}
          onBlur={e => e.target.style.borderColor = 'rgba(192,132,252,0.15)'}
        />
        <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
          placeholder={tr('Why does this matter? Paint the picture...', 'Почему это важно? Опишите картину...')}
          style={{ ...inp, resize: 'none' }}
          onFocus={e => e.target.style.borderColor = `${LOG_NEON}55`}
          onBlur={e => e.target.style.borderColor = 'rgba(192,132,252,0.15)'}
        />
        <select value={cat} onChange={e => setCat(e.target.value)}
          style={{ ...inp, appearance: 'none' }}>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { if (title.trim()) onSave(title.trim(), desc.trim(), cat) }} style={{
            flex: 1, padding: '9px', borderRadius: 5, cursor: 'pointer',
            fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 800,
            letterSpacing: '0.12em', color: LOG_NEON,
            background: LOG_DIM, border: `1px solid ${LOG_NEON}40`,
          }}>{tr('PLANT THE STAR', 'ЗАЖЕЧЬ ЗВЕЗДУ')}</button>
          <button onClick={onCancel} style={{
            padding: '9px 16px', borderRadius: 5, cursor: 'pointer',
            fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)',
            color: 'rgba(148,163,184,0.35)', border: '1px solid rgba(255,255,255,0.06)',
          }}>ABORT</button>
        </div>
      </div>
    </div>
  )
}

// ─── Constellation panel (cross-dream synthesis) ──────────────────────────────
function ConstellationPanel({ c, state, onChange, onDismiss }: {
  c:        Constellation
  state:    LogState
  onChange: (s: LogState) => void
  onDismiss:() => void
}) {
  const deploy = (idx: number) => {
    const item = c.plan[idx]
    if (!item || item.deployed) return
    syncPlanItemToScrap7(item)
    const plan = c.plan.map((p, i) => i === idx ? { ...p, deployed: true } : p)
    onChange(setConstellation(state, { ...c, plan }))
  }
  const deployAll = () => {
    let any = false
    c.plan.forEach(p => { if (!p.deployed) { syncPlanItemToScrap7(p); any = true } })
    if (any) onChange(setConstellation(state, { ...c, plan: c.plan.map(p => ({ ...p, deployed: true })) }))
  }
  const remaining = c.plan.filter(p => !p.deployed).length

  return (
    <div style={{
      margin: '8px 10px', borderRadius: 12, overflow: 'hidden',
      background: 'rgba(8,3,20,0.95)',
      border: `1px solid ${LOG_NEON}38`,
      boxShadow: `0 0 28px rgba(192,132,252,0.16)`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
        borderBottom: `1px solid ${LOG_NEON}22`, background: `${LOG_NEON}0a` }}>
        <span style={{ fontSize: 13, filter: `drop-shadow(0 0 6px ${LOG_NEON})` }}>⟡</span>
        <div style={{ flex: 1 }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 900,
            color: LOG_NEON, letterSpacing: '0.2em' }}>{tr('CONSTELLATION SYNTHESIS', 'СИНТЕЗ СОЗВЕЗДИЯ')}</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${LOG_NEON}50`,
            letterSpacing: '0.1em' }}>{c.plan.length} UNIFIED ACTIONS · {c.links.length} LINKS</p>
        </div>
        {remaining > 0 && (
          <button onClick={deployAll} style={{
            fontFamily: 'var(--font)', fontSize: 8, fontWeight: 800, color: S7_NEON,
            letterSpacing: '0.1em', cursor: 'pointer', padding: '4px 9px', borderRadius: 4,
            border: `1px solid ${S7_NEON}45`, background: `${S7_NEON}0c`, transition: 'background 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = `${S7_NEON}1a`}
            onMouseLeave={e => e.currentTarget.style.background = `${S7_NEON}0c`}
          >→ DEPLOY ALL</button>
        )}
        <button onClick={onDismiss} title={tr('Dismiss synthesis', 'Скрыть синтез')}
          style={{ fontSize: 13, color: 'rgba(192,132,252,0.3)', cursor: 'pointer', transition: 'color 0.12s' }}
          onMouseEnter={e => e.currentTarget.style.color = '#ff0033'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(192,132,252,0.3)'}
        >×</button>
      </div>

      {/* Synthesis text */}
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${LOG_NEON}12`, background: `${LOG_NEON}04` }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: `${LOG_NEON}80`,
          lineHeight: 1.7, fontStyle: 'italic', borderLeft: `2px solid ${LOG_NEON}30`, paddingLeft: 8 }}>
          {c.synthesis}
        </p>
      </div>

      {/* Interconnections */}
      {c.links.length > 0 && (
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${LOG_NEON}10`,
          display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700, color: `${LOG_NEON}45`,
            letterSpacing: '0.18em' }}>{tr('INTERCONNECTIONS', 'ВЗАИМОСВЯЗИ')}</p>
          {c.links.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 9, color: LOG_NEON, lineHeight: 1.5, flexShrink: 0 }}>◇</span>
              <div>
                <p style={{ fontFamily: 'var(--font)', fontSize: 7.5, color: `${LOG_NEON}70`,
                  fontWeight: 700, letterSpacing: '0.04em' }}>{l.dreams.join('  ✦  ')}</p>
                <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)',
                  color: 'rgba(210,200,255,0.6)', lineHeight: 1.5 }}>{l.insight}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Unified plan → SCRAP-7 */}
      <div style={{ padding: '8px 12px 10px' }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700, color: `${LOG_NEON}45`,
          letterSpacing: '0.18em', marginBottom: 6 }}>UNIFIED PLAN → SCRAP-7</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {c.plan.map((p, i) => {
            const tColor = TASK_TYPE_COLOR[p.type]
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
                opacity: p.deployed ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                <button onClick={() => deploy(i)} disabled={p.deployed}
                  title={p.deployed ? 'On SCRAP-7' : 'Send to SCRAP-7'}
                  style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: p.deployed ? 'default' : 'pointer',
                    border: `1.5px solid ${p.deployed ? `${S7_NEON}40` : `${S7_NEON}70`}`,
                    background: p.deployed ? `${S7_NEON}12` : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, color: p.deployed ? S7_NEON : `${S7_NEON}90`, transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!p.deployed) e.currentTarget.style.background = `${S7_NEON}14` }}
                  onMouseLeave={e => { if (!p.deployed) e.currentTarget.style.background = 'transparent' }}
                >{p.deployed ? '✓' : '+'}</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)',
                    color: p.deployed ? 'rgba(148,163,184,0.4)' : 'rgba(220,210,255,0.85)',
                    letterSpacing: '0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.text}
                  </p>
                  {p.serves && (
                    <p style={{ fontFamily: 'var(--font)', fontSize: 6.5, color: `${LOG_NEON}45`,
                      letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      ↳ {p.serves}
                    </p>
                  )}
                </div>
                <span style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700, color: tColor,
                  letterSpacing: '0.1em', flexShrink: 0, padding: '1px 5px', borderRadius: 3,
                  border: `1px solid ${tColor}30`, background: `${tColor}08` }}>
                  {TASK_TYPE_LABEL[p.type]}
                </span>
              </div>
            )
          })}
        </div>
        {remaining === 0 && (
          <p style={{ fontFamily: 'var(--font)', fontSize: 8, color: `${S7_NEON}70`,
            letterSpacing: '0.12em', textAlign: 'center', marginTop: 8 }}>
            ✦ ALL ACTIONS DEPLOYED · CHECK SCRAP-7
          </p>
        )}
      </div>
    </div>
  )
}

/** Dreams that already drive an uplink — read from progression, never stored here. */
function promotedDreamIds(): Set<string> {
  return new Set(loadProgression().goals
    .map(g => g.sourceDreamId)
    .filter((id): id is string => !!id))
}

// ─── Main Log component ────────────────────────────────────────────────────────
export default function Log() {
  const [state,         setState]         = useState<LogState>(() => loadLogState())
  const [expandedDreams,setExpandedDreams]= useState<Set<string>>(() => new Set())
  const [dreamModal,    setDreamModal]    = useState<Dream | 'new' | null>(null)
  const [synthesizing,  setSynthesizing]  = useState(false)
  const [synthError,    setSynthError]    = useState('')
  const [promoting,     setPromoting]     = useState<Dream | null>(null)
  const [promotedIds,   setPromotedIds]   = useState<Set<string>>(() => promotedDreamIds())

  const persist = useCallback((s: LogState) => { saveLogState(s); setState(s) }, [])

  // ── Cross-dream constellation synthesis ──
  const synthesize = async () => {
    if (state.dreams.length < 2) return
    setSynthesizing(true); setSynthError('')
    try {
      const settings = loadSettings()
      const dreamsText = state.dreams
        .map((d, i) => `#${i + 1} [${d.category}] ${d.title}\n${d.description || '(no description)'}`)
        .join('\n\n')
      const parsed = await aiJson<Record<string, unknown>>([
        { role: 'system', content: CONSTELLATION_SYSTEM },
        { role: 'user',   content: `Dreams in priority order (#1 = highest):\n\n${dreamsText}` },
      ], settings, { model: modelForTask(settings, 'log.analysis'), maxTokens: 2048 })
      const c: Constellation = {
        synthesis: typeof parsed.synthesis === 'string' ? parsed.synthesis : '',
        links: Array.isArray(parsed.links)
          ? parsed.links.filter((l: { dreams?: unknown; insight?: unknown }) => Array.isArray(l.dreams) && l.insight)
          : [],
        plan: Array.isArray(parsed.plan)
          ? parsed.plan
              .map((p: { text?: unknown; type?: unknown; serves?: unknown }): PlanItem => ({
                text: String(p.text ?? '').trim(),
                type: (['habit', 'daily', 'todo'] as LogTaskType[]).includes(p.type as LogTaskType)
                  ? (p.type as LogTaskType) : 'todo',
                serves: String(p.serves ?? ''),
                deployed: false,
              }))
              .filter((p: PlanItem) => p.text.length > 1)
          : [],
        generatedAt: new Date().toISOString(),
      }
      persist(setConstellation(state, c))
    } catch (err) {
      setSynthError(err instanceof Error ? err.message : 'Synthesis failed. Check AI settings.')
    }
    setSynthesizing(false)
  }

  // Auto-expand newly created dreams
  const prevCountRef = useRef(state.dreams.length)
  useEffect(() => {
    if (state.dreams.length > prevCountRef.current && state.dreams[0]) {
      setExpandedDreams(prev => new Set([...prev, state.dreams[0].id]))
    }
    prevCountRef.current = state.dreams.length
  }, [state.dreams.length])

  // Listen for SCRAP-7 sync completions (tasks marked done in SCRAP-7)
  useEffect(() => {
    const handler = () => { setState(loadLogState()); setPromotedIds(promotedDreamIds()) }
    window.addEventListener('warren:sync', handler)
    return () => window.removeEventListener('warren:sync', handler)
  }, [])

  const totalMissions = state.dreams.reduce((s, d) => s + d.missions.length, 0)
  const activeMissions = state.dreams.reduce((s, d) => s + d.missions.filter(m => m.status === 'active').length, 0)
  const overallPct = state.dreams.length === 0 ? 0
    : Math.round(state.dreams.reduce((s, d) => s + calcDreamProgress(d), 0) / state.dreams.length)

  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        padding: '8px 14px', flexShrink: 0,
        borderBottom: `1px solid rgba(192,132,252,0.1)`,
        background: 'rgba(8,3,20,0.6)',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 900,
            color: LOG_NEON, letterSpacing: '0.2em', textShadow: `0 0 10px ${LOG_NEON}` }}>L.O.G</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${LOG_NEON}40`, letterSpacing: '0.12em' }}>
            LONG-RANGE OBJECTIVE GRAPH
          </p>
        </div>
        <div style={{ flex: 1 }} />
        {[
          { v: String(state.dreams.length), l: tr('DREAMS', 'МЕЧТЫ'),   c: LOG_NEON },
          { v: String(activeMissions),      l: tr('ACTIVE', 'АКТИВНЫЕ'),   c: LOG_NEON },
          { v: `${overallPct}%`,            l: tr('PROGRESS', 'ПРОГРЕСС'), c: 'rgba(192,132,252,0.5)' },
        ].map(({ v, l, c }) => (
          <div key={l} style={{ textAlign: 'right' }}>
            <p style={{ fontFamily: 'var(--font)', fontSize: 14, fontWeight: 900, color: c, lineHeight: 1 }}>{v}</p>
            <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: 'rgba(192,132,252,0.3)', letterSpacing: '0.1em' }}>{l}</p>
          </div>
        ))}
        {state.dreams.length >= 2 && (
          <button onClick={synthesize} disabled={synthesizing} title={tr('Analyze all dreams together', 'Проанализировать все мечты вместе')}
            style={{
              height: 28, padding: '0 10px', borderRadius: 7, cursor: synthesizing ? 'default' : 'pointer',
              fontFamily: 'var(--font)', fontSize: 8, fontWeight: 800, letterSpacing: '0.1em',
              color: synthesizing ? `${LOG_NEON}50` : LOG_NEON,
              border: `1px solid ${LOG_NEON}35`, background: LOG_DIM, transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
            onMouseEnter={e => { if (!synthesizing) e.currentTarget.style.background = 'rgba(192,132,252,0.18)' }}
            onMouseLeave={e => e.currentTarget.style.background = LOG_DIM}
          >
            <span style={{ animation: synthesizing ? 'pulse 1.2s ease-in-out infinite' : 'none' }}>⟡</span>
            {synthesizing ? tr('SYNTHESIZING','СИНТЕЗ...') : tr('SYNTHESIZE','СИНТЕЗ')}
          </button>
        )}
        {!LOG_FROZEN && <button onClick={() => setDreamModal('new')} style={{
          width: 28, height: 28, borderRadius: 7, fontSize: 16, fontWeight: 700,
          color: `${LOG_NEON}80`, border: `1px solid ${LOG_NEON}30`,
          background: LOG_DIM, cursor: 'pointer', transition: 'all 0.15s',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
          onMouseEnter={e => { e.currentTarget.style.color = LOG_NEON; e.currentTarget.style.background = 'rgba(192,132,252,0.18)' }}
          onMouseLeave={e => { e.currentTarget.style.color = `${LOG_NEON}80`; e.currentTarget.style.background = LOG_DIM }}
        >✧</button>}
      </div>

      {/* Synthesis error (shared) */}
      {synthError && (
        <div style={{ margin: '8px 10px 0', padding: '8px 10px', borderRadius: 7, flexShrink: 0,
          background: 'rgba(255,0,51,0.05)', border: '1px solid rgba(255,0,51,0.2)' }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: '#ff4444' }}>{synthError}</p>
          <button onClick={synthesize} style={{ fontFamily: 'var(--font)', fontSize: 8,
            color: LOG_NEON, letterSpacing: '0.1em', cursor: 'pointer', marginTop: 4 }}>RETRY ↺</button>
        </div>
      )}

      {/* Star tree (list) */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* Synthesis error */}
        {synthError && (
          <div style={{ margin: '8px 10px 0', padding: '8px 10px', borderRadius: 7,
            background: 'rgba(255,0,51,0.05)', border: '1px solid rgba(255,0,51,0.2)' }}>
            <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: '#ff4444' }}>{synthError}</p>
            <button onClick={synthesize} style={{ fontFamily: 'var(--font)', fontSize: 8,
              color: LOG_NEON, letterSpacing: '0.1em', cursor: 'pointer', marginTop: 4 }}>RETRY ↺</button>
          </div>
        )}

        {/* Persisted constellation synthesis */}
        {state.constellation && (
          <ConstellationPanel c={state.constellation} state={state} onChange={persist}
            onDismiss={() => persist(clearConstellation(state))} />
        )}

        {state.dreams.length === 0 && (
          <div style={{ padding: '40px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 12, filter: `drop-shadow(0 0 12px ${LOG_NEON})` }}>✧</div>
            <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-md)',
              color: 'rgba(192,132,252,0.25)', marginBottom: 6, letterSpacing: '0.05em' }}>
              {tr('THE CONSTELLATION IS EMPTY', 'СОЗВЕЗДИЕ ПУСТО')}
            </p>
            <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)',
              color: `${LOG_NEON}22`, letterSpacing: '0.1em', lineHeight: 1.8 }}>
              {tr('Plant your first star —', 'Зажгите первую звезду —')}<br/>{tr('a Dream you want to make real.', 'мечту, которую хотите осуществить.')}
            </p>
            {LOG_FROZEN ? (
              <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', marginTop: 18,
                color: `${LOG_NEON}55`, letterSpacing: '0.06em', lineHeight: 1.8 }}>
                {tr('L.O.G is read-only — new goals are set up in UPLINKS.',
                    'L.O.G только для чтения — новые цели создаются в UPLINKS.')}
              </p>
            ) : (
            <button onClick={() => setDreamModal('new')} style={{
              marginTop: 18, padding: '8px 22px', borderRadius: 7, cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700,
              letterSpacing: '0.12em', color: LOG_NEON,
              border: `1px solid ${LOG_NEON}40`, background: LOG_DIM, transition: 'background 0.15s',
            }}>{tr('✧ PLANT FIRST STAR', '✧ ЗАЖЕЧЬ ПЕРВУЮ ЗВЕЗДУ')}</button>
            )}
          </div>
        )}

        {state.dreams.map((dream, i) => (
          <DreamCard
            key={dream.id}
            dream={dream}
            rank={i + 1}
            total={state.dreams.length}
            expanded={expandedDreams.has(dream.id)}
            onToggleExpand={() => setExpandedDreams(prev => {
              const next = new Set(prev)
              if (next.has(dream.id)) next.delete(dream.id); else next.add(dream.id)
              return next
            })}
            state={state}
            onChange={persist}
            onEdit={() => setDreamModal(dream)}
            onMove={dir => persist(moveDream(state, dream.id, dir))}
            promoted={promotedIds.has(dream.id)}
            onPromote={() => setPromoting(dream)}
          />
        ))}

        <div style={{ height: 16 }} />
      </div>

      {/* Dream modal */}
      {dreamModal !== null && (
        <DreamModal
          categories={state.categories}
          initial={dreamModal === 'new' ? undefined : dreamModal}
          onSave={(title, desc, cat) => {
            if (dreamModal === 'new') persist(createDream(state, title, desc, cat))
            else persist(updateDream(state, dreamModal.id, { title, description: desc, category: cat }))
            setDreamModal(null)
          }}
          onCancel={() => setDreamModal(null)}
        />
      )}

      {/* Dream → protocol. Everything it writes lives in progression, not here. */}
      {promoting && (
        <NewUplink accent="#00f5ff" dream={promoting}
          onClose={() => setPromoting(null)}
          onCommitted={() => { setPromoting(null); setPromotedIds(promotedDreamIds()) }} />
      )}
    </div>
  )
}
