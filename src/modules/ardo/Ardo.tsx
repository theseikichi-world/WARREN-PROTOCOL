import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  type ArdoText, type TextType, type Language, type SessionType,
  type ReviewCard,
  TEXT_TYPE_LABEL, LANG_LABEL, SCORE_LABELS,
  getChunkStatus, STATUS_COLOR, getFirstLine, getHint, todayKey,
} from './types'
import {
  loadArdoState, saveArdoState, type ArdoState, type SessionItem, type NewTextData,
  addText, markTextLearned, reviveText,
  getDueItems, getLearnItems, getAllItems,
  applySessionResults, applyLearnSession,
  startSprint, advanceSprint, getSprintDueCount,
  getTextStats, getTotalDue, autoChunk,
} from './store'
import { SPRINT_STAGE_LABELS } from './types'

const NEON    = '#00e4a0'
const NEON_DIM = 'rgba(0,228,160,0.1)'

// ─── TTS helper ───────────────────────────────────────────────────────────────
function speak(text: string, lang: Language) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang === 'RU' ? 'ru-RU' : lang === 'EN' ? 'en-US' : lang === 'CN' ? 'zh-CN' : 'en-US'
  u.rate = 0.85
  window.speechSynthesis.speak(u)
}

// ─── Countdown hook ───────────────────────────────────────────────────────────
function useCountdown(targetIso: string | undefined): { ms: number; label: string; isDue: boolean } {
  const [ms, setMs] = useState(() => targetIso ? Math.max(0, new Date(targetIso).getTime() - Date.now()) : 0)
  useEffect(() => {
    if (!targetIso) return
    const id = setInterval(() => setMs(Math.max(0, new Date(targetIso).getTime() - Date.now())), 1000)
    return () => clearInterval(id)
  }, [targetIso])

  const isDue = ms === 0
  let label = 'NOW'
  if (ms > 0) {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    const h = Math.floor(m / 60)
    if (h > 0)      label = `${h}h ${m % 60}m`
    else if (m > 0) label = `${m}m ${s % 60}s`
    else            label = `${s}s`
  }
  return { ms, label, isDue }
}

// ─── Ebbinghaus retention calculation ────────────────────────────────────────
// R(t) = e^(-t / S)  where S = memory stability
// SM-2 assumption: at nextReviewDate, retention ≈ 90%
// → S = intervalDays / -ln(0.9) ≈ intervalDays × 9.49

function calcChunkRetention(card: ReviewCard): number {
  if (card.reviewCount === 0) return 0
  if (card.intervalDays <= 0) return 0.5
  const nextDueMs   = new Date(card.nextReviewDate).getTime()
  const lastReviewMs = nextDueMs - card.intervalDays * 86400000
  const daysSince    = (Date.now() - lastReviewMs) / 86400000
  const stability    = card.intervalDays / (-Math.log(0.9))   // ≈ × 9.49
  return Math.min(1, Math.exp(-Math.max(0, daysSince) / stability))
}

function retentionColor(r: number): string {
  if (r <= 0)    return 'rgba(148,163,184,0.2)'
  if (r >= 0.75) return '#22c55e'
  if (r >= 0.5)  return '#eab308'
  if (r >= 0.25) return '#ff6b00'
  return '#ff0033'
}

// ─── Memory Curve component ───────────────────────────────────────────────────
function MemoryCurve({ text, cards }: { text: ArdoText; cards: ReviewCard[] }) {
  const textCards = cards.filter(c => c.textId === text.id)
  const reviewed  = textCards.filter(c => c.reviewCount > 0 && c.intervalDays > 0)

  if (reviewed.length === 0) {
    return (
      <div style={{ padding: '12px', textAlign: 'center',
        borderTop: `1px solid ${NEON}08` }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)',
          color: `${NEON}25`, letterSpacing: '0.1em' }}>
          Complete a session to see the memory curve
        </p>
      </div>
    )
  }

  // Per-chunk retentions
  const retentions = textCards.map(c => calcChunkRetention(c))
  const avgRet     = retentions.reduce((s, r) => s + r, 0) / retentions.length
  const retPct     = Math.round(avgRet * 100)
  const mainColor  = retentionColor(avgRet)
  const weakCount  = textCards.filter((_, i) => retentions[i] > 0 && retentions[i] < 0.5).length

  // Average stability and days-since for the curve
  const now = Date.now()
  const avgDaysSince = reviewed.reduce((s, c) => {
    const nextMs    = new Date(c.nextReviewDate).getTime()
    const lastReview = nextMs - c.intervalDays * 86400000
    return s + (now - lastReview) / 86400000
  }, 0) / reviewed.length

  const avgStability = reviewed.reduce((s, c) => s + c.intervalDays / (-Math.log(0.9)), 0) / reviewed.length

  // Average next review (days from today)
  const avgNextMs        = reviewed.reduce((s, c) => s + new Date(c.nextReviewDate).getTime(), 0) / reviewed.length
  const nextReviewInDays = (avgNextMs - now) / 86400000

  // SVG dimensions
  const W = 230, H = 58
  const daysBack    = 8
  const daysForward = Math.max(14, nextReviewInDays + 5)
  const totalDays   = daysBack + daysForward
  const pxPerDay    = W / totalDays
  const todayX      = daysBack * pxPerDay
  const nextRevX    = todayX + nextReviewInDays * pxPerDay

  // Build SVG path (step 0.2 days)
  const steps = Math.round(totalDays / 0.2)
  const pathPts: string[] = []
  let todayY = H * 0.5

  for (let i = 0; i <= steps; i++) {
    const dFromToday = -daysBack + i * 0.2
    const t          = avgDaysSince + dFromToday
    const ret        = t <= 0 ? 1.0 : Math.exp(-t / avgStability)
    const x          = todayX + dFromToday * pxPerDay
    const y          = (H - 6) - ret * (H - 14) + 4   // 4px top pad, 10px bottom pad
    pathPts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    if (Math.abs(dFromToday) < 0.15) todayY = y
  }

  const linePath = pathPts.join(' ')
  const startX   = (todayX - daysBack * pxPerDay).toFixed(1)
  const endX     = (todayX + daysForward * pxPerDay).toFixed(1)
  const fillPath = `${linePath} L${endX},${H} L${startX},${H} Z`

  // 50% retention Y position (danger zone)
  const dangerY = (H - 6) - 0.5 * (H - 14) + 4

  // Sprint review dots (if sprint active)
  const sprint        = text.sprint
  const sprintDotX    = sprint
    ? todayX + (new Date(sprint.nextDueAt).getTime() - now) / 86400000 / 1 * pxPerDay
    : null

  const gradId = `mc-${text.id.slice(0, 8)}`

  return (
    <div style={{ borderTop: `1px solid ${NEON}08`, padding: '10px 12px' }}>

      {/* Top row: retention % + curve */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        {/* Retention number */}
        <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 42 }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 22, fontWeight: 900,
            color: mainColor, lineHeight: 1,
            textShadow: `0 0 12px ${mainColor}70` }}>{retPct}%</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 6.5, color: `${mainColor}60`,
            letterSpacing: '0.12em', marginTop: 2 }}>RETENTION</p>
        </div>

        {/* SVG curve */}
        <div style={{ flex: 1 }}>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={mainColor} stopOpacity="0.22"/>
                <stop offset="100%" stopColor={mainColor} stopOpacity="0.02"/>
              </linearGradient>
            </defs>

            {/* Gradient fill under curve */}
            <path d={fillPath} fill={`url(#${gradId})`}/>

            {/* 50% danger zone */}
            <line x1="0" y1={dangerY.toFixed(1)} x2={W} y2={dangerY.toFixed(1)}
              stroke="rgba(255,68,68,0.18)" strokeWidth="0.8" strokeDasharray="3,4"/>
            <text x="2" y={(dangerY - 2).toFixed(1)} fontSize="5.5"
              fill="rgba(255,68,68,0.35)" fontFamily="monospace">50%</text>

            {/* Curve */}
            <path d={linePath} fill="none" stroke={mainColor} strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ filter: `drop-shadow(0 0 3px ${mainColor}80)` }}/>

            {/* Today vertical */}
            <line x1={todayX.toFixed(1)} y1="2" x2={todayX.toFixed(1)} y2={H}
              stroke={mainColor} strokeWidth="0.8" strokeOpacity="0.35"/>

            {/* Today dot */}
            <circle cx={todayX.toFixed(1)} cy={todayY.toFixed(1)} r="3.5"
              fill={mainColor} style={{ filter: `drop-shadow(0 0 5px ${mainColor})` }}/>

            {/* Today label */}
            <text x={todayX.toFixed(1)} y={(H - 0.5).toFixed(1)} textAnchor="middle"
              fontSize="5.5" fill={`${mainColor}80`} fontFamily="monospace">NOW</text>

            {/* Next review line (if in view) */}
            {nextRevX >= 0 && nextRevX <= W && (
              <>
                <line x1={nextRevX.toFixed(1)} y1="2" x2={nextRevX.toFixed(1)} y2={H - 8}
                  stroke="rgba(255,255,255,0.18)" strokeWidth="0.8" strokeDasharray="2,3"/>
                <text x={(nextRevX + 2).toFixed(1)} y="9" fontSize="5.5"
                  fill="rgba(255,255,255,0.3)" fontFamily="monospace">
                  {nextReviewInDays > 0 ? `+${Math.round(nextReviewInDays)}d` : 'due'}
                </text>
              </>
            )}

            {/* Sprint next review dot */}
            {sprintDotX !== null && sprintDotX > todayX && sprintDotX <= W && (
              <circle cx={sprintDotX.toFixed(1)} cy="6" r="3"
                fill="#ff6b00" style={{ filter: 'drop-shadow(0 0 4px #ff6b00)' }}/>
            )}
          </svg>
        </div>
      </div>

      {/* Chunk heatmap */}
      <div>
        <p style={{ fontFamily: 'var(--font)', fontSize: 6.5, color: 'rgba(148,163,184,0.3)',
          letterSpacing: '0.14em', marginBottom: 5 }}>
          CHUNKS — {textCards.length} total
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {textCards.map((c, i) => {
            const r     = retentions[i]
            const color = retentionColor(r)
            const pct   = Math.round(r * 100)
            return (
              <div key={c.chunkId}
                title={`Chunk ${i + 1}: ${r === 0 ? 'not reviewed' : `${pct}% retention`}`}
                style={{
                  width: 12, height: 12, borderRadius: 2,
                  background: color,
                  boxShadow: r > 0 ? `0 0 4px ${color}60` : 'none',
                  transition: 'all 0.2s',
                  cursor: 'default',
                }}/>
            )
          })}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 10, marginTop: 7, alignItems: 'center', flexWrap: 'wrap' }}>
          {[
            { color: '#22c55e', label: '≥75%' },
            { color: '#eab308', label: '50–75%' },
            { color: '#ff6b00', label: '25–50%' },
            { color: '#ff0033', label: '<25%'  },
            { color: 'rgba(148,163,184,0.2)', label: 'new' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }}/>
              <span style={{ fontFamily: 'var(--font)', fontSize: 6.5,
                color: 'rgba(148,163,184,0.35)', letterSpacing: '0.06em' }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Status message */}
        <div style={{ marginTop: 7 }}>
          {weakCount > 0 && (
            <p style={{ fontFamily: 'var(--font)', fontSize: 8, color: '#ff6b00',
              letterSpacing: '0.08em' }}>
              ⚠ {weakCount} chunk{weakCount !== 1 ? 's' : ''} below 50% — drill soon
            </p>
          )}
          {weakCount === 0 && avgRet >= 0.75 && (
            <p style={{ fontFamily: 'var(--font)', fontSize: 8, color: '#22c55e',
              letterSpacing: '0.08em' }}>
              ✦ Strong memory — next review in {Math.max(0, Math.round(nextReviewInDays))}d
            </p>
          )}
          {weakCount === 0 && avgRet >= 0.5 && avgRet < 0.75 && (
            <p style={{ fontFamily: 'var(--font)', fontSize: 8, color: '#eab308',
              letterSpacing: '0.08em' }}>
              ◈ Holding — schedule a recall to strengthen
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ pct, color = NEON, height = 3 }: { pct: number; color?: string; height?: number }) {
  return (
    <div style={{ height, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color,
        boxShadow: `0 0 6px ${color}70`, borderRadius: 2, transition: 'width 0.5s ease' }} />
    </div>
  )
}

// ─── Karaoke mode ────────────────────────────────────────────────────────────
// Line-by-line lyric display for songs. Tap to advance. Optional BPM auto-scroll.
// The SRS system still handles long-term memorisation; this is for live practice.
function KaraokeView({ text, onDone }: { text: ArdoText; onDone: () => void }) {
  const KA     = '#f59e0b'
  const KA_DIM = 'rgba(245,158,11,0.1)'

  // Flatten all chunks → individual non-empty lines
  const lines = useMemo(() =>
    text.chunks
      .slice()
      .sort((a, b) => a.order - b.order)
      .flatMap(chunk => chunk.content.split('\n').filter(l => l.trim() !== ''))
  , [text.chunks])

  const [phase,     setPhase]     = useState<'setup' | 'live' | 'done'>('setup')
  const [lineIdx,   setLineIdx]   = useState(0)
  const [autoMs,    setAutoMs]    = useState<number | null>(null)
  const [bpmInput,  setBpmInput]  = useState('120')
  const [bars,      setBars]      = useState(2)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const bpmToMs = (bpm: number, b: number) => Math.round((60 / bpm) * 4 * b * 1000)

  const advance = useCallback(() => {
    setLineIdx(prev => {
      const next = prev + 1
      if (next >= lines.length) { setPhase('done'); return prev }
      return next
    })
  }, [lines.length])

  const back = useCallback(() => setLineIdx(prev => Math.max(0, prev - 1)), [])

  // Auto-advance timer
  useEffect(() => {
    if (phase !== 'live' || !autoMs) return
    timerRef.current = setInterval(advance, autoMs)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [phase, autoMs, advance])

  // Keyboard
  useEffect(() => {
    if (phase !== 'live') return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'ArrowDown') {
        e.preventDefault()
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
        advance()
        if (autoMs) timerRef.current = setInterval(advance, autoMs)
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') {
        e.preventDefault()
        back()
      } else if (e.code === 'Escape') {
        e.preventDefault()
        onDone()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, autoMs, advance, back, onDone])

  const chipStyle = (on: boolean): React.CSSProperties => ({
    flex: 1, padding: '4px 0', borderRadius: 4, cursor: 'pointer',
    fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700,
    color: on ? KA : 'rgba(148,163,184,0.35)',
    border: `1px solid ${on ? `${KA}40` : 'rgba(255,255,255,0.06)'}`,
    background: on ? KA_DIM : 'transparent', transition: 'all 0.12s',
  })

  // ── SETUP ──────────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    const bpmVal  = parseFloat(bpmInput) || 0
    const estMs   = bpmVal > 0 ? bpmToMs(bpmVal, bars) : null
    return (
      <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18,
        background: 'rgba(20,10,2,0.97)', position: 'relative' }}>

        <button onClick={onDone} style={{ position: 'absolute', top: 12, left: 12,
          fontFamily: 'var(--font)', fontSize: 9, color: `${KA}45`, letterSpacing: '0.1em',
          transition: 'color 0.12s' }}
          onMouseEnter={e => e.currentTarget.style.color = KA}
          onMouseLeave={e => e.currentTarget.style.color = `${KA}45`}
        >← BACK</button>

        <span style={{ fontSize: 28, filter: `drop-shadow(0 0 14px ${KA})` }}>🎵</span>

        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 900,
            color: KA, letterSpacing: '0.2em', textShadow: `0 0 10px ${KA}` }}>KARAOKE</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 8, color: `${KA}60`,
            letterSpacing: '0.1em', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', maxWidth: 220 }}>{text.title}</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${KA}35`,
            letterSpacing: '0.08em', marginTop: 2 }}>{lines.length} lines</p>
        </div>

        <div style={{ width: '100%', maxWidth: 260, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 7.5, color: `${KA}50`,
            letterSpacing: '0.15em', textAlign: 'center' }}>ADVANCE MODE</p>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { if (timerRef.current) clearInterval(timerRef.current); setAutoMs(null) }} style={{
              flex: 1, padding: '10px 8px', borderRadius: 7, cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.06em',
              color: autoMs === null ? KA : 'rgba(148,163,184,0.35)',
              border: `1px solid ${autoMs === null ? `${KA}40` : 'rgba(255,255,255,0.06)'}`,
              background: autoMs === null ? KA_DIM : 'transparent', transition: 'all 0.12s',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            }}>
              <span>👆 TAP</span>
              <span style={{ fontSize: 7, opacity: 0.6 }}>manual</span>
            </button>
            <button onClick={() => {
              const ms = bpmToMs(parseFloat(bpmInput) || 120, bars)
              setAutoMs(ms)
            }} style={{
              flex: 1, padding: '10px 8px', borderRadius: 7, cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.06em',
              color: autoMs !== null ? KA : 'rgba(148,163,184,0.35)',
              border: `1px solid ${autoMs !== null ? `${KA}40` : 'rgba(255,255,255,0.06)'}`,
              background: autoMs !== null ? KA_DIM : 'transparent', transition: 'all 0.12s',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            }}>
              <span>♩ BPM</span>
              <span style={{ fontSize: 7, opacity: 0.6 }}>auto-scroll</span>
            </button>
          </div>

          {/* BPM config */}
          <div style={{ padding: '10px 12px', borderRadius: 7,
            background: 'rgba(245,158,11,0.05)', border: `1px solid ${KA}18` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontFamily: 'var(--font)', fontSize: 7.5, color: `${KA}55`,
                letterSpacing: '0.12em', flexShrink: 0 }}>BPM</span>
              <input type="number" value={bpmInput}
                onChange={e => {
                  setBpmInput(e.target.value)
                  const bpm = parseFloat(e.target.value) || 0
                  if (bpm > 0 && autoMs !== null) setAutoMs(bpmToMs(bpm, bars))
                }}
                style={{ flex: 1, width: 0, padding: '4px 8px', borderRadius: 4,
                  background: 'rgba(0,0,0,0.4)', border: `1px solid ${KA}25`, outline: 'none',
                  fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: KA }}
              />
            </div>
            <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${KA}45`,
              letterSpacing: '0.1em', marginBottom: 5 }}>BARS PER LINE</p>
            <div style={{ display: 'flex', gap: 5 }}>
              {([1, 2, 4] as const).map(b => (
                <button key={b} onClick={() => {
                  setBars(b)
                  if (autoMs !== null) setAutoMs(bpmToMs(parseFloat(bpmInput) || 120, b))
                }} style={chipStyle(bars === b)}>{b} {b === 1 ? 'bar' : 'bars'}</button>
              ))}
            </div>
            {estMs && (
              <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${KA}50`,
                marginTop: 6, letterSpacing: '0.06em' }}>
                ≈ {(estMs / 1000).toFixed(1)}s per line
              </p>
            )}
          </div>
        </div>

        <button onClick={() => { setLineIdx(0); setPhase('live') }} style={{
          padding: '10px 36px', borderRadius: 7, cursor: 'pointer',
          fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 800, letterSpacing: '0.14em',
          color: KA, border: `1px solid ${KA}40`, background: KA_DIM, transition: 'background 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.18)'}
          onMouseLeave={e => e.currentTarget.style.background = KA_DIM}
        >🎵 START</button>
      </div>
    )
  }

  // ── DONE ───────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16,
        background: 'rgba(20,10,2,0.97)' }}>
        <span style={{ fontSize: 32, filter: `drop-shadow(0 0 14px ${KA})` }}>🌟</span>
        <p style={{ fontFamily: 'var(--font)', fontSize: 14, fontWeight: 900,
          color: KA, textShadow: `0 0 10px ${KA}`, letterSpacing: '0.1em' }}>END OF SONG</p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: `${KA}60`,
          textAlign: 'center', lineHeight: 1.7 }}>
          {lines.length} lines · {text.title}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setLineIdx(0); setPhase('live') }} style={{
            padding: '10px 20px', borderRadius: 7, cursor: 'pointer',
            fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 800, letterSpacing: '0.12em',
            color: KA, border: `1px solid ${KA}40`, background: KA_DIM, transition: 'background 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.18)'}
            onMouseLeave={e => e.currentTarget.style.background = KA_DIM}
          >↺ AGAIN</button>
          <button onClick={onDone} style={{
            padding: '10px 20px', borderRadius: 7, cursor: 'pointer',
            fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 800, letterSpacing: '0.12em',
            color: 'rgba(148,163,184,0.5)', border: '1px solid rgba(148,163,184,0.15)',
            background: 'transparent', transition: 'all 0.15s',
          }}>DONE</button>
        </div>
      </div>
    )
  }

  // ── LIVE ───────────────────────────────────────────────────────────────────
  const progress = Math.round(((lineIdx + 1) / lines.length) * 100)

  const handleAreaClick = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    advance()
    if (autoMs) timerRef.current = setInterval(advance, autoMs)
  }

  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column',
      background: 'rgba(20,10,2,0.98)', overflow: 'hidden', cursor: 'pointer' }}
      onClick={handleAreaClick}>

      {/* Progress bar */}
      <div style={{ height: 2, background: 'rgba(245,158,11,0.1)', flexShrink: 0 }}>
        <div style={{ height: '100%', width: `${progress}%`, background: KA,
          boxShadow: `0 0 6px ${KA}70`, transition: 'width 0.3s ease' }} />
      </div>

      {/* Top bar */}
      <div style={{ padding: '8px 14px', flexShrink: 0, display: 'flex',
        alignItems: 'center', gap: 10, borderBottom: `1px solid ${KA}12` }}
        onClick={e => e.stopPropagation()}>
        <button onClick={onDone} style={{ fontFamily: 'var(--font)', fontSize: 9,
          color: `${KA}45`, letterSpacing: '0.1em', transition: 'color 0.12s', flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.color = KA}
          onMouseLeave={e => e.currentTarget.style.color = `${KA}45`}
        >✕</button>
        <p style={{ fontFamily: 'var(--font)', fontSize: 8, color: `${KA}60`,
          letterSpacing: '0.1em', flex: 1, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text.title}</p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 8, color: `${KA}45`,
          letterSpacing: '0.1em', flexShrink: 0 }}>{lineIdx + 1} / {lines.length}</p>
        {autoMs && (
          <span style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${KA}55`,
            letterSpacing: '0.08em' }}>♩ AUTO</span>
        )}
      </div>

      {/* Lines display — tap-through area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '16px 18px', overflow: 'hidden',
        pointerEvents: 'none', userSelect: 'none' }}>

        {/* prev -2 */}
        <p style={{ fontFamily: 'var(--font)', fontSize: 10, color: `${KA}12`,
          letterSpacing: '0.02em', lineHeight: 1.7, textAlign: 'center',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          minHeight: 18, transition: 'all 0.25s ease', marginBottom: 3 }}>
          {lineIdx >= 2 ? lines[lineIdx - 2] : ''}
        </p>

        {/* prev -1 */}
        <p style={{ fontFamily: 'var(--font)', fontSize: 12, color: `${KA}25`,
          letterSpacing: '0.02em', lineHeight: 1.7, textAlign: 'center',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          minHeight: 22, transition: 'all 0.25s ease', marginBottom: 8 }}>
          {lineIdx >= 1 ? lines[lineIdx - 1] : ''}
        </p>

        {/* CURRENT */}
        <div style={{ padding: '12px 14px', borderRadius: 10, textAlign: 'center',
          background: 'rgba(245,158,11,0.07)', border: `1px solid ${KA}28`,
          boxShadow: `0 0 24px ${KA}12`, marginBottom: 10, transition: 'all 0.2s ease' }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 18, fontWeight: 800,
            color: KA, letterSpacing: '0.04em', lineHeight: 1.5,
            textShadow: `0 0 14px ${KA}80`, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {lines[lineIdx] ?? ''}
          </p>
        </div>

        {/* next +1 */}
        <p style={{ fontFamily: 'var(--font)', fontSize: 12, color: `${KA}28`,
          letterSpacing: '0.02em', lineHeight: 1.7, textAlign: 'center',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          minHeight: 22, transition: 'all 0.25s ease', marginBottom: 3 }}>
          {lineIdx + 1 < lines.length ? lines[lineIdx + 1] : ''}
        </p>

        {/* next +2 */}
        <p style={{ fontFamily: 'var(--font)', fontSize: 10, color: `${KA}16`,
          letterSpacing: '0.02em', lineHeight: 1.7, textAlign: 'center',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          minHeight: 18, transition: 'all 0.25s ease', marginBottom: 3 }}>
          {lineIdx + 2 < lines.length ? lines[lineIdx + 2] : ''}
        </p>

        {/* next +3 */}
        <p style={{ fontFamily: 'var(--font)', fontSize: 9, color: `${KA}09`,
          letterSpacing: '0.02em', lineHeight: 1.7, textAlign: 'center',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          minHeight: 16, transition: 'all 0.25s ease' }}>
          {lineIdx + 3 < lines.length ? lines[lineIdx + 3] : ''}
        </p>
      </div>

      {/* Bottom controls */}
      <div style={{ padding: '10px 14px', borderTop: `1px solid ${KA}12`, flexShrink: 0,
        display: 'flex', gap: 7, alignItems: 'center' }}
        onClick={e => e.stopPropagation()}>
        <button onClick={back} disabled={lineIdx === 0} style={{
          padding: '8px 12px', borderRadius: 6, cursor: lineIdx > 0 ? 'pointer' : 'default',
          fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700,
          color: lineIdx > 0 ? `${KA}70` : 'rgba(148,163,184,0.2)',
          border: `1px solid ${lineIdx > 0 ? `${KA}25` : 'rgba(255,255,255,0.05)'}`,
          background: 'transparent', transition: 'all 0.15s',
        }}>← PREV</button>

        <button onClick={handleAreaClick} style={{
          flex: 1, padding: '8px', borderRadius: 6, cursor: 'pointer',
          fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 800, letterSpacing: '0.12em',
          color: KA, border: `1px solid ${KA}40`, background: KA_DIM, transition: 'background 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.18)'}
          onMouseLeave={e => e.currentTarget.style.background = KA_DIM}
        >{autoMs ? '♩ AUTO — TAP TO SYNC' : 'TAP ▶'}</button>

        <button onClick={() => setLineIdx(0)} title="Restart from beginning" style={{
          padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
          fontFamily: 'var(--font)', fontSize: 11, color: `${KA}45`,
          border: `1px solid ${KA}15`, background: 'transparent', transition: 'all 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.color = KA}
          onMouseLeave={e => e.currentTarget.style.color = `${KA}45`}
        >↺</button>
      </div>
    </div>
  )
}

// ─── Full Run mode ────────────────────────────────────────────────────────────
// Recall the COMPLETE text in sequence — no chunks, no scaffolding.
// Like a real performance. Uses a theater prompter (first word of each chunk).
function FullRunView({ text, onDone }: {
  text:   { title: string; chunks: { id: string; content: string; order: number }[] }
  onDone: (score: number) => void
}) {
  const [phase,    setPhase]    = useState<'prep' | 'running' | 'reveal'>('prep')
  const [timer,    setTimer]    = useState<number | null>(null)  // selected seconds
  const [elapsed,  setElapsed]  = useState(0)
  const [hints,    setHints]    = useState<Set<number>>(new Set())  // chunk orders where hint was used
  const chunks = [...text.chunks].sort((a, b) => a.order - b.order)

  // Running timer
  useEffect(() => {
    if (phase !== 'running') return
    const id = setInterval(() => setElapsed(e => {
      const next = e + 1
      if (timer && next >= timer) { clearInterval(id); setPhase('reveal') }
      return next
    }), 1000)
    return () => clearInterval(id)
  }, [phase, timer])

  const toggleHint = (order: number) => setHints(prev => {
    const next = new Set(prev)
    if (next.has(order)) next.delete(order); else next.add(order)
    return next
  })

  const fmt = (s: number) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`

  // ── PREP: timer selection ──
  if (phase === 'prep') {
    return (
      <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 900,
          color: NEON, letterSpacing: '0.2em', textShadow: `0 0 8px ${NEON}` }}>FULL RUN</p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)',
          color: `${NEON}60`, textAlign: 'center', lineHeight: 1.7, maxWidth: 220 }}>
          Recall the complete <strong style={{ color: NEON }}>{text.title}</strong> from start to finish — no text, no prompts.
          <br/>Click chunk numbers for first-word hints (like a stage prompter).
        </p>
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 8, color: `${NEON}50`,
            letterSpacing: '0.18em', textAlign: 'center', marginBottom: 8 }}>TIME LIMIT (OPTIONAL)</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {[null, 60, 120, 300].map(s => (
              <button key={String(s)} onClick={() => setTimer(s)} style={{
                padding: '6px 12px', borderRadius: 5, cursor: 'pointer',
                fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em',
                color: timer === s ? NEON : 'rgba(148,163,184,0.35)',
                border: `1px solid ${timer === s ? `${NEON}40` : 'rgba(255,255,255,0.06)'}`,
                background: timer === s ? NEON_DIM : 'transparent', transition: 'all 0.12s',
              }}>
                {s === null ? '∞ FREE' : s === 60 ? '1 MIN' : s === 120 ? '2 MIN' : '5 MIN'}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setPhase('running')} style={{
          padding: '10px 32px', borderRadius: 7, cursor: 'pointer',
          fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 800, letterSpacing: '0.12em',
          color: NEON, border: `1px solid ${NEON}40`, background: NEON_DIM, transition: 'background 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,228,160,0.18)'}
          onMouseLeave={e => e.currentTarget.style.background = NEON_DIM}
        >🎭 ACTION</button>
      </div>
    )
  }

  // ── RUNNING: blank stage with prompter ──
  if (phase === 'running') {
    const timerPct = timer ? Math.min(100, (elapsed / timer) * 100) : 0
    return (
      <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Timer bar */}
        {timer && (
          <div style={{ height: 3, background: 'rgba(255,255,255,0.04)', flexShrink: 0 }}>
            <div style={{ height: '100%', width: `${timerPct}%`,
              background: timerPct > 80 ? '#ff4444' : NEON,
              transition: 'width 1s linear, background 0.3s',
              boxShadow: `0 0 6px ${timerPct > 80 ? '#ff444470' : `${NEON}70`}` }} />
          </div>
        )}
        <div style={{ padding: '10px 14px', flexShrink: 0, display: 'flex', justifyContent: 'space-between',
          borderBottom: `1px solid ${NEON}10` }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 8, color: `${NEON}50`, letterSpacing: '0.15em' }}>
            {text.title} — FULL RUN
          </p>
          {timer && (
            <p style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 800,
              color: timerPct > 80 ? '#ff4444' : NEON, letterSpacing: '0.08em' }}>
              {fmt(timer - elapsed)}
            </p>
          )}
          {!timer && (
            <p style={{ fontFamily: 'var(--font)', fontSize: 8, color: `${NEON}40`, letterSpacing: '0.1em' }}>
              {fmt(elapsed)}
            </p>
          )}
        </div>

        {/* Blank stage + chunk number prompter column */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Prompter sidebar */}
          <div style={{ width: 32, borderRight: `1px solid ${NEON}08`, overflowY: 'auto',
            display: 'flex', flexDirection: 'column', padding: '8px 0' }}>
            {chunks.map(ch => (
              <button key={ch.id} onClick={() => toggleHint(ch.order)} title="Show first word"
                style={{
                  width: '100%', padding: '4px 0', cursor: 'pointer', flexShrink: 0,
                  fontFamily: 'var(--font)', fontSize: 8, fontWeight: 700,
                  color: hints.has(ch.order) ? NEON : `${NEON}25`,
                  background: hints.has(ch.order) ? NEON_DIM : 'transparent',
                  borderBottom: `1px solid ${NEON}06`,
                  transition: 'all 0.12s',
                }}>
                {ch.order + 1}
              </button>
            ))}
          </div>

          {/* Hint words shown */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
            {hints.size === 0 && (
              <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)',
                color: `${NEON}18`, textAlign: 'center', marginTop: 40, letterSpacing: '0.1em' }}>
                Click a number for a first-word hint
              </p>
            )}
            {chunks.filter(ch => hints.has(ch.order)).map(ch => (
              <div key={ch.id} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'var(--font)', fontSize: 8, color: `${NEON}40`,
                  flexShrink: 0, minWidth: 16 }}>{ch.order + 1}</span>
                <p style={{ fontFamily: 'var(--font)', fontSize: 13, fontWeight: 700,
                  color: NEON, textShadow: `0 0 8px ${NEON}80`, letterSpacing: '0.04em' }}>
                  {ch.content.split(/\s+/)[0]}…
                </p>
              </div>
            ))}
          </div>
        </div>

        <button onClick={() => setPhase('reveal')} style={{
          margin: '0 12px 12px', padding: '10px', borderRadius: 7, cursor: 'pointer',
          flexShrink: 0, fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 800,
          letterSpacing: '0.12em', color: NEON, border: `1px solid ${NEON}40`,
          background: NEON_DIM, transition: 'background 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,228,160,0.18)'}
          onMouseLeave={e => e.currentTarget.style.background = NEON_DIM}
        >DONE — REVEAL ↓</button>
      </div>
    )
  }

  // ── REVEAL: show full text + rate ──
  const hintsUsed = hints.size
  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', flexShrink: 0, borderBottom: `1px solid ${NEON}10`,
        display: 'flex', alignItems: 'center', gap: 8 }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 8, color: `${NEON}50`, letterSpacing: '0.15em', flex: 1 }}>
          {text.title} — ORIGINAL
        </p>
        {hintsUsed > 0 && (
          <p style={{ fontFamily: 'var(--font)', fontSize: 7.5, color: '#eab308' }}>
            {hintsUsed} hints used
          </p>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
        {chunks.map(ch => (
          <div key={ch.id} style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8,
            background: `${NEON}04`, borderLeft: `2px solid ${NEON}20` }}>
            <p style={{ fontFamily: 'var(--font)', fontSize: 7.5, color: `${NEON}40`,
              letterSpacing: '0.12em', marginBottom: 6 }}>CHUNK {ch.order + 1}</p>
            <p style={{ fontFamily: 'var(--font)', fontSize: 13, color: 'rgba(200,255,230,0.85)',
              lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{ch.content}</p>
          </div>
        ))}
      </div>

      <div style={{ padding: '10px 12px', borderTop: `1px solid ${NEON}10`, flexShrink: 0 }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 8, color: `${NEON}50`,
          letterSpacing: '0.18em', textAlign: 'center', marginBottom: 10 }}>HOW WAS YOUR PERFORMANCE?</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
          {[
            { score: 1, label: 'STRUGGLED', emoji: '🔴', color: '#ff0033', sub: 'Major gaps' },
            { score: 2, label: 'MOSTLY',    emoji: '🟡', color: '#ff6b00', sub: 'Minor stumbles' },
            { score: 3, label: 'NAILED IT', emoji: '⭐', color: '#22c55e', sub: 'Clean run' },
          ].map(({ score, label, emoji, color, sub }) => (
            <button key={score} onClick={() => onDone(score)} style={{
              padding: '10px 6px', borderRadius: 8, cursor: 'pointer',
              fontFamily: 'var(--font)', fontWeight: 800, letterSpacing: '0.08em',
              color, border: `1px solid ${color}35`, background: `${color}08`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              transition: 'background 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = `${color}15`}
              onMouseLeave={e => e.currentTarget.style.background = `${color}08`}
            >
              <span style={{ fontSize: 18 }}>{emoji}</span>
              <span style={{ fontSize: 'var(--fs-xs)' }}>{label}</span>
              <span style={{ fontSize: 7, opacity: 0.6 }}>{sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Text card (dashboard) ────────────────────────────────────────────────────
function SprintBadge({ sprint, onStart }: {
  sprint:  NonNullable<ArdoText['sprint']>
  onStart: () => void
}) {
  const { label, isDue } = useCountdown(sprint.nextDueAt)
  const stageLabel = SPRINT_STAGE_LABELS[sprint.stage] ?? `STAGE ${sprint.stage}`
  return (
    <button onClick={isDue ? onStart : undefined} style={{
      flex: 1, padding: '6px 4px', borderRadius: 5, cursor: isDue ? 'pointer' : 'default',
      fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.06em',
      color: isDue ? '#ff6b00' : `${NEON}55`,
      border: `1px solid ${isDue ? 'rgba(255,107,0,0.4)' : `${NEON}20`}`,
      background: isDue ? 'rgba(255,107,0,0.08)' : 'transparent',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
      transition: 'all 0.15s', animation: isDue ? 'pulse 1.8s ease-in-out infinite' : 'none',
    }}>
      <span style={{ fontSize: 7, opacity: 0.7 }}>SPRINT {sprint.stage}/{SPRINT_STAGE_LABELS.length - 1}</span>
      <span>{isDue ? `${stageLabel} — NOW` : `${stageLabel} in ${label}`}</span>
    </button>
  )
}

function TextCard({ text, state, onStudy, onMarkLearned, onSprintStart, onFullRun, onKaraoke }: {
  text:           ArdoText
  state:          ArdoState
  onStudy:        (mode: SessionType) => void
  onMarkLearned:  () => void
  onSprintStart:  () => void
  onFullRun:      () => void
  onKaraoke?:     () => void
}) {
  const [expanded,   setExpanded]   = useState(false)
  const [showCurve,  setShowCurve]  = useState(false)
  const [hov,        setHov]        = useState(false)
  const stats = getTextStats(text, state.cards)

  const typeColor: Record<TextType, string> = {
    poem: '#bf5fff', monologue: '#00b4ff', role: '#ff6b00', song: '#f59e0b', prose: '#22c55e',
  }
  const tc = typeColor[text.type]

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        margin: '5px 10px', borderRadius: 10, overflow: 'hidden',
        background: 'rgba(0,12,8,0.7)', border: `1px solid ${hov ? `${NEON}28` : `${NEON}12`}`,
        transition: 'all 0.18s',
      }}>

      {/* Progress strip */}
      <ProgressBar pct={stats.progress} color={stats.progress === 100 ? '#f59e0b' : NEON} />

      <div style={{ padding: '10px 12px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 800,
              color: 'rgba(210,255,240,0.9)', letterSpacing: '0.04em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {text.title}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
              {text.author && (
                <span style={{ fontFamily: 'var(--font)', fontSize: 7.5,
                  color: 'rgba(148,163,184,0.45)', letterSpacing: '0.06em' }}>{text.author}</span>
              )}
              <span style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700,
                color: tc, letterSpacing: '0.1em', padding: '1px 5px', borderRadius: 3,
                border: `1px solid ${tc}30`, background: `${tc}08` }}>
                {TEXT_TYPE_LABEL[text.type]}
              </span>
              <span style={{ fontFamily: 'var(--font)', fontSize: 7,
                color: `${NEON}50`, letterSpacing: '0.08em' }}>{LANG_LABEL[text.language]}</span>
            </div>
          </div>

          {/* Stats + progress */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontFamily: 'var(--font)', fontSize: 14, fontWeight: 900,
              color: stats.progress === 100 ? '#f59e0b' : NEON, lineHeight: 1 }}>{stats.progress}%</p>
            <p style={{ fontFamily: 'var(--font)', fontSize: 7,
              color: `${NEON}45`, letterSpacing: '0.08em' }}>{stats.mastered}/{stats.total}</p>
          </div>
        </div>

        {/* Status row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          {stats.due > 0 && (
            <span style={{ fontFamily: 'var(--font)', fontSize: 8, fontWeight: 700,
              color: '#ff4444', letterSpacing: '0.1em',
              padding: '2px 7px', borderRadius: 4,
              border: '1px solid rgba(255,68,68,0.3)', background: 'rgba(255,68,68,0.08)',
              animation: 'pulse 2s ease-in-out infinite',
            }}>🔴 {stats.due} DUE</span>
          )}
          {stats.reviewing > 0 && (
            <span style={{ fontFamily: 'var(--font)', fontSize: 7.5,
              color: '#eab308', letterSpacing: '0.06em' }}>{stats.reviewing} reviewing</span>
          )}
          {stats.new > 0 && (
            <span style={{ fontFamily: 'var(--font)', fontSize: 7.5,
              color: 'rgba(148,163,184,0.4)', letterSpacing: '0.06em' }}>{stats.new} new</span>
          )}
          {text.deadline && (
            <span style={{ fontFamily: 'var(--font)', fontSize: 7.5, marginLeft: 'auto',
              color: 'rgba(148,163,184,0.35)', letterSpacing: '0.06em' }}>
              deadline {new Date(text.deadline).toLocaleDateString('en', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {/* Sprint active: show countdown + full run */}
          {text.sprint ? (
            <>
              <SprintBadge sprint={text.sprint} onStart={() => onStudy('recall')} />
              <button onClick={onFullRun} style={{
                padding: '6px 10px', borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em',
                color: `${NEON}70`, border: `1px solid ${NEON}25`, background: 'transparent', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.color = NEON; e.currentTarget.style.background = NEON_DIM }}
                onMouseLeave={e => { e.currentTarget.style.color = `${NEON}70`; e.currentTarget.style.background = 'transparent' }}
              >🎭 RUN</button>
            </>
          ) : (
            <>
              <button onClick={() => onStudy('learn')} style={{
                flex: 1, padding: '6px 0', borderRadius: 5, cursor: 'pointer',
                fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.1em',
                color: NEON, border: `1px solid ${NEON}35`, background: NEON_DIM, transition: 'background 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,228,160,0.18)'}
                onMouseLeave={e => e.currentTarget.style.background = NEON_DIM}
              >LEARN</button>

              <button onClick={() => onStudy('recall')} disabled={stats.due === 0} style={{
                flex: 1, padding: '6px 0', borderRadius: 5, cursor: stats.due > 0 ? 'pointer' : 'default',
                fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.1em',
                color: stats.due > 0 ? '#ff4444' : 'rgba(148,163,184,0.2)',
                border: `1px solid ${stats.due > 0 ? 'rgba(255,68,68,0.3)' : 'rgba(255,255,255,0.05)'}`,
                background: stats.due > 0 ? 'rgba(255,68,68,0.06)' : 'transparent', transition: 'background 0.15s',
              }}
                onMouseEnter={e => { if (stats.due > 0) e.currentTarget.style.background = 'rgba(255,68,68,0.12)' }}
                onMouseLeave={e => { if (stats.due > 0) e.currentTarget.style.background = 'rgba(255,68,68,0.06)' }}
              >RECALL {stats.due > 0 ? `(${stats.due})` : ''}</button>

              {/* SPRINT button — emergency mode */}
              <button onClick={onSprintStart} title="Sprint mode: intra-day SRS (20min→1hr→4hr→8hr→...)" style={{
                padding: '6px 8px', borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em',
                color: '#ff6b00', border: '1px solid rgba(255,107,0,0.3)', background: 'rgba(255,107,0,0.06)',
                transition: 'all 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,107,0,0.12)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,107,0,0.06)'}
              >⚡ SPRINT</button>

              {/* Full run — whole text */}
              <button onClick={onFullRun} title="Full run: recall entire text in sequence" style={{
                padding: '6px 8px', borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em',
                color: `${NEON}70`, border: `1px solid ${NEON}25`, background: 'transparent', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.color = NEON; e.currentTarget.style.background = NEON_DIM }}
                onMouseLeave={e => { e.currentTarget.style.color = `${NEON}70`; e.currentTarget.style.background = 'transparent' }}
              >🎭 RUN</button>

              {/* Karaoke — songs only */}
              {text.type === 'song' && onKaraoke && (
                <button onClick={onKaraoke} title="Karaoke mode: line-by-line with BPM scroll" style={{
                  padding: '6px 8px', borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                  fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.06em',
                  color: 'rgba(245,158,11,0.7)', border: '1px solid rgba(245,158,11,0.25)',
                  background: 'transparent', transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#f59e0b'; e.currentTarget.style.background = 'rgba(245,158,11,0.08)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(245,158,11,0.7)'; e.currentTarget.style.background = 'transparent' }}
                >🎵</button>
              )}
            </>
          )}

          {/* Memory curve toggle */}
          <button onClick={() => setShowCurve(v => !v)} title="Memory curve"
            style={{
              width: 28, padding: '6px 0', borderRadius: 5, cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 11,
              color: showCurve ? NEON : `${NEON}40`,
              border: `1px solid ${showCurve ? `${NEON}35` : 'rgba(255,255,255,0.06)'}`,
              background: showCurve ? NEON_DIM : 'transparent',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = NEON }}
            onMouseLeave={e => { if (!showCurve) e.currentTarget.style.color = `${NEON}40` }}
          >〜</button>

          <button onClick={() => setExpanded(v => !v)} style={{
            width: 28, padding: '6px 0', borderRadius: 5, cursor: 'pointer',
            fontFamily: 'var(--font)', fontSize: 10, color: `${NEON}50`,
            border: `1px solid rgba(255,255,255,0.06)`, background: 'transparent', transition: 'all 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.color = NEON}
            onMouseLeave={e => e.currentTarget.style.color = `${NEON}50`}
          >{expanded ? '▲' : '▼'}</button>

          {/* Mark as learned — glows gold when all chunks mastered */}
          {hov && (
            <button
              onClick={onMarkLearned}
              title={stats.mastered === stats.total && stats.total > 0 ? 'Move to Glory Hall ✦' : 'Mark as learned'}
              style={{
                padding: '6px 8px', borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                fontFamily: 'var(--font)', fontSize: stats.mastered === stats.total && stats.total > 0 ? 9 : 7,
                fontWeight: 700, letterSpacing: '0.08em',
                color: stats.mastered === stats.total && stats.total > 0 ? '#f59e0b' : 'rgba(245,158,11,0.3)',
                border: `1px solid ${stats.mastered === stats.total && stats.total > 0 ? 'rgba(245,158,11,0.4)' : 'rgba(245,158,11,0.1)'}`,
                background: stats.mastered === stats.total && stats.total > 0 ? 'rgba(245,158,11,0.08)' : 'transparent',
                boxShadow: stats.mastered === stats.total && stats.total > 0 ? '0 0 10px rgba(245,158,11,0.3)' : 'none',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.15)'; e.currentTarget.style.color = '#f59e0b' }}
              onMouseLeave={e => {
                const allDone = stats.mastered === stats.total && stats.total > 0
                e.currentTarget.style.background = allDone ? 'rgba(245,158,11,0.08)' : 'transparent'
                e.currentTarget.style.color = allDone ? '#f59e0b' : 'rgba(245,158,11,0.3)'
              }}
            >
              {stats.mastered === stats.total && stats.total > 0 ? '✦ LEARNED' : '✦'}
            </button>
          )}
        </div>

        {/* Memory curve (toggleable) */}
        {showCurve && (
          <MemoryCurve text={text} cards={state.cards} />
        )}
      </div>

      {/* Expanded chunks */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${NEON}10`, padding: '8px 12px' }}>
          {text.chunks.map(chunk => {
            const card   = state.cards.find(c => c.chunkId === chunk.id)
            const status = getChunkStatus(card)
            const color  = STATUS_COLOR[status]
            const isToday = card?.nextReviewDate === todayKey()
            return (
              <div key={chunk.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: isToday ? '#ff4444' : color,
                    boxShadow: `0 0 5px ${isToday ? '#ff4444' : color}60` }} />
                  <span style={{ fontFamily: 'var(--font)', fontSize: 6, color: 'rgba(148,163,184,0.25)',
                    letterSpacing: '0.04em' }}>{chunk.order + 1}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)',
                    color: 'rgba(200,240,220,0.6)', lineHeight: 1.5,
                    overflow: 'hidden', display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  }}>{chunk.content}</p>
                  {chunk.anchor && (
                    <p style={{ fontFamily: 'var(--font)', fontSize: 8, color: `${NEON}50`, marginTop: 2 }}>
                      {chunk.anchor}
                    </p>
                  )}
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <p style={{ fontFamily: 'var(--font)', fontSize: 7, color, letterSpacing: '0.1em', fontWeight: 700 }}>
                    {status.toUpperCase()}
                  </p>
                  {card && card.reviewCount > 0 && (
                    <p style={{ fontFamily: 'var(--font)', fontSize: 6, color: 'rgba(148,163,184,0.3)', marginTop: 1 }}>
                      {card.intervalDays}d
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Glory card (learned texts) ──────────────────────────────────────────────
function GloryCard({ text, state, onRevive, onFullRun, onKaraoke }: {
  text:       ArdoText
  state:      ArdoState
  onRevive:   () => void
  onFullRun:  () => void
  onKaraoke?: () => void
}) {
  const [hov, setHov] = useState(false)
  const stats = getTextStats(text, state.cards)
  const learnedDate = text.learnedAt
    ? new Date(text.learnedAt).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  const typeColor: Record<TextType, string> = {
    poem: '#bf5fff', monologue: '#00b4ff', role: '#ff6b00', song: '#f59e0b', prose: '#22c55e',
  }

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        margin: '5px 10px', borderRadius: 10, overflow: 'hidden',
        background: 'rgba(20,14,4,0.7)',
        border: `1px solid ${hov ? 'rgba(245,158,11,0.35)' : 'rgba(245,158,11,0.15)'}`,
        transition: 'all 0.18s',
        opacity: 0.85,
      }}>

      {/* Gold completion strip */}
      <div style={{ height: 2, background: 'linear-gradient(90deg, #f59e0b, #fcd34d, #f59e0b)',
        boxShadow: '0 0 8px rgba(245,158,11,0.5)' }} />

      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          {/* Gold star icon */}
          <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
            boxShadow: '0 0 10px rgba(245,158,11,0.2)' }}>
            ✦
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 800,
              color: 'rgba(253,230,138,0.7)', letterSpacing: '0.04em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              textDecoration: 'none' }}>
              {text.title}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center' }}>
              {text.author && (
                <span style={{ fontFamily: 'var(--font)', fontSize: 7.5,
                  color: 'rgba(245,158,11,0.4)' }}>{text.author}</span>
              )}
              <span style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700,
                color: typeColor[text.type], letterSpacing: '0.1em', padding: '1px 5px',
                borderRadius: 3, border: `1px solid ${typeColor[text.type]}25`,
                background: `${typeColor[text.type]}08` }}>
                {TEXT_TYPE_LABEL[text.type]}
              </span>
            </div>
          </div>

          {/* Stats */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontFamily: 'var(--font)', fontSize: 14, fontWeight: 900,
              color: '#f59e0b', lineHeight: 1, textShadow: '0 0 8px rgba(245,158,11,0.5)' }}>
              {stats.total}
            </p>
            <p style={{ fontFamily: 'var(--font)', fontSize: 6.5,
              color: 'rgba(245,158,11,0.4)', letterSpacing: '0.1em' }}>CHUNKS</p>
          </div>
        </div>

        {/* Learned date */}
        {learnedDate && (
          <p style={{ fontFamily: 'var(--font)', fontSize: 7.5,
            color: 'rgba(245,158,11,0.45)', letterSpacing: '0.08em', marginTop: 8 }}>
            LEARNED · {learnedDate}
          </p>
        )}

        {/* Actions */}
        {hov && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={onFullRun} style={{
              flex: 1, padding: '6px 0', borderRadius: 5, cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.1em',
              color: 'rgba(245,158,11,0.7)', border: '1px solid rgba(245,158,11,0.25)',
              background: 'rgba(245,158,11,0.05)', transition: 'background 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.12)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,158,11,0.05)'}
            >🎭 PERFORM</button>

            {/* Karaoke — songs only */}
            {text.type === 'song' && onKaraoke && (
              <button onClick={onKaraoke} title="Karaoke mode" style={{
                padding: '6px 10px', borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.06em',
                color: 'rgba(245,158,11,0.7)', border: '1px solid rgba(245,158,11,0.2)',
                background: 'rgba(245,158,11,0.04)', transition: 'all 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.12)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,158,11,0.04)'}
              >🎵</button>
            )}

            <button onClick={onRevive} title="Move back to active drilling" style={{
              padding: '6px 12px', borderRadius: 5, cursor: 'pointer', flexShrink: 0,
              fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.1em',
              color: 'rgba(148,163,184,0.4)', border: '1px solid rgba(148,163,184,0.1)',
              background: 'transparent', transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.color = NEON; e.currentTarget.style.borderColor = `${NEON}30` }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(148,163,184,0.4)'; e.currentTarget.style.borderColor = 'rgba(148,163,184,0.1)' }}
            >REVIVE</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Add text form ────────────────────────────────────────────────────────────
function AddTextForm({ onSave, onCancel }: {
  onSave:  (d: NewTextData) => void
  onCancel:() => void
}) {
  const [title,    setTitle]    = useState('')
  const [author,   setAuthor]   = useState('')
  const [type,     setType]     = useState<TextType>('poem')
  const [language, setLanguage] = useState<Language>('RU')
  const [rawText,  setRawText]  = useState('')
  const [deadline, setDeadline] = useState('')
  const [preview,  setPreview]  = useState<string[]>([])

  useEffect(() => {
    if (rawText.trim()) setPreview(autoChunk(rawText, type))
    else setPreview([])
  }, [rawText, type])

  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 5,
    background: 'rgba(0,0,0,0.5)', border: `1px solid ${NEON}18`,
    outline: 'none', fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)',
    color: 'rgba(200,255,230,0.85)', letterSpacing: '0.03em',
    userSelect: 'text', WebkitUserSelect: 'text', transition: 'border-color 0.15s',
  }
  const chipStyle = (on: boolean) => ({
    padding: '4px 9px', borderRadius: 4, cursor: 'pointer',
    fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em',
    color: on ? NEON : 'rgba(148,163,184,0.35)',
    background: on ? NEON_DIM : 'transparent',
    border: `1px solid ${on ? `${NEON}40` : 'rgba(255,255,255,0.05)'}`,
    transition: 'all 0.12s',
  })

  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${NEON}15`,
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onCancel} style={{ fontSize: 11, color: `${NEON}50`, letterSpacing: '0.1em',
          transition: 'color 0.12s' }}
          onMouseEnter={e => e.currentTarget.style.color = NEON}
          onMouseLeave={e => e.currentTarget.style.color = `${NEON}50`}
        >← BACK</button>
        <p style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 900,
          color: NEON, letterSpacing: '0.2em', textShadow: `0 0 8px ${NEON}` }}>IMPORT TEXT</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {/* Title + Author */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title *"
            style={{ ...inp, flex: 2 }}
            onFocus={e => e.target.style.borderColor = `${NEON}50`}
            onBlur={e => e.target.style.borderColor = `${NEON}18`} />
          <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Author"
            style={{ ...inp, flex: 1 }}
            onFocus={e => e.target.style.borderColor = `${NEON}50`}
            onBlur={e => e.target.style.borderColor = `${NEON}18`} />
        </div>

        {/* Type */}
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 7.5, color: `${NEON}50`,
            letterSpacing: '0.15em', marginBottom: 6 }}>TEXT TYPE</p>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {(['poem','monologue','role','song','prose'] as TextType[]).map(t => (
              <button key={t} onClick={() => setType(t)} style={chipStyle(type === t)}>
                {TEXT_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 7.5, color: `${NEON}50`,
            letterSpacing: '0.15em', marginBottom: 6 }}>LANGUAGE</p>
          <div style={{ display: 'flex', gap: 5 }}>
            {(['RU','EN','CN','other'] as Language[]).map(l => (
              <button key={l} onClick={() => setLanguage(l)} style={chipStyle(language === l)}>
                {LANG_LABEL[l]}
              </button>
            ))}
          </div>
        </div>

        {/* Deadline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font)', fontSize: 7.5, color: `${NEON}50`,
            letterSpacing: '0.15em', flexShrink: 0 }}>DEADLINE</span>
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
            style={{ ...inp, flex: 1 }}
            onFocus={e => e.target.style.borderColor = `${NEON}50`}
            onBlur={e => e.target.style.borderColor = `${NEON}18`} />
        </div>

        {/* Raw text */}
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 7.5, color: `${NEON}50`,
            letterSpacing: '0.15em', marginBottom: 6 }}>PASTE TEXT *</p>
          <textarea value={rawText} onChange={e => setRawText(e.target.value)}
            placeholder={'Paste your text here...\n\nFor poems: separate stanzas with empty lines.\nFor roles: format as CHARACTER: dialogue\nFor prose: natural paragraphs.'}
            rows={10}
            style={{ ...inp, resize: 'none', lineHeight: 1.7 }}
            onFocus={e => e.target.style.borderColor = `${NEON}50`}
            onBlur={e => e.target.style.borderColor = `${NEON}18`}
          />
        </div>

        {/* Chunk preview */}
        {preview.length > 0 && (
          <div style={{ padding: '10px 12px', borderRadius: 8,
            background: `${NEON}05`, border: `1px solid ${NEON}18` }}>
            <p style={{ fontFamily: 'var(--font)', fontSize: 8, fontWeight: 700,
              color: NEON, letterSpacing: '0.18em', marginBottom: 8 }}>
              PREVIEW — {preview.length} CHUNKS
            </p>
            {preview.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6,
                padding: '6px 8px', borderRadius: 6,
                background: 'rgba(0,228,160,0.03)', borderLeft: `2px solid ${NEON}30` }}>
                <span style={{ fontFamily: 'var(--font)', fontSize: 7.5, color: `${NEON}50`,
                  flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)',
                  color: 'rgba(200,255,230,0.55)', lineHeight: 1.6 }}>{c}</p>
              </div>
            ))}
          </div>
        )}

        {/* Save */}
        <button
          disabled={!title.trim() || !rawText.trim()}
          onClick={() => onSave({ title: title.trim(), author: author.trim(), type, language, rawText: rawText.trim(), deadline: deadline || null })}
          style={{
            padding: '10px', borderRadius: 6, cursor: title.trim() && rawText.trim() ? 'pointer' : 'default',
            fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 800, letterSpacing: '0.12em',
            color: title.trim() && rawText.trim() ? NEON : 'rgba(148,163,184,0.25)',
            border: `1px solid ${title.trim() && rawText.trim() ? `${NEON}40` : 'rgba(255,255,255,0.05)'}`,
            background: title.trim() && rawText.trim() ? NEON_DIM : 'transparent',
            transition: 'all 0.15s',
          }}
        >LOAD INTO A.R.D.O</button>
      </div>
    </div>
  )
}

// ─── Session view ─────────────────────────────────────────────────────────────
type Phase = 'showing' | 'cue' | 'hint' | 'revealed' | 'done'

function SessionView({ items, mode, language, onFinish, onUpdateState }: {
  items:         SessionItem[]
  mode:          SessionType
  language:      Language
  onFinish:      (results: { cardId: string; score: number }[]) => void
  onUpdateState: (fn: (s: ArdoState) => ArdoState) => void
}) {
  const [idx,     setIdx]     = useState(0)
  const [phase,   setPhase]   = useState<Phase>(mode === 'learn' ? 'showing' : 'cue')
  const [results, setResults] = useState<{ cardId: string; score: number }[]>([])

  const current = items[idx]
  const total   = items.length
  const pct     = Math.round((idx / total) * 100)

  const next = useCallback(() => {
    if (idx + 1 >= total) {
      setPhase('done')
    } else {
      setIdx(i => i + 1)
      setPhase(mode === 'learn' ? 'showing' : 'cue')
    }
  }, [idx, total, mode])

  const rate = (score: number) => {
    setResults(prev => [...prev, { cardId: current.card.id, score }])
    next()
  }

  if (phase === 'done') {
    const avg = results.length > 0 ? results.reduce((s, r) => s + r.score, 0) / results.length : 0
    return (
      <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
        <span style={{ fontSize: 32, filter: `drop-shadow(0 0 12px ${NEON})` }}>🐢</span>
        <p style={{ fontFamily: 'var(--font)', fontSize: 14, fontWeight: 900,
          color: NEON, textShadow: `0 0 10px ${NEON}`, letterSpacing: '0.1em' }}>
          SESSION COMPLETE
        </p>
        <div style={{ display: 'flex', gap: 16 }}>
          {[
            { v: total, l: 'CHUNKS' },
            { v: mode === 'recall' ? results.length : total, l: 'REVIEWED' },
            { v: avg.toFixed(1), l: 'AVG SCORE' },
          ].map(({ v, l }) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font)', fontSize: 20, fontWeight: 900,
                color: NEON, lineHeight: 1 }}>{v}</p>
              <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${NEON}50`,
                letterSpacing: '0.1em', marginTop: 2 }}>{l}</p>
            </div>
          ))}
        </div>
        <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: `${NEON}60`,
          textAlign: 'center', lineHeight: 1.7, maxWidth: 200 }}>
          {mode === 'recall'
            ? 'SRS intervals updated. Next review scheduled.'
            : 'All chunks seen. They\'ll be queued for recall tomorrow.'}
        </p>
        <button onClick={() => onFinish(results)} style={{
          padding: '10px 28px', borderRadius: 7, cursor: 'pointer',
          fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 800,
          letterSpacing: '0.12em', color: NEON, border: `1px solid ${NEON}40`,
          background: NEON_DIM, transition: 'background 0.15s',
        }}>DONE →</button>
      </div>
    )
  }

  if (!current) return null

  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '8px 14px', flexShrink: 0,
        borderBottom: `1px solid ${NEON}10`,
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 8, color: `${NEON}50`, letterSpacing: '0.15em' }}>
          {mode === 'learn' ? 'LEARN' : 'RECALL'} · {idx + 1}/{total}
        </p>
        <div style={{ flex: 1 }}>
          <ProgressBar pct={pct} />
        </div>
        <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${NEON}40`, letterSpacing: '0.08em', flexShrink: 0 }}>
          {current.textTitle}
        </p>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
        padding: '20px 18px', overflowY: 'auto' }}>

        {/* Chunk number */}
        <p style={{ fontFamily: 'var(--font)', fontSize: 7.5, color: `${NEON}40`,
          letterSpacing: '0.18em', marginBottom: 12, textAlign: 'center' }}>
          CHUNK {current.chunk.order + 1}
        </p>

        {/* ── LEARN mode: show full text ── */}
        {mode === 'learn' && (
          <>
            <div style={{ flex: 1, padding: '16px', borderRadius: 10,
              background: `${NEON}06`, border: `1px solid ${NEON}18`,
              display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontFamily: 'var(--font)', fontSize: 14, fontWeight: 700,
                color: 'rgba(200,255,230,0.9)', lineHeight: 1.8,
                whiteSpace: 'pre-wrap', letterSpacing: '0.02em' }}>
                {current.chunk.content}
              </p>
              {current.chunk.anchor && (
                <p style={{ fontFamily: 'var(--font)', fontSize: 10,
                  color: `${NEON}60`, borderTop: `1px solid ${NEON}15`, paddingTop: 8 }}>
                  💡 {current.chunk.anchor}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexShrink: 0 }}>
              <button onClick={() => speak(current.chunk.content, language)}
                style={{ padding: '8px 14px', borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700,
                  letterSpacing: '0.1em', color: `${NEON}70`,
                  border: `1px solid ${NEON}25`, background: 'transparent', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = NEON_DIM; e.currentTarget.style.color = NEON }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = `${NEON}70` }}
              >🔊 LISTEN</button>
              <button onClick={next} style={{ flex: 1, padding: '8px', borderRadius: 6, cursor: 'pointer',
                fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 800, letterSpacing: '0.12em',
                color: NEON, border: `1px solid ${NEON}40`, background: NEON_DIM, transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,228,160,0.18)'}
                onMouseLeave={e => e.currentTarget.style.background = NEON_DIM}
              >{idx + 1 >= total ? 'FINISH' : 'NEXT →'}</button>
            </div>
          </>
        )}

        {/* ── RECALL mode ── */}
        {mode === 'recall' && (
          <>
            {/* CUE: show first line */}
            {(phase === 'cue' || phase === 'hint') && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontFamily: 'var(--font)', fontSize: 8,
                  color: `${NEON}50`, letterSpacing: '0.18em', textAlign: 'center' }}>
                  {phase === 'cue' ? 'RECALL THE FULL TEXT ↓' : '30% HINT ↓'}
                </p>
                <div style={{ padding: '16px', borderRadius: 10,
                  background: `${NEON}06`, border: `1px solid ${NEON}18` }}>
                  <p style={{ fontFamily: 'var(--font)', fontSize: 15, fontWeight: 700,
                    color: 'rgba(200,255,230,0.85)', lineHeight: 1.8,
                    whiteSpace: 'pre-wrap', letterSpacing: '0.02em' }}>
                    {phase === 'cue' ? getFirstLine(current.chunk.content) : getHint(current.chunk.content)}
                  </p>
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
                  {phase === 'cue' && (
                    <button onClick={() => setPhase('hint')} style={{
                      flex: 1, padding: '8px', borderRadius: 6, cursor: 'pointer',
                      fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700,
                      letterSpacing: '0.1em', color: '#eab308',
                      border: '1px solid rgba(234,179,8,0.3)', background: 'rgba(234,179,8,0.06)',
                      transition: 'background 0.15s',
                    }}>HINT 30%</button>
                  )}
                  <button onClick={() => setPhase('revealed')} style={{
                    flex: 2, padding: '8px', borderRadius: 6, cursor: 'pointer',
                    fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 800,
                    letterSpacing: '0.12em', color: NEON,
                    border: `1px solid ${NEON}40`, background: NEON_DIM, transition: 'background 0.15s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,228,160,0.18)'}
                    onMouseLeave={e => e.currentTarget.style.background = NEON_DIM}
                  >REVEAL</button>
                </div>
              </div>
            )}

            {/* REVEALED: show full text + rate */}
            {phase === 'revealed' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ padding: '14px 16px', borderRadius: 10,
                  background: `${NEON}06`, border: `1px solid ${NEON}20` }}>
                  <p style={{ fontFamily: 'var(--font)', fontSize: 14, fontWeight: 600,
                    color: 'rgba(200,255,230,0.88)', lineHeight: 1.8,
                    whiteSpace: 'pre-wrap', letterSpacing: '0.02em' }}>
                    {current.chunk.content}
                  </p>
                </div>
                <div style={{ flex: 1 }} />
                <p style={{ fontFamily: 'var(--font)', fontSize: 8, color: `${NEON}50`,
                  letterSpacing: '0.18em', textAlign: 'center', flexShrink: 0 }}>
                  HOW WELL DID YOU RECALL?
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 7, flexShrink: 0 }}>
                  {SCORE_LABELS.map(({ score, label, emoji, color }) => (
                    <button key={score} onClick={() => rate(score)} style={{
                      padding: '12px 8px', borderRadius: 8, cursor: 'pointer',
                      fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 800,
                      letterSpacing: '0.08em', color,
                      border: `1px solid ${color}35`, background: `${color}08`,
                      transition: 'background 0.15s',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = `${color}15`}
                      onMouseLeave={e => e.currentTarget.style.background = `${color}08`}
                    >
                      <span style={{ fontSize: 16 }}>{emoji}</span>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main Ardo component ──────────────────────────────────────────────────────
type Screen =
  | { type: 'dashboard' }
  | { type: 'add-text' }
  | { type: 'session';  textId: string | null; mode: SessionType; items: SessionItem[]; language: Language }
  | { type: 'fullrun';  text: ArdoText }
  | { type: 'karaoke';  text: ArdoText }

export default function Ardo() {
  const [state, setState]     = useState<ArdoState>(() => loadArdoState())
  const [screen, setScreen]   = useState<Screen>({ type: 'dashboard' })
  const [tab, setTab]         = useState<'active' | 'glory'>('active')

  const persist = useCallback((s: ArdoState) => { saveArdoState(s); setState(s) }, [])

  const activeTexts = state.texts.filter(t => t.status === 'active')
  const learnedTexts = state.texts.filter(t => t.status === 'learned')
  const totalDue    = getTotalDue(state)
  const sprintDue   = getSprintDueCount(state)

  const startSession = (textId: string, mode: SessionType) => {
    const text = state.texts.find(t => t.id === textId)
    if (!text) return
    const items = mode === 'learn'
      ? getLearnItems(state, textId)
      : text.sprint
        ? getAllItems(state, textId)   // sprint uses ALL chunks, not just due
        : getDueItems(state, textId)
    if (items.length === 0) return
    setScreen({ type: 'session', textId, mode, items, language: text.language })
  }

  const handleSprintStart = (textId: string) => {
    // Sprint starts with a full Learn session — schedules recall in 20min after
    persist(startSprint(state, textId))
    startSession(textId, 'learn')
  }

  const startGlobalReview = () => {
    const items = getDueItems(state, null)
    if (items.length === 0) return
    const lang = state.texts.find(t => t.id === items[0]?.chunk.textId)?.language ?? 'EN'
    setScreen({ type: 'session', textId: null, mode: 'recall', items, language: lang })
  }

  const finishSession = (results: { cardId: string; score: number }[]) => {
    if (screen.type !== 'session') return
    let newState: ArdoState
    if (screen.mode === 'learn' && screen.textId) {
      const text = state.texts.find(t => t.id === screen.textId!)
      if (text?.sprint) {
        // Sprint learn: don't re-schedule, sprint manages timing
        newState = state
      } else {
        newState = applyLearnSession(state, screen.textId)
      }
    } else if (screen.textId) {
      const text = state.texts.find(t => t.id === screen.textId!)
      if (text?.sprint) {
        // Sprint recall: advance to next stage
        newState = advanceSprint(state, screen.textId)
      } else {
        newState = applySessionResults(state, results)
      }
    } else {
      newState = applySessionResults(state, results)
    }
    persist(newState)
    setScreen({ type: 'dashboard' })
  }

  const finishFullRun = (_score: number) => {
    // Full run doesn't change SRS — it's a performance check only
    setScreen({ type: 'dashboard' })
  }

  // ── Full run screen ──
  if (screen.type === 'fullrun') {
    return <FullRunView text={screen.text} onDone={finishFullRun} />
  }

  // ── Karaoke screen ──
  if (screen.type === 'karaoke') {
    return <KaraokeView text={screen.text} onDone={() => setScreen({ type: 'dashboard' })} />
  }

  // ── Session screen ──
  if (screen.type === 'session') {
    return (
      <SessionView
        items={screen.items}
        mode={screen.mode}
        language={screen.language}
        onFinish={finishSession}
        onUpdateState={fn => persist(fn(state))}
      />
    )
  }

  // ── Add text screen ──
  if (screen.type === 'add-text') {
    return (
      <AddTextForm
        onSave={data => { persist(addText(state, data)); setScreen({ type: 'dashboard' }) }}
        onCancel={() => setScreen({ type: 'dashboard' })}
      />
    )
  }

  // ── Dashboard ──
  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '8px 14px', flexShrink: 0,
        borderBottom: `1px solid ${NEON}12`, background: 'rgba(0,8,5,0.6)',
        display: 'flex', alignItems: 'center', gap: 14 }}>
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 900,
            color: NEON, letterSpacing: '0.2em', textShadow: `0 0 10px ${NEON}` }}>A.R.D.O</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${NEON}40`, letterSpacing: '0.1em' }}>
            ADAPTIVE RECALL & DRILLING OPERATOR
          </p>
        </div>
        <div style={{ flex: 1 }} />
        {[
          { v: String(state.profile.streak), l: 'STREAK',  c: state.profile.streak > 0 ? '#ff6b00' : `${NEON}50`, suffix: '🔥' },
          { v: String(totalDue),             l: 'DUE',     c: totalDue > 0 ? '#ff4444' : `${NEON}50`, suffix: '' },
          { v: String(learnedTexts.length),  l: 'REPERTOIRE', c: learnedTexts.length > 0 ? '#f59e0b' : `${NEON}50`, suffix: '' },
        ].map(({ v, l, c, suffix }) => (
          <div key={l} style={{ textAlign: 'right' }}>
            <p style={{ fontFamily: 'var(--font)', fontSize: 14, fontWeight: 900, color: c, lineHeight: 1 }}>
              {v}{suffix}
            </p>
            <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: 'rgba(0,228,160,0.3)',
              letterSpacing: '0.1em' }}>{l}</p>
          </div>
        ))}
        <button onClick={() => setScreen({ type: 'add-text' })} style={{
          width: 28, height: 28, borderRadius: 7, fontSize: 16, fontWeight: 700,
          color: `${NEON}80`, border: `1px solid ${NEON}30`,
          background: NEON_DIM, cursor: 'pointer', transition: 'all 0.15s',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
          onMouseEnter={e => { e.currentTarget.style.color = NEON; e.currentTarget.style.background = 'rgba(0,228,160,0.18)' }}
          onMouseLeave={e => { e.currentTarget.style.color = `${NEON}80`; e.currentTarget.style.background = NEON_DIM }}
        >+</button>
      </div>

      {/* Global review CTA */}
      {totalDue > 0 && (
        <button onClick={startGlobalReview} style={{
          margin: '8px 10px 2px', padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          background: 'rgba(255,68,68,0.07)', border: '1px solid rgba(255,68,68,0.25)',
          transition: 'background 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,68,68,0.12)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,68,68,0.07)'}
        >
          <span style={{ fontSize: 16 }}>🔴</span>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <p style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 800,
              color: '#ff4444', letterSpacing: '0.15em' }}>START TODAY'S REVIEW</p>
            <p style={{ fontFamily: 'var(--font)', fontSize: 7.5, color: 'rgba(255,68,68,0.5)',
              letterSpacing: '0.06em', marginTop: 1 }}>
              {totalDue} chunks need drilling across all texts
            </p>
          </div>
          <span style={{ fontFamily: 'var(--font)', fontSize: 9, color: 'rgba(255,68,68,0.5)' }}>→</span>
        </button>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${NEON}12`, flexShrink: 0,
        background: 'rgba(0,8,5,0.3)' }}>
        {([
          ['active', `ACTIVE (${activeTexts.length})`,         NEON],
          ['glory',  `REPERTOIRE (${learnedTexts.length})`, '#f59e0b'],
        ] as [typeof tab, string, string][]).map(([id, label, color]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: '8px 4px', cursor: 'pointer',
            fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: tab === id ? 700 : 400,
            letterSpacing: '0.1em',
            color: tab === id ? color : 'rgba(148,163,184,0.3)',
            textShadow: tab === id ? `0 0 8px ${color}` : 'none',
            background: 'transparent',
            borderBottom: tab === id ? `2px solid ${color}` : '2px solid transparent',
            transition: 'all 0.15s',
          }}>{label}</button>
        ))}
      </div>

      {/* Text list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ── ACTIVE tab ── */}
        {tab === 'active' && (
          <>
            {activeTexts.length === 0 && (
              <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 12, filter: `drop-shadow(0 0 12px ${NEON})` }}>🐢</div>
                <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-md)',
                  color: 'rgba(0,228,160,0.2)', marginBottom: 6 }}>NO TEXTS LOADED</p>
                <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)',
                  color: `${NEON}18`, lineHeight: 1.8, letterSpacing: '0.08em' }}>
                  Import a poem, monologue, role or song.<br/>
                  A.R.D.O will drill it into permanent memory.
                </p>
                <button onClick={() => setScreen({ type: 'add-text' })} style={{
                  marginTop: 18, padding: '8px 22px', borderRadius: 7, cursor: 'pointer',
                  fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700,
                  letterSpacing: '0.12em', color: NEON, border: `1px solid ${NEON}40`,
                  background: NEON_DIM, transition: 'background 0.15s',
                }}>+ IMPORT FIRST TEXT</button>
              </div>
            )}
            {activeTexts.map(text => (
              <TextCard key={text.id} text={text} state={state}
                onStudy={mode => startSession(text.id, mode)}
                onMarkLearned={() => persist(markTextLearned(state, text.id))}
                onSprintStart={() => handleSprintStart(text.id)}
                onFullRun={() => setScreen({ type: 'fullrun', text })}
                onKaraoke={text.type === 'song' ? () => setScreen({ type: 'karaoke', text }) : undefined}
              />
            ))}
          </>
        )}

        {/* ── REPERTOIRE tab ── */}
        {tab === 'glory' && (
          <>
            {learnedTexts.length === 0 && (
              <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>🏛️</div>
                <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-md)',
                  color: 'rgba(245,158,11,0.2)', marginBottom: 6 }}>REPERTOIRE IS EMPTY</p>
                <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)',
                  color: 'rgba(245,158,11,0.15)', lineHeight: 1.8, letterSpacing: '0.08em' }}>
                  Master a text and mark it as learned.<br/>
                  Your repertoire grows with every text you master.
                </p>
              </div>
            )}

            {learnedTexts.length > 0 && (
              <div style={{ padding: '10px 14px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16, filter: 'drop-shadow(0 0 6px rgba(245,158,11,0.6))' }}>✦</span>
                <p style={{ fontFamily: 'var(--font)', fontSize: 8, fontWeight: 700,
                  color: 'rgba(245,158,11,0.5)', letterSpacing: '0.2em' }}>
                  {learnedTexts.length} TEXT{learnedTexts.length !== 1 ? 'S' : ''} IN YOUR REPERTOIRE
                </p>
              </div>
            )}

            {learnedTexts.map(text => (
              <GloryCard key={text.id} text={text} state={state}
                onRevive={() => { persist(reviveText(state, text.id)); setTab('active') }}
                onFullRun={() => setScreen({ type: 'fullrun', text })}
                onKaraoke={text.type === 'song' ? () => setScreen({ type: 'karaoke', text }) : undefined}
              />
            ))}
          </>
        )}

        <div style={{ height: 16 }} />
      </div>
    </div>
  )
}
