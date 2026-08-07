import { useState } from 'react'
import { t as tr } from '../../i18n'
import { fmtClock, fmtDur, type Block } from '../infinity8/store'

// ─── Day ribbon — the whole day as one horizontal bar ─────────────────────────
// Replaces the tall vertical timeline on the Warren OS dashboard: same data,
// a fraction of the space, and it reads like a game's day/night cycle.

const KIND_COLOR: Record<Block['kind'], string> = {
  meal:       '#ffb13c',
  work:       '#7c83ff',
  event:      '#ff6b6b',
  commitment: '#22d3ee',
  break:      '#64748b',
  free:       '#39ff14',
}
const KIND_ICON: Record<Block['kind'], string> = {
  meal: '🍽', work: '💼', event: '◆', commitment: '◇', break: '·', free: '✦',
}

export function DayRibbon({ blocks, wakeMin, sleepMin, nowMin, freeMinutes, current, pendingCount, onOpenConfig, onGo }: {
  blocks:       Block[]
  wakeMin:      number
  sleepMin:     number
  nowMin:       number
  freeMinutes:  number
  current:      Block | null
  pendingCount: number
  onOpenConfig: () => void
  onGo:         (path: string) => void
}) {
  const [hov, setHov] = useState<string | null>(null)

  const lastEnd = blocks.reduce((m, b) => Math.max(m, b.end), sleepMin)
  const start   = wakeMin
  const end     = Math.max(sleepMin, lastEnd)
  const span    = Math.max(1, end - start)
  const pct     = (min: number) => ((min - start) / span) * 100

  // Hour ticks — every 2h, and never so dense they turn into noise
  const step  = span > 16 * 60 ? 180 : 120
  const ticks: number[] = []
  for (let h = Math.ceil(start / 60) * 60; h <= end; h += step) ticks.push(h)

  const nowIn = nowMin >= start && nowMin <= end
  const overdue = end > sleepMin   // work spilled past bedtime

  return (
    <div style={{ marginTop: 16 }}>
      {/* Header — what's happening + what's left */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
        <span style={{ fontSize: 17.5, filter: 'drop-shadow(0 0 8px #22d3ee)',
          animation: 'pulse 2.4s ease-in-out infinite' }}>∞</span>
        <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 800,
          color: 'rgba(34,211,238,0.75)', letterSpacing: '0.2em' }}>
          {tr("TODAY'S FLOW", 'ПОТОК ДНЯ')}</span>

        {current && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ color: 'rgba(148,163,184,0.3)' }}>·</span>
            <span style={{ fontSize: 12.5 }}>{KIND_ICON[current.kind]}</span>
            <span style={{ fontFamily: 'var(--font)', fontSize: 12.5, fontWeight: 700,
              color: KIND_COLOR[current.kind], textShadow: `0 0 8px ${KIND_COLOR[current.kind]}50`,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
              {current.label}</span>
            <span style={{ fontFamily: 'var(--font)', fontSize: 10.5, color: 'rgba(148,163,184,0.5)' }}>
              {tr('until', 'до')} {fmtClock(current.end)}</span>
          </span>
        )}

        <div style={{ flex: 1 }} />

        {pendingCount > 0 && (
          <span style={{ fontFamily: 'var(--font)', fontSize: 10.5, fontWeight: 800,
            color: 'rgba(255,215,0,0.8)', letterSpacing: '0.08em', padding: '3px 8px',
            borderRadius: 6, border: '1px solid rgba(255,215,0,0.28)', background: 'rgba(255,215,0,0.06)' }}>
            {pendingCount} {tr('OPEN', 'ОТКРЫТО')}</span>
        )}
        <span style={{ fontFamily: 'var(--font)', fontSize: 14.5, fontWeight: 900, color: '#39ff14',
          textShadow: '0 0 10px rgba(57,255,20,0.45)' }}>{fmtDur(freeMinutes)}</span>
        <span style={{ fontFamily: 'var(--font)', fontSize: 10, color: 'rgba(57,255,20,0.5)',
          letterSpacing: '0.12em' }}>{tr('FREE LEFT', 'СВОБОДНО')}</span>
        <button onClick={onOpenConfig} title={tr('Day anchors & weekly optimize', 'Опоры дня и оптимизация недели')}
          style={{
            width: 24, height: 24, borderRadius: 7, fontSize: 13.5, cursor: 'pointer', marginLeft: 4,
            color: 'rgba(34,211,238,0.6)', border: '1px solid rgba(34,211,238,0.25)',
            background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>⚙</button>
      </div>

      {/* The bar */}
      <div style={{
        position: 'relative', height: 46, borderRadius: 11, overflow: 'hidden',
        border: '1px solid rgba(34,211,238,0.18)',
        // faint dawn → noon → dusk wash behind the segments
        background: 'linear-gradient(90deg, rgba(255,177,60,0.06), rgba(34,211,238,0.05) 40%, rgba(124,131,255,0.06) 75%, rgba(20,10,40,0.2))',
      }}>
        {blocks.map(b => {
          const w = pct(b.end) - pct(b.start)
          if (w <= 0) return null
          const color   = KIND_COLOR[b.kind]
          const isFree  = b.kind === 'free'
          const isNow   = nowMin >= b.start && nowMin < b.end
          const past    = b.end <= nowMin
          const hovered = hov === b.id
          const wide    = w > 7

          return (
            <button key={b.id}
              onMouseEnter={() => setHov(b.id)} onMouseLeave={() => setHov(null)}
              onClick={() => onGo(b.kind === 'commitment' ? '/scrap7' : '/infinity8')}
              title={`${b.label} · ${fmtClock(b.start)}–${fmtClock(b.end)}${b.done ? ' ✓' : ''}`}
              style={{
                position: 'absolute', top: 0, bottom: 0,
                left: `${pct(b.start)}%`, width: `calc(${w}% - 1px)`,
                display: 'flex', alignItems: 'center', justifyContent: wide ? 'flex-start' : 'center',
                gap: 5, padding: wide ? '0 8px' : 0, cursor: 'pointer', overflow: 'hidden',
                background: isFree
                  ? (past ? 'rgba(57,255,20,0.03)' : 'rgba(57,255,20,0.07)')
                  : `${color}${hovered ? '38' : past ? '14' : '24'}`,
                borderLeft: `2px solid ${isFree ? 'rgba(57,255,20,0.25)' : color}${past ? '60' : ''}`,
                borderTop: 'none', borderRight: 'none', borderBottom: 'none',
                opacity: b.done ? 0.4 : past ? 0.55 : 1,
                boxShadow: isNow ? `inset 0 0 20px ${color}30` : 'none',
                transition: 'background 0.15s, opacity 0.15s',
              }}>
              <span style={{ fontSize: 11.5, flexShrink: 0, opacity: 0.85 }}>
                {b.done ? '✓' : KIND_ICON[b.kind]}</span>
              {wide && (
                <span style={{
                  fontFamily: 'var(--font)', fontSize: 11, fontWeight: 700, minWidth: 0,
                  color: isFree ? 'rgba(57,255,20,0.75)' : 'rgba(230,248,255,0.92)',
                  textDecoration: b.done ? 'line-through' : 'none',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                }}>{b.label}</span>
              )}
            </button>
          )
        })}

        {/* Bedtime edge — everything right of it is overdue spill */}
        {overdue && (
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pct(sleepMin)}%`,
            width: 0, borderLeft: '1px dashed rgba(255,84,112,0.5)', pointerEvents: 'none' }} />
        )}

        {/* NOW marker */}
        {nowIn && (
          <div style={{ position: 'absolute', top: -1, bottom: -1, left: `${pct(nowMin)}%`,
            width: 2, background: '#ff5470', boxShadow: '0 0 10px #ff5470',
            pointerEvents: 'none', zIndex: 3 }}>
            <div style={{ position: 'absolute', top: -3, left: -3, width: 8, height: 8,
              borderRadius: '50%', background: '#ff5470', boxShadow: '0 0 8px #ff5470' }} />
          </div>
        )}
      </div>

      {/* Hour ticks */}
      <div style={{ position: 'relative', height: 14, marginTop: 3 }}>
        {ticks.map(t => (
          <span key={t} style={{
            position: 'absolute', left: `${pct(t)}%`, transform: 'translateX(-50%)',
            fontFamily: 'var(--font)', fontSize: 11.5, color: 'rgba(34,211,238,0.35)',
            letterSpacing: '0.04em', whiteSpace: 'nowrap',
          }}>{fmtClock(t)}</span>
        ))}
        {overdue && (
          <span style={{ position: 'absolute', right: 0, fontFamily: 'var(--font)', fontSize: 11.5,
            color: 'rgba(255,84,112,0.6)', letterSpacing: '0.08em' }}>
            {tr('past bedtime', 'после отбоя')}</span>
        )}
      </div>
    </div>
  )
}
