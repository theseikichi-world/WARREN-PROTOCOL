import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { gatherSuggestions, assignToFreeBlocks, type Suggestion } from './suggestions'
import {
  loadInf8State, saveInf8State, type Inf8State,
  type Anchors, type DayEvent, type Block, type Period,
  getTodayCommitments, buildDay, todayKey, effectiveAnchors, sleepHours,
  fmtClock, fmtDur, toMin,
  setAnchors, addEvent, removeEvent, setOverride, clearOverride, setPrefTimes,
} from './store'
import {
  loadState as loadScrap7, saveState as saveScrap7,
  updateTask, createTask,
} from '../scrap7/store'
import { aiJson, loadSettings, modelForTask } from '../../settings'
import { t as tr } from '../../i18n'

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
// Guild-suggestion tone palette: play = entertainment, grow = progress, care = wellbeing
const TONE: Record<Suggestion['tone'], string> = {
  play: '#ff8a4c', grow: '#8b9bff', care: '#ffd76b',
}

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_SHORT: Record<string, string> = { mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S', sun: 'S' }
const daysLabel = (d: string[] | 'everyday') => d === 'everyday' ? tr('Every day', 'Каждый день') : d.map(k => DAY_SHORT[k] ?? k).join(' ')

// Localized labels for AI-returned periods and SCRAP-7 task kinds
const periodLabel = (p: Period) =>
  ({ morning: tr('morning', 'утро'), midday: tr('midday', 'полдень'),
     afternoon: tr('afternoon', 'день'), evening: tr('evening', 'вечер') }[p] ?? p)
const kindLabel = (k: 'habit' | 'daily') =>
  k === 'habit' ? tr('HABIT', 'ПРИВЫЧКА') : tr('DAILY', 'ЕЖЕДН.')

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
          style={{ ...timeInp, color: `${NEON}50`, cursor: 'pointer' }}>{tr('+ add', '+ доб.')}</button>
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
          letterSpacing: '0.2em', marginBottom: 12 }}>{tr('DAY ANCHORS', 'ОПОРЫ ДНЯ')}</p>

        <Row label={tr('☀ Wake up', '☀ Подъём')}><input type="time" value={a.wake} onChange={e => set({ wake: e.target.value })} style={timeInp} /></Row>
        <Row label={tr('🌙 Bedtime', '🌙 Отбой')}><input type="time" value={a.sleep} onChange={e => set({ sleep: e.target.value })} style={timeInp} /></Row>
        <Row label={`${tr('😴 Sleep length', '😴 Длина сна')} · ${sleepHours(a)}${tr('h', 'ч')}`}>
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
                }}>{h}{tr('h', 'ч')}</button>
              )
            })}
          </div>
        </Row>
        <Row label={`${tr('☕ Break between activities', '☕ Перерыв между делами')} · ${a.breakMin}${tr('m', 'м')}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {[0, 5, 10, 15].map(m => {
              const on = a.breakMin === m
              return (
                <button key={m} onClick={() => set({ breakMin: m })} style={{
                  ...timeInp, padding: '4px 8px', cursor: 'pointer',
                  color: on ? NEON : 'rgba(148,163,184,0.4)',
                  borderColor: on ? `${NEON}40` : 'rgba(255,255,255,0.08)',
                }}>{m === 0 ? tr('none', 'нет') : `${m}${tr('m', 'м')}`}</button>
              )
            })}
          </div>
        </Row>

        <div style={{ height: 1, background: `${NEON}12`, margin: '6px 0 10px' }} />
        {mealRow('breakfast', tr('🍽 Breakfast', '🍽 Завтрак'))}
        {mealRow('lunch', tr('🍽 Lunch', '🍽 Обед'))}
        {mealRow('dinner', tr('🍽 Dinner', '🍽 Ужин'))}

        <div style={{ height: 1, background: `${NEON}12`, margin: '6px 0 10px' }} />
        <Row label={tr('💼 Work block', '💼 Рабочий блок')}>
          <button onClick={() => set({ workEnabled: !a.workEnabled })} style={{
            ...timeInp, cursor: 'pointer', color: a.workEnabled ? NEON : 'rgba(148,163,184,0.4)',
            borderColor: a.workEnabled ? `${NEON}40` : 'rgba(255,255,255,0.08)',
          }}>{a.workEnabled ? tr('ON', 'ВКЛ') : tr('OFF', 'ВЫКЛ')}</button>
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
        }}>{tr('SAVE ANCHORS', 'СОХРАНИТЬ ОПОРЫ')}</button>
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
          letterSpacing: '0.2em' }}>{tr('SOMETHING CAME UP', 'ЧТО-ТО ВОЗНИКЛО')}</p>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={tr('Event…', 'Событие…')} style={{ ...inp }} autoFocus />
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
            background: valid ? NEON_D : 'transparent' }}>{tr('+ BLOCK THE TIME', '+ ЗАНЯТЬ ВРЕМЯ')}</button>
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

  const navigate = useNavigate()

  const commitments = useMemo(() => getTodayCommitments(state.durations, state.prefTime), [state.durations, state.prefTime, refresh])
  const plan = useMemo(() => buildDay(eff, commitments, state.events[today] ?? []),
    [eff, commitments, state.events, today])

  // Overnight schedules (bedtime past midnight): roll sleep + the "now" marker
  // past 24:00 so they land in the same awake window the timeline draws.
  const wakeRaw = toMin(eff.wake)
  const overnight = toMin(eff.sleep) <= wakeRaw
  const sleepAdj = overnight ? toMin(eff.sleep) + 1440 : toMin(eff.sleep)
  const nowAdj = overnight && nowMin < wakeRaw ? nowMin + 1440 : nowMin

  // GUILD SUGGESTS — natural invitations spread across the day's free blocks
  const suggestions = useMemo(() => gatherSuggestions(), [refresh])
  const freeSuggestions = useMemo(() => {
    const free = plan.blocks
      .filter(b => b.kind === 'free' && b.end > nowAdj && (b.end - b.start) >= 25)
      .map(b => ({ id: b.id, minutes: b.end - b.start }))
    return assignToFreeBlocks(free, suggestions)
  }, [plan, suggestions, nowAdj])

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
      const parsed = await aiJson<Record<string, unknown>>([
        { role: 'system', content: OPTIMIZE_SYSTEM },
        { role: 'user',   content: msg },
      ], settings, { model: modelForTask(settings, 'infinity8.optimize'), maxTokens: 1800 })
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
      setOptError(err instanceof Error ? err.message : tr('Optimize failed. Check AI settings.', 'Не удалось оптимизировать. Проверьте настройки ИИ.'))
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

  // INFINITY-8 is a tracking VIEW — completion is owned by SCRAP-7 (and shown here
  // read-only), so you never mark the same thing done in two places.

  const pct = plan.committedCount > 0 ? Math.round(plan.doneCount / plan.committedCount * 100) : 100
  const allDone = plan.committedCount > 0 && plan.doneCount === plan.committedCount
  const noCommit = plan.committedCount === 0

  // Banner content (the guilt-free core)
  const banner = noCommit
    ? { color: '#39ff14', title: tr('NOTHING SCHEDULED', 'НИЧЕГО НЕ ЗАПЛАНИРОВАНО'), sub: tr(`${fmtDur(plan.freeMinutes)} of open day — it's all yours.`, `${fmtDur(plan.freeMinutes)} свободного дня — всё ваше.`) }
    : allDone
      ? { color: '#39ff14', title: tr('✓ DAY CLEARED', '✓ ДЕНЬ ОЧИЩЕН'), sub: tr(`Everything's done. The next ${fmtDur(plan.freeMinutes)} are yours — go enjoy them, guilt-free.`, `Всё сделано. Следующие ${fmtDur(plan.freeMinutes)} ваши — наслаждайтесь без чувства вины.`) }
      : { color: NEON, title: `${plan.doneCount}/${plan.committedCount} ${tr('DONE', 'ГОТОВО')}`, sub: tr(`${fmtDur(plan.freeMinutes)} free once you finish. Knock them out, then relax.`, `${fmtDur(plan.freeMinutes)} свободно, как закончите. Разделайтесь — и отдыхайте.`) }

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
            letterSpacing: '0.12em' }}>{tr('FREE TODAY', 'СВОБОДНО СЕГОДНЯ')}</p>
        </div>
        <button onClick={() => setSheet('event')} title={tr('Something came up (meeting, cinema…)', 'Что-то возникло (встреча, кино…)')} style={{
          width: 28, height: 28, borderRadius: 7, fontSize: 15, color: `${NEON}80`,
          border: `1px solid ${NEON}25`, background: NEON_D, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>+</button>
        <button onClick={() => setSheet('anchors')} title={tr('Day anchors (wake / sleep / breaks)', 'Опоры дня (подъём / сон / перерывы)')} style={{
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
        }} title={tr('Reflow today from now', 'Перестроить день с этого момента')} style={{
          flex: 1, padding: '6px', borderRadius: 6, cursor: 'pointer',
          fontFamily: 'var(--font)', fontSize: 7.5, fontWeight: 700, letterSpacing: '0.08em',
          color: '#ffb13c', border: '1px solid rgba(255,177,60,0.3)', background: 'rgba(255,177,60,0.06)',
        }}>{tr('😴 OVERSLEPT — RESHUFFLE', '😴 ПРОСПАЛ — ПЕРЕСТРОИТЬ')}</button>
        {state.overrides[today] && (
          <button onClick={() => persist(clearOverride(state, today))} title={tr('Back to normal anchors', 'Вернуть обычные опоры')} style={{
            padding: '6px 9px', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font)',
            fontSize: 7.5, fontWeight: 700, color: 'rgba(148,163,184,0.5)',
            border: '1px solid rgba(255,255,255,0.08)', background: 'transparent',
          }}>{tr('RESET', 'СБРОС')}</button>
        )}
        <button onClick={runOptimize} disabled={optimizing} title={tr('Rebalance the week with science', 'Перебалансировать неделю по науке')} style={{
          flex: 1, padding: '6px', borderRadius: 6, cursor: optimizing ? 'default' : 'pointer',
          fontFamily: 'var(--font)', fontSize: 7.5, fontWeight: 800, letterSpacing: '0.08em',
          color: optimizing ? `${NEON}50` : NEON, border: `1px solid ${NEON}35`, background: NEON_D,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        }}>
          <span style={{ animation: optimizing ? 'pulse 1.2s ease-in-out infinite' : 'none' }}>⚡</span>
          {optimizing ? tr('OPTIMIZING…', 'ОПТИМИЗАЦИЯ…') : tr('OPTIMIZE WEEK', 'ОПТИМИЗИРОВАТЬ НЕДЕЛЮ')}
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
        wakeMin={wakeRaw}
        sleepMin={sleepAdj}
        nowMin={nowAdj}
        suggestions={freeSuggestions}
        onRemoveEvent={id => persist(removeEvent(state, today, id))}
        onGo={path => navigate(path)}
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
            letterSpacing: '0.2em' }}>{tr('WEEK REBALANCED', 'НЕДЕЛЯ ПЕРЕБАЛАНСИРОВАНА')}</p>
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
              letterSpacing: '0.18em', marginBottom: 6 }}>{tr('RESCHEDULE IN SCRAP-7', 'ПЕРЕНЕСТИ В SCRAP-7')}</p>
            {result.changes.map(c => (
              <div key={c.id} style={{ marginBottom: 7, padding: '8px 10px', borderRadius: 8,
                background: `${NEON}06`, border: `1px solid ${NEON}1f` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <p style={{ flex: 1, fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 700,
                    color: 'rgba(220,250,255,0.9)' }}>{c.label}</p>
                  <span style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 800,
                    color: periodColor[c.bestTime], letterSpacing: '0.06em', textTransform: 'uppercase' }}>{periodLabel(c.bestTime)}</span>
                  <span style={{ fontFamily: 'var(--font)', fontSize: 8, fontWeight: 800, color: NEON,
                    letterSpacing: '0.1em' }}>{daysLabel(c.days)}</span>
                </div>
                {c.note && <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: 'rgba(148,163,184,0.5)', marginTop: 2 }}>{c.note}</p>}
                <button onClick={() => onApplyChange(c)} style={{
                  marginTop: 6, width: '100%', padding: '5px', borderRadius: 5, cursor: 'pointer',
                  fontFamily: 'var(--font)', fontSize: 8, fontWeight: 800, letterSpacing: '0.1em',
                  color: NEON, border: `1px solid ${NEON}35`, background: NEON_D,
                }}>{tr('✓ APPLY', '✓ ПРИМЕНИТЬ')}</button>
              </div>
            ))}
          </>
        )}

        {result.additions.length > 0 && (
          <>
            <p style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700, color: '#39ff14',
              letterSpacing: '0.18em', margin: '10px 0 6px' }}>{tr('SUGGESTED ADDITIONS', 'ПРЕДЛОЖЕННЫЕ ДОБАВЛЕНИЯ')}</p>
            {result.additions.map((a, i) => (
              <div key={i} style={{ marginBottom: 7, padding: '8px 10px', borderRadius: 8,
                background: 'rgba(57,255,20,0.04)', border: '1px solid rgba(57,255,20,0.18)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <p style={{ flex: 1, fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 700,
                    color: 'rgba(230,255,235,0.9)' }}>{a.text}</p>
                  <span style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700, color: 'rgba(57,255,20,0.7)',
                    letterSpacing: '0.06em' }}>{kindLabel(a.type)}</span>
                  <span style={{ fontFamily: 'var(--font)', fontSize: 8, fontWeight: 800, color: '#39ff14' }}>{daysLabel(a.days)}</span>
                </div>
                {a.note && <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: 'rgba(148,163,184,0.5)', marginTop: 2 }}>{a.note}</p>}
                <button onClick={() => onApplyAddition(a, i)} style={{
                  marginTop: 6, width: '100%', padding: '5px', borderRadius: 5, cursor: 'pointer',
                  fontFamily: 'var(--font)', fontSize: 8, fontWeight: 800, letterSpacing: '0.1em',
                  color: '#39ff14', border: '1px solid rgba(57,255,20,0.35)', background: 'rgba(57,255,20,0.06)',
                }}>{tr('+ ADD TO SCRAP-7', '+ ДОБАВИТЬ В SCRAP-7')}</button>
              </div>
            ))}
          </>
        )}

        {result.changes.length === 0 && result.additions.length === 0 && (
          <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: `${NEON}60`,
            textAlign: 'center', padding: '10px' }}>{tr('Your week is already well balanced.', 'Ваша неделя уже хорошо сбалансирована.')} ✓</p>
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

function Timeline({ blocks, wakeMin, sleepMin, nowMin, suggestions, onRemoveEvent, onGo }: {
  blocks: Block[]
  wakeMin: number; sleepMin: number; nowMin: number
  suggestions: Record<string, Suggestion[]>
  onRemoveEvent: (id: string) => void
  onGo: (path: string) => void
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
            letterSpacing: '0.18em' }}>{tr('WAKE', 'ПОДЪЁМ')} {fmtClock(wakeMin)}</span>
        </div>
        <div style={{ position: 'absolute', top: y(sleepMin) + 4, left: 0, right: 0, display: 'flex',
          alignItems: 'center', gap: 6, paddingLeft: GUTTER }}>
          <span style={{ fontSize: 9 }}>🌙</span>
          <span style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700, color: `${NEON}50`,
            letterSpacing: '0.18em' }}>{tr('SLEEP', 'СОН')} {fmtClock(sleepMin)}</span>
        </div>

        {/* Blocks */}
        {blocks.map(b => (
          <TimelineBlock key={b.id} b={b} top={y(b.start)} height={(b.end - b.start) * PPM}
            isNow={nowMin >= b.start && nowMin < b.end}
            suggestions={suggestions[b.id]}
            onRemoveEvent={b.kind === 'event' ? () => onRemoveEvent(b.id) : undefined}
            onGo={onGo} />
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

function TimelineBlock({ b, top, height, isNow, suggestions, onRemoveEvent, onGo }: {
  b: Block; top: number; height: number; isNow: boolean
  suggestions?: Suggestion[]
  onRemoveEvent?: () => void; onGo?: (path: string) => void
}) {
  const [hov, setHov] = useState(false)
  const color = BLOCK_COLOR[b.kind]
  const isCommit = b.kind === 'commitment'
  const isFree   = b.kind === 'free'
  const h        = Math.max(16, height - 2)
  const tall     = h >= 44   // room for badges

  // Free time with guild invitations — header + clickable suggestion chips
  if (isFree && suggestions && suggestions.length) {
    return (
      <div style={{ position: 'absolute', left: GUTTER, right: 0, top: top + 1, height: h,
        borderRadius: 7, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 3,
        padding: '4px 8px', backgroundColor: 'rgba(8,20,14,0.34)',
        border: '1px dashed rgba(57,255,20,0.28)', borderLeft: '3px dashed rgba(57,255,20,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11, opacity: 0.55 }}>✦</span>
          <span style={{ flex: 1, fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)',
            color: 'rgba(57,255,20,0.6)', letterSpacing: '0.02em',
            textShadow: '0 1px 4px rgba(0,0,0,0.55)' }}>{tr('Free', 'Свободно')} · {fmtDur(b.end - b.start)}</span>
          <span style={{ fontFamily: 'var(--font)', fontSize: 6.5, fontWeight: 800, letterSpacing: '0.14em',
            color: 'rgba(57,255,20,0.45)', flexShrink: 0 }}>{tr('GUILD SUGGESTS', 'ГИЛЬДИЯ СОВЕТУЕТ')}</span>
        </div>
        {suggestions.map(s => (
          <button key={s.id} onClick={() => onGo?.(s.path)} title={s.detail}
            style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left',
              padding: '4px 7px', borderRadius: 5, cursor: 'pointer', flexShrink: 0,
              background: `${TONE[s.tone]}12`, border: `1px solid ${TONE[s.tone]}40` }}>
            <span style={{ fontSize: 12, flexShrink: 0 }}>{s.icon}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <span style={{ display: 'block', fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)',
                fontWeight: 700, color: TONE[s.tone],
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
              {s.detail && (
                <span style={{ display: 'block', fontFamily: 'var(--font)', fontSize: 7,
                  color: 'rgba(148,163,184,0.6)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.detail}</span>
              )}
            </span>
            <span style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${TONE[s.tone]}cc`, flexShrink: 0 }}>
              ~{fmtDur(s.minutes)}
            </span>
          </button>
        ))}
      </div>
    )
  }

  // Break: faint hatch band (still proportional)
  if (b.kind === 'break') {
    return (
      <div style={{ position: 'absolute', left: GUTTER, right: 0, top, height,
        display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 6, opacity: 0.5 }}>
        <span style={{ fontFamily: 'var(--font)', fontSize: 7, color: 'rgba(148,163,184,0.5)',
          letterSpacing: '0.12em', flexShrink: 0 }}>↔ {tr('break', 'перерыв')}</span>
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
        /* Read-only status DOT (not a checkbox) — completion is owned by SCRAP-7; shown here just for tracking */
        <span title={b.done ? tr('Done (marked in SCRAP-7)', 'Готово (отмечено в SCRAP-7)') : tr('Still open — mark it in SCRAP-7', 'Ещё не сделано — отметьте в SCRAP-7')} style={{
          width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
          border: `1.5px solid ${b.done ? color : `${color}55`}`,
          background: b.done ? color : 'transparent',
          boxShadow: b.done ? `0 0 6px ${color}` : 'none',
        }} />
      ) : (
        <span style={{ fontSize: 12, flexShrink: 0, opacity: isFree ? 0.6 : 1 }}>{BLOCK_ICON[b.kind]}</span>
      )}

      <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)',
        fontWeight: isNow ? 700 : 400,
        color: isFree ? 'rgba(57,255,20,0.6)' : 'rgba(225,250,255,0.92)',
        letterSpacing: '0.02em', textDecoration: b.done ? 'line-through' : 'none',
        textShadow: '0 1px 4px rgba(0,0,0,0.55)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {isFree ? `${tr('Free', 'Свободно')} · ${fmtDur(b.end - b.start)}` : b.label}
      </span>

      {isNow && (
        <span style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 900, color,
          letterSpacing: '0.1em', flexShrink: 0, padding: '1px 5px', borderRadius: 3,
          border: `1px solid ${color}`, animation: 'pulse 1.8s ease-in-out infinite' }}>● {tr('NOW', 'СЕЙЧАС')}</span>
      )}
      {isCommit && tall && !isNow && (
        <span style={{ fontFamily: 'var(--font)', fontSize: 6.5, fontWeight: 700, color: `${color}90`,
          letterSpacing: '0.1em', flexShrink: 0, padding: '1px 5px', borderRadius: 3, border: `1px solid ${color}30` }}>
          {b.commitKind === 'habit' ? tr('HABIT', 'ПРИВЫЧКА') : tr('DAILY', 'ЕЖЕДН.')}
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
