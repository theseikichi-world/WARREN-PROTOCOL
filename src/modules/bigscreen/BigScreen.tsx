import { useState, useEffect, useMemo, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri, loadSettings } from '../../settings'
import { t as tr } from '../../i18n'
import { getHubStats, type HubStats } from '../../hubStats'
import {
  getNowSnapshot, getTodayCommitments, loadInf8State,
  fmtDur, fmtClock, type Commitment,
} from '../infinity8/store'
import { gatherSuggestions, type Suggestion } from '../infinity8/suggestions'
import { filterApps, monogram, tileNeon, groupByLetter, type AppEntry } from './apps'

const NEON = '#00f5ff'
const GOLD = '#ffd700'
const BG   = 'rgb(3,7,14)'   // fully opaque — Warren OS covers the desktop completely

const TONE: Record<Suggestion['tone'], string> = {
  play: '#ff8a4c', grow: '#8b9bff', care: '#ffd76b',
}

// ─── Clock ────────────────────────────────────────────────────────────────────
function BigClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{ textAlign: 'right', lineHeight: 1 }}>
      <p style={{ fontFamily: 'var(--font)', fontSize: 28, fontWeight: 900, color: '#fff',
        textShadow: '0 0 18px rgba(0,245,255,0.5)' }}>
        {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
      </p>
      <p style={{ fontFamily: 'var(--font)', fontSize: 8.5, color: 'rgba(0,245,255,0.55)',
        letterSpacing: '0.14em', marginTop: 4, textTransform: 'uppercase' }}>
        {now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' })}
      </p>
    </div>
  )
}

// ─── Quest log (right rail) — the day as an MMORPG mission tracker ────────────
function QuestLog({ commitments, suggestions, onOpenModule }: {
  commitments: Commitment[]
  suggestions: Suggestion[]
  onOpenModule: (path: string) => void
}) {
  const done  = commitments.filter(c => c.done).length
  const total = commitments.length
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0
  const side  = suggestions.slice(0, 4)

  return (
    <aside style={{
      width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14,
      padding: '22px 24px', overflowY: 'auto',
      borderLeft: `1px solid ${GOLD}1a`,
      background: 'linear-gradient(180deg, rgba(255,215,0,0.03), rgba(0,0,0,0))',
    }}>
      {/* Header + day progress */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 13, fontWeight: 900, color: GOLD,
            letterSpacing: '0.2em', textShadow: `0 0 12px ${GOLD}60` }}>
            ⚔ {tr('QUEST LOG', 'ЖУРНАЛ ЗАДАНИЙ')}</p>
          {total > 0 && (
            <span style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 800,
              color: done === total ? '#39ff14' : `${GOLD}90`, marginLeft: 'auto' }}>{done}/{total}</span>
          )}
        </div>
        {total > 0 && (
          <div style={{ height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 9,
            background: 'rgba(255,215,0,0.1)' }}>
            <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3,
              background: done === total
                ? 'linear-gradient(90deg, #39ff14, #a3ff5e)'
                : `linear-gradient(90deg, ${GOLD}, #ffb700)`,
              boxShadow: `0 0 8px ${done === total ? '#39ff1470' : `${GOLD}70`}`,
              transition: 'width 0.5s ease' }} />
          </div>
        )}
      </div>

      {/* Main quests — today's commitments */}
      <div>
        <p style={{ fontFamily: 'var(--font)', fontSize: 8, fontWeight: 800, color: `${GOLD}80`,
          letterSpacing: '0.22em', marginBottom: 8 }}>{tr('MAIN QUESTS', 'ОСНОВНЫЕ ЗАДАНИЯ')}</p>
        {total === 0 && (
          <p style={{ fontFamily: 'var(--font)', fontSize: 9.5, color: 'rgba(148,163,184,0.45)',
            lineHeight: 1.7 }}>
            {tr('Nothing scheduled today — the realm is quiet.', 'На сегодня ничего не назначено — в королевстве тихо.')}</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {commitments.map(c => (
            <button key={c.id} onClick={() => onOpenModule('/scrap7')} style={{
              display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', cursor: 'pointer',
              padding: '9px 12px', borderRadius: 9, transition: 'all 0.15s',
              background: c.done ? 'rgba(57,255,20,0.04)' : 'rgba(255,215,0,0.05)',
              border: `1px solid ${c.done ? 'rgba(57,255,20,0.18)' : 'rgba(255,215,0,0.18)'}`,
              opacity: c.done ? 0.6 : 1,
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = c.done ? 'rgba(57,255,20,0.4)' : `${GOLD}60`}
              onMouseLeave={e => e.currentTarget.style.borderColor = c.done ? 'rgba(57,255,20,0.18)' : 'rgba(255,215,0,0.18)'}>
              <span style={{ fontSize: 11, flexShrink: 0,
                color: c.done ? '#39ff14' : GOLD,
                textShadow: c.done ? '0 0 6px #39ff14' : `0 0 6px ${GOLD}80` }}>
                {c.done ? '◆' : '◇'}</span>
              <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font)', fontSize: 10.5,
                fontWeight: 700, letterSpacing: '0.03em',
                color: c.done ? 'rgba(180,220,190,0.55)' : 'rgba(255,245,215,0.92)',
                textDecoration: c.done ? 'line-through' : 'none',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.label}</span>
              <span style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700, flexShrink: 0,
                color: c.kind === 'habit' ? 'rgba(0,180,255,0.6)' : `${GOLD}60`,
                letterSpacing: '0.08em', padding: '2px 6px', borderRadius: 4,
                border: `1px solid ${c.kind === 'habit' ? 'rgba(0,180,255,0.25)' : `${GOLD}25`}` }}>
                {c.kind === 'habit' ? tr('HABIT', 'ПРИВЫЧКА') : tr('DAILY', 'ЕЖЕДН.')}</span>
            </button>
          ))}
        </div>
        {total > 0 && done === total && (
          <p style={{ fontFamily: 'var(--font)', fontSize: 9, color: '#39ff14', marginTop: 8,
            letterSpacing: '0.08em', textShadow: '0 0 8px rgba(57,255,20,0.5)' }}>
            ✦ {tr('ALL QUESTS CLEARED — free roam unlocked', 'ВСЕ ЗАДАНИЯ ВЫПОЛНЕНЫ — свободная игра открыта')}</p>
        )}
      </div>

      {/* Side quests — guild invitations */}
      {side.length > 0 && (
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 8, fontWeight: 800,
            color: 'rgba(139,155,255,0.7)', letterSpacing: '0.22em', marginBottom: 8 }}>
            {tr('SIDE QUESTS', 'ПОБОЧНЫЕ ЗАДАНИЯ')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {side.map(s => (
              <button key={s.id} onClick={() => onOpenModule(s.path)} style={{
                display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', cursor: 'pointer',
                padding: '9px 12px', borderRadius: 9, transition: 'border-color 0.15s',
                background: `${TONE[s.tone]}08`, border: `1px solid ${TONE[s.tone]}28`,
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = `${TONE[s.tone]}60`}
                onMouseLeave={e => e.currentTarget.style.borderColor = `${TONE[s.tone]}28`}>
                <span style={{ fontSize: 15, flexShrink: 0 }}>{s.icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: 'var(--font)', fontSize: 10,
                    fontWeight: 700, color: TONE[s.tone],
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                  {s.detail && (
                    <span style={{ display: 'block', fontFamily: 'var(--font)', fontSize: 8,
                      color: 'rgba(148,163,184,0.55)', marginTop: 1,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.detail}</span>
                  )}
                </span>
                <span style={{ fontFamily: 'var(--font)', fontSize: 7.5, flexShrink: 0,
                  color: `${TONE[s.tone]}cc` }}>~{fmtDur(s.minutes)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}

// ─── App tile ─────────────────────────────────────────────────────────────────
function AppTile({ app, onLaunch }: { app: AppEntry; onLaunch: (a: AppEntry) => void }) {
  const [hov, setHov] = useState(false)
  const neon = tileNeon(app.name)
  return (
    <button onClick={() => onLaunch(app)}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      title={app.name}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        padding: '14px 8px 10px', borderRadius: 12, cursor: 'pointer',
        background: hov ? `${neon}10` : 'rgba(13,24,48,0.45)',
        border: `1px solid ${hov ? `${neon}55` : 'rgba(255,255,255,0.06)'}`,
        boxShadow: hov ? `0 0 18px ${neon}25` : 'none',
        transition: 'all 0.15s', minWidth: 0,
      }}>
      <div style={{
        width: 52, height: 52, borderRadius: 13, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `linear-gradient(135deg, ${neon}22, ${neon}08)`,
        border: `1px solid ${neon}45`,
        fontFamily: 'var(--font)', fontSize: 17, fontWeight: 900, color: neon,
        textShadow: `0 0 10px ${neon}`,
        boxShadow: hov ? `0 0 14px ${neon}40` : `inset 0 0 10px ${neon}10`,
        transition: 'box-shadow 0.15s',
      }}>{monogram(app.name)}</div>
      <span style={{
        fontFamily: 'var(--font)', fontSize: 8.5, fontWeight: 600, letterSpacing: '0.03em',
        color: hov ? 'rgba(230,250,255,0.95)' : 'rgba(200,220,235,0.6)',
        maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{app.name}</span>
    </button>
  )
}

// ─── Big Screen — Warren OS mode ──────────────────────────────────────────────
export default function BigScreen({ onExit, onOpenModule }: {
  onExit: () => void
  onOpenModule: (path: string) => void
}) {
  const [view, setView]       = useState<'home' | 'apps'>('home')
  const [apps, setApps]       = useState<AppEntry[]>([])
  const [query, setQuery]     = useState('')
  const [appsError, setAppsError] = useState('')
  const [appsLoading, setAppsLoading] = useState(true)
  const [toast, setToast]     = useState('')
  const [name, setName]       = useState(() => loadSettings().displayName)

  // Live day data — same engines the Hub uses
  const [stats, setStats]           = useState<HubStats>(() => getHubStats())
  const [snap, setSnap]             = useState(() => getNowSnapshot())
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])

  const refresh = useCallback(() => {
    setStats(getHubStats())
    setSnap(getNowSnapshot())
    const inf8 = loadInf8State()
    setCommitments(getTodayCommitments(inf8.durations, inf8.prefTime))
    setSuggestions(gatherSuggestions())
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30000)
    window.addEventListener('warren:sync', refresh)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(id); window.removeEventListener('warren:sync', refresh); window.removeEventListener('focus', refresh) }
  }, [refresh])

  // Greeting name: settings → OS username fallback
  useEffect(() => {
    if (!name && isTauri()) {
      invoke<string>('get_username').then(u => setName(u)).catch(() => {})
    }
  }, [name])

  // Start Menu scan (desktop only)
  useEffect(() => {
    if (!isTauri()) { setAppsLoading(false); return }
    invoke<AppEntry[]>('list_apps')
      .then(list => setApps(list))
      .catch(e => setAppsError(e instanceof Error ? e.message : String(e)))
      .finally(() => setAppsLoading(false))
  }, [])

  // Esc: PROGRAMS → HOME → exit to Windows
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (view === 'apps') setView('home')
      else onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, onExit])

  const launch = (app: AppEntry) => {
    invoke('launch_app', { path: app.path })
      .then(() => {
        setToast(`▶ ${app.name}`)
        setTimeout(() => setToast(''), 2500)
        if (isTauri()) void getCurrentWindow().setFullscreen(false)
      })
      .catch(e => {
        setToast(`⚠ ${e instanceof Error ? e.message : String(e)}`)
        setTimeout(() => setToast(''), 4000)
      })
  }

  const filtered = useMemo(() => filterApps(apps, query), [apps, query])
  const groups   = useMemo(() => groupByLetter(filtered), [filtered])

  const hour = new Date().getHours()
  const greeting = hour < 5 ? tr('STILL UP', 'ЕЩЁ НЕ СПИШЬ') : hour < 12 ? tr('GOOD MORNING', 'ДОБРОЕ УТРО')
    : hour < 17 ? tr('GOOD AFTERNOON', 'ДОБРЫЙ ДЕНЬ') : tr('GOOD EVENING', 'ДОБРЫЙ ВЕЧЕР')

  const cur = snap.current
  const isFreeNow = !snap.awake || !cur || cur.kind === 'free' || cur.kind === 'break'

  const tiles = [
    { label: tr('TASKS DUE', 'ЗАДАЧ СЕГОДНЯ'),   value: String(stats.tasksDue),    neon: '#00b4ff', emoji: '🦝', path: '/scrap7' },
    { label: tr('ACTIVE GOALS', 'АКТИВНЫХ ЦЕЛЕЙ'), value: String(stats.activeGoals), neon: '#c084fc', emoji: '🦫', path: '/log' },
    { label: tr('KCAL LEFT', 'ККАЛ ОСТАЛОСЬ'),   value: stats.caloriesLeft === null ? '—' : String(stats.caloriesLeft), neon: '#ff006e', emoji: '🐼', path: '/solaris' },
    { label: tr('BEST STREAK', 'ЛУЧШАЯ СЕРИЯ'),  value: stats.streak > 0 ? `${stats.streak}🔥` : '0', neon: '#39ff14', emoji: '🔥', path: '/scrap7' },
  ]

  const navBtn = (active: boolean): React.CSSProperties => ({
    padding: '10px 18px', borderRadius: 9, cursor: 'pointer',
    fontFamily: 'var(--font)', fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
    color: active ? NEON : 'rgba(148,163,184,0.5)',
    border: `1px solid ${active ? 'rgba(0,245,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
    background: active ? 'rgba(0,245,255,0.08)' : 'transparent',
    textShadow: active ? `0 0 10px ${NEON}` : 'none',
    transition: 'all 0.15s',
  })

  return (
    <div className="fade-in" style={{ height: '100vh', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', background: BG }}>

      {/* Header */}
      <div style={{ padding: '20px 30px 16px', flexShrink: 0, display: 'flex',
        alignItems: 'center', gap: 18, borderBottom: '1px solid rgba(0,245,255,0.12)' }}>
        <div style={{
          width: 42, height: 42, borderRadius: 11,
          background: 'linear-gradient(135deg, rgba(0,245,255,0.18), rgba(0,245,255,0.04))',
          border: '1px solid rgba(0,245,255,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font)', fontSize: 18, fontWeight: 900, color: NEON,
          textShadow: `0 0 14px ${NEON}`, boxShadow: '0 0 18px rgba(0,245,255,0.18)',
        }}>W</div>
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 15, fontWeight: 900,
            letterSpacing: '0.26em', color: NEON, textShadow: `0 0 16px ${NEON}` }}>
            WARREN OS</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 7.5, color: 'rgba(0,245,255,0.4)',
            letterSpacing: '0.18em', marginTop: 2 }}>
            <span className="pulse" style={{ color: '#39ff14', marginRight: 5 }}>●</span>
            {tr('ALL SYSTEMS NOMINAL', 'ВСЕ СИСТЕМЫ В НОРМЕ')}</p>
        </div>

        {/* View nav */}
        <div style={{ display: 'flex', gap: 8, marginLeft: 26 }}>
          <button style={navBtn(view === 'home')} onClick={() => setView('home')}>
            ⌂ {tr('HOME', 'ГЛАВНАЯ')}</button>
          <button style={navBtn(view === 'apps')} onClick={() => setView('apps')}>
            ⊞ {tr('PROGRAMS', 'ПРОГРАММЫ')}</button>
        </div>

        <div style={{ flex: 1 }} />
        <BigClock />
        <button onClick={onExit} title={tr('Exit Big Screen (Esc)', 'Выйти из Большого экрана (Esc)')} style={{
          padding: '11px 18px', borderRadius: 9, cursor: 'pointer', marginLeft: 8,
          fontFamily: 'var(--font)', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em',
          color: 'rgba(255,120,120,0.85)', border: '1px solid rgba(255,68,68,0.35)',
          background: 'rgba(255,68,68,0.07)', transition: 'all 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,68,68,0.15)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,68,68,0.07)'}>
          ⏏ {tr('EXIT TO WINDOWS', 'ВЫЙТИ В WINDOWS')}</button>
      </div>

      {/* ── HOME — statuses + quest log ── */}
      {view === 'home' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Main stage */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '30px 34px' }}>
            {/* Greeting */}
            <p style={{ fontFamily: 'var(--font)', fontSize: 26, fontWeight: 900,
              color: 'rgba(235,250,255,0.95)', letterSpacing: '0.06em' }}>
              {greeting}{name ? `, ${name.toUpperCase()}` : ''}
              <span style={{ color: NEON, textShadow: `0 0 14px ${NEON}` }}> _</span></p>
            <p style={{ fontFamily: 'var(--font)', fontSize: 9, color: 'rgba(148,163,184,0.5)',
              letterSpacing: '0.16em', marginTop: 6, textTransform: 'uppercase' }}>
              {tr('The guild is assembled · your day awaits', 'Гильдия в сборе · день ждёт')}</p>

            {/* NOW panel */}
            <div style={{ marginTop: 26, padding: '18px 22px', borderRadius: 14,
              background: 'linear-gradient(135deg, rgba(34,211,238,0.09), rgba(57,255,20,0.03))',
              border: '1px solid rgba(34,211,238,0.25)', display: 'flex', alignItems: 'center', gap: 18 }}>
              <span style={{ fontSize: 30, filter: 'drop-shadow(0 0 10px #22d3ee)',
                animation: 'pulse 2.4s ease-in-out infinite' }}>∞</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: 'var(--font)', fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em',
                  color: isFreeNow ? 'rgba(57,255,20,0.75)' : '#22d3ee' }}>
                  {isFreeNow ? tr('● FREE NOW', '● СЕЙЧАС СВОБОДНО') : tr('● HAPPENING NOW', '● ИДЁТ СЕЙЧАС')}</p>
                <p style={{ fontFamily: 'var(--font)', fontSize: 18, fontWeight: 800,
                  color: 'rgba(225,250,255,0.95)', marginTop: 4,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {!snap.awake ? tr('Off the clock', 'Вне графика')
                    : isFreeNow ? tr('Free time', 'Свободное время') : cur!.label}</p>
                <p style={{ fontFamily: 'var(--font)', fontSize: 9.5, color: 'rgba(148,163,184,0.6)', marginTop: 3 }}>
                  {snap.awake && !isFreeNow && cur
                    ? `${tr('until', 'до')} ${fmtClock(cur.end)}`
                    : snap.next ? `${tr('next:', 'далее:')} ${snap.next.label} · ${fmtClock(snap.next.start)}` : ''}</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontFamily: 'var(--font)', fontSize: 24, fontWeight: 900, color: '#39ff14',
                  lineHeight: 1, textShadow: '0 0 14px rgba(57,255,20,0.5)' }}>{fmtDur(snap.freeMinutes)}</p>
                <p style={{ fontFamily: 'var(--font)', fontSize: 7.5, color: 'rgba(57,255,20,0.55)',
                  letterSpacing: '0.14em', marginTop: 4 }}>{tr('FREE TODAY', 'СВОБОДНО СЕГОДНЯ')}</p>
              </div>
            </div>

            {/* Status tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 18 }}>
              {tiles.map(({ label, value, neon, emoji, path }) => (
                <button key={label} onClick={() => onOpenModule(path)} style={{
                  padding: '16px 18px', borderRadius: 13, cursor: 'pointer', textAlign: 'left',
                  background: 'rgba(13,24,48,0.5)', border: '1px solid rgba(255,255,255,0.06)',
                  transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = `${neon}55`; e.currentTarget.style.boxShadow = `0 0 18px ${neon}18` }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.boxShadow = 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 20 }}>{emoji}</span>
                    <span style={{ fontFamily: 'var(--font)', fontSize: 24, fontWeight: 900, color: neon,
                      textShadow: `0 0 12px ${neon}60` }}>{value}</span>
                  </div>
                  <p style={{ fontFamily: 'var(--font)', fontSize: 8, color: 'rgba(148,163,184,0.55)',
                    letterSpacing: '0.12em', marginTop: 10 }}>{label}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Quest rail */}
          <QuestLog commitments={commitments} suggestions={suggestions} onOpenModule={onOpenModule} />
        </div>
      )}

      {/* ── PROGRAMS — launcher grid ── */}
      {view === 'apps' && (
        <>
          <div style={{ padding: '16px 34px 4px', flexShrink: 0 }}>
            <input value={query} onChange={e => setQuery(e.target.value)} autoFocus
              placeholder={tr('🔍  Search your programs…', '🔍  Поиск программ…')}
              style={{
                width: '100%', maxWidth: 460, padding: '11px 16px', borderRadius: 10,
                background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(0,245,255,0.2)',
                outline: 'none', fontFamily: 'var(--font)', fontSize: 12,
                color: 'rgba(225,250,255,0.92)', letterSpacing: '0.03em',
                userSelect: 'text', WebkitUserSelect: 'text',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(0,245,255,0.5)'}
              onBlur={e => e.target.style.borderColor = 'rgba(0,245,255,0.2)'} />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 34px 30px' }}>
            {!isTauri() && (
              <p style={{ fontFamily: 'var(--font)', fontSize: 11, color: 'rgba(148,163,184,0.55)',
                textAlign: 'center', padding: '60px 20px', lineHeight: 1.8 }}>
                {tr('Big Screen launches your installed programs — that needs the Warren desktop app.',
                    'Большой экран запускает установленные программы — для этого нужна настольная версия Warren.')}</p>
            )}
            {appsLoading && isTauri() && (
              <p style={{ fontFamily: 'var(--font)', fontSize: 10, color: 'rgba(0,245,255,0.5)',
                letterSpacing: '0.14em', textAlign: 'center', padding: '50px 0' }}
                className="pulse">{tr('SCANNING INSTALLED PROGRAMS…', 'СКАНИРОВАНИЕ УСТАНОВЛЕННЫХ ПРОГРАММ…')}</p>
            )}
            {appsError && (
              <p style={{ fontFamily: 'var(--font)', fontSize: 10, color: '#ff5470',
                textAlign: 'center', padding: '30px 0' }}>⚠ {appsError}</p>
            )}
            {!appsLoading && !appsError && isTauri() && filtered.length === 0 && (
              <p style={{ fontFamily: 'var(--font)', fontSize: 10, color: 'rgba(148,163,184,0.45)',
                textAlign: 'center', padding: '40px 0' }}>
                {tr('Nothing found for', 'Ничего не найдено по')} “{query}”</p>
            )}

            {groups.map(({ letter, apps: groupApps }) => (
              <div key={letter} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 10px' }}>
                  <span style={{ fontFamily: 'var(--font)', fontSize: 12, fontWeight: 900,
                    color: 'rgba(0,245,255,0.55)', letterSpacing: '0.1em' }}>{letter}</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(0,245,255,0.08)' }} />
                  <span style={{ fontFamily: 'var(--font)', fontSize: 8,
                    color: 'rgba(148,163,184,0.35)' }}>{groupApps.length}</span>
                </div>
                <div style={{ display: 'grid', gap: 10,
                  gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))' }}>
                  {groupApps.map(app => <AppTile key={app.path} app={app} onLaunch={launch} />)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Launch toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 22px', borderRadius: 10, zIndex: 50,
          background: 'rgba(4,10,18,0.95)', border: '1px solid rgba(0,245,255,0.35)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.6), 0 0 16px rgba(0,245,255,0.15)' }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 700,
            color: toast.startsWith('⚠') ? '#ff5470' : NEON, letterSpacing: '0.08em' }}>{toast}</p>
        </div>
      )}
    </div>
  )
}
