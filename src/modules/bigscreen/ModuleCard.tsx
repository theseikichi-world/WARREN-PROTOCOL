import { useState } from 'react'
import { t as tr } from '../../i18n'
import { CyberIcon } from '../../components/CyberIcon'
import type { GuildMember } from '../../guild'
import type { ModuleSummaries } from './moduleStats'

// ─── Living cards — between an icon and the full app ──────────────────────────
// Every guild member keeps the same shell (icon · name · headline · footer) but
// renders its own signature micro-visualisation, so the dashboard reads like a
// control room instead of a launcher.

const MACRO_COLOR = { protein: '#ff5470', carbs: '#4ade80', fat: '#ffb13c' } as const

// ── Micro-viz primitives ──
function WeekDots({ dots, neon }: { dots: boolean[]; neon: string }) {
  const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const todayIdx = (new Date().getDay() + 6) % 7   // Mon-indexed
  return (
    <div style={{ display: 'flex', gap: 5 }}>
      {dots.map((on, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div style={{
            width: 15, height: 15, borderRadius: 5,
            background: on ? `${neon}30` : 'rgba(255,255,255,0.04)',
            border: `1px solid ${on ? `${neon}70` : 'rgba(255,255,255,0.07)'}`,
            boxShadow: on ? `0 0 7px ${neon}45` : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10.5, color: neon, lineHeight: 1,
          }}>{on ? '✓' : ''}</div>
          <span style={{ fontFamily: 'var(--font)', fontSize: 11,
            color: i === todayIdx ? `${neon}b0` : 'rgba(148,163,184,0.35)',
            fontWeight: i === todayIdx ? 800 : 400 }}>{LETTERS[i]}</span>
        </div>
      ))}
    </div>
  )
}

function Bar({ pct, color, label, value }: { pct: number; color: string; label?: string; value?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {(label || value) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          {label && <span style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 700,
            color: `${color}c0`, letterSpacing: '0.1em' }}>{label}</span>}
          {value && <span style={{ fontFamily: 'var(--font)', fontSize: 11,
            color: 'rgba(148,163,184,0.5)' }}>{value}</span>}
        </div>
      )}
      <div style={{ height: 4, borderRadius: 2, overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
        <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: color,
          boxShadow: `0 0 6px ${color}70`, borderRadius: 2, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}

function Ring({ pct, color, label }: { pct: number; color: string; label: string }) {
  const R = 19, C = 2 * Math.PI * R
  const over = pct > 100
  const c = over ? '#ff5470' : color
  return (
    <div style={{ position: 'relative', width: 48, height: 48, flexShrink: 0 }}>
      <svg width="48" height="48" viewBox="0 0 48 48" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="24" cy="24" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="4" />
        <circle cx="24" cy="24" r={R} fill="none" stroke={c} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={`${C * Math.min(1, pct / 100)} ${C}`}
          style={{ filter: `drop-shadow(0 0 4px ${c})`, transition: 'stroke-dasharray 0.6s ease' }} />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 900,
        color: c, textShadow: `0 0 8px ${c}70` }}>{label}</span>
    </div>
  )
}

/** Big number + caption, the card's headline metric. */
function Metric({ value, caption, color }: { value: string; caption: string; color: string }) {
  return (
    <div style={{ textAlign: 'right', flexShrink: 0 }}>
      <p style={{ fontFamily: 'var(--font)', fontSize: 20, fontWeight: 900, color, lineHeight: 1,
        textShadow: `0 0 12px ${color}55` }}>{value}</p>
      <p style={{ fontFamily: 'var(--font)', fontSize: 11, color: 'rgba(148,163,184,0.5)',
        letterSpacing: '0.12em', marginTop: 4, whiteSpace: 'nowrap' }}>{caption}</p>
    </div>
  )
}

const footerStyle = (color: string): React.CSSProperties => ({
  fontFamily: 'var(--font)', fontSize: 10.5, color: `${color}95`,
  letterSpacing: '0.03em', marginTop: 'auto', paddingTop: 8,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
})
const emptyStyle: React.CSSProperties = {
  fontFamily: 'var(--font)', fontSize: 10.5, color: 'rgba(148,163,184,0.4)',
  letterSpacing: '0.03em', marginTop: 'auto', paddingTop: 8,
}

// ─── The card ─────────────────────────────────────────────────────────────────
export function ModuleCard({ member, sums, onOpen }: {
  member: GuildMember
  sums:   ModuleSummaries
  onOpen: () => void
}) {
  const [hov, setHov] = useState(false)
  const neon = member.neon

  // Each module contributes a headline metric and a body — the rest is shared.
  let metric: React.ReactNode = null
  let body:   React.ReactNode = null
  let footer: React.ReactNode = null

  if (member.id === 'scrap7' && sums.scrap7) {
    const s = sums.scrap7
    metric = <Metric value={String(s.due)} caption={tr('OPEN', 'ОТКРЫТО')} color={neon} />
    body = (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <WeekDots dots={s.weekDots} neon={neon} />
        {s.streak > 0 && (
          <span style={{ fontFamily: 'var(--font)', fontSize: 12.5, fontWeight: 900,
            color: '#ff6b00', textShadow: '0 0 8px rgba(255,107,0,0.5)', marginBottom: 9 }}>
            {s.streak}🔥</span>
        )}
      </div>
    )
    footer = s.next
      ? <p style={footerStyle(neon)}>▸ {s.next}</p>
      : <p style={emptyStyle}>{tr('All clear today ✓', 'На сегодня всё ✓')}</p>
  }

  else if (member.id === 'log' && sums.log) {
    const s = sums.log
    const pct = s.total > 0 ? (s.done / s.total) * 100 : 0
    metric = <Metric value={String(s.active)} caption={tr('MISSIONS', 'МИССИЙ')} color={neon} />
    body = s.dream ? (
      <div>
        <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 700, color: 'rgba(230,240,255,0.85)',
          marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          ✦ {s.dream}</p>
        <Bar pct={pct} color={neon} value={`${s.done}/${s.total}`} />
      </div>
    ) : <p style={emptyStyle}>{tr('No dreams charted yet', 'Мечты ещё не намечены')}</p>
    footer = s.next ? <p style={footerStyle(neon)}>▸ {s.next}</p> : null
  }

  else if (member.id === 'ardo' && sums.ardo) {
    const s = sums.ardo
    metric = <Metric value={String(s.due)} caption={tr('DUE', 'К ПОВТОРУ')}
      color={s.due > 0 ? '#ff4444' : neon} />
    body = s.texts > 0 ? (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: `${neon}a0`,
            letterSpacing: '0.1em' }}>{tr('MASTERY', 'ОСВОЕНО')}</span>
          <span style={{ fontFamily: 'var(--font)', fontSize: 10.5, fontWeight: 800, color: neon }}>
            {s.mastery}%</span>
        </div>
        <Bar pct={s.mastery} color={neon} />
        <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: 'rgba(148,163,184,0.45)', marginTop: 5 }}>
          {s.texts} {tr('texts in training', 'текстов в работе')}</p>
      </div>
    ) : <p style={emptyStyle}>{tr('No texts loaded', 'Нет текстов')}</p>
    footer = s.next ? <p style={footerStyle(neon)}>▸ {s.next}</p> : null
  }

  else if (member.id === 'pomu' && sums.solaris) {
    const s = sums.solaris
    metric = <Metric value={String(s.kcalLeft)} caption={tr('KCAL LEFT', 'ККАЛ ОСТ.')} color={neon} />
    body = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Ring pct={s.kcalPct} color={neon} label={`${s.kcalPct}%`} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          {s.macros.map(m => (
            <Bar key={m.key} pct={m.pct} color={MACRO_COLOR[m.key]}
              label={m.key === 'protein' ? tr('PRO', 'БЕЛ') : m.key === 'carbs' ? tr('CAR', 'УГЛ') : tr('FAT', 'ЖИР')} />
          ))}
          <Bar pct={s.waterPct} color="#38bdf8" label="💧" />
        </div>
      </div>
    )
    footer = s.member ? <p style={footerStyle(neon)}>▸ {s.member}</p> : null
  }

  else if (member.id === 'foxy' && sums.pictures) {
    const s = sums.pictures
    metric = <Metric value={String(s.catchUp || s.watching)}
      caption={s.catchUp > 0 ? tr('TO WATCH', 'К ПРОСМОТРУ') : tr('WATCHING', 'СМОТРЮ')} color={neon} />
    body = s.title ? (
      <div>
        <p style={{ fontFamily: 'var(--font)', fontSize: 12, fontWeight: 700, color: 'rgba(255,240,225,0.9)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          🎬 {s.title}</p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, marginTop: 5,
          color: s.detail ? '#4ade80' : s.days === 0 ? '#4ade80' : `${neon}b0` }}>
          {s.detail
            ? `🍿 ${s.detail}`
            : s.days === null ? tr('no schedule yet', 'расписания пока нет')
            : s.days === 0 ? tr('new episode today!', 'новый эпизод сегодня!')
            : s.days === 1 ? tr('next episode tomorrow', 'новый эпизод завтра')
            : `${tr('next episode in', 'новый эпизод через')} ${s.days} ${tr('days', 'дн.')}`}</p>
      </div>
    ) : <p style={emptyStyle}>{tr('Library is empty', 'Библиотека пуста')}</p>
    footer = null
  }

  else if (member.id === 'hoot' && sums.journal) {
    const s = sums.journal
    metric = <Metric value={s.streak > 0 ? `${s.streak}🔥` : '0'} caption={tr('DAY STREAK', 'ДНЕЙ ПОДРЯД')} color={neon} />
    body = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          padding: '5px 10px', borderRadius: 8,
          background: s.writtenToday ? 'rgba(57,255,20,0.08)' : `${neon}0c`,
          border: `1px solid ${s.writtenToday ? 'rgba(57,255,20,0.3)' : `${neon}30`}`,
        }}>
          <span style={{ fontFamily: 'var(--font)', fontSize: 10.5, fontWeight: 800,
            color: s.writtenToday ? '#39ff14' : neon, letterSpacing: '0.06em' }}>
            {s.writtenToday ? tr("✓ TODAY'S PAGE SEALED", '✓ СТРАНИЦА ЗАПИСАНА') : tr("○ TODAY IS BLANK", '○ СЕГОДНЯ ПУСТО')}</span>
        </div>
        <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: `${neon}90` }}>
          🎟 {s.stickers}</span>
      </div>
    )
    footer = <p style={emptyStyle}>{s.entries} {tr('entries logged', 'записей всего')}</p>
  }

  // A module with no data yet (or one whose read failed) still deserves a face
  if (!body) {
    body = (
      <p style={emptyStyle}>
        {member.id === 'pomu'
          ? tr('No crew calibrated yet', 'Экипаж ещё не откалиброван')
          : tr('Nothing here yet — tap to begin', 'Пока пусто — нажмите, чтобы начать')}
      </p>
    )
  }

  return (
    <button onClick={onOpen}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', flexDirection: 'column', textAlign: 'left', cursor: 'pointer',
        padding: '14px 15px 13px', borderRadius: 14, minHeight: 148, minWidth: 0,
        background: `linear-gradient(150deg, ${neon}0e, rgba(13,24,48,0.42))`,
        border: `1px solid ${hov ? `${neon}60` : `${neon}22`}`,
        boxShadow: hov ? `0 0 24px ${neon}22` : 'none',
        transition: 'all 0.18s',
      }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, marginBottom: 12 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${neon}12`, border: `1px solid ${neon}35`,
        }}>
          <CyberIcon id={member.id} size={17} color={neon} glow />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 12, fontWeight: 900, color: neon,
            letterSpacing: '0.1em', textShadow: `0 0 8px ${neon}50`,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name}</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: 'rgba(148,163,184,0.5)',
            letterSpacing: '0.05em', marginTop: 3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {hov ? tr('OPEN →', 'ОТКРЫТЬ →') : member.role}</p>
        </div>
        {metric}
      </div>

      {/* Signature visualisation */}
      {body}
      {footer}
    </button>
  )
}
