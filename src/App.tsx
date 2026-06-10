import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import { GUILD, type GuildMember } from './guild'
import { hasAccess, type Entitlements } from './entitlements'
import { loadSettings, saveSettings, applySettings, type Settings } from './settings'
import SettingsPanel from './SettingsPanel'
import Scrap7    from './modules/scrap7/Scrap7'
import Log       from './modules/log/Log'
import Ardo      from './modules/ardo/Ardo'
import Solaris   from './modules/solaris/Solaris'
import Infinity8 from './modules/infinity8/Infinity8'
import Pictures  from './modules/pictures/Pictures'
import Journal   from './modules/journal/Journal'
import { getNowSnapshot, fmtClock, fmtDur } from './modules/infinity8/store'
import { CyberIcon } from './components/CyberIcon'

// ─── Matrix intro ─────────────────────────────────────────────────────────────
const BOOT_LINES = [
  '> WARREN PROTOCOL v1.0.0',
  '> INITIALIZING CORE SYSTEMS...',
  '> CONNECTING TO GUILD NETWORK...',
  '> SCANNING MODULES [10/10]...',
  '> SUPABASE LINK... ESTABLISHED',
  '> MYSTIC RAVI... ONLINE',
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
            all systems nominal
          </p>
        </div>
      </div>

      {/* Right: clock + controls */}
      <div data-tauri-drag-region style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Clock />
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
      </div>
    </div>
  )
}

// ─── Sidebar button — cyberpunk icon ─────────────────────────────────────────
import type { ModuleId } from './guild'

function SidebarBtn({ iconId, neon, active, title, dim = false, onClick }: {
  iconId: ModuleId | 'hub' | 'set' | 'pwr'
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
function NowCard() {
  const navigate = useNavigate()
  const [snap, setSnap] = useState(() => getNowSnapshot())
  const [nowMin, setNowMin] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() })

  useEffect(() => {
    const refresh = () => { setSnap(getNowSnapshot()); const d = new Date(); setNowMin(d.getHours() * 60 + d.getMinutes()) }
    const id = setInterval(refresh, 30000)
    window.addEventListener('warren:sync', refresh)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(id); window.removeEventListener('warren:sync', refresh); window.removeEventListener('focus', refresh) }
  }, [])

  const cur = snap.current
  const isFreeNow = !snap.awake || !cur || cur.kind === 'free' || cur.kind === 'break'
  const headline = !snap.awake ? 'Off the clock'
    : isFreeNow ? 'Free time'
    : cur!.label
  const sub = !snap.awake
    ? `${fmtDur(snap.freeMinutes)} of free time today`
    : isFreeNow
      ? (snap.next ? `until ${snap.next.label} at ${fmtClock(snap.next.start)}` : 'rest of the day is yours')
      : `now → ${fmtClock(cur!.end)} · ${fmtDur(Math.max(0, cur!.end - nowMin))} left`

  return (
    <button onClick={() => navigate('/infinity8')} className="glow-pulse" style={{
      width: '100%', textAlign: 'left', cursor: 'pointer',
      padding: '13px 15px', borderRadius: 10, marginBottom: 16,
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
          color: isFreeNow ? 'rgba(57,255,20,0.7)' : INF }}>
          {isFreeNow ? '● FREE NOW' : '● HAPPENING NOW'}
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
        <p style={{ fontSize: 7, color: 'rgba(57,255,20,0.5)', letterSpacing: '0.1em', marginTop: 2 }}>FREE TODAY</p>
        {snap.committedCount > 0 && (
          <p style={{ fontSize: 7.5, color: `${INF}70`, marginTop: 3 }}>{snap.doneCount}/{snap.committedCount} done</p>
        )}
      </div>
    </button>
  )
}

function Dashboard({ displayName }: { displayName: string }) {
  const now  = new Date()
  const hour = now.getHours()
  const greeting = hour < 5 ? 'still up?' : hour < 12 ? 'good morning' : hour < 17 ? 'good afternoon' : 'good evening'
  const name = displayName || null

  return (
    <div className="fade-in" style={{ height: '100%', overflowY: 'auto', padding: '20px 18px' }}>

      {/* Greeting */}
      <div style={{ marginBottom: 22 }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.03em' }}>
          {greeting}{name ? `, ${name}` : ''} <span style={{ color: 'var(--accent)', textShadow: '0 0 10px var(--accent-dim)' }}>👋</span>
        </p>
        <p style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.1em', marginTop: 4, textTransform: 'uppercase' }}>
          Warren hub · select a module →
        </p>
      </div>

      {/* Live now card (INFINITY-8) */}
      <NowCard />

      {/* Quick stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Tasks due',   value: '—',  neon: '#00b4ff', emoji: '🦝' },
          { label: 'Active goals',value: '—',  neon: '#c084fc', emoji: '🦫' },
          { label: 'Calories',    value: '—',  neon: '#ff006e', emoji: '🐼' },
          { label: 'Streak',      value: '—',  neon: '#39ff14', emoji: '🔥' },
        ].map(({ label, value, neon, emoji }) => (
          <div key={label} style={{
            padding: '10px 12px', borderRadius: 8,
            background: 'rgba(13,24,48,0.5)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13 }}>{emoji}</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: neon, textShadow: `0 0 8px ${neon}50` }}>
                {value}
              </span>
            </div>
            <p style={{ fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* Status */}
      <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(57,255,20,0.04)', border: '1px solid rgba(57,255,20,0.1)' }}>
        <p style={{ fontSize: 9, color: 'rgba(57,255,20,0.6)', letterSpacing: '0.1em', fontWeight: 700 }}>
          <span className="pulse">●</span> ALL SYSTEMS NOMINAL
        </p>
        <p style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 3, letterSpacing: '0.06em' }}>
          Warren is running · modules can be accessed from the sidebar →
        </p>
      </div>
    </div>
  )
}

// ─── Module view ──────────────────────────────────────────────────────────────
function ModuleView({ member, unlocked }: { member: GuildMember; unlocked: boolean }) {
  const navigate = useNavigate()

  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '13px 16px 11px', flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
        background: `${member.neon}04`,
      }}>
        <button
          onClick={() => navigate('/')}
          style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 6px 2px 0' }}
        >←</button>
        <span style={{
          fontFamily: 'var(--font)', fontSize: 11, fontWeight: 900,
          color: member.neon, textShadow: `0 0 10px ${member.neon}`,
          letterSpacing: '0.05em', minWidth: 32, textAlign: 'center',
        }}>{member.unit}</span>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: member.neon, textShadow: `0 0 8px ${member.neon}`, letterSpacing: '0.12em' }}>
            {member.name.toUpperCase()}
          </p>
          <p style={{ fontSize: 7.5, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>{member.role}</p>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, padding: 24 }}>
        {unlocked ? (
          <>
            <span style={{ fontSize: 30 }}>🚧</span>
            <p style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              In development
            </p>
          </>
        ) : (
          <>
            <span style={{ fontSize: 30 }}>🔒</span>
            <p style={{ fontSize: 10, color: member.neon, fontWeight: 700, letterSpacing: '0.1em', textShadow: `0 0 8px ${member.neon}` }}>
              {member.name.toUpperCase()}
            </p>
            <p style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.7, maxWidth: 200 }}>
              Purchase this module to unlock {member.role.toLowerCase()}.
            </p>
            <button
              style={{
                marginTop: 6, padding: '8px 22px', borderRadius: 6, fontSize: 9,
                border: `1px solid ${member.neon}40`, color: member.neon,
                background: `${member.neon}0c`, letterSpacing: '0.12em',
                textTransform: 'uppercase', fontWeight: 700,
              }}
              onMouseEnter={e => e.currentTarget.style.background = `${member.neon}1a`}
              onMouseLeave={e => e.currentTarget.style.background = `${member.neon}0c`}
            >
              Unlock Module
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const navigate  = useNavigate()
  const location  = useLocation()

  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [intro, setIntro]       = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const entitlements: Entitlements = {}

  // Apply settings on mount and whenever they change
  useEffect(() => { applySettings(settings) }, [settings])

  const activeModule = GUILD.find(m => location.pathname.startsWith(m.path)) ?? null

  const bgColor = `rgba(6, 11, 22, ${settings.opacity})`

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
            {GUILD.filter(m => !['scrap7', 'log', 'ardo', 'pomu', 'ravi', 'foxy', 'hoot'].includes(m.id)).map(member => (
              <Route
                key={member.id}
                path={`${member.path}/*`}
                element={
                  <ModuleView
                    member={member}
                    unlocked={hasAccess(entitlements, member.id, member.free)}
                  />
                }
              />
            ))}
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
          <div style={{ width: 28, height: 1, background: 'var(--border)', margin: '2px 0' }} />

          {/* Modules */}
          {GUILD.map(member => (
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
          <div style={{ width: 28, height: 1, background: 'rgba(255,0,51,0.1)', margin: '2px 0' }} />
          <SidebarBtn iconId="pwr" neon="#ff0033" active={false} title="Disconnect" onClick={() => getCurrentWindow().close()} />
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
