import { useState, useRef, useEffect, useCallback } from 'react'
import {
  HABIT_MILESTONES, MILESTONE_LABELS, WEEKDAYS,
  todayKey, dateKey,
  type Task, type TaskType, type Priority, type Direction,
} from './types'
import {
  loadState, saveState, applyDailyReset, createTask,
  completeTask, uncompleteTask, deleteTask, updateTask, addMessage, addCategory,
  duplicateTask, pickableCategories, orbitTasks, habitDoneToday, taskSource, SOURCE_LABEL,
  type NewTaskData,
} from './store'
import { parseCommand } from './commandParser'
import Infinity8 from '../infinity8/Infinity8'
import { t as tr } from '../../i18n'
import { loadSettings, aiJson, modelForTask, type AiMessage } from '../../settings'
import { trackFromList } from '../progression/store'
import { play as playCue } from '../../sound'
import { CyberIcon } from '../../components/CyberIcon'

const NEON = '#00b4ff'

const SCRAP7_SYSTEM = `You are ORBIT, a cyber-raccoon task engineer. You turn what the user says into structured tasks.

Reply with ONLY a JSON object, no markdown fences, no prose outside it:
{"reply": string, "tasks": [{"text": string, "type": "daily"|"todo", "category": string, "schedule": "everyday"|"weekly"|null, "days": ["mon","tue","wed","thu","fri","sat","sun"] }], "delete": [number]}

DELETING:
- To REMOVE existing tasks, put their NUMBERS (from the numbered EXISTING TASKS list below) in "delete". e.g. "delete": [1, 2].
- Use it when the user says a task was added wrong, is a duplicate, in the wrong tab, or asks to delete/remove it.
- You CANNOT change a task's type in place — to "move" a task to another tab, delete the old number AND add a corrected one in "tasks".
- Never claim you deleted something unless its number is in "delete".

CHOOSING THE TYPE — this matters, get it right:
- "todo"  = a FINITE task that will be DONE one day, then gone. Even if tackled bit-by-bit over several days, a project with an end is a to-do. e.g. "Tidy up the cabinets", "Buy a desk", "Fix the bike".
- "daily" = an indefinitely recurring routine with NO finish line, checked off each day. e.g. "Make the bed", "Take vitamins".
- There is NO "habit" type here. A behaviour the user is BUILDING — reading, exercise, drills — belongs to UPLINKS, not to this module: goal routines come from a PROTOCOL and the basics from LIFE SUPPORT. If asked for one, make it a "daily" only if it is a genuine scheduled obligation; otherwise say plainly that habits are set up in UPLINKS and add nothing.

NAMING:
- Give a short, clean, imperative title (2-5 words). Strip filler like "I want to", "at a time", "doing one per day".
- Put cadence/notes in "reply", NOT in the title. e.g. title "Tidy up the cabinets" + reply "...do one per day."

RULES:
- Look at the user's existing tasks (provided below). If one with the SAME purpose already exists, DO NOT create a duplicate — return "tasks": [] and say so in "reply".
- Only split into multiple tasks when the user clearly lists multiple distinct things.
- "schedule"/"days" only apply to habit/daily; use null for todo. "weekly" needs "days".
- category: one of Health, Work, Study, Mindset, Home, Personal.
- "reply" is short, direct, raccoon-engineer tone. Only 🔥 emoji allowed. If just chatting (no task), return "tasks": [] with a brief reply.`

// ─── AI JSON contract ─────────────────────────────────────────────────────────
interface Scrap7AiTask {
  text:      string
  type:      string
  category?: string
  schedule?: 'everyday' | 'weekly' | null
  days?:     string[]
}
interface Scrap7AiResult {
  reply:  string
  tasks:  Scrap7AiTask[]
  delete: number[]
}

/** Normalize the parsed AI object into a safe Scrap7AiResult. */
function normalizeScrap7(obj: Record<string, unknown>): Scrap7AiResult {
  return {
    reply:  typeof obj.reply === 'string' ? obj.reply : '',
    tasks:  Array.isArray(obj.tasks) ? obj.tasks as Scrap7AiTask[] : [],
    delete: Array.isArray(obj.delete)
      ? (obj.delete as unknown[]).map(n => Number(n)).filter(n => Number.isInteger(n) && n > 0)
      : [],
  }
}

// ─── 14-day streak calendar (Dailies tab) ─────────────────────────────────────
function StreakCalendar({ tasks }: { tasks: Task[] }) {
  const today = new Date()
  const days  = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - (13 - i)); return d
  })
  const allDone = new Set<string>()
  for (const t of tasks) {
    for (const d of [...(t.completionHistory ?? []), ...(t.trackingHistory ?? [])]) allDone.add(d)
  }
  const todayStr = todayKey()

  return (
    <div style={{ display: 'flex', gap: 3, padding: '8px 14px 6px', alignItems: 'center',
      borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      {days.map((d, i) => {
        const key     = dateKey(d)
        const done    = allDone.has(key)
        const isToday = key === todayStr
        const prevKey = i > 0 ? dateKey(days[i - 1]) : null
        const connected = done && prevKey && allDone.has(prevKey)
        return (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
            <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {connected && <div style={{ position: 'absolute', left: 0, right: '50%', height: 2,
                background: NEON, opacity: 0.4, top: '50%', transform: 'translateY(-50%)' }} />}
              <div style={{
                width: 12, height: 12, borderRadius: 3, flexShrink: 0, zIndex: 1,
                background: done ? NEON : isToday ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
                boxShadow: done ? `0 0 5px ${NEON}60` : 'none',
                border: `1px solid ${isToday ? 'rgba(255,255,255,0.2)' : 'transparent'}`,
              }} />
            </div>
            {(i === 0 || d.getDate() === 1) && (
              <span style={{ fontFamily: 'var(--font)', fontSize: 11,
                color: 'rgba(148,163,184,0.3)' }}>
                {d.toLocaleDateString('en', { month: 'short' })}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Pomodoro mini-timer ──────────────────────────────────────────────────────
interface PomoState {
  taskId:    string
  taskName:  string
  minutes:   number
  remaining: number
  running:   boolean
  phase:     'work' | 'break'
  sessions:  number
}

function PomodoroBar({ pomo, onPause, onStop }: {
  pomo: PomoState; onPause: () => void; onStop: () => void
}) {
  const m   = Math.floor(pomo.remaining / 60)
  const s   = pomo.remaining % 60
  const pct = (pomo.remaining / (pomo.minutes * 60)) * 100
  const col = pomo.phase === 'work' ? '#ef4444' : '#22c55e'

  return (
    <div style={{
      flexShrink: 0, padding: '8px 14px',
      background: `${col}08`, borderBottom: `1px solid ${col}25`,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      {/* Progress ring substitute */}
      <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, position: 'relative',
        background: `conic-gradient(${col} ${pct}%, rgba(255,255,255,0.06) ${pct}%)` }}>
        <div style={{ position: 'absolute', inset: 3, borderRadius: '50%', background: 'var(--bg-void)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 900, color: col }}>
            {pomo.phase === 'work' ? '🍅' : '☕'}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700,
          color: col, letterSpacing: '0.06em' }}>
          {m.toString().padStart(2,'0')}:{s.toString().padStart(2,'0')}{' '}
          <span style={{ color: 'rgba(148,163,184,0.4)', fontWeight: 400 }}>
            {pomo.phase === 'work' ? tr('FOCUS', 'ФОКУС') : tr('BREAK', 'ПЕРЕРЫВ')}
          </span>
        </p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-2xs)',
          color: 'rgba(148,163,184,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {pomo.taskName}
        </p>
      </div>

      {/* Session dots */}
      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ width: 6, height: 6, borderRadius: 2,
            background: i < pomo.sessions ? col : 'rgba(255,255,255,0.08)' }} />
        ))}
      </div>

      <button onClick={onPause} style={{ fontFamily: 'var(--font)', fontSize: 14.5, color: col,
        padding: '3px 7px', border: `1px solid ${col}30`, borderRadius: 4,
        background: `${col}10`, cursor: 'pointer', flexShrink: 0 }}>
        {pomo.running ? '⏸' : '▶'}
      </button>
      <button onClick={onStop} style={{ fontFamily: 'var(--font)', fontSize: 13.5, color: 'rgba(148,163,184,0.35)',
        padding: '3px 7px', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }}>
        ✕
      </button>
    </div>
  )
}

// ─── Task row (dailies + todos) ───────────────────────────────────────────────
function TaskRow({ task, onCheck, onDelete, onEdit, onPomo }: {
  task: Task; onCheck: () => void; onDelete: () => void
  onEdit: () => void; onPomo: () => void
}) {
  const [hov, setHov]       = useState(false)
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState(task.text)
  const editRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) editRef.current?.focus() }, [editing])

  // A habit is done when today's dose is met, not when a checkbox is ticked —
  // it has no `completed` flag to read.
  const done   = task.taskType === 'habit' ? habitDoneToday(task) : task.completed
  const source = taskSource(task)
  const src    = SOURCE_LABEL[source]
  const PC: Record<string, string> = { trivial: '#6b7280', easy: '#22c55e', medium: '#f59e0b', hard: '#ef4444' }
  const priorityColor = task.priority ? (PC[task.priority] ?? '#6b7280') : undefined

  const DOW2: Record<string, string> = { mon: 'Mo', tue: 'Tu', wed: 'We', thu: 'Th', fri: 'Fr', sat: 'Sa', sun: 'Su' }
  const ORDER = ['mon','tue','wed','thu','fri','sat','sun']
  const schedWeekly = task.schedule?.type === 'weekly' && task.schedule.days?.length
    ? task.schedule.days.slice().sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).map(d => DOW2[d] ?? d).join(' ')
    : null

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
      background: hov ? 'rgba(255,255,255,0.02)' : 'transparent',
      borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.12s',
    }}>
      <button onClick={onCheck} style={{
        width: 22, height: 22, borderRadius: 11, flexShrink: 0,
        border: `2px solid ${done ? NEON : 'rgba(148,163,184,0.22)'}`,
        background: done ? `${NEON}20` : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 0.18s',
        boxShadow: done ? `0 0 8px ${NEON}40` : 'none',
      }}>
        {done && <div style={{ width: 8, height: 8, borderRadius: 4, background: NEON }} />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input ref={editRef} value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={() => { if (editVal.trim()) { /* handled by parent */ } setEditing(false) }}
            onKeyDown={e => { if (e.key === 'Enter') { setEditing(false) } if (e.key === 'Escape') { setEditing(false); setEditVal(task.text) } }}
            style={{ width: '100%', background: `${NEON}08`, border: `1px solid ${NEON}40`,
              borderRadius: 4, outline: 'none', fontFamily: 'var(--font)',
              fontSize: 'var(--fs-lg)', color: 'rgba(220,240,255,0.9)', padding: '2px 7px',
              userSelect: 'text', WebkitUserSelect: 'text' }} />
        ) : (
          <p onDoubleClick={() => setEditing(true)} style={{
            fontFamily: 'var(--font)', fontSize: 'var(--fs-lg)', letterSpacing: '0.02em',
            color: done ? 'rgba(148,163,184,0.28)' : 'rgba(220,240,255,0.9)',
            textDecoration: done ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text',
          }}>{task.text}</p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3 }}>
          {/* Where this row came from, and therefore whether it counts. A task
              you added yourself is listed with everything else and says plainly
              that it is yours — a row that looks scored and isn't would make
              "did I finish today" a lie. */}
          <span title={source === 'yours'
            ? tr('Yours — does not affect scores or streaks', 'Ваше — не влияет на счёт и серии')
            : source === 'uplink'
              ? tr('A routine from your protocol — scored and streaked', 'Рутина протокола — со счётом и серией')
              : tr('Life support — a basic', 'Жизнеобеспечение — базовое')}
            style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-2xs)', fontWeight: 700,
              letterSpacing: '0.1em', color: src.color, flexShrink: 0,
              padding: '1px 5px', borderRadius: 3,
              border: `1px solid ${source === 'yours' ? 'rgba(148,163,184,0.22)' : `${src.color}35`}`,
              background: source === 'yours' ? 'transparent' : `${src.color}0e`,
              opacity: done ? 0.4 : 1 }}>
            {tr(src.en, src.ru)}
          </span>
          {task.taskType === 'daily' && (schedWeekly
            ? <span title={tr('Scheduled days', 'Дни по расписанию')} style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-2xs)',
                fontWeight: 700, color: '#22d3ee', letterSpacing: '0.06em',
                padding: '1px 5px', borderRadius: 3, border: '1px solid rgba(34,211,238,0.3)',
                background: 'rgba(34,211,238,0.08)' }}>{schedWeekly}</span>
            : <span style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: 'rgba(148,163,184,0.3)', letterSpacing: '0.05em' }}>daily</span>
          )}
          {(task.streak ?? 0) > 0 && (
            <span style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: '#ff6b00' }}>
              🔥{task.streak}
            </span>
          )}
          {priorityColor && !done && (
            <span style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)',
              color: priorityColor, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {task.priority}
            </span>
          )}
          {task.dueDate && !done && (
            <span style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: 'rgba(148,163,184,0.35)' }}>
              due {new Date(task.dueDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
            </span>
          )}
          <span style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: 'rgba(148,163,184,0.25)' }}>
            {task.category}
          </span>
        </div>
      </div>

      {hov && !editing && (
        <div style={{ display: 'flex', gap: 3, flexShrink: 0, alignItems: 'center' }}>
          <button onClick={onPomo} title={tr('Start Pomodoro', 'Запустить Помодоро')} style={{
            fontSize: 16.5, padding: '2px 4px', color: 'rgba(239,68,68,0.35)',
            transition: 'color 0.12s' }}
            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(239,68,68,0.35)'}
          >🍅</button>
          <button onClick={onEdit} style={{ fontSize: 14.5, color: `${NEON}40`, padding: '2px 4px', transition: 'color 0.12s' }}
            onMouseEnter={e => e.currentTarget.style.color = NEON}
            onMouseLeave={e => e.currentTarget.style.color = `${NEON}40`}
          >✎</button>
          <button onClick={onDelete} style={{ fontSize: 16.5, color: 'rgba(255,0,51,0.25)', padding: '2px 4px', transition: 'color 0.12s', lineHeight: 1 }}
            onMouseEnter={e => e.currentTarget.style.color = '#ff0033'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,0,51,0.25)'}
          >×</button>
        </div>
      )}
    </div>
  )
}

// ─── TaskModal ────────────────────────────────────────────────────────────────
function TaskModal({ categories, initialTask, initialText = '', initialType = 'todo', onSave, onCancel, onNewCategory }: {
  categories: string[]; initialTask?: Task; initialText?: string; initialType?: TaskType
  onSave: (d: NewTaskData) => void; onCancel: () => void; onNewCategory: (n: string) => void
}) {
  const isEdit = !!initialTask
  const [text,      setText]      = useState(initialTask?.text ?? initialText)
  const [taskType,  setTaskType]  = useState<TaskType>(initialTask?.taskType ?? initialType)
  const [category,  setCategory]  = useState(initialTask?.category ?? (categories[0] ?? 'Health'))
  const [priority,  setPriority]  = useState<Priority>(initialTask?.priority ?? 'medium')
  const [direction, setDirection] = useState<Direction>(initialTask?.direction ?? 'positive')
  const [schedType, setSchedType] = useState<'everyday' | 'weekly'>(
    initialTask?.schedule?.type === 'weekly' ? 'weekly' : 'everyday'
  )
  const [days,     setDays]    = useState<string[]>(initialTask?.schedule?.days ?? [])
  const [target,   setTarget]  = useState(initialTask?.target ?? 1)
  const [unit,     setUnit]    = useState(initialTask?.unit ?? '')
  const [dueDate,  setDueDate] = useState(initialTask?.dueDate ?? '')
  const [newCat,   setNewCat]  = useState('')
  const [addingCat, setAddingCat] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { setTimeout(() => ref.current?.focus(), 50) }, [])

  const save = () => {
    if (!text.trim()) return
    onSave({
      text: text.trim(), category, taskType, direction,
      target: taskType === 'habit' ? target : undefined,
      unit:   taskType === 'habit' && unit ? unit : undefined,
      schedule: taskType !== 'todo' ? { type: schedType, days: schedType === 'weekly' ? days : [] } : undefined,
      priority: taskType === 'todo' ? priority : undefined,
      dueDate:  taskType === 'todo' && dueDate ? dueDate : undefined,
    })
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 5,
    background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)',
    outline: 'none', fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)',
    color: 'rgba(220,240,255,0.88)', letterSpacing: '0.03em',
    userSelect: 'text', WebkitUserSelect: 'text',
  }
  const chip = (on: boolean, color: string): React.CSSProperties => ({
    padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
    fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    color: on ? color : 'rgba(148,163,184,0.35)',
    background: on ? `${color}12` : 'transparent',
    border: `1px solid ${on ? `${color}35` : 'rgba(255,255,255,0.05)'}`,
    transition: 'all 0.12s',
  })

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ width: '100%', background: 'rgba(8,14,28,0.97)', borderTop: `1px solid ${NEON}25`,
        backdropFilter: 'blur(16px)', padding: '16px', display: 'flex', flexDirection: 'column', gap: 9,
        maxHeight: '85%', overflowY: 'auto' }}>

        {/* Not "what kind of task" — there is only one kind. Just: does it
            come back? Everything else about a task follows from that. */}
        <div style={{ display: 'flex', gap: 5 }}>
          <button onClick={() => setTaskType('todo')} style={chip(taskType === 'todo', NEON)}>
            {tr('ONCE', 'ОДИН РАЗ')}
          </button>
          <button onClick={() => setTaskType('daily')} style={chip(taskType === 'daily', NEON)}>
            ↻ {tr('REPEATS', 'ПОВТОРЯЕТСЯ')}
          </button>
        </div>

        {/* Title */}
        <input ref={ref} value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel() }}
          placeholder={taskType === 'daily' ? tr('Something that comes back...', 'То, что возвращается...') : tr('Something to get done...', 'То, что нужно сделать...')}
          style={inp}
          onFocus={e => e.target.style.borderColor = `${NEON}45`}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
        />

        {/* Category */}
        {!addingCat ? (
          <select value={category} onChange={e => e.target.value === '__new__' ? setAddingCat(true) : setCategory(e.target.value)}
            style={{ ...inp, appearance: 'none' }}>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
            <option value="__new__">{tr('+ New category', '+ Новая категория')}</option>
          </select>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder={tr('Category name...', 'Название категории...')}
              style={{ ...inp, flex: 1 }}
              onKeyDown={e => {
                if (e.key === 'Enter' && newCat.trim()) { onNewCategory(newCat.trim()); setCategory(newCat.trim()); setAddingCat(false); setNewCat('') }
              }} />
            <button onClick={() => { if (newCat.trim()) { onNewCategory(newCat.trim()); setCategory(newCat.trim()) }; setAddingCat(false); setNewCat('') }}
              style={{ ...chip(true, '#39ff14'), padding: '0 10px', flexShrink: 0, border: '1px solid rgba(57,255,20,0.25)' }}>{tr('ADD', 'ДОБАВ.')}</button>
          </div>
        )}

        {/* Habit extras */}
        {taskType === 'habit' && (
          <>
            <div style={{ display: 'flex', gap: 5 }}>
              <button onClick={() => setDirection('positive')} style={chip(direction === 'positive', '#22c55e')}>➕ {tr('Build', 'Развивать')}</button>
              <button onClick={() => setDirection('negative')} style={chip(direction === 'negative', '#ef4444')}>➖ {tr('Break', 'Бросать')}</button>
            </div>
            {/* Dose target */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: 'rgba(148,163,184,0.4)' }}>{tr('Daily target', 'Дневная цель')}</span>
                <button onClick={() => setTarget(Math.max(1, target - 1))}
                  style={{ ...chip(false, NEON), padding: '3px 8px' }}>−</button>
                <span style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-md)', color: NEON, fontWeight: 700, minWidth: 24, textAlign: 'center' }}>
                  {target}
                </span>
                <button onClick={() => setTarget(target + 1)}
                  style={{ ...chip(false, NEON), padding: '3px 8px' }}>+</button>
              </div>
              <input value={unit} onChange={e => setUnit(e.target.value)} placeholder={tr('unit (glasses, min, km…)', 'единица (стаканы, мин, км…)')}
                style={{ ...inp, flex: 1, fontSize: 'var(--fs-xs)' }} />
            </div>
          </>
        )}

        {/* Daily schedule */}
        {taskType === 'daily' && (
          <>
            <div style={{ display: 'flex', gap: 5 }}>
              <button onClick={() => setSchedType('everyday')} style={chip(schedType === 'everyday', NEON)}>∞ {tr('Every day', 'Каждый день')}</button>
              <button onClick={() => setSchedType('weekly')}   style={chip(schedType === 'weekly', NEON)}>↻ {tr('Specific days', 'По дням')}</button>
            </div>
            {schedType === 'weekly' && (
              <div style={{ display: 'flex', gap: 3 }}>
                {WEEKDAYS.map(({ value, label }) => {
                  const on = days.includes(value)
                  return (
                    <button key={value} onClick={() => setDays(prev => on ? prev.filter(d => d !== value) : [...prev, value])}
                      style={{ flex: 1, padding: '4px 0', borderRadius: 3,
                        fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700,
                        color: on ? NEON : 'rgba(148,163,184,0.3)',
                        background: on ? `${NEON}12` : 'transparent',
                        border: `1px solid ${on ? `${NEON}30` : 'rgba(255,255,255,0.04)'}`,
                        cursor: 'pointer', transition: 'all 0.12s' }}>{label}</button>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* Todo extras */}
        {taskType === 'todo' && (
          <>
            <div style={{ display: 'flex', gap: 5 }}>
              {(['trivial', 'easy', 'medium', 'hard'] as Priority[]).map(p => {
                const pc = { trivial: '#6b7280', easy: '#22c55e', medium: '#f59e0b', hard: '#ef4444' }[p]
                return <button key={p} onClick={() => setPriority(p)} style={chip(priority === p, pc)}>{tr(p, ({ trivial: 'тривиальная', easy: 'лёгкая', medium: 'средняя', hard: 'сложная' } as const)[p])}</button>
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: 'rgba(148,163,184,0.4)', flexShrink: 0 }}>{tr('Due date', 'Срок')}</span>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                style={{ ...inp, flex: 1 }} />
            </div>
          </>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={save} style={{
            flex: 1, padding: '9px', borderRadius: 5,
            fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 800, letterSpacing: '0.1em',
            color: NEON, background: `${NEON}12`, border: `1px solid ${NEON}35`,
            cursor: 'pointer', transition: 'background 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = `${NEON}20`}
            onMouseLeave={e => e.currentTarget.style.background = `${NEON}12`}
          >{isEdit ? tr('UPDATE', 'ОБНОВИТЬ') : tr('DEPLOY', 'СОЗДАТЬ')}</button>
          <button onClick={onCancel} style={{
            padding: '9px 16px', borderRadius: 5, fontFamily: 'var(--font)',
            fontSize: 'var(--fs-sm)', color: 'rgba(148,163,184,0.35)',
            border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer',
          }}>{tr('ABORT', 'ОТМЕНА')}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Chat message ─────────────────────────────────────────────────────────────
function ChatMsg({ text, sender }: { text: string; sender: 'user' | 'scrap7' }) {
  const isUser = sender === 'user'
  return (
    <div style={{ display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row', gap: 8, marginBottom: 10 }}>
      <div style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0,
        background: isUser ? 'rgba(255,255,255,0.08)' : `${NEON}18`,
        border: `1px solid ${isUser ? 'rgba(255,255,255,0.1)' : `${NEON}30`}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14.5 }}>
        {isUser ? '👤' : <CyberIcon id="scrap7" size={15} color={NEON} />}
      </div>
      <div style={{ maxWidth: '75%', padding: '8px 12px',
        borderRadius: isUser ? '10px 2px 10px 10px' : '2px 10px 10px 10px',
        background: isUser ? 'rgba(255,255,255,0.06)' : `rgba(0,180,255,0.08)`,
        border: `1px solid ${isUser ? 'rgba(255,255,255,0.08)' : `${NEON}20`}` }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)',
          color: 'rgba(220,240,255,0.85)', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {text}
        </p>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
type ViewKey = 'tasks' | 'chat'

export default function Scrap7() {
  const [state, setState]   = useState(() => applyDailyReset(loadState()))
  const [view, setView]     = useState<ViewKey>('tasks')
  // The day on a line is the first thing you should see — the list is the same
  // day with the shape taken out of it.
  const [timeline, setTimeline] = useState(true)
  const [input, setInput]   = useState('')
  const [thinking, setThinking] = useState(false)
  const [lastReply, setLastReply] = useState<string | null>(null)
  const [modal, setModal]   = useState<{ text?: string; type?: TaskType } | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [milestone, setMilestone] = useState<typeof HABIT_MILESTONES[0] | null>(null)
  const [pomo, setPomo]     = useState<PomoState | null>(null)
  /** Rule 27: real work gets a visible beat. Tracking a routine here pays XP. */
  const [flashMsg, setFlashMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!flashMsg) return
    const id = setTimeout(() => setFlashMsg(null), 2200)
    return () => clearTimeout(id)        // rule 37: an effect with a timer cancels it
  }, [flashMsg])
  const pomoRef             = useRef<ReturnType<typeof setInterval> | null>(null)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)

  const persist = useCallback((s: typeof state) => { saveState(s); setState(s) }, [])

  // Live sync: refresh when L.O.G pushes tasks via warren:sync event
  useEffect(() => {
    const handler = () => setState(applyDailyReset(loadState()))
    window.addEventListener('warren:sync', handler)
    return () => window.removeEventListener('warren:sync', handler)
  }, [])

  // Pomo tick
  useEffect(() => {
    if (!pomo) { if (pomoRef.current) clearInterval(pomoRef.current); return }
    if (!pomo.running) return
    pomoRef.current = setInterval(() => {
      setPomo(p => {
        if (!p) return null
        if (p.remaining <= 1) {
          clearInterval(pomoRef.current!)
          const isWork = p.phase === 'work'
          const newSessions = isWork ? p.sessions + 1 : p.sessions
          const breakMins = newSessions % 4 === 0 ? 15 : 5
          return { ...p, phase: isWork ? 'break' : 'work', remaining: (isWork ? breakMins : p.minutes) * 60,
            total: (isWork ? breakMins : p.minutes) * 60, sessions: newSessions, running: true }
        }
        return { ...p, remaining: p.remaining - 1 }
      })
    }, 1000)
    return () => { if (pomoRef.current) clearInterval(pomoRef.current) }
  }, [pomo?.running, pomo?.phase])

  // Scroll chat
  useEffect(() => {
    if (view === 'chat') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [state.chatHistory, view, thinking])


  const handleSend = async () => {
    const raw = input.trim()
    if (!raw) return
    setInput('')
    let s = addMessage(state, { text: raw, sender: 'user' })
    setView('chat')
    persist(s)
    setThinking(true)

    try {
      const parsed = parseCommand(raw, s.tasks)
      if (parsed) {
        for (const action of parsed.actions) {
          if (action.type === 'complete_task' && action.task_id)
            s = completeTask(s, action.task_id)
          // 'track_habit' is deliberately unhandled. Habits live in UPLINKS, and
          // tracking one from here would move its score without awarding the XP
          // that recordRun/recordBaselineRun attach to a run — a silent economy
          // leak. The reply below says where to go instead.
          else if (action.type === 'track_habit') {
            s = addMessage(s, { text: tr('Habits are tracked in UPLINKS — routines on the tree, basics on the character sheet. ORBIT keeps what has to happen.',
                                         'Привычки — в UPLINKS: рутины на дереве, основы на листе персонажа. ORBIT держит то, что нужно сделать.'),
                                sender: 'scrap7' })
          }
          else if (action.type === 'delete_task' && action.task_id)
            s = deleteTask(s, action.task_id)
          else if (action.type === 'open_task_modal')
            setModal({ text: action.suggestion, type: action.taskType })
          else if (action.type === 'create_direct') {
            // No tab to inherit from any more: a task is one-off unless it says otherwise
            const type: TaskType = (action.taskType as TaskType) ?? 'todo'
            const isWeekly = action.recurrence === 'weekly' && (action.recurDays?.length ?? 0) > 0
            s = createTask(s, {
              text: action.suggestion ?? raw, category: action.category ?? 'Health',
              taskType: type, direction: 'positive',
              schedule: type !== 'todo' ? (isWeekly ? { type: 'weekly', days: action.recurDays ?? [] } : { type: 'everyday' }) : undefined,
              priority: type === 'todo' ? 'medium' : undefined,
            })
          }
        }
        s = addMessage(s, { text: parsed.text, sender: 'scrap7' })
        persist(s)
        setLastReply(parsed.text)
        setThinking(false)
        return
      }

      // Tier 2: AI — returns structured JSON { reply, tasks, delete }
      const settings = loadSettings()
      const taskRefs = s.tasks                      // snapshot — delete numbers index into this
      const context  = taskRefs.length
        ? taskRefs.map((t, i) => `${i + 1}. [${t.taskType}] ${t.text}`).join('\n')
        : '(none yet)'
      const msgs: AiMessage[] = [
        { role: 'system', content: SCRAP7_SYSTEM + `\n\nEXISTING TASKS (numbered):\n${context}` },
        { role: 'user',   content: raw },
      ]
      const out = await aiJson<Record<string, unknown>>(msgs, settings, { model: modelForTask(settings, 'scrap7.assistant') })
      const parsedAI = normalizeScrap7(out)

      // ── Deletes first (so a "move to another tab" delete+recreate works cleanly) ──
      const deleted: string[] = []
      const delIds = new Set<string>()
      for (const n of parsedAI.delete) {
        const ref = taskRefs[n - 1]
        if (ref && !delIds.has(ref.id)) delIds.add(ref.id)
      }
      for (const id of delIds) {
        const t = s.tasks.find(x => x.id === id)
        if (t) { s = deleteTask(s, id); deleted.push(t.text) }
      }

      // ── Creates ──
      const created: string[] = []
      const skipped: string[] = []
      for (const t of parsedAI.tasks) {
        const text = (t.text || '').trim()
        const type = (['habit', 'daily', 'todo'] as TaskType[]).includes(t.type as TaskType)
          ? (t.type as TaskType) : 'todo'
        if (text.length < 2) continue

        // Client-side dedup safety net (model is also told, but double-check).
        // Strict on purpose — see duplicateTask. A loose match here throws the
        // task away after the model has already said it added it.
        const dup = duplicateTask(s.tasks, text)
        if (dup) { skipped.push(`"${text}" — already here as "${dup.text}"`); continue }

        const isWeekly = type !== 'todo' && t.schedule === 'weekly' && (t.days?.length ?? 0) > 0
        s = createTask(s, {
          text,
          category: t.category || 'Personal',
          taskType: type,
          direction: 'positive',
          schedule: type === 'todo' ? undefined
            : isWeekly ? { type: 'weekly', days: t.days ?? [] } : { type: 'everyday' },
          priority: type === 'todo' ? 'medium' : undefined,
        })
        created.push(`${text} → ${type}`)
      }

      // The model writes its reply before we run dedup, so it says "Added X"
      // whether or not X survived. When nothing was created, that sentence is
      // false — drop it and report what actually happened instead. The screen
      // never claims work it did not do.
      const nothingLanded = parsedAI.tasks.length > 0 && created.length === 0 && deleted.length === 0
      let reply = nothingLanded
        ? tr('Nothing added.', 'Ничего не добавлено.')
        : (parsedAI.reply?.trim() || (created.length || deleted.length ? 'Done.' : 'Standing by.'))
      const notes: string[] = []
      if (deleted.length) notes.push(`Removed: ${deleted.join(', ')}.`)
      if (skipped.length) notes.push(`${skipped.join('; ')}.`)
      if (notes.length) reply += `\n(${notes.join(' ')})`
      s = addMessage(s, { text: reply, sender: 'scrap7' })
      persist(s)
      setLastReply(reply)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed.'
      s = addMessage(s, { text: msg, sender: 'scrap7' })
      persist(s)
    }
    setThinking(false)
  }



  // One list. The DAILIES/TO-DO split was two names for the same thing —
  // something you have to do — differing only in whether it comes back, which
  // is a property of a task and not a category of task. Habits aren't here at
  // all: the line is BUILDS YOU vs JUST HAS TO HAPPEN, and the first half lives
  // in UPLINKS where it is scored, streaked and capped.
  const shownTasks  = orbitTasks(state.tasks)
  const isDone      = (t: Task) => t.taskType === 'habit' ? habitDoneToday(t) : t.completed
  const activeTasks = shownTasks.filter(t => !isDone(t))
  const doneTasks   = shownTasks.filter(t => isDone(t))

  /**
   * Checking a row off. A habit is TRACKED rather than completed, and it goes
   * through the shared path so the score, the streak and the XP move together —
   * tracking that moved a score without paying its XP is the reason this was
   * once forbidden outside UPLINKS.
   */
  const checkOff = (t: Task) => {
    if (t.taskType === 'habit') {
      if (isDone(t)) return                     // a dose already met is not undone here
      const { gained, levelUp } = trackFromList(t.id)
      setState(loadState())
      if (levelUp)      { setFlashMsg(tr(`LEVEL ${levelUp}`, `УРОВЕНЬ ${levelUp}`)); playCue('level') }
      else if (gained)  { setFlashMsg(`+${gained} XP`); playCue('xp') }
      else              playCue('check')
      return
    }
    // Un-checking is the same gesture undone, so it gets the lighter cue.
    playCue(t.completed ? 'tick' : 'check')
    persist(t.completed ? uncompleteTask(state, t.id) : completeTask(state, t.id))
  }

  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

      {/* The week strip moved to the hub. Showing "on track" above the list of
          things you have not done yet was the wrong room for it — this screen is
          for working, the hub is for seeing where you stand. */}

      {/* What the last tap was worth. Informational, per rule 10 — it reports
          the delta, it does not congratulate. Timer cleaned up on unmount. */}
      {flashMsg && (
        <div style={{ position: 'absolute', top: 10, right: 14, zIndex: 40,
          padding: '5px 11px', borderRadius: 7, animation: 'fadeInPlace 0.18s ease',
          background: 'rgba(4,10,18,0.96)', border: `1px solid ${NEON}45` }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 800,
            letterSpacing: '0.12em', color: NEON }}>{flashMsg}</p>
        </div>
      )}

      {/* Pomodoro bar */}
      {pomo && (
        <PomodoroBar pomo={pomo}
          onPause={() => setPomo(p => p ? { ...p, running: !p.running } : null)}
          onStop={() => { if (pomoRef.current) clearInterval(pomoRef.current); setPomo(null) }}
        />
      )}

      {/* View + tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{ display: 'flex', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          {(['tasks', 'chat'] as ViewKey[]).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '9px 11px', fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)',
              fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer',
              color: view === v ? NEON : 'rgba(148,163,184,0.3)',
              background: view === v ? `${NEON}08` : 'transparent',
              borderBottom: view === v ? `2px solid ${NEON}` : '2px solid transparent',
              transition: 'all 0.15s',
            }}>{v === 'tasks' ? '≡' : '💬'}</button>
          ))}
        </div>

        {/* The day, two ways: what has to happen, and when it lands. The
            timeline owns no tasks of its own — it reads these — so it was never
            a second module, only the other half of this one. */}
        {view === 'tasks' && (
          <div style={{ display: 'flex', flex: 1 }}>
            {([true, false] as const).map(tl => {
              const on = timeline === tl
              return (
                <button key={String(tl)} onClick={() => setTimeline(tl)} style={{
                  flex: 1, padding: '9px 4px', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 6,
                  fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: on ? 700 : 400,
                  letterSpacing: '0.1em', cursor: 'pointer', background: 'transparent',
                  color: on ? NEON : 'rgba(148,163,184,0.4)',
                  textShadow: on ? `0 0 8px ${NEON}` : 'none',
                  borderBottom: on ? `2px solid ${NEON}` : '2px solid transparent',
                  transition: 'all 0.15s',
                }}>
                  {tl ? '∞' : '≡'} {tl ? tr('TIMELINE', 'ТАЙМЛАЙН') : tr('LIST', 'СПИСОК')}
                  {!tl && activeTasks.length > 0 && (
                    <span style={{ minWidth: 16, height: 15, borderRadius: 7, padding: '0 4px',
                      background: on ? `${NEON}20` : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${on ? `${NEON}35` : 'rgba(255,255,255,0.08)'}`,
                      fontSize: 'var(--fs-xs)', fontWeight: 700, fontFamily: 'var(--font)',
                      color: on ? NEON : 'rgba(148,163,184,0.35)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{activeTasks.length}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}


        <button onClick={() => setModal({})} style={{
          padding: '9px 12px', fontFamily: 'var(--font)', fontSize: 20, fontWeight: 700,
          color: `${NEON}70`, cursor: 'pointer',
          borderLeft: '1px solid rgba(255,255,255,0.06)', transition: 'color 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.color = NEON}
          onMouseLeave={e => e.currentTarget.style.color = `${NEON}70`}
        >+</button>
      </div>

      {/* ── The day on a line ── */}
      {view === 'tasks' && timeline && (
        <div style={{ flex: 1, overflow: 'hidden' }}><Infinity8 /></div>
      )}

      {/* ── Tasks ── */}
      {view === 'tasks' && !timeline && (
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* The fortnight behind you — repeating work is the only thing with a
              history worth drawing, so it only shows when there is some. */}
          {state.tasks.some(t => t.taskType === 'daily') && <StreakCalendar tasks={state.tasks} />}

          {shownTasks.length === 0 && (
            <div style={{ padding: '28px 16px', textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-md)',
                color: 'rgba(148,163,184,0.22)', marginBottom: 6 }}>
                {tr('Nothing due today', 'На сегодня ничего')}
              </p>
              <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)',
                color: `${NEON}28`, letterSpacing: '0.06em' }}>
                {tr('Talk to ORBIT or press + ↑', 'Напишите ORBIT или нажмите + ↑')}
              </p>
            </div>
          )}

          {activeTasks.map(t => (
            <TaskRow key={t.id} task={t}
              onCheck={() => checkOff(t)}
              onDelete={() => persist(deleteTask(state, t.id))}
              onEdit={() => setEditingTask(t)}
              onPomo={() => setPomo({ taskId: t.id, taskName: t.text, minutes: 25, remaining: 25*60, running: true, phase: 'work', sessions: 0 })}
            />
          ))}

          {/* Done section */}
          {doneTasks.length > 0 && (
            <>
              <div style={{ padding: '5px 14px 3px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)',
                  color: 'rgba(148,163,184,0.2)', letterSpacing: '0.12em' }}>{tr('DONE', 'ГОТОВО')}</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.03)' }} />
              </div>
              {doneTasks.map(t => (
                <TaskRow key={t.id} task={t}
                  onCheck={() => checkOff(t)}
                  onDelete={() => persist(deleteTask(state, t.id))}
                  onEdit={() => setEditingTask(t)}
                  onPomo={() => setPomo({ taskId: t.id, taskName: t.text, minutes: 25, remaining: 25*60, running: true, phase: 'work', sessions: 0 })}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Chat ── */}
      {view === 'chat' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
          {state.chatHistory.map(msg => (
            <ChatMsg key={msg.id} text={msg.text} sender={msg.sender} />
          ))}
          {thinking && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: `${NEON}18`,
                border: `1px solid ${NEON}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CyberIcon id="scrap7" size={15} color={NEON} /></div>
              <div style={{ padding: '10px 14px', borderRadius: '2px 10px 10px 10px',
                background: `rgba(0,180,255,0.08)`, border: `1px solid ${NEON}20`,
                display: 'flex', gap: 4, alignItems: 'center' }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: NEON,
                    animation: 'pulse 1.2s ease-in-out infinite', animationDelay: `${i * 0.2}s` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      )}

      {/* Milestone toast */}
      {milestone && (
        <div style={{ position: 'absolute', top: 48, left: 12, right: 12, padding: '10px 14px',
          borderRadius: 8, zIndex: 100,
          background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)',
          animation: 'fadeIn 0.3s ease' }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', color: '#f59e0b',
            fontWeight: 700, letterSpacing: '0.08em', marginBottom: 3 }}>
            {(MILESTONE_LABELS[milestone.days]?.icon ?? '🔥')} {milestone.label.toUpperCase()} — {milestone.days} DAYS
          </p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)',
            color: 'rgba(245,158,11,0.65)' }}>{milestone.msg}</p>
          <button onClick={() => setMilestone(null)}
            style={{ position: 'absolute', top: 6, right: 8, fontSize: 14.5,
              color: 'rgba(245,158,11,0.4)', cursor: 'pointer' }}>×</button>
        </div>
      )}

      {/* Input */}
      <div style={{ borderTop: '1px solid rgba(0,180,255,0.1)', padding: '8px 12px',
        background: 'rgba(0,0,0,0.2)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
          placeholder={thinking ? tr('Processing...', 'Обработка...') : tr('Talk to ORBIT...', 'Напишите ORBIT...')}
          disabled={thinking}
          style={{
            flex: 1, padding: '8px 12px', borderRadius: 6,
            background: 'rgba(0,180,255,0.05)',
            border: `1px solid ${input ? `${NEON}30` : 'rgba(0,180,255,0.1)'}`,
            outline: 'none', fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)',
            color: 'rgba(220,240,255,0.85)', letterSpacing: '0.02em',
            userSelect: 'text', WebkitUserSelect: 'text', transition: 'border-color 0.15s',
          }}
          onFocus={e => e.target.style.borderColor = `${NEON}50`}
          onBlur={e => e.target.style.borderColor = input ? `${NEON}30` : 'rgba(0,180,255,0.1)'}
        />
        <button onClick={handleSend} disabled={!input.trim() || thinking} style={{
          width: 36, height: 36, borderRadius: 6, flexShrink: 0,
          background: input.trim() ? `${NEON}18` : 'rgba(255,255,255,0.03)',
          border: `1px solid ${input.trim() ? `${NEON}40` : 'rgba(255,255,255,0.06)'}`,
          color: input.trim() ? NEON : 'rgba(148,163,184,0.2)',
          fontSize: 15.5, cursor: input.trim() ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
        }}>▶</button>
      </div>

      {/* Create modal */}
      {modal !== null && (
        <TaskModal categories={pickableCategories(state)} initialText={modal.text} initialType={modal.type ?? 'todo'}
          onSave={data => { persist(createTask(state, data)); setModal(null) }}
          onCancel={() => setModal(null)}
          onNewCategory={name => persist(addCategory(state, name))}
        />
      )}

      {/* Edit modal */}
      {editingTask !== null && (
        <TaskModal categories={pickableCategories(state)} initialTask={editingTask}
          onSave={data => { persist(updateTask(state, editingTask.id, data)); setEditingTask(null) }}
          onCancel={() => setEditingTask(null)}
          onNewCategory={name => persist(addCategory(state, name))}
        />
      )}
    </div>
  )
}
