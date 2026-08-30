import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import { GUILD, type GuildMember, type ModuleId } from './guild'
import { hasAccess, type Entitlements } from './entitlements'
import { loadSettings, saveSettings, applySettings, isTauri, type Settings } from './settings'
import SettingsPanel from './SettingsPanel'
import { Onboarding } from './Onboarding'
import { RouteTour } from './TourOverlay'
import { Initiation } from './modules/progression/Initiation'
import { LevelUp } from './modules/progression/LevelUp'
import { gatedLevel } from './modules/progression/xp'
import { loadProgression, saveProgression, adoptOrphanHabits } from './modules/progression/store'
import { autoSync } from './sync'
import { moduleLevel, moduleUnlocked } from './moduleAccess'
import { bootLines } from './boot'
import { play as playCue } from './sound'
import { QuestHintBanner } from './modules/progression/QuestHint'
import Scrap7    from './modules/scrap7/Scrap7'
import Ardo      from './modules/ardo/Ardo'
import Solaris   from './modules/solaris/Solaris'
import Infinity8 from './modules/infinity8/Infinity8'
import Pictures  from './modules/pictures/Pictures'
import Journal   from './modules/journal/Journal'
import Vigilante from './modules/vigilante/Vigilante'
import BigScreen from './modules/bigscreen/BigScreen'
import { getNowSnapshot, fmtClock, fmtDur } from './modules/infinity8/store'
import { gatherSuggestions, topSuggestion, type Suggestion } from './modules/infinity8/suggestions'
import { getHubStats, type HubStats } from './hubStats'
import { ReleaseRadar } from './modules/pictures/ReleaseRadar'
import Uplinks from './modules/progression/Uplinks'
import { BandwidthStrip } from './modules/progression/BandwidthStrip'
import { QuestPanel } from './modules/progression/QuestPanel'
import { WeekStrip } from './modules/progression/WeekStrip'
import { loadState as loadScrap7 } from './modules/scrap7/store'
import { useLocale, t } from './i18n'
import { CyberIcon } from './components/CyberIcon'
import { HubWindow } from './components/HubWindow'

// ─── Dormant surfaces ─────────────────────────────────────────────────────────
// Warren OS (fullscreen launcher, file browser, quest log) is parked while the
// progression system lands — it doesn't serve the goal loop. Code and data stay
// untouched; only navigation drops it. INFINITY-8 is parked the same way via its
// `built: false` in guild.ts — but its code is very much alive: it is ORBIT's
// TIMELINE view and the hub's NOW card. The flag only keeps it out of the
// sidebar, because it was never a module in its own right.
const WARREN_OS_ENABLED = false

// ─── Sidebar order ────────────────────────────────────────────────────────────
// Hand-ordered rather than array-ordered, and ordered by how often a thing is
// actually opened rather than by how important it is. The kitchen, the day and
// the log are daily; PATHFINDER is opened once or twice in the life of a goal,
// so it sits last among the instruments — directly above the utilities — even
// though everything downstream begins there.
const INSTRUMENT_ORDER: ModuleId[] = ['pomu', 'scrap7', 'hoot', 'log']

const built = GUILD.filter(m => m.built)
const NAV_ORDER = INSTRUMENT_ORDER
  .map(id => built.find(m => m.id === id))
  .filter((m): m is GuildMember => !!m)
  // anything built, an instrument, and not hand-placed still gets a slot
  .concat(built.filter(m => m.group === 'instrument' && !INSTRUMENT_ORDER.includes(m.id)))
const NAV_UTILITIES = built.filter(m => m.group === 'utility')

function IntroScreen({ onDone, displayName }: { onDone: () => void; displayName: string }) {
  const [lines, setLines]         = useState<string[]>([])
  const [username, setUsername]   = useState(displayName || 'AGENT')
  const [showHello, setShowHello] = useState(false)
  const [exiting, setExiting]     = useState(false)

  // Fixed for the life of this boot, so a re-render can't reshuffle it
  const [script] = useState(() => bootLines(displayName))

  // onDone is a fresh closure on every parent render. Held in a ref so the timer
  // effect below doesn't list it as a dependency — it used to, which restarted
  // the whole chain on every re-render and printed each line two or three times.
  const doneRef = useRef(onDone)
  useEffect(() => { doneRef.current = onDone }, [onDone])

  useEffect(() => {
    if (!displayName) {
      invoke<string>('get_username').then(u => setUsername(u)).catch(() => {})
    }
  }, [displayName])

  useEffect(() => {
    let i = 0
    const timers: number[] = []
    const at = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms))

    const addLine = () => {
      if (i < script.length) {
        setLines(prev => [...prev, script[i]])
        i++
        at(addLine, i === script.length - 1 ? 180 : 90 + Math.random() * 70)
      } else {
        at(() => setShowHello(true), 300)
        at(() => setExiting(true), 1800)
        at(() => doneRef.current(), 2300)
      }
    }
    at(addLine, 400)
    // Cancelling matters twice over: StrictMode mounts effects twice in dev, and
    // without this both chains survive and interleave.
    return () => { timers.forEach(clearTimeout); setLines([]) }
  }, [script])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,4,10,0.97)',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '0 28px',
      paddingTop: 'var(--sa-top)', paddingBottom: 'var(--sa-bottom)',
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
            fontFamily: 'var(--font)', fontSize: 13.5,
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
            fontFamily: 'var(--font)', fontSize: 12.5,
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
      {/* Hidden on a phone (see index.css): iOS is already showing the time in
          the status bar directly above this, and two clocks stacked is a waste
          of the narrowest bar in the app. The date line stays — the status bar
          does not carry that. */}
      <p className="titlebar-clock" style={{
        fontSize: 20, fontWeight: 800, letterSpacing: '0.04em',
        color: '#fff', textShadow: '0 0 12px rgba(0,245,255,0.5)',
      }}>{time}</p>
      <p style={{ fontSize: 10.5, color: 'rgba(0,245,255,0.6)', letterSpacing: '0.12em', marginTop: 2, textTransform: 'uppercase' }}>
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
        // The bar keeps its 52px of content and grows by whatever iOS is
        // covering, so its background runs behind the clock and the notch
        // instead of the clock landing on the word WARREN.
        height: 'calc(52px + var(--sa-top))',
        paddingTop: 'var(--sa-top)',
        paddingRight: 'calc(14px + var(--sa-right))',
        paddingLeft: 'calc(16px + var(--sa-left))',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, cursor: 'grab',
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
          fontSize: 14.5, fontWeight: 900, color: '#00f5ff',
          textShadow: '0 0 10px #00f5ff',
          boxShadow: '0 0 12px rgba(0,245,255,0.15)',
        }}>W</div>
        <div>
          <p style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: '0.22em', color: 'rgba(0,245,255,0.8)', textTransform: 'uppercase' }}>
            Warren
          </p>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em', marginTop: 1 }}>
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
              fontFamily: 'var(--font)', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em',
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
                fontSize: 14.5, color: 'rgba(148,163,184,0.35)',
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

function SidebarBtn({ iconId, neon, active, title, dim = false, locked = false, onClick }: {
  iconId: ModuleId | 'hub' | 'set' | 'pwr' | 'uplink'
  neon: string; active: boolean; title: string
  dim?: boolean; locked?: boolean; onClick: () => void
}) {
  const [hov, setHov] = useState(false)
  const on = (active || hov) && !locked

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={title}
      style={{
        // Grows on touch screens — see --nav-btn-* in index.css.
        width: 'var(--nav-btn-w)', height: 'var(--nav-btn-h)', borderRadius: 7, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: on ? `${neon}12` : 'transparent',
        border: `1px solid ${on ? `${neon}35` : 'transparent'}`,
        transition: 'all 0.15s', position: 'relative', cursor: 'pointer',
        opacity: dim ? 0.25 : 1,
      }}
    >
      <CyberIcon id={iconId} size={18}
        color={locked ? 'rgba(148,163,184,0.3)' : on ? neon : 'rgba(148,163,184,0.4)'} glow={on} />
      {locked && (
        <span style={{ position: 'absolute', right: 3, bottom: 2, fontSize: 11.5, lineHeight: 1,
          color: 'rgba(148,163,184,0.55)' }}>🔒</span>
      )}
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
    {/* The card no longer travels to INFINITY-8 — it *is* INFINITY-8, minimized.
        Tapping it maximizes the module over the hub without leaving it. */}
    <HubWindow tone={INF} label={t('INFINITY-8 · TODAY', 'INFINITY-8 · СЕГОДНЯ')}
      minimized={
    <div className="glow-pulse" style={{
      width: '100%', textAlign: 'left',
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
        {/* Only when it says something the headline does not. "● FREE NOW"
            over "Free time", and "● QUESTS OPEN" over "3 quests still open",
            were labels for the line underneath them. */}
        {!idleNow && (
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: INF }}>
            {t('● HAPPENING NOW', '● ИДЁТ СЕЙЧАС')}
          </p>
        )}
        <p style={{ fontSize: 16.5, fontWeight: 800, color: 'rgba(225,250,255,0.95)',
          letterSpacing: '0.02em', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {headline}
        </p>
        <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.6)', letterSpacing: '0.04em', marginTop: 2 }}>{sub}</p>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ fontSize: 18, fontWeight: 900, color: '#39ff14', lineHeight: 1,
          textShadow: '0 0 10px rgba(57,255,20,0.4)' }}>{fmtDur(snap.freeMinutes)}</p>
        <p style={{ fontSize: 11.5, color: 'rgba(57,255,20,0.5)', letterSpacing: '0.1em', marginTop: 2 }}>{t('LEFT', 'ОСТАЛОСЬ')}</p>
        {snap.committedCount > 0 && (
          <p style={{ fontSize: 10, color: `${INF}70`, marginTop: 3 }}>{snap.doneCount}/{snap.committedCount} {t('done', 'готово')}</p>
        )}
      </div>
    </div>
      }>
      <Infinity8 />
    </HubWindow>

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
        <span style={{ fontSize: 20, flexShrink: 0 }}>{suggest.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.16em',
            color: `${SUGGEST_TONE[suggest.tone]}b0` }}>{t('THE GUILD SUGGESTS', 'ГИЛЬДИЯ СОВЕТУЕТ')}</p>
          <p style={{ fontSize: 14.5, fontWeight: 700, color: 'rgba(225,250,255,0.95)', marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{suggest.label}</p>
          {suggest.detail && (
            <p style={{ fontSize: 10.5, color: 'rgba(148,163,184,0.6)', marginTop: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{suggest.detail}</p>
          )}
        </div>
        <span style={{ fontSize: 10.5, color: `${SUGGEST_TONE[suggest.tone]}cc`, flexShrink: 0 }}>~{fmtDur(suggest.minutes)}</span>
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

  // Icons come from the app's own set, keyed by module, so a tile and its
  // sidebar button are visibly the same thing. The animal emoji these replaced
  // were left over from the guild-of-mascots era and no longer matched anything.
  const orbitOpen = moduleUnlocked(
    'scrap7',
    gatedLevel(loadProgression().xp, loadProgression().quests).level,
    loadSettings().unlockAll,
  )

  const tiles = [
    { label: t('Tasks due', 'Задачи на сегодня'),   value: String(stats.tasksDue),
      neon: '#00b4ff', icon: 'scrap7' as const, path: '/scrap7' },
    { label: t('Dreams', 'Мечты'),                  value: String(stats.activeGoals),
      neon: '#c084fc', icon: 'log' as const,    path: '/log' },
    { label: t('Kcal left', 'Ккал осталось'),       value: stats.caloriesLeft === null ? '—' : String(stats.caloriesLeft),
      neon: '#ffb13c', icon: 'pomu' as const,   path: '/solaris' },
    { label: t('Best streak', 'Лучшая серия'),      value: String(stats.streak),
      neon: '#ff6b00', icon: 'uplink' as const, path: '/uplinks' },
  ]

  return (
    <div className="fade-in" style={{ height: '100%', overflowY: 'auto', padding: '20px 18px' }}>

      {/* Greeting */}
      <div style={{ marginBottom: 22 }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.03em' }}>
          {greeting}{name ? `, ${name}` : ''} <span style={{ color: 'var(--accent)', textShadow: '0 0 10px var(--accent-dim)' }}>👋</span>
        </p>
      </div>

      {/* Where you stand, and where the day is: the two things the hub is for.
          The NOW card used to be gated on INFINITY-8 being its own module — it
          isn't one any more, it's ORBIT's other half, so it follows ORBIT. */}
      <WeekStrip tasks={loadScrap7().tasks} />
      {orbitOpen && <NowCard />}

      {/* The quest log lives where navigation lives */}
      <div data-tour="quest-panel"><QuestPanel /></div>

      {/* Two uplinks, and what they're carrying */}
      <div data-tour="bandwidth"><BandwidthStrip /></div>

      {/* What's landing soon, from the titles already tracked */}
      <ReleaseRadar />

      {/* Quick stats row — live, tap to open the module */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
        {tiles.map(({ label, value, neon, icon, path }) => (
          <button key={label} onClick={() => navigate(path)} style={{
            padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
            background: 'rgba(13,24,48,0.5)',
            border: '1px solid rgba(255,255,255,0.05)', transition: 'border-color 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = `${neon}55`}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <CyberIcon id={icon} size={14} color={neon} glow />
              <span style={{ fontSize: 17.5, fontWeight: 800, color: neon, textShadow: `0 0 8px ${neon}50` }}>
                {value}
              </span>
            </div>
            <p style={{ fontSize: 10.5, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {label}
            </p>
          </button>
        ))}
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
  const [initiated, setInitiated] = useState(() => !!loadProgression().initiatedAt)
  const [levelUp, setLevelUp] = useState<number | null>(null)
  const [level, setLevel] = useState(() => { const p = loadProgression(); return gatedLevel(p.xp, p.quests).level })
  const [lockNote, setLockNote] = useState('')
  const entitlements: Entitlements = {}

  // Apply settings on mount and whenever they change
  useEffect(() => { applySettings(settings) }, [settings])

  // A habit belonging to no system has nowhere to be seen now that ORBIT
  // keeps only the day. Adopt them into life support before anything renders.
  useEffect(() => { adoptOrphanHabits() }, [])

  // Sync on launch and whenever the window goes away — the two moments where the
  // other device could plausibly have moved. It never resolves a conflict on its
  // own; that waits in Settings. See sync.ts.
  useEffect(() => {
    if (!settings.syncEnabled) return
    const cfg = {
      url: settings.syncUrl, passphrase: settings.syncPassphrase,
      bypass: settings.syncBypass, enabled: true,
    }
    void autoSync(cfg)
    const onHide = () => { if (document.visibilityState === 'hidden') void autoSync(cfg) }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [settings.syncEnabled, settings.syncUrl, settings.syncPassphrase, settings.syncBypass])

  // The IDENTIFY YOURSELF quest points at Settings, which is an overlay owned
  // here rather than a route — so it asks for it by event.
  useEffect(() => {
    const open = () => setSettingsOpen(true)
    window.addEventListener('warren:open-settings', open)
    return () => window.removeEventListener('warren:open-settings', open)
  }, [])

  // Watched at the top rather than inside a screen: a threshold can be crossed
  // by logging water in SOLARIS, and the moment should land wherever you are.
  useEffect(() => {
    const check = () => {
      const p = loadProgression()
      const reached = gatedLevel(p.xp, p.quests).level
      setLevel(reached)
      if (reached > (p.celebratedLevel ?? 1)) setLevelUp(reached)
    }
    check()
    window.addEventListener('warren:sync', check)
    window.addEventListener('focus', check)
    return () => {
      window.removeEventListener('warren:sync', check)
      window.removeEventListener('focus', check)
    }
  }, [])

  // Every launch starts at the hub. HashRouter restores the last route from the
  // URL, so without this a restart — or a reset performed inside a module —
  // drops you back on a screen that may no longer have anything on it.
  useEffect(() => {
    if (WARREN_OS_ENABLED && isTauri() && loadSettings().bootBigScreen) {
      void getCurrentWindow().setFullscreen(true).catch(() => {})
      navigate('/bigscreen')
      return
    }
    navigate('/', { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeModule = GUILD.find(m => location.pathname.startsWith(m.path)) ?? null

  /** Navigate and drop the settings overlay — it covers wherever you're going. */
  /**
   * Moving between modules. The cue is the only feedback that the tap landed
   * before the next screen paints — without it a slow route change reads as a
   * dead button, which is why the locked path already had one and the working
   * path did not.
   */
  const go = (path: string) => {
    if (path !== location.pathname) playCue('open')
    setSettingsOpen(false)
    navigate(path)
  }

  /** A locked module says what opens it rather than doing nothing at all. */
  const flashLocked = (id: ModuleId) => {
    const m = GUILD.find(g => g.id === id)
    playCue('deny')
    setLockNote(`${m?.name ?? ''} · ${t('LEVEL', 'УРОВЕНЬ')} ${moduleLevel(id)}`)
    window.setTimeout(() => setLockNote(''), 2600)
  }

  // ── What owns the screen ────────────────────────────────────────────────────
  // Strictly one at a time, in this order. Every one of these is full-screen, so
  // without an explicit chain they stack: the arrival used to land on top of an
  // unfinished tour, and opening a module early started a second tour over the
  // first. Each stage waits for the one above it.
  const onHub          = location.pathname === '/'
  const showIntro      = intro && settings.showIntro
  const showOnboarding = !showIntro && !settings.onboardedAt
  const showInitiation = !showIntro && !showOnboarding && !initiated && onHub
  const showLevelUp    = levelUp !== null && !showIntro && !showOnboarding && !showInitiation
  // Reached by URL, back button, or a level that dropped — never a dead render
  const lockedRoute = GUILD.some(m =>
    m.built && location.pathname.startsWith(m.path) && !moduleUnlocked(m.id, level, settings.unlockAll))
  const tourEnabled    = !showIntro && !showOnboarding && !showInitiation && !showLevelUp && !settingsOpen

  // Window transparency only means something when there is a desktop behind the
  // window. In a browser there is nothing behind it, so the slider would just
  // dilute the app against the default white canvas.
  const bgColor = isTauri() ? `rgba(6, 11, 22, ${settings.opacity})` : 'rgb(6, 11, 22)'

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

  // The rim light, the rounded corners and the drop shadow all say "a window
  // floating on a desktop". On a phone the app IS the screen, so the same
  // styling reads as a smaller screen inset inside the real one.
  const framed = isTauri()

  return (
    <div className="app-shell" style={{
      display: 'flex', flexDirection: 'column',
      width: '100vw',
      background: bgColor,
      backdropFilter: 'blur(22px) saturate(1.5)',
      WebkitBackdropFilter: 'blur(22px) saturate(1.5)',
      border: framed ? '1px solid rgba(0,245,255,0.1)' : 'none',
      borderRadius: framed ? 10 : 0, overflow: 'hidden',
      boxShadow: framed
        ? '0 12px 50px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,245,255,0.06), inset 0 1px 0 rgba(255,255,255,0.04)'
        : 'none',
    }}>
      {/* Matrix intro */}
      {intro && settings.showIntro && (
        <IntroScreen onDone={() => setIntro(false)} displayName={settings.displayName} />
      )}

      {/* First run. Nothing here works properly until it knows whose day it is
          measuring, so this is a gate rather than a quest. */}
      {showOnboarding && (
        <Onboarding settings={settings}
          onDone={patch => { const next = { ...settings, ...patch }; saveSettings(next); setSettings(next) }} />
      )}

      {/* The arrival. Lives on the hub, because that is where a new operator is
          standing — it used to ambush you the first time you opened UPLINKS. */}
      {showInitiation && (
        <Initiation name={settings.displayName}
          onDone={() => {
            saveProgression({ ...loadProgression(), initiatedAt: new Date().toISOString() })
            setInitiated(true)
          }} />
      )}

      {/* A threshold crossed. Says what changed, never "well done". */}
      {showLevelUp && (
        <LevelUp level={levelUp}
          onDone={() => {
            saveProgression({ ...loadProgression(), celebratedLevel: levelUp })
            setLevelUp(null)
          }} />
      )}

      {/* Step-by-step, once per surface — and only once everything above it is done */}
      <RouteTour enabled={tourEnabled} />

      {/* Title bar */}
      <TitleBar />

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Main content */}
        <main style={{ flex: 1, minWidth: 0, overflow: 'hidden', position: 'relative',
          paddingLeft: 'var(--sa-left)',
          display: 'flex', flexDirection: 'column' }}>
          {/* Settings panel */}
          {settingsOpen && (
            <SettingsPanel
              settings={settings}
              onClose={() => setSettingsOpen(false)}
              onChange={s => { saveSettings(s); setSettings(s) }}
            />
          )}

          <QuestHintBanner />

          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {lockedRoute && <Navigate to="/" replace />}
          <Routes>
            <Route path="/" element={<Dashboard displayName={settings.displayName} />} />
            <Route path="/scrap7/*"    element={<Scrap7 />} />
            {/* PATHFINDER folded into UPLINKS as the DREAMS tab — a door is not
                a room (rule 17). The route redirects rather than 404s, because
                old links, quest destinations and muscle memory all still say
                /log. `Log.tsx` stays on disk, unrouted, per rule 12. */}
            <Route path="/log/*"       element={<Navigate to="/uplinks" replace />} />
            <Route path="/ardo/*"      element={<Ardo />} />
            <Route path="/solaris/*"   element={<Solaris />} />
            <Route path="/infinity8/*" element={<Infinity8 />} />
            <Route path="/pictures/*"  element={<Pictures />} />
            <Route path="/journal/*"   element={<Journal />} />
            <Route path="/vigilante/*" element={<Vigilante />} />
            <Route path="/uplinks/*"  element={<Uplinks />} />
            {/* Unbuilt modules are hidden; any stray URL falls back to the Hub */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </div>
        </main>

        {/* Sidebar — RIGHT side */}
        <aside data-tour="sidebar" style={{
          width: 'calc(48px + var(--sa-right))', flexShrink: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', paddingTop: 8, paddingBottom: 8, paddingRight: 'var(--sa-right)',
          borderLeft: '1px solid var(--border)',
          background: 'rgba(6,11,22,0.4)',
          gap: 2,
        }}>
          {/* Settings is an overlay on top of the module, so going anywhere
              dismisses it — otherwise it hides the screen you just asked for. */}
          {/* Hub */}
          <SidebarBtn iconId="hub" neon="var(--accent)" active={location.pathname === '/'} title="Warren Hub" onClick={() => go('/')} />
          <SidebarBtn iconId="uplink" neon="#00f5ff" active={location.pathname.startsWith('/uplinks')}
            title={t('Uplinks — goals & bandwidth', 'Каналы — цели и полоса')} onClick={() => go('/uplinks')} />
          <div style={{ width: 28, height: 1, background: 'var(--border)', margin: '2px 0' }} />

          {/* INSTRUMENTS, then a divider, then UTILITIES. The split is the whole
              point: instruments build the character, utilities serve the day. */}
          {NAV_ORDER.map(member => {
            const open = moduleUnlocked(member.id, level, settings.unlockAll)
            return (
              <SidebarBtn
                key={member.id}
                iconId={member.id}
                neon={member.neon}
                active={location.pathname.startsWith(member.path)}
                title={open ? `${member.name} · ${member.role}`
                            : `${member.name} · ${t('opens at level', 'открывается на уровне')} ${moduleLevel(member.id)}`}
                dim={!open || !hasAccess(entitlements, member.id, member.free)}
                locked={!open}
                onClick={() => open ? go(member.path) : flashLocked(member.id)}
              />
            )
          })}
          {NAV_UTILITIES.length > 0 && (
            <div title={t('Utilities — they serve the day, not the character', 'Утилиты — служат дню, а не персонажу')}
              style={{ width: 20, height: 1, background: 'rgba(255,255,255,0.14)', margin: '5px 0' }} />
          )}
          {NAV_UTILITIES.map(member => {
            const open = moduleUnlocked(member.id, level, settings.unlockAll)
            return (
              <SidebarBtn
                key={member.id}
                iconId={member.id}
                neon={member.neon}
                active={location.pathname.startsWith(member.path)}
                title={open ? `${member.name} · ${member.role} · ${t('utility', 'утилита')}`
                            : `${member.name} · ${t('opens at level', 'открывается на уровне')} ${moduleLevel(member.id)}`}
                dim={!open || !hasAccess(entitlements, member.id, member.free)}
                locked={!open}
                onClick={() => open ? go(member.path) : flashLocked(member.id)}
              />
            )
          })}

          <div style={{ flex: 1 }} />
          <SidebarBtn iconId="set" neon="var(--accent)" active={settingsOpen} title="Settings" onClick={() => setSettingsOpen(o => !o)} />
          {isTauri() && <>
            <div style={{ width: 28, height: 1, background: 'rgba(255,0,51,0.1)', margin: '2px 0' }} />
            <SidebarBtn iconId="pwr" neon="#ff0033" active={false} title="Disconnect" onClick={() => getCurrentWindow().close()} />
          </>}
        </aside>
      </div>

      {/* A locked module says what opens it */}
      {lockNote && (
        <div style={{ position: 'fixed', bottom: 26, right: 60, zIndex: 60,
          padding: '7px 13px', borderRadius: 8, background: 'rgba(4,10,18,0.96)',
          border: '1px solid rgba(148,163,184,0.3)', animation: 'fadeInPlace 0.18s ease' }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em',
            color: 'rgba(200,220,240,0.75)' }}>🔒 {t('OPENS AT', 'ОТКРОЕТСЯ НА')} {lockNote}</p>
        </div>
      )}

      {/* Status bar */}
      <div style={{
        height: 'calc(18px + var(--sa-bottom))',
        paddingBottom: 'var(--sa-bottom)',
        paddingLeft: 'calc(14px + var(--sa-left))',
        paddingRight: 'calc(14px + var(--sa-right))',
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
        borderTop: '1px solid var(--border)',
        background: 'rgba(6,11,22,0.35)',
      }}>
        <span className="pulse" style={{ fontSize: 5, color: '#39ff14' }}>●</span>
        <span style={{ fontSize: 10.5, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
          {activeModule
            ? `${activeModule.name} · ${activeModule.role}`
            : 'Warren Protocol · Active'}
        </span>
      </div>
    </div>
  )
}
