import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  loadInf8State, saveInf8State, type Inf8State,
  type Anchors, type DayEvent, type Block, type Period,
  getTodayCommitments, buildDay, todayKey, effectiveAnchors, sleepHours,
  fmtClock, fmtDur, toMin,
  setAnchors, addEvent, removeEvent, setOverride, clearOverride, setPrefTimes,
} from './store'
import {
  loadState as loadScrap7, saveState as saveScrap7,
  completeTask, uncompleteTask, trackHabit, updateTask, createTask,
} from '../scrap7/store'
import { aiChat, loadSettings, modelForTask, type AiMessage } from '../../settings'

const NEON   = '#22d3ee'   // infinity cyan
const NEON_D = 'rgba(34,211,238,0.1)'

const BLOCK_COLOR: Record<Block['kind'], string> = {
  meal:       '#ffb13c',
  work:       '#7c83ff',
  event:      '#ff6b6b',
  commitment: '#22d3ee',
  break:      '#64748b',
  free:       '#39ff14',
}
const BLOCK_ICON: Record<Block['kind'], string> = {
  meal: '🍽', work: '💼', event: '◆', commitment: '◇', break: '·', free: '✦',
}

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_SHORT: Record<string, string> = { mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S', sun: 'S' }
const daysLabel = (d: string[] | 'everyday') => d === 'everyday' ? 'Every day' : d.map(k => DAY_SHORT[k] ?? k).join(' ')

// ─── Optimize types ───────────────────────────────────────────────────────────
interface OptChange   { id: string; label: string; days: string[] | 'everyday'; bestTime: Period; note: string }
interface OptAddition { text: string; type: 'habit' | 'daily'; days: string[] | 'everyday'; bestTime: Period; note: string }
interface OptimizeResult { rationale: string; changes: OptChange[]; additions: OptAddition[] }

const OPTIMIZE_SYSTEM = `You are INFINITY-8, a chronobiology-aware day scientist. You rebalance a person's recurring commitments so no single day is overloaded, using evidence-based timing.

Principles:
- Strength/hard workouts peak late afternoon (16:00–19:00); body temp & power highest. Gentle mobility/yoga fits the morning.
- Focused/creative/learning/memory work is best in the morning (post-wake cortisol peak).
- If many dailies stack on one day, SPLIT them across the week (e.g. Mon/Wed/Fri vs Tue/Thu/Sat) and keep at least one lighter REST day (often Sunday).
- Don't schedule heavy training back-to-back days for the same muscle group.
- A short, fun, low-effort item (a walk, a game break, stretching) is healthy — suggest 1–2 if the week looks all-grind.

Respond with ONLY JSON, no fences:
{
  "rationale": "2-3 sentences on how you rebalanced and why (the science).",
  "changes": [
    { "id": "<exact id from input>", "label": "name", "days": ["mon","wed","fri"] | "everyday", "bestTime": "morning|midday|afternoon|evening", "note": "short why (max 8 words)" }
  ],
  "additions": [
    { "text": "Short fun/mobility activity", "type": "habit|daily", "days": ["sat"] | "everyday", "bestTime": "...", "note": "short why" }
  ]
}
Only include a task in "changes" if you actually change its days or want to pin its best time. Use the exact ids given.`

// ─── Anchor settings sheet ────────────────────────────────────────────────────
function AnchorSheet({ anchors, onSave, onClose }: {
  anchors: Anchors; onSave: (a: Partial<Anchors>) => void; onClose: () => void
}) {
  const [a, setA] = useState<Anchors>(anchors)
  const set = (patch: Partial<Anchors>) => setA(prev => ({ ...prev, ...patch }))

  const timeInp: React.CSSProperties = {
    padding: '5px 8px', borderRadius: 5, background: 'rgba(0,0,0,0.5)',
    border: `1px solid ${NEON}25`, outline: 'none', fontFamily: 'var(--font)',
    fontSize: 'var(--fs-sm)', color: 'rgba(220,250,255,0.9)',
  }
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
      <span style={{ flex: 1, fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)',
        color: `${NEON}80`, letterSpacing: '0.06em' }}>{label}</span>
      {children}
    </div>
  )
  const mealRow = (key: 'breakfast' | 'lunch' | 'dinner', label: string) => (
    <Row label={label}>
      {a[key] === null ? (
        <button onClick={() => set({ [key]: key === 'breakfast' ? '08:00' : key === 'lunch' ? '13:00' : '19:00' } as Partial<Anchors>)}
          style={{ ...timeInp, color: `${NEON}50`, cursor: 'pointer' }}>+ add</button>
      ) : (
        <>
          <input type="time" value={a[key]!} onChange={e => set({ [key]: e.target.value } as Partial<Anchors>)} style={timeInp} />
          <button onClick={() => set({ [key]: null } as Partial<Anchors>)}
            style={{ fontSize: 13, color: 'rgba(255,0,51,0.4)', cursor: 'pointer' }}>×</button>
        </>
      )}
    </Row>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', background: 'rgba(4,12,16,0.98)', borderTop: `1px solid ${NEON}30`,
        backdropFilter: 'blur(20px)', padding: '16px', maxHeight: '85%', overflowY: 'auto',
        borderTopLeftRadius: 14, borderTopRightRadius: 14,
      }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 800, color: NEON,
          letterSpacing: '0.2em', marginBottom: 12 }}>DAY ANCHORS</p>

        <Row label="☀ Wake up"><input type="time" value={a.wake} onChange={e => set({ wake: e.target.value })} style={timeInp} /></Row>
        <Row label="🌙 Bedtime"><input type="time" value={a.sleep} onChange={e => set({ sleep: e.target.value })} style={timeInp} /></Row>
        <Row label={`😴 Sleep length · ${sleepHours(a)}h`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {[6, 7, 8, 9].map(h => {
              const on = Math.round(sleepHours(a)) === h
              return (
                <button key={h} onClick={() => {
                  // set bedtime = wake − h hours
                  const bed = ((toMin(a.wake) - h * 60) % 1440 + 1440) % 1440
                  set({ sleep: `${String(Math.floor(bed / 60)).padStart(2, '0')}:${String(bed % 60).padStart(2, '0')}` })
                }} style={{
                  ...timeInp, padding: '4px 8px', cursor: 'pointer',
                  color: on ? NEON : 'rgba(148,163,184,0.4)',
                  borderColor: on ? `${NEON}40` : 'rgba(255,255,255,0.08)',
                }}>{h}h</button>
              )
            })}
          </div>
        </Row>
        <Row label={`☕ Break between activities · ${a.breakMin}m`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {[0, 5, 10, 15].map(m => {
              const on = a.breakMin === m
              return (
                <button key={m} onClick={() => set({ breakMin: m })} style={{
                  ...timeInp, padding: '4px 8px', cursor: 'pointer',
                  color: on ? NEON : 'rgba(148,163,184,0.4)',
                  borderColor: on ? `${NEON}40` : 'rgba(255,255,255,0.08)',
                }}>{m === 0 ? 'none' : `${m}m`}</button>
              )
            })}
          </div>
        </Row>

        <div style={{ height: 1, background: `${NEON}12`, margin: '6px 0 10px' }} />
        {mealRow('breakfast', '🍽 Breakfast')}
        {mealRow('lunch', '🍽 Lunch')}
        {mealRow('dinner', '🍽 Dinner')}

        <div style={{ height: 1, background: `${NEON}12`, margin: '6px 0 10px' }} />
        <Row label="💼 Work block">
          <button onClick={() => set({ workEnabled: !a.workEnabled })} style={{
            ...timeInp, cursor: 'pointer', color: a.workEnabled ? NEON : 'rgba(148,163,184,0.4)',
            borderColor: a.workEnabled ? `${NEON}40` : 'rgba(255,255,255,0.08)',
          }}>{a.workEnabled ? 'ON' : 'OFF'}</button>
        </Row>
        {a.workEnabled && (
          <Row label="">
            <input type="time" value={a.workStart} onChange={e => set({ workStart: e.target.value })} style={timeInp} />
            <span style={{ color: `${NEON}50` }}>→</span>
            <input type="time" value={a.workEnd} onChange={e => set({ workEnd: e.target.value })} style={timeInp} />
          </Row>
        )}

        <button onClick={() => { onSave(a); onClose() }} style={{
          width: '100%', marginTop: 12, padding: '10px', borderRadius: 7, cursor: 'pointer',
          fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 800, letterSpacing: '0.12em',
          color: NEON, border: `1px solid ${NEON}40`, background: NEON_D,
        }}>SAVE ANCHORS</button>
      </div>
    </div>
  )
}

// ─── Add-event sheet ──────────────────────────────────────────────────────────
function EventSheet({ onSave, onClose }: {
  onSave: (e: Omit<DayEvent, 'id'>) => void; onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('15:00')
  const [end, setEnd]     = useState('16:00')
  const valid = title.trim() !== '' && toMin(end) > toMin(start)
  const inp: React.CSSProperties = {
    padding: '6px 9px', borderRadius: 5, background: 'rgba(0,0,0,0.5)',
    border: `1px solid ${NEON}25`, outline: 'none', fontFamily: 'var(--font)',
    fontSize: 'var(--fs-sm)', color: 'rgba(220,250,255,0.9)',
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', background: 'rgba(4,12,16,0.98)', borderTop: `1px solid ${NEON}30`,
        backdropFilter: 'blur(20px)', padding: '16px', display: 'flex', flexDirection: 'column', gap: 9,
        borderTopLeftRadius: 14, borderTopRightRadius: 14,
      }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 800, color: NEON,
          letterSpacing: '0.2em' }}>SOMETHING CAME UP</p>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Event…" style={{ ...inp }} autoFocus />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="time" value={start} onChange={e => setStart(e.target.value)} style={inp} />
          <span style={{ color: `${NEON}50` }}>→</span>
          <input type="time" value={end} onChange={e => setEnd(e.target.value)} style={inp} />
        </div>
        <button disabled={!valid} onClick={() => valid && (onSave({ title: title.trim(), start, end }), onClose())}
          style={{ padding: '9px', borderRadius: 7, cursor: valid ? 'pointer' : 'default',
            fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 800, letterSpacing: '0.12em',
            color: valid ? NEON : 'rgba(148,163,184,0.25)',
            border: `1px solid ${valid ? `${NEON}40` : 'rgba(255,255,255,0.05)'}`,
            background: valid ? NEON_D : 'transparent' }}>+ BLOCK THE TIME</button>
      </div>
    </div>
  )
}

// ─── Main module ──────────────────────────────────────────────────────────────
export default function Infinity8() {
  const [state, setState] = useState<Inf8State>(() => loadInf8State())
  const [refresh, setRefresh] = useState(0)
  const [sheet, setSheet] = useState<'anchors' | 'event' | null>(null)
  const [nowMin, setNowMin] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() })
  const [optimizing, setOptimizing] = useState(false)
  const [optError, setOptError]     = useState('')
  const [optResult, setOptResult]   = useState<OptimizeResult | null>(null)

  const persist = useCallback((s: Inf8State) => { saveInf8State(s); setState(s) }, [])
  const today = todayKey()
  const eff = effectiveAnchors(state, today)

  // Refresh when SCRAP-7 changes elsewhere, and tick the "now" line each minute
  useEffect(() => {
    const onSync = () => setRefresh(r => r + 1)
    window.addEventListener('warren:sync', onSync)
    const id = setInterval(() => { const d = new Date(); setNowMin(d.getHours() * 60 + d.getMinutes()) }, 60000)
    return () => { window.removeEventListener('warren:sync', onSync); clearInterval(id) }
  }, [])

  const commitments = useMemo(() => getTodayCommitments(state.durations, state.prefTime), [state.durations, state.prefTime, refresh])
  const plan = useMemo(() => buildDay(eff, commitments, state.events[today] ?? []),
    [eff, commitments, state.events, today])

  // ── Smart weekly optimize (AI rewrites SCRAP-7 schedules) ──
  const runOptimize = async () => {
    setOptimizing(true); setOptError(''); setOptResult(null)
    try {
      const settings = loadSettings()
      const tasks = loadScrap7().tasks
      const recurring = tasks.filter(t =>
        (t.taskType === 'daily') || (t.taskType === 'habit' && (t.direction ?? 'positive') === 'positive'))
      const list = recurring.map(t => {
        const sch = t.schedule
        const when = !sch || sch.type === 'everyday' ? 'everyday' : (sch.days ?? []).join('/')
        return `- {id:"${t.id}", name:"${t.text}", kind:"${t.taskType}", current:"${when}"}`
      }).join('\n')
      const msg = `Wake ${eff.wake}, bedtime ${eff.sleep} (${sleepHours(eff)}h sleep). Break between activities: ${eff.breakMin}min.
Recurring commitments:\n${list || '(none)'}\n\nRebalance the week so no single day is overloaded.`
      const raw = await aiChat([
        { role: 'system', content: OPTIMIZE_SYSTEM },
        { role: 'user',   content: msg },
      ], settings, { model: modelForTask(settings, 'infinity8.optimize'), maxTokens: 1800 })
      const clean = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
      const s = clean.indexOf('{'), e = clean.lastIndexOf('}')
      const parsed = JSON.parse(clean.slice(s, e + 1))
      const normDays = (d: unknown): string[] | 'everyday' => {
        if (d === 'everyday' || d == null) return 'everyday'
        if (Array.isArray(d)) { const f = d.map(String).filter(x => DAY_KEYS.includes(x)); return f.length ? f : 'everyday' }
        return 'everyday'
      }
      const normPeriod = (p: unknown): Period =>
        (['morning', 'midday', 'afternoon', 'evening'] as Period[]).includes(p as Period) ? p as Period : 'midday'
      setOptResult({
        rationale: String(parsed.rationale ?? ''),
        changes: Array.isArray(parsed.changes) ? parsed.changes
          .filter((c: { id?: unknown }) => recurring.some(t => t.id === c.id))
          .map((c: { id: string; label?: unknown; days?: unknown; bestTime?: unknown; note?: unknown }) => ({
            id: c.id, label: String(c.label ?? recurring.find(t => t.id === c.id)?.text ?? ''),
            days: normDays(c.days), bestTime: normPeriod(c.bestTime), note: String(c.note ?? ''),
          })) : [],
        additions: Array.isArray(parsed.additions) ? parsed.additions
          .map((a: { text?: unknown; type?: unknown; days?: unknown; bestTime?: unknown; note?: unknown }) => ({
            text: String(a.text ?? '').trim(),
            type: a.type === 'habit' ? 'habit' as const : 'daily' as const,
            days: normDays(a.days), bestTime: normPeriod(a.bestTime), note: String(a.note ?? ''),
          })).filter((a: OptAddition) => a.text.length > 1) : [],
      })
    } catch (err) {
      setOptError(err instanceof Error ? err.message : 'Optimize failed. Check AI settings.')
    }
    setOptimizing(false)
  }

  const applyChange = (c: OptChange) => {
    let s7 = loadScrap7()
    s7 = updateTask(s7, c.id, { schedule: c.days === 'everyday' ? { type: 'everyday' } : { type: 'weekly', days: c.days } })
    saveScrap7(s7)
    persist(setPrefTimes(state, { [c.id]: c.bestTime }))
    window.dispatchEvent(new CustomEvent('warren:sync', { detail: { source: 'infinity8' } }))
    setRefresh(r => r + 1)
    setOptResult(prev => prev ? { ...prev, changes: prev.changes.filter(x => x.id !== c.id) } : prev)
  }
  const applyAddition = (a: OptAddition, idx: number) => {
    let s7 = loadScrap7()
    s7 = createTask(s7, {
      text: a.text, category: 'Goals', taskType: a.type, direction: 'positive',
      schedule: a.days === 'everyday' ? { type: 'everyday' } : { type: 'weekly', days: a.days },
    })
    saveScrap7(s7)
    window.dispatchEvent(new CustomEvent('warren:sync', { detail: { source: 'infinity8' } }))
    setRefresh(r => r + 1)
    setOptResult(prev => prev ? { ...prev, additions: prev.additions.filter((_, i) => i !== idx) } : prev)
  }

  // Toggle a commitment's done state directly in SCRAP-7
  const toggleCommitment = (b: Block) => {
    if (!b.taskId) return
    let s7 = loadScrap7()
    if (b.commitKind === 'daily') {
      s7 = b.done ? uncompleteTask(s7, b.taskId) : completeTask(s7, b.taskId)
    } else {
      if (b.done) return            // habits only increment from here
      s7 = trackHabit(s7, b.taskId).state
    }
    saveScrap7(s7)
    window.dispatchEvent(new CustomEvent('warren:sync', { detail: { source: 'infinity8' } }))
    setRefresh(r => r + 1)
  }

  const pct = plan.committedCount > 0 ? Math.round(plan.doneCount / plan.committedCount * 100) : 100
  const allDone = plan.committedCount > 0 && plan.doneCount === plan.committedCount
  const noCommit = plan.committedCount === 0

  // Banner content (the guilt-free core)
  const banner = noCommit
    ? { color: '#39ff14', title: 'NOTHING SCHEDULED', sub: `${fmtDur(plan.freeMinutes)} of open day — it's all yours.` }
    : allDone
      ? { color: '#39ff14', title: '✓ DAY CLEARED', sub: `Everything's done. The next ${fmtDur(plan.freeMinutes)} are yours — go enjoy them, guilt-free.` }
      : { color: NEON, title: `${plan.doneCount}/${plan.committedCount} DONE`, sub: `${fmtDur(plan.freeMinutes)} free once you finish. Knock them out, then relax.` }

  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '8px 14px', flexShrink: 0, borderBottom: `1px solid ${NEON}14`,
        background: 'rgba(2,10,14,0.6)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 900, color: NEON,
            letterSpacing: '0.22em', textShadow: `0 0 12px ${NEON}` }}>∞ INFINITY-8</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 6.5, color: `${NEON}45`, letterSpacing: '0.12em' }}>
            {new Date().toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase()}
          </p>
        </div>
        {/* Free time headline */}
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 17, fontWeight: 900,
            color: '#39ff14', lineHeight: 1, textShadow: '0 0 12px rgba(57,255,20,0.5)' }}>
            {fmtDur(plan.freeMinutes)}</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 6.5, color: 'rgba(57,255,20,0.5)',
            letterSpacing: '0.12em' }}>FREE TODAY</p>
        </div>
        <button onClick={() => setSheet('event')} title="Something came up (meeting, cinema…)" style={{
          width: 28, height: 28, borderRadius: 7, fontSize: 15, color: `${NEON}80`,
          border: `1px solid ${NEON}25`, background: NEON_D, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>+</button>
        <button onClick={() => setSheet('anchors')} title="Day anchors (wake / sleep / breaks)" style={{
          width: 28, height: 28, borderRadius: 7, fontSize: 13, color: `${NEON}70`,
          border: `1px solid ${NEON}25`, background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>⚙</button>
      </div>

      {/* Adaptation strip: overslept + optimize */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 10px 0', flexShrink: 0 }}>
        <button onClick={() => {
          const d = new Date(); const wk = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
          persist(setOverride(state, today, { wake: wk }))
        }} title="Reflow today from now" style={{
          flex: 1, padding: '6px', borderRadius: 6, cursor: 'pointer',
          fontFamily: 'var(--font)', fontSize: 7.5, fontWeight: 700, letterSpacing: '0.08em',
          color: '#ffb13c', border: '1px solid rgba(255,177,60,0.3)', background: 'rgba(255,177,60,0.06)',
        }}>😴 OVERSLEPT — RESHUFFLE</button>
        {state.overrides[today] && (
          <button onClick={() => persist(clearOverride(state, today))} title="Back to normal anchors" style={{
            padding: '6px 9px', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font)',
            fontSize: 7.5, fontWeight: 700, color: 'rgba(148,163,184,0.5)',
            border: '1px solid rgba(255,255,255,0.08)', background: 'transparent',
          }}>RESET</button>
        )}
        <button onClick={runOptimize} disabled={optimizing} title="Rebalance the week with science" style={{
          flex: 1, padding: '6px', borderRadius: 6, cursor: optimizing ? 'default' : 'pointer',
          fontFamily: 'var(--font)', fontSize: 7.5, fontWeight: 800, letterSpacing: '0.08em',
          color: optimizing ? `${NEON}50` : NEON, border: `1px solid ${NEON}35`, background: NEON_D,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        }}>
          <span style={{ animation: optimizing ? 'pulse 1.2s ease-in-out infinite' : 'none' }}>⚡</span>
          {optimizing ? 'OPTIMIZING…' : 'OPTIMIZE WEEK'}
        </button>
      </div>

      {/* Guilt-free banner */}
      <div style={{ margin: '8px 10px', padding: '10px 14px', borderRadius: 10, flexShrink: 0,
        backgroundColor: 'rgba(4,12,16,0.7)',
        border: `1px solid ${banner.color}40`,
        boxShadow: `inset 0 0 0 400px ${banner.color}10${allDone || noCommit ? `, 0 0 22px ${banner.color}20` : ''}`,
        display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 900,
            color: banner.color, letterSpacing: '0.14em', textShadow: `0 0 8px ${banner.color}70` }}>
            {banner.title}</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: `${banner.color}90`,
            lineHeight: 1.5, marginTop: 3 }}>{banner.sub}</p>
        </div>
        {plan.committedCount > 0 && (
          <div style={{ position: 'relative', width: 38, height: 38, flexShrink: 0 }}>
            <svg width="38" height="38" viewBox="0 0 38 38" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="19" cy="19" r="15" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
              <circle cx="19" cy="19" r="15" fill="none" stroke={banner.color} strokeWidth="3" strokeLinecap="round"
                strokeDasharray={`${(pct / 100) * 2 * Math.PI * 15} ${2 * Math.PI * 15}`}
                style={{ filter: `drop-shadow(0 0 4px ${banner.color})`, transition: 'stroke-dasharray 0.5s' }} />
            </svg>
            <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontFamily: 'var(--font)', fontSize: 9, fontWeight: 900,
              color: banner.color }}>{pct}%</span>
          </div>
        )}
      </div>

      {/* Optimize error */}
      {optError && (
        <div style={{ margin: '6px 10px 0', padding: '8px 10px', borderRadius: 7, flexShrink: 0,
          background: 'rgba(255,0,51,0.05)', border: '1px solid rgba(255,0,51,0.2)' }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: '#ff4444' }}>{optError}</p>
        </div>
      )}

      {/* Proportional timeline */}
      <Timeline
        blocks={plan.blocks}
        wakeMin={toMin(eff.wake)}
        sleepMin={toMin(eff.sleep)}
        nowMin={nowMin}
        onToggle={toggleCommitment}
        onRemoveEvent={id => persist(removeEvent(state, today, id))}
      />

      {/* Optimize proposal */}
      {optResult && (
        <OptimizePanel result={optResult} onApplyChange={applyChange} onApplyAddition={applyAddition}
          onClose={() => setOptResult(null)} />
      )}

      {sheet === 'anchors' && (
        <AnchorSheet anchors={state.anchors} onSave={p => persist(setAnchors(state, p))} onClose={() => setSheet(null)} />
      )}
      {sheet === 'event' && (
        <EventSheet onSave={e => persist(addEvent(state, today, e))} onClose={() => setSheet(null)} />
      )}
    </div>
  )
}

// ─── Optimize proposal sheet ──────────────────────────────────────────────────
function OptimizePanel({ result, onApplyChange, onApplyAddition, onClose }: {
  result: OptimizeResult
  onApplyChange: (c: OptChange) => void
  onApplyAddition: (a: OptAddition, idx: number) => void
  onClose: () => void
}) {
  const periodColor: Record<Period, string> = {
    morning: '#ffb13c', midday: '#39ff14', afternoon: '#7c83ff', evening: '#bf5fff',
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxHeight: '85%', overflowY: 'auto',
        background: 'rgba(4,12,16,0.98)', borderTop: `1px solid ${NEON}35`,
        backdropFilter: 'blur(20px)', borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: '14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 13 }}>⚡</span>
          <p style={{ flex: 1, fontFamily: 'var(--font)', fontSize: 9, fontWeight: 900, color: NEON,
            letterSpacing: '0.2em' }}>WEEK REBALANCED</p>
          <button onClick={onClose} style={{ fontSize: 15, color: 'rgba(148,163,184,0.4)', cursor: 'pointer' }}>×</button>
        </div>

        {result.rationale && (
          <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: `${NEON}85`,
            lineHeight: 1.6, fontStyle: 'italic', borderLeft: `2px solid ${NEON}30`, paddingLeft: 8, marginBottom: 12 }}>
            {result.rationale}
          </p>
        )}

        {result.changes.length > 0 && (
          <>
            <p style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700, color: `${NEON}45`,
              letterSpacing: '0.18em', marginBottom: 6 }}>RESCHEDULE IN SCRAP-7</p>
            {result.changes.map(c => (
              <div key={c.id} style={{ marginBottom: 7, padding: '8px 10px', borderRadius: 8,
                background: `${NEON}06`, border: `1px solid ${NEON}1f` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <p style={{ flex: 1, fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 700,
                    color: 'rgba(220,250,255,0.9)' }}>{c.label}</p>
                  <span style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 800,
                    color: periodColor[c.bestTime], letterSpacing: '0.06em', textTransform: 'uppercase' }}>{c.bestTime}</span>
                  <span style={{ fontFamily: 'var(--font)', fontSize: 8, fontWeight: 800, color: NEON,
                    letterSpacing: '0.1em' }}>{daysLabel(c.days)}</span>
                </div>
                {c.note && <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: 'rgba(148,163,184,0.5)', marginTop: 2 }}>{c.note}</p>}
                <button onClick={() => onApplyChange(c)} style={{
                  marginTop: 6, width: '100%', padding: '5px', borderRadius: 5, cursor: 'pointer',
                  fontFamily: 'var(--font)', fontSize: 8, fontWeight: 800, letterSpacing: '0.1em',
                  color: NEON, border: `1px solid ${NEON}35`, background: NEON_D,
                }}>✓ APPLY</button>
              </div>
            ))}
          </>
        )}

        {result.additions.length > 0 && (
          <>
            <p style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700, color: '#39ff14',
              letterSpacing: '0.18em', margin: '10px 0 6px' }}>SUGGESTED ADDITIONS</p>
            {result.additions.map((a, i) => (
              <div key={i} style={{ marginBottom: 7, padding: '8px 10px', borderRadius: 8,
                background: 'rgba(57,255,20,0.04)', border: '1px solid rgba(57,255,20,0.18)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <p style={{ flex: 1, fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 700,
                    color: 'rgba(230,255,235,0.9)' }}>{a.text}</p>
                  <span style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700, color: 'rgba(57,255,20,0.7)',
                    letterSpacing: '0.06em' }}>{a.type.toUpperCase()}</span>
                  <span style={{ fontFamily: 'var(--font)', fontSize: 8, fontWeight: 800, color: '#39ff14' }}>{daysLabel(a.days)}</span>
                </div>
                {a.note && <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: 'rgba(148,163,184,0.5)', marginTop: 2 }}>{a.note}</p>}
                <button onClick={() => onApplyAddition(a, i)} style={{
                  marginTop: 6, width: '100%', padding: '5px', borderRadius: 5, cursor: 'pointer',
                  fontFamily: 'var(--font)', fontSize: 8, fontWeight: 800, letterSpacing: '0.1em',
                  color: '#39ff14', border: '1px solid rgba(57,255,20,0.35)', background: 'rgba(57,255,20,0.06)',
                }}>+ ADD TO SCRAP-7</button>
              </div>
            ))}
          </>
        )}

        {result.changes.length === 0 && result.additions.length === 0 && (
          <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: `${NEON}60`,
            textAlign: 'center', padding: '10px' }}>Your week is already well balanced. ✓</p>
        )}
      </div>
    </div>
  )
}

// ─── Proportional timeline ────────────────────────────────────────────────────
// Block HEIGHT = duration, against an hour grid, so you see the day to scale.
const PPM    = 1.75           // pixels per minute (1 hour ≈ 105px; 20 min ≈ 35px)
const GUTTER = 42             // left hour-label column
const TOP_PAD = 18           // room above for the WAKE cap

function Timeline({ blocks, wakeMin, sleepMin, nowMin, onToggle, onRemoveEvent }: {
  blocks: Block[]
  wakeMin: number; sleepMin: number; nowMin: number
  onToggle: (b: Block) => void
  onRemoveEvent: (id: string) => void
}) {
  const lastEnd = blocks.reduce((m, b) => Math.max(m, b.end), sleepMin)
  const start = wakeMin
  const end   = Math.max(sleepMin, lastEnd)
  const y = (min: number) => (min - start) * PPM + TOP_PAD
  const H = y(end) + 24

  const hours: number[] = []
  for (let h = Math.ceil(start / 60); h <= Math.floor(end / 60); h++) hours.push(h * 60)

  const showNow = nowMin >= start && nowMin <= end

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {/* Scrim panel — keeps the timeline readable over a transparent window / wallpaper */}
      <div style={{ position: 'relative', height: H, margin: '4px 10px 16px',
        background: 'rgba(3,10,14,0.55)', borderRadius: 10 }}>

        {/* Hour grid */}
        {hours.map(h => (
          <div key={h} style={{ position: 'absolute', top: y(h), left: 0, right: 0, height: 0 }}>
            <span style={{ position: 'absolute', left: 0, top: -6, width: GUTTER - 6,
              textAlign: 'right', fontFamily: 'var(--font)', fontSize: 8, fontWeight: 700,
              color: `${NEON}45`, letterSpacing: '0.04em' }}>{fmtClock(h)}</span>
            <div style={{ position: 'absolute', left: GUTTER, right: 0, top: 0,
              borderTop: '1px solid rgba(34,211,238,0.08)' }} />
          </div>
        ))}

        {/* Wake / sleep caps */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex',
          alignItems: 'center', gap: 6, paddingLeft: GUTTER }}>
          <span style={{ fontSize: 9 }}>☀</span>
          <span style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700, color: `${NEON}50`,
            letterSpacing: '0.18em' }}>WAKE {fmtClock(wakeMin)}</span>
        </div>
        <div style={{ position: 'absolute', top: y(sleepMin) + 4, left: 0, right: 0, display: 'flex',
          alignItems: 'center', gap: 6, paddingLeft: GUTTER }}>
          <span style={{ fontSize: 9 }}>🌙</span>
          <span style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700, color: `${NEON}50`,
            letterSpacing: '0.18em' }}>SLEEP {fmtClock(sleepMin)}</span>
        </div>

        {/* Blocks */}
        {blocks.map(b => (
          <TimelineBlock key={b.id} b={b} top={y(b.start)} height={(b.end - b.start) * PPM}
            isNow={nowMin >= b.start && nowMin < b.end}
            onToggle={() => onToggle(b)}
            onRemoveEvent={b.kind === 'event' ? () => onRemoveEvent(b.id) : undefined} />
        ))}

        {/* Now line */}
        {showNow && (
          <div style={{ position: 'absolute', top: y(nowMin), left: GUTTER - 4, right: 0, height: 0, zIndex: 8 }}>
            <div style={{ position: 'absolute', left: 0, top: -3, width: 6, height: 6, borderRadius: '50%',
              background: '#ff5470', boxShadow: '0 0 6px #ff5470' }} />
            <div style={{ position: 'absolute', left: 4, right: 0, top: 0,
              borderTop: '1px solid rgba(255,84,112,0.6)' }} />
          </div>
        )}
      </div>
    </div>
  )
}

function TimelineBlock({ b, top, height, isNow, onToggle, onRemoveEvent }: {
  b: Block; top: number; height: number; isNow: boolean
  onToggle: () => void; onRemoveEvent?: () => void
}) {
  const [hov, setHov] = useState(false)
  const color = BLOCK_COLOR[b.kind]
  const isCommit = b.kind === 'commitment'
  const isFree   = b.kind === 'free'
  const h        = Math.max(16, height - 2)
  const tall     = h >= 44   // room for badges

  // Break: faint hatch band (still proportional)
  if (b.kind === 'break') {
    return (
      <div style={{ position: 'absolute', left: GUTTER, right: 0, top, height,
        display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 6, opacity: 0.5 }}>
        <span style={{ fontFamily: 'var(--font)', fontSize: 7, color: 'rgba(148,163,184,0.5)',
          letterSpacing: '0.12em', flexShrink: 0 }}>↔ break</span>
        <div style={{ flex: 1, borderTop: '1px dashed rgba(148,163,184,0.18)' }} />
      </div>
    )
  }

  const liveColor = isNow && !isFree ? color : isFree ? `${color}40` : `${color}30`

  // Opaque dark base + translucent color overlay (inset) → tinted but readable over any wallpaper
  const baseBg = isFree ? 'rgba(8,20,14,0.30)' : isNow ? 'rgba(13,26,32,0.94)' : 'rgba(9,18,23,0.88)'
  const tint   = isFree ? 'none' : `inset 0 0 0 400px ${color}${isNow ? '1c' : '12'}`

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ position: 'absolute', left: GUTTER, right: 0, top: top + 1, height: h,
        borderRadius: 7, overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 7, padding: '0 9px',
        backgroundColor: baseBg,
        border: `1px solid ${liveColor}`,
        borderLeft: `3px solid ${isFree ? `${color}50` : color}`,
        borderStyle: isFree ? 'dashed' : 'solid',
        boxShadow: isNow && !isFree ? `0 0 14px ${color}55, ${tint}` : isFree ? 'none' : tint,
        opacity: b.done ? 0.5 : 1, transition: 'all 0.2s',
        zIndex: isNow ? 6 : 1,
      }}>
      {isCommit ? (
        <button onClick={onToggle} title={b.done ? 'Done' : 'Mark done'} style={{
          width: 16, height: 16, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
          border: `1.5px solid ${b.done ? color : `${color}55`}`,
          background: b.done ? `${color}22` : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color,
        }}>{b.done ? '✓' : ''}</button>
      ) : (
        <span style={{ fontSize: 12, flexShrink: 0, opacity: isFree ? 0.6 : 1 }}>{BLOCK_ICON[b.kind]}</span>
      )}

      <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)',
        fontWeight: isNow ? 700 : 400,
        color: isFree ? 'rgba(57,255,20,0.6)' : 'rgba(225,250,255,0.92)',
        letterSpacing: '0.02em', textDecoration: b.done ? 'line-through' : 'none',
        textShadow: '0 1px 4px rgba(0,0,0,0.55)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {isFree ? `Free · ${fmtDur(b.end - b.start)}` : b.label}
      </span>

      {isNow && (
        <span style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 900, color,
          letterSpacing: '0.1em', flexShrink: 0, padding: '1px 5px', borderRadius: 3,
          border: `1px solid ${color}`, animation: 'pulse 1.8s ease-in-out infinite' }}>● NOW</span>
      )}
      {isCommit && tall && !isNow && (
        <span style={{ fontFamily: 'var(--font)', fontSize: 6.5, fontWeight: 700, color: `${color}90`,
          letterSpacing: '0.1em', flexShrink: 0, padding: '1px 5px', borderRadius: 3, border: `1px solid ${color}30` }}>
          {b.commitKind === 'habit' ? 'HABIT' : 'DAILY'}
        </span>
      )}
      {!isFree && (
        <span style={{ fontFamily: 'var(--font)', fontSize: 7.5, color: 'rgba(148,163,184,0.5)', flexShrink: 0 }}>
          {fmtDur(b.end - b.start)}
        </span>
      )}
      {onRemoveEvent && hov && (
        <button onClick={onRemoveEvent} style={{ fontSize: 13, color: 'rgba(255,0,51,0.4)',
          flexShrink: 0, cursor: 'pointer' }}>×</button>
      )}
    </div>
  )
}
