import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import { GUILD } from './guild'
import { hasAccess, type Entitlements } from './entitlements'
import { loadSettings, saveSettings, applySettings, isTauri, type Settings } from './settings'
import SettingsPanel from './SettingsPanel'
import Scrap7    from './modules/scrap7/Scrap7'
import Log       from './modules/log/Log'
import Ardo      from './modules/ardo/Ardo'
import Solaris   from './modules/solaris/Solaris'
import Infinity8 from './modules/infinity8/Infinity8'
import Pictures  from './modules/pictures/Pictures'
import Journal   from './modules/journal/Journal'
import BigScreen from './modules/bigscreen/BigScreen'
import { getNowSnapshot, fmtClock, fmtDur } from './modules/infinity8/store'
import { gatherSuggestions, topSuggestion, type Suggestion } from './modules/infinity8/suggestions'
import { getHubStats, type HubStats } from './hubStats'
import { ReleaseRadar } from './modules/pictures/ReleaseRadar'
import Uplinks from './modules/progression/Uplinks'
import { BandwidthStrip } from './modules/progression/BandwidthStrip'
import { useLocale, t } from './i18n'
import { CyberIcon } from './components/CyberIcon'

// ─── Dormant surfaces ─────────────────────────────────────────────────────────
// Warren OS (fullscreen launcher, file browser, quest log) is parked while the
// progression system lands — it doesn't serve the goal loop. Code and data stay
// untouched; only navigation drops it. INFINITY-8 is parked the same way via its
// `built: false` in guild.ts, and may return later as a scheduling layer once
// routines carry fixed time-of-day anchors.
const WARREN_OS_ENABLED = false
const INF8_ENABLED = GUILD.some(m => m.id === 'ravi' && m.built)

// ─── Matrix intro ─────────────────────────────────────────────────────────────
const BOOT_LINES = [
  '> WARREN PROTOCOL v1.0.0',
  '> INITIALIZING CORE SYSTEMS...',
  '> CONNECTING TO GUILD NETWORK...',
  '> SCANNING MODULES [7/7]...',
  '> LOCAL DATA VAULT... SECURED',
  '> INFINITY-8 CONDUCTOR... ONLINE',
  '> ALL SYSTEMS NOMINAL',
  '',
]

function IntroScreen({ onDone, displayName }: { onDone: () => void; displayName: string }) {
  const [lines, setLines]         = useState<string[]>([])
  const [username, setUsername]   = useState(displayName || 'AGENT')
  const [showHello, setShowHello] = useState(false)
  const [exiting, setExiting]     = useState(false)

  useEffect(() => {
    if (!displayName) {
      invoke<string>('get_username').then(u => setUsername(u)).catch(() => {})
    }
  }, [displayName])

  useEffect(() => {
    let i = 0
    const addLine = () => {
      if (i < BOOT_LINES.length) {
        setLines(prev => [...prev, BOOT_LINES[i]])
        i++
        setTimeout(addLine, i === BOOT_LINES.length - 1 ? 180 : 110 + Math.random() * 80)
      } else {
        setTimeout(() => setShowHello(true), 300)
        setTimeout(() => setExiting(true), 1800)
        setTimeout(() => onDone(), 2300)
      }
    }
    setTimeout(addLine, 400)
  }, [onDone])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,4,10,0.97)',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '0 28px',
      opacity: exiting ? 0 : 1,
      transition: exiting ? 'opacity 0.5s ease' : 'none',
      borderRadius: 10,
    }}>
      {/* Scanline effect */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.03) 0px, rgba(0,0,0,0.03) 1px, transparent 1px, transparent 2px)',
        borderRadius: 10,
      }} />

      {/* Boot log */}
      <div style={{ marginBottom: 24 }}>
        {lines.map((line, i) => (
          <p key={i} style={{
            fontFamily: 'var(--font)', fontSize: 11,
            color: line === '' ? 'transparent' : 'rgba(0,245,180,0.75)',
            lineHeight: 1.8, letterSpacing: '0.06em',
            animation: 'fadeIn 0.15s ease forwards',
          }}>
            {line || ' '}
          </p>
        ))}
        {/* Blinking cursor */}
        {!showHello && (
          <span style={{
            display: 'inline-block', width: 8, height: 14,
            background: '#00f5b4', marginTop: 4,
            animation: 'blink 0.7s step-end infinite',
            verticalAlign: 'bottom',
          }} />
        )}
      </div>

      {/* Hello message */}
      {showHello && (
        <div style={{ animation: 'slideUp 0.4s ease forwards' }}>
          <div style={{
            height: 1, background: 'linear-gradient(90deg, transparent, rgba(0,245,255,0.4), transparent)',
            marginBottom: 20,
          }} />
          <p style={{
            fontFamily: 'var(--font)', fontSize: 22, fontWeight: 800,
            color: '#00f5ff', letterSpacing: '0.12em',
            textShadow: '0 0 20px rgba(0,245,255,0.6), 0 0 40px rgba(0,245,255,0.3)',
          }}>
            HELLO, {username}
          </p>
          <p style={{
            fontFamily: 'var(--font)', fontSize: 10,
            color: 'rgba(0,245,255,0.4)', letterSpacing: '0.15em', marginTop: 6,
          }}>
            WARREN IS NOW ACTIVE
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Clock (title bar) ────────────────────────────────────────────────────────
function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time    = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' })
  const date    = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div style={{ textAlign: 'right', lineHeight: 1 }}>
      <p style={{
        fontSize: 18, fontWeight: 800, letterSpacing: '0.04em',
        color: '#fff', textShadow: '0 0 12px rgba(0,245,255,0.5)',
      }}>{time}</p>
      <p style={{ fontSize: 8, color: 'rgba(0,245,255,0.6)', letterSpacing: '0.12em', marginTop: 2, textTransform: 'uppercase' }}>
        {weekday} · {date}
      </p>
    </div>
  )
}

// ─── Title bar ────────────────────────────────────────────────────────────────
function TitleBar() {
  const navigate = useNavigate()
  const enterBigScreen = async () => {
    if (isTauri()) { try { await getCurrentWindow().setFullscreen(true) } catch { /* ignore */ } }
    navigate('/bigscreen')
  }
  return (
    <div
      data-tauri-drag-region
      style={{
        height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 14px 0 16px', flexShrink: 0, cursor: 'grab',
        borderBottom: '1px solid var(--border)',
        background: 'rgba(6,11,22,0.5)',
      }}
    >
      {/* Left: logo */}
      <div data-tauri-drag-region style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7,
          background: 'linear-gradient(135deg, rgba(0,245,255,0.15), rgba(0,245,255,0.04))',
          border: '1px solid rgba(0,245,255,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 900, color: '#00f5ff',
          textShadow: '0 0 10px #00f5ff',
          boxShadow: '0 0 12px rgba(0,245,255,0.15)',
        }}>W</div>
        <div>
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', color: 'rgba(0,245,255,0.8)', textTransform: 'uppercase' }}>
            Warren
          </p>
          <p style={{ fontSize: 7.5, color: 'var(--text-muted)', letterSpacing: '0.1em', marginTop: 1 }}>
            <span className="pulse" style={{ color: '#39ff14', marginRight: 4 }}>●</span>
            {t('all systems nominal', 'все системы в норме')}
          </p>
        </div>
      </div>

      {/* Right: clock + controls */}
      <div data-tauri-drag-region style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {WARREN_OS_ENABLED && isTauri() && (
          <button onClick={enterBigScreen} title={t('Big Screen — fullscreen launcher', 'Большой экран — полноэкранный лаунчер')}
            style={{
              height: 24, padding: '0 10px', borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
              color: 'rgba(0,245,255,0.55)', border: '1px solid rgba(0,245,255,0.2)',
              background: 'rgba(0,245,255,0.05)', transition: 'all 0.15s',
              fontFamily: 'var(--font)', fontSize: 8, fontWeight: 800, letterSpacing: '0.1em',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#00f5ff'; e.currentTarget.style.borderColor = 'rgba(0,245,255,0.5)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(0,245,255,0.55)'; e.currentTarget.style.borderColor = 'rgba(0,245,255,0.2)' }}>
            ⛶ {t('BIG SCREEN', 'БОЛЬШОЙ ЭКРАН')}
          </button>
        )}
        <Clock />
        {isTauri() && (
        <div style={{ display: 'flex', gap: 5, marginLeft: 4 }}>
          {[
            { label: '−', action: () => getCurrentWindow().minimize(), color: '#ffd700' },
            { label: '×', action: () => getCurrentWindow().close(),    color: '#ff4444' },
          ].map(({ label, action, color }) => (
            <button
              key={label}
              onClick={action}
              style={{
                width: 20, height: 20, borderRadius: 5,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                fontSize: 12, color: 'rgba(148,163,184,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = `${color}20`
                e.currentTarget.style.borderColor = `${color}50`
                e.currentTarget.style.color = color
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
                e.currentTarget.style.color = 'rgba(148,163,184,0.35)'
              }}
            >{label}</button>
          ))}
        </div>
        )}
      </div>
    </div>
  )
}

// ─── Sidebar button — cyberpunk icon ─────────────────────────────────────────
import type { ModuleId } from './guild'

function SidebarBtn({ iconId, neon, active, title, dim = false, onClick }: {
  iconId: ModuleId | 'hub' | 'set' | 'pwr' | 'uplink'
  neon: string; active: boolean; title: string
  dim?: boolean; onClick: () => void
}) {
  const [hov, setHov] = useState(false)
  const on = active || hov

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={title}
      style={{
        width: 42, height: 34, borderRadius: 7, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: on ? `${neon}12` : 'transparent',
        border: `1px solid ${on ? `${neon}35` : 'transparent'}`,
        transition: 'all 0.15s', position: 'relative', cursor: 'pointer',
        opacity: dim ? 0.25 : 1,
      }}
    >
      <CyberIcon id={iconId} size={18} color={on ? neon : 'rgba(148,163,184,0.4)'} glow={on} />
      {active && (
        <div style={{
          position: 'absolute', right: -1, top: '22%', bottom: '22%',
          width: 2, borderRadius: 2,
          background: neon, boxShadow: `0 0 7px ${neon}`,
        }} />
      )}
    </button>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
// ─── Live "what's now" card (INFINITY-8 → Hub) ────────────────────────────────
const INF = '#22d3ee'
const SUGGEST_TONE: Record<Suggestion['tone'], string> = {
  play: '#ff8a4c', grow: '#8b9bff', care: '#ffd76b',
}
function NowCard() {
  const navigate = useNavigate()
  const [snap, setSnap] = useState(() => getNowSnapshot())
  const [nowMin, setNowMin] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() })
  const [suggest, setSuggest] = useState<Suggestion | null>(null)

  useEffect(() => {
    const refresh = () => {
      const s = getNowSnapshot()
      setSnap(s)
      const d = new Date(); setNowMin(d.getHours() * 60 + d.getMinutes())
      const free = !s.awake || !s.current || s.current.kind === 'free' || s.current.kind === 'break'
      setSuggest(free ? topSuggestion(gatherSuggestions(), s.freeMinutes) : null)
    }
    refresh()
    const id = setInterval(refresh, 30000)
    window.addEventListener('warren:sync', refresh)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(id); window.removeEventListener('warren:sync', refresh); window.removeEventListener('focus', refresh) }
  }, [])

  const cur = snap.current
  // "Free" only counts when nothing is scheduled AND nothing is still open —
  // unfinished quests mean the day isn't yours yet.
  const idleNow    = !snap.awake || !cur || cur.kind === 'free' || cur.kind === 'break'
  const isFreeNow  = idleNow && snap.pendingCount === 0
  const headline = !snap.awake ? t('Off the clock', 'Вне графика')
    : !idleNow ? cur!.label
    : snap.pendingCount > 0
      ? `${snap.pendingCount} ${t('quests still open', 'заданий не закрыто')}`
      : t('Free time', 'Свободное время')
  const sub = !snap.awake
    ? `${fmtDur(snap.freeMinutes)} ${t('of free time left', 'свободного времени осталось')}`
    : !idleNow
      ? `${t('now', 'сейчас')} → ${fmtClock(cur!.end)} · ${fmtDur(Math.max(0, cur!.end - nowMin))} ${t('left', 'осталось')}`
      : snap.pendingCount > 0
        ? `${fmtDur(snap.freeMinutes)} ${t('left today — knock them out', 'осталось сегодня — разделайтесь с ними')}`
        : (snap.next ? `${t('until', 'до')} ${snap.next.label} ${t('at', 'в')} ${fmtClock(snap.next.start)}` : t('rest of the day is yours', 'остаток дня — ваш'))

  return (
   <div style={{ marginBottom: 16 }}>
    <button onClick={() => navigate('/infinity8')} className="glow-pulse" style={{
      width: '100%', textAlign: 'left', cursor: 'pointer',
      padding: '13px 15px', borderRadius: 10,
      background: `linear-gradient(135deg, ${INF}14, rgba(57,255,20,0.04))`,
      border: `1px solid ${INF}30`,
      display: 'flex', alignItems: 'center', gap: 12, transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = `${INF}60`}
      onMouseLeave={e => e.currentTarget.style.borderColor = `${INF}30`}
    >
      <span style={{ fontSize: 22, filter: `drop-shadow(0 0 8px ${INF})`,
        animation: 'pulse 2.4s ease-in-out infinite' }}>∞</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: '0.18em',
          color: isFreeNow ? 'rgba(57,255,20,0.7)' : idleNow ? 'rgba(255,215,0,0.75)' : INF }}>
          {isFreeNow ? t('● FREE NOW', '● СЕЙЧАС СВОБОДНО')
            : idleNow ? t('● QUESTS OPEN', '● ЕСТЬ ЗАДАНИЯ')
            : t('● HAPPENING NOW', '● ИДЁТ СЕЙЧАС')}
        </p>
        <p style={{ fontSize: 14, fontWeight: 800, color: 'rgba(225,250,255,0.95)',
          letterSpacing: '0.02em', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {headline}
        </p>
        <p style={{ fontSize: 8.5, color: 'rgba(148,163,184,0.6)', letterSpacing: '0.04em', marginTop: 2 }}>{sub}</p>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ fontSize: 16, fontWeight: 900, color: '#39ff14', lineHeight: 1,
          textShadow: '0 0 10px rgba(57,255,20,0.4)' }}>{fmtDur(snap.freeMinutes)}</p>
        <p style={{ fontSize: 7, color: 'rgba(57,255,20,0.5)', letterSpacing: '0.1em', marginTop: 2 }}>{t('FREE LEFT', 'СВОБОДНО ОСТАЛОСЬ')}</p>
        {snap.committedCount > 0 && (
          <p style={{ fontSize: 7.5, color: `${INF}70`, marginTop: 3 }}>{snap.doneCount}/{snap.committedCount} {t('done', 'готово')}</p>
        )}
      </div>
    </button>

    {/* The guild's invitation for the free time at hand */}
    {isFreeNow && suggest && (
      <button onClick={() => navigate(suggest.path)} style={{
        width: '100%', textAlign: 'left', cursor: 'pointer', marginTop: 6,
        padding: '8px 12px', borderRadius: 9,
        background: `${SUGGEST_TONE[suggest.tone]}10`,
        border: `1px solid ${SUGGEST_TONE[suggest.tone]}38`,
        display: 'flex', alignItems: 'center', gap: 10, transition: 'border-color 0.15s',
      }}
        onMouseEnter={e => e.currentTarget.style.borderColor = `${SUGGEST_TONE[suggest.tone]}70`}
        onMouseLeave={e => e.currentTarget.style.borderColor = `${SUGGEST_TONE[suggest.tone]}38`}
      >
        <span style={{ fontSize: 18, flexShrink: 0 }}>{suggest.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 7, fontWeight: 800, letterSpacing: '0.16em',
            color: `${SUGGEST_TONE[suggest.tone]}b0` }}>{t('THE GUILD SUGGESTS', 'ГИЛЬДИЯ СОВЕТУЕТ')}</p>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(225,250,255,0.95)', marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{suggest.label}</p>
          {suggest.detail && (
            <p style={{ fontSize: 8, color: 'rgba(148,163,184,0.6)', marginTop: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{suggest.detail}</p>
          )}
        </div>
        <span style={{ fontSize: 8, color: `${SUGGEST_TONE[suggest.tone]}cc`, flexShrink: 0 }}>~{fmtDur(suggest.minutes)}</span>
      </button>
    )}
   </div>
  )
}

function Dashboard({ displayName }: { displayName: string }) {
  const now  = new Date()
  const hour = now.getHours()
  const greeting = hour < 5 ? t('still up?', 'ещё не спите?') : hour < 12 ? t('good morning', 'доброе утро') : hour < 17 ? t('good afternoon', 'добрый день') : t('good evening', 'добрый вечер')
  const name = displayName || null
  const navigate = useNavigate()

  // Live guild stats — refresh when any module syncs or the window regains focus
  const [stats, setStats] = useState<HubStats>(() => getHubStats())
  useEffect(() => {
    const refresh = () => setStats(getHubStats())
    refresh()
    window.addEventListener('warren:sync', refresh)
    window.addEventListener('focus', refresh)
    return () => { window.removeEventListener('warren:sync', refresh); window.removeEventListener('focus', refresh) }
  }, [])

  const tiles = [
    { label: t('Tasks due', 'Задачи на сегодня'),    value: String(stats.tasksDue),    neon: '#00b4ff', emoji: '🦝', path: '/scrap7' },
    { label: t('Active goals', 'Активные цели'), value: String(stats.activeGoals), neon: '#c084fc', emoji: '🦫', path: '/log' },
    { label: t('Kcal left', 'Ккал осталось'),    value: stats.caloriesLeft === null ? '—' : String(stats.caloriesLeft), neon: '#ff006e', emoji: '🐼', path: '/solaris' },
    { label: t('Best streak', 'Лучшая серия'),  value: stats.streak > 0 ? `${stats.streak}🔥` : '0', neon: '#39ff14', emoji: '🔥', path: '/scrap7' },
  ]

  return (
    <div className="fade-in" style={{ height: '100%', overflowY: 'auto', padding: '20px 18px' }}>

      {/* Greeting */}
      <div style={{ marginBottom: 22 }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.03em' }}>
          {greeting}{name ? `, ${name}` : ''} <span style={{ color: 'var(--accent)', textShadow: '0 0 10px var(--accent-dim)' }}>👋</span>
        </p>
        <p style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.1em', marginTop: 4, textTransform: 'uppercase' }}>
          {t('Warren hub · select a module →', 'Хаб Warren · выберите модуль →')}
        </p>
      </div>

      {/* Live now card — only while INFINITY-8 is in service */}
      {INF8_ENABLED && <NowCard />}

      {/* Two uplinks, and what they're carrying */}
      <BandwidthStrip />

      {/* What's landing soon, from the titles already tracked */}
      <ReleaseRadar />

      {/* Quick stats row — live, tap to open the module */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
        {tiles.map(({ label, value, neon, emoji, path }) => (
          <button key={label} onClick={() => navigate(path)} style={{
            padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
            background: 'rgba(13,24,48,0.5)',
            border: '1px solid rgba(255,255,255,0.05)', transition: 'border-color 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = `${neon}55`}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13 }}>{emoji}</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: neon, textShadow: `0 0 8px ${neon}50` }}>
                {value}
              </span>
            </div>
            <p style={{ fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {label}
            </p>
          </button>
        ))}
      </div>

      {/* Status */}
      <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(57,255,20,0.04)', border: '1px solid rgba(57,255,20,0.1)' }}>
        <p style={{ fontSize: 9, color: 'rgba(57,255,20,0.6)', letterSpacing: '0.1em', fontWeight: 700 }}>
          <span className="pulse">●</span> {t('ALL SYSTEMS NOMINAL', 'ВСЕ СИСТЕМЫ В НОРМЕ')}
        </p>
        <p style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 3, letterSpacing: '0.06em' }}>
          {t('Warren is running · modules can be accessed from the sidebar →', 'Warren работает · модули доступны на боковой панели →')}
        </p>
      </div>
    </div>
  )
}


// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  useLocale()   // re-render the whole shell when the language toggles
  const navigate  = useNavigate()
  const location  = useLocation()

  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [intro, setIntro]       = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const entitlements: Entitlements = {}

  // Apply settings on mount and whenever they change
  useEffect(() => { applySettings(settings) }, [settings])

  // Desktop: boot straight into fullscreen Warren OS (the intro plays on top)
  useEffect(() => {
    if (WARREN_OS_ENABLED && isTauri() && loadSettings().bootBigScreen) {
      void getCurrentWindow().setFullscreen(true).catch(() => {})
      navigate('/bigscreen')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeModule = GUILD.find(m => location.pathname.startsWith(m.path)) ?? null

  const bgColor = `rgba(6, 11, 22, ${settings.opacity})`

  // Big Screen (Warren OS mode) is immersive — no title bar, no sidebar.
  // The initiation-protocol intro plays on top of it, fullscreen.
  if (location.pathname.startsWith('/bigscreen')) {
    return (
      <>
        {intro && settings.showIntro && (
          <IntroScreen onDone={() => setIntro(false)} displayName={settings.displayName} />
        )}
        <BigScreen
          onExit={() => {
            if (isTauri()) { void getCurrentWindow().setFullscreen(false).catch(() => {}) }
            navigate('/')
          }} />
      </>
    )
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', width: '100vw',
      background: bgColor,
      backdropFilter: 'blur(22px) saturate(1.5)',
      WebkitBackdropFilter: 'blur(22px) saturate(1.5)',
      border: '1px solid rgba(0,245,255,0.1)',
      borderRadius: 10, overflow: 'hidden',
      boxShadow: '0 12px 50px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,245,255,0.06), inset 0 1px 0 rgba(255,255,255,0.04)',
    }}>
      {/* Matrix intro */}
      {intro && settings.showIntro && (
        <IntroScreen onDone={() => setIntro(false)} displayName={settings.displayName} />
      )}

      {/* Title bar */}
      <TitleBar />

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Main content */}
        <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {/* Settings panel */}
          {settingsOpen && (
            <SettingsPanel
              settings={settings}
              onClose={() => setSettingsOpen(false)}
              onChange={s => { saveSettings(s); setSettings(s) }}
            />
          )}

          <Routes>
            <Route path="/" element={<Dashboard displayName={settings.displayName} />} />
            <Route path="/scrap7/*"    element={<Scrap7 />} />
            <Route path="/log/*"       element={<Log />} />
            <Route path="/ardo/*"      element={<Ardo />} />
            <Route path="/solaris/*"   element={<Solaris />} />
            <Route path="/infinity8/*" element={<Infinity8 />} />
            <Route path="/pictures/*"  element={<Pictures />} />
            <Route path="/journal/*"   element={<Journal />} />
            <Route path="/uplinks/*"  element={<Uplinks />} />
            {/* Unbuilt modules are hidden; any stray URL falls back to the Hub */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {/* Sidebar — RIGHT side */}
        <aside style={{
          width: 48, flexShrink: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', padding: '8px 0',
          borderLeft: '1px solid var(--border)',
          background: 'rgba(6,11,22,0.4)',
          gap: 2,
        }}>
          {/* Hub */}
          <SidebarBtn iconId="hub" neon="var(--accent)" active={location.pathname === '/'} title="Warren Hub" onClick={() => navigate('/')} />
          <SidebarBtn iconId="uplink" neon="#00f5ff" active={location.pathname.startsWith('/uplinks')}
            title={t('Uplinks — goals & bandwidth', 'Каналы — цели и полоса')} onClick={() => navigate('/uplinks')} />
          <div style={{ width: 28, height: 1, background: 'var(--border)', margin: '2px 0' }} />

          {/* Modules — only the ones that are actually shipped */}
          {GUILD.filter(m => m.built).map(member => (
            <SidebarBtn
              key={member.id}
              iconId={member.id}
              neon={member.neon}
              active={location.pathname.startsWith(member.path)}
              title={`${member.name} · ${member.role}`}
              dim={!hasAccess(entitlements, member.id, member.free)}
              onClick={() => navigate(member.path)}
            />
          ))}

          <div style={{ flex: 1 }} />
          <SidebarBtn iconId="set" neon="var(--accent)" active={settingsOpen} title="Settings" onClick={() => setSettingsOpen(o => !o)} />
          {isTauri() && <>
            <div style={{ width: 28, height: 1, background: 'rgba(255,0,51,0.1)', margin: '2px 0' }} />
            <SidebarBtn iconId="pwr" neon="#ff0033" active={false} title="Disconnect" onClick={() => getCurrentWindow().close()} />
          </>}
        </aside>
      </div>

      {/* Status bar */}
      <div style={{
        height: 18, flexShrink: 0, display: 'flex', alignItems: 'center',
        padding: '0 14px', gap: 8,
        borderTop: '1px solid var(--border)',
        background: 'rgba(6,11,22,0.35)',
      }}>
        <span className="pulse" style={{ fontSize: 5, color: '#39ff14' }}>●</span>
        <span style={{ fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
          {activeModule
            ? `${activeModule.name} · ${activeModule.role}`
            : 'Warren Protocol · Active'}
        </span>
      </div>
    </div>
  )
}
