import { useState, useEffect, useMemo, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri, loadSettings } from '../../settings'
import { t as tr } from '../../i18n'
import { GUILD } from '../../guild'
import {
  getNowSnapshot, getTodayCommitments, loadInf8State,
  effectiveAnchors, buildDay, todayKey, toMin,
  fmtDur, type Commitment, type Inf8State,
} from '../infinity8/store'
import { gatherSuggestions, type Suggestion } from '../infinity8/suggestions'
import { DayRibbon } from './DayRibbon'
import { FileBrowser } from './FileBrowser'
import { parentPath } from './files'
import { ModuleCard } from './ModuleCard'
import { getModuleSummaries, type ModuleSummaries } from './moduleStats'
import Infinity8 from '../infinity8/Infinity8'
import Scrap7   from '../scrap7/Scrap7'
import Log      from '../log/Log'
import Ardo     from '../ardo/Ardo'
import Solaris  from '../solaris/Solaris'
import Pictures from '../pictures/Pictures'
import Journal  from '../journal/Journal'
import {
  filterApps, monogram, tileNeon, groupByLetter,
  loadFavs, saveFavs, toggleFav,
  loadLaunchStats, saveLaunchStats, recordLaunch, mostUsed,
  fmtAgo, isRunning,
  type AppEntry, type LaunchStats,
} from './apps'

const NEON = '#00f5ff'
const GOLD = '#ffd700'
const BG   = 'rgb(3,7,14)'   // fully opaque — Warren OS covers the desktop completely

// Cyber dot-grid backdrop for the main stage — fills the void without noise
const STAGE_BG: React.CSSProperties = {
  backgroundImage: 'radial-gradient(rgba(0,245,255,0.05) 1px, transparent 1px)',
  backgroundSize: '26px 26px',
}

const TONE: Record<Suggestion['tone'], string> = {
  play: '#ff8a4c', grow: '#8b9bff', care: '#ffd76b',
}

// Modules hosted INSIDE Warren OS — clicking a guild card opens them here,
// fullscreen, with the quest rail still visible. Never drops to the widget.
const MODULES: Record<string, React.ComponentType> = {
  '/scrap7':    Scrap7,
  '/log':       Log,
  '/ardo':      Ardo,
  '/solaris':   Solaris,
  '/infinity8': Infinity8,
  '/pictures':  Pictures,
  '/journal':   Journal,
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

// ─── Section label ────────────────────────────────────────────────────────────
function SectionLabel({ icon, text, color = NEON }: { icon: string; text: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 12px' }}>
      <span style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 800,
        color: `${color}90`, letterSpacing: '0.22em' }}>{icon} {text}</span>
      <div style={{ flex: 1, height: 1, background: `${color}12` }} />
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
      width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14,
      padding: '20px 22px', overflowY: 'auto',
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

/** Wide entry button — the way into Files and the program library. */
function BigEntry({ icon, title, sub, color, onClick }: {
  icon: string; title: string; sub: string; color: string; onClick: () => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', cursor: 'pointer',
        padding: '15px 18px', borderRadius: 13, minWidth: 0,
        background: hov ? `${color}12` : `linear-gradient(135deg, ${color}0b, rgba(13,24,48,0.4))`,
        border: `1px solid ${hov ? `${color}60` : `${color}22`}`,
        boxShadow: hov ? `0 0 22px ${color}20` : 'none', transition: 'all 0.16s',
      }}>
      <span style={{ fontSize: 24, flexShrink: 0, filter: `drop-shadow(0 0 8px ${color}70)` }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 900, color,
          letterSpacing: '0.14em', textShadow: `0 0 10px ${color}50` }}>{title}</p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 8, color: 'rgba(148,163,184,0.55)',
          letterSpacing: '0.04em', marginTop: 4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</p>
      </div>
      <span style={{ marginLeft: 'auto', fontFamily: 'var(--font)', fontSize: 12,
        color: `${color}${hov ? 'cc' : '55'}`, flexShrink: 0 }}>→</span>
    </button>
  )
}

// ─── App tile — icon, name, and what Warren knows about your use of it ────────
function AppTile({ app, onLaunch, fav, onToggleFav, stat, running, icon }: {
  app: AppEntry
  onLaunch: (a: AppEntry) => void
  fav: boolean
  onToggleFav: (a: AppEntry) => void
  stat?: { count: number; last: string }
  running?: boolean
  icon?: string
}) {
  const [hov, setHov] = useState(false)
  const neon = tileNeon(app.name)
  const meta = running
    ? tr('running', 'запущено')
    : stat
      ? `${stat.count}× · ${fmtAgo(stat.last)}`
      : null

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ position: 'relative', minWidth: 0 }}>
      <button onClick={() => onLaunch(app)} title={app.name}
        style={{
          width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
          padding: '13px 8px 10px', borderRadius: 12, cursor: 'pointer',
          background: hov ? `${neon}10` : running ? 'rgba(57,255,20,0.05)' : 'rgba(13,24,48,0.45)',
          border: `1px solid ${hov ? `${neon}55` : running ? 'rgba(57,255,20,0.28)' : 'rgba(255,255,255,0.06)'}`,
          boxShadow: hov ? `0 0 18px ${neon}25` : 'none',
          transition: 'all 0.15s',
        }}>
        <div style={{
          width: 48, height: 48, borderRadius: 13, flexShrink: 0, position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `linear-gradient(135deg, ${neon}22, ${neon}08)`,
          border: `1px solid ${neon}45`,
          fontFamily: 'var(--font)', fontSize: 16, fontWeight: 900, color: neon,
          textShadow: icon ? 'none' : `0 0 10px ${neon}`,
          boxShadow: hov ? `0 0 14px ${neon}40` : `inset 0 0 10px ${neon}10`,
          transition: 'box-shadow 0.15s',
        }}>
          {icon
            ? <img src={`data:image/png;base64,${icon}`} alt="" width={30} height={30}
                style={{ imageRendering: 'auto', filter: hov ? 'saturate(1.15)' : 'none' }} />
            : monogram(app.name)}
          {running && (
            <span className="pulse" style={{
              position: 'absolute', top: -3, right: -3, width: 9, height: 9, borderRadius: '50%',
              background: '#39ff14', boxShadow: '0 0 8px #39ff14',
              border: '1.5px solid rgba(3,7,14,0.9)',
            }} />
          )}
        </div>
        <span style={{
          fontFamily: 'var(--font)', fontSize: 8.5, fontWeight: 600, letterSpacing: '0.03em',
          color: hov ? 'rgba(230,250,255,0.95)' : 'rgba(200,220,235,0.6)',
          maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{app.name}</span>
        <span style={{
          fontFamily: 'var(--font)', fontSize: 6.5, letterSpacing: '0.06em', height: 8,
          color: running ? 'rgba(57,255,20,0.8)' : 'rgba(148,163,184,0.4)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%',
        }}>{meta ?? ''}</span>
      </button>
      {/* Pin star — visible on hover, or always when pinned */}
      {(hov || fav) && (
        <button onClick={e => { e.stopPropagation(); onToggleFav(app) }}
          title={fav ? tr('Unpin from home', 'Открепить с главной') : tr('Pin to home', 'Закрепить на главной')}
          style={{
            position: 'absolute', top: 5, right: 5, width: 20, height: 20,
            borderRadius: 6, cursor: 'pointer', fontSize: 11, lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: fav ? GOLD : 'rgba(148,163,184,0.5)',
            background: 'rgba(4,10,18,0.85)',
            border: `1px solid ${fav ? `${GOLD}50` : 'rgba(255,255,255,0.1)'}`,
            textShadow: fav ? `0 0 6px ${GOLD}` : 'none',
          }}>{fav ? '★' : '☆'}</button>
      )}
    </div>
  )
}

// ─── Big Screen — Warren OS mode ──────────────────────────────────────────────
export default function BigScreen({ onExit }: { onExit: () => void }) {
  // 'home' | 'apps' | a module path ('/scrap7', '/solaris', …)
  const [view, setView]       = useState<string>('home')
  const [apps, setApps]       = useState<AppEntry[]>([])
  const [favs, setFavs]       = useState<string[]>(() => loadFavs())
  const [stats, setStats]     = useState<LaunchStats>(() => loadLaunchStats())
  const [procs, setProcs]     = useState<string[]>([])
  const [icons, setIcons]     = useState<Record<string, string>>({})
  const [filePath, setFilePath] = useState<string | null>(null)
  const [query, setQuery]     = useState('')
  const [appsError, setAppsError] = useState('')
  const [appsLoading, setAppsLoading] = useState(true)
  const [toast, setToast]     = useState('')
  const [name, setName]       = useState(() => loadSettings().displayName)

  // Live day data — same engines the Hub uses
  const [snap, setSnap]             = useState(() => getNowSnapshot())
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [inf8, setInf8]             = useState<Inf8State>(() => loadInf8State())
  const [sums, setSums]             = useState<ModuleSummaries>(() => getModuleSummaries())
  const [nowMin, setNowMin]         = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() })

  const refresh = useCallback(() => {
    setSnap(getNowSnapshot())
    const s = loadInf8State()
    setInf8(s)
    setCommitments(getTodayCommitments(s.durations, s.prefTime))
    setSuggestions(gatherSuggestions())
    setSums(getModuleSummaries())
    const d = new Date(); setNowMin(d.getHours() * 60 + d.getMinutes())
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30000)
    window.addEventListener('warren:sync', refresh)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(id); window.removeEventListener('warren:sync', refresh); window.removeEventListener('focus', refresh) }
  }, [refresh])

  // Leaving a hosted module → data may have changed; refresh immediately
  useEffect(() => { refresh() }, [view, refresh])

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

  // Real Windows icons, fetched once in the background — monograms show until
  // they land, so the grid is never blocked on this.
  useEffect(() => {
    if (!isTauri() || apps.length === 0) return
    const paths = apps.map(a => a.path)
    invoke<string[]>('app_icons', { paths })
      .then(list => {
        const map: Record<string, string> = {}
        list.forEach((b64, i) => { if (b64) map[paths[i]] = b64 })
        setIcons(map)
      })
      .catch(() => { /* monograms remain */ })
  }, [apps])

  // What's running right now — polled gently, and refreshed when you come back
  useEffect(() => {
    if (!isTauri()) return
    const scan = () => { invoke<string[]>('running_processes').then(setProcs).catch(() => {}) }
    scan()
    const id = setInterval(scan, 20000)
    window.addEventListener('focus', scan)
    return () => { clearInterval(id); window.removeEventListener('focus', scan) }
  }, [])

  // Esc: module / programs → HOME → widget mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // In Files, Esc walks back up the tree before leaving the view
      if (view === 'files' && filePath !== null) { setFilePath(parentPath(filePath)); return }
      if (view !== 'home') setView('home')
      else onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, filePath, onExit])

  const launch = (app: AppEntry) => {
    invoke('launch_app', { path: app.path })
      .then(() => {
        setStats(prev => { const next = recordLaunch(prev, app.path); saveLaunchStats(next); return next })
        setToast(`▶ ${app.name}`)
        setTimeout(() => setToast(''), 2500)
        if (isTauri()) void getCurrentWindow().setFullscreen(false)
      })
      .catch(e => {
        setToast(`⚠ ${e instanceof Error ? e.message : String(e)}`)
        setTimeout(() => setToast(''), 4000)
      })
  }

  const handleToggleFav = (app: AppEntry) => {
    setFavs(prev => { const next = toggleFav(prev, app.path); saveFavs(next); return next })
  }

  const filtered = useMemo(() => filterApps(apps, query), [apps, query])
  const groups   = useMemo(() => groupByLetter(filtered), [filtered])
  const favApps  = useMemo(
    () => favs.map(p => apps.find(a => a.path === p)).filter((a): a is AppEntry => !!a),
    [favs, apps])
  // Before anything is pinned, seed the row with what you actually open most
  const suggestedApps = useMemo(() => {
    if (favApps.length > 0) return []
    return mostUsed(apps, stats, 6)
  }, [apps, stats, favApps])
  // INFINITY-8 lives ON the dashboard now (timeline column) — no guild card for it
  const builtModules = useMemo(() => GUILD.filter(m => m.built && m.id !== 'ravi'), [])

  // ── Day timeline (the dashboard's spine) — same math as the INFINITY-8 module ──
  const today = todayKey()
  const eff   = useMemo(() => effectiveAnchors(inf8, today), [inf8, today])
  // LIVE plan — outstanding work reflows from now, free time means time left
  const plan  = useMemo(() => buildDay(eff, commitments, inf8.events[today] ?? [], nowMin),
    [eff, commitments, inf8.events, today, nowMin])
  const wakeRaw   = toMin(eff.wake)
  const overnight = toMin(eff.sleep) <= wakeRaw
  const sleepAdj  = overnight ? toMin(eff.sleep) + 1440 : toMin(eff.sleep)
  const nowAdj    = overnight && nowMin < wakeRaw ? nowMin + 1440 : nowMin

  const hour = new Date().getHours()
  const greeting = hour < 5 ? tr('STILL UP', 'ЕЩЁ НЕ СПИШЬ') : hour < 12 ? tr('GOOD MORNING', 'ДОБРОЕ УТРО')
    : hour < 17 ? tr('GOOD AFTERNOON', 'ДОБРЫЙ ДЕНЬ') : tr('GOOD EVENING', 'ДОБРЫЙ ВЕЧЕР')

  const HostedModule = MODULES[view]
  const hostedMember = GUILD.find(m => m.path === view)

  return (
    <div className="fade-in" style={{ height: '100vh', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', background: BG }}>

      {/* Header */}
      <div style={{ padding: '18px 30px 14px', flexShrink: 0, display: 'flex',
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

        {view !== 'home' && (
          <button onClick={() => setView('home')} style={{
            marginLeft: 22, padding: '10px 18px', borderRadius: 9, cursor: 'pointer',
            fontFamily: 'var(--font)', fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
            color: NEON, border: '1px solid rgba(0,245,255,0.35)',
            background: 'rgba(0,245,255,0.07)', transition: 'all 0.15s',
          }}>← {tr('HOME', 'ГЛАВНАЯ')}</button>
        )}
        {hostedMember && (
          <span style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 900,
            color: hostedMember.neon, letterSpacing: '0.14em',
            textShadow: `0 0 10px ${hostedMember.neon}` }}>
            {hostedMember.name}</span>
        )}

        <div style={{ flex: 1 }} />
        <BigClock />
        {/* Not an exit — Warren shrinks back to the compact widget */}
        <button onClick={onExit} title={tr('Back to the compact widget (Esc)', 'Вернуться к компактному виджету (Esc)')} style={{
          padding: '11px 18px', borderRadius: 9, cursor: 'pointer', marginLeft: 8,
          fontFamily: 'var(--font)', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em',
          color: 'rgba(0,245,255,0.65)', border: '1px solid rgba(0,245,255,0.25)',
          background: 'rgba(0,245,255,0.05)', transition: 'all 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.color = NEON; e.currentTarget.style.borderColor = 'rgba(0,245,255,0.55)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(0,245,255,0.65)'; e.currentTarget.style.borderColor = 'rgba(0,245,255,0.25)' }}>
          ⊟ {tr('WIDGET MODE', 'РЕЖИМ ВИДЖЕТА')}</button>
      </div>

      {/* ── HOME — statuses + guild + favorites + timeline + quest log ── */}
      {view === 'home' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Main stage */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '22px 30px 28px', ...STAGE_BG }}>
            {/* Greeting */}
            <p style={{ fontFamily: 'var(--font)', fontSize: 23, fontWeight: 900,
              color: 'rgba(235,250,255,0.95)', letterSpacing: '0.05em' }}>
              {greeting}{name ? `, ${name.toUpperCase()}` : ''}
              <span style={{ color: NEON, textShadow: `0 0 14px ${NEON}` }}> _</span></p>
            <p style={{ fontFamily: 'var(--font)', fontSize: 8.5, color: 'rgba(148,163,184,0.5)',
              letterSpacing: '0.16em', marginTop: 5, textTransform: 'uppercase' }}>
              {tr('The guild is assembled · your day awaits', 'Гильдия в сборе · день ждёт')}</p>

            {/* The day, as one horizontal ribbon */}
            <DayRibbon
              blocks={plan.blocks}
              wakeMin={wakeRaw}
              sleepMin={sleepAdj}
              nowMin={nowAdj}
              freeMinutes={plan.freeMinutes}
              current={snap.current}
              pendingCount={snap.pendingCount}
              onOpenConfig={() => setView('/infinity8')}
              onGo={p => setView(p)}
            />

            {/* Guild modules — living cards carry the numbers now */}
            <SectionLabel icon="⬡" text={tr('THE GUILD', 'ГИЛЬДИЯ')} />
            <div style={{ display: 'grid', gap: 12,
              gridTemplateColumns: 'repeat(auto-fill, minmax(272px, 1fr))' }}>
              {builtModules.map(m => (
                <ModuleCard key={m.id} member={m} sums={sums} onOpen={() => setView(m.path)} />
              ))}
            </div>

            {/* Your machine — files first, then the program library */}
            <SectionLabel icon="🖥" text={tr('YOUR COMPUTER', 'ВАШ КОМПЬЮТЕР')} />
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <BigEntry icon="🗂" color={GOLD}
                title={tr('FILES', 'ФАЙЛЫ')}
                sub={tr('Browse drives, folders and documents', 'Диски, папки и документы')}
                onClick={() => { setFilePath(null); setView('files') }} />
              <BigEntry icon="⊞" color={NEON}
                title={tr('ALL PROGRAMS', 'ВСЕ ПРОГРАММЫ')}
                sub={`${apps.length} ${tr('installed · pin any with ★', 'установлено · закрепите ★')}`}
                onClick={() => setView('apps')} />
            </div>

            {/* Pinned programs */}
            <SectionLabel icon="★" text={tr('PINNED PROGRAMS', 'ЗАКРЕПЛЁННЫЕ ПРОГРАММЫ')} color={GOLD} />
            <div style={{ display: 'grid', gap: 10,
              gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))' }}>
              {favApps.map(app => (
                <AppTile key={app.path} app={app} onLaunch={launch}
                  fav onToggleFav={handleToggleFav} icon={icons[app.path]}
                  stat={stats[app.path]} running={isRunning(app.name, procs)} />
              ))}
              {suggestedApps.map(app => (
                <AppTile key={app.path} app={app} onLaunch={launch}
                  fav={false} onToggleFav={handleToggleFav} icon={icons[app.path]}
                  stat={stats[app.path]} running={isRunning(app.name, procs)} />
              ))}
            </div>
            {favApps.length === 0 && (
              <p style={{ fontFamily: 'var(--font)', fontSize: 8.5, color: 'rgba(148,163,184,0.4)',
                marginTop: 10, letterSpacing: '0.04em' }}>
                {suggestedApps.length > 0
                  ? tr('Your most-used programs — pin any with ★ to keep it here.',
                       'Ваши самые запускаемые программы — закрепите любую звёздочкой ★.')
                  : tr('Pin programs with the ★ in All Programs — they land here.',
                       'Закрепляйте программы звёздочкой ★ в «Все программы» — они появятся здесь.')}</p>
            )}

          </div>

          {/* Quest rail */}
          <QuestLog commitments={commitments} suggestions={suggestions} onOpenModule={p => setView(p)} />
        </div>
      )}

      {/* ── HOSTED MODULE — fullscreen inside Warren OS, quest rail stays ── */}
      {HostedModule && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center',
            padding: '16px 24px 20px', overflow: 'hidden', ...STAGE_BG }}>
            <div style={{
              width: '100%', maxWidth: 760, height: '100%', borderRadius: 16, overflow: 'hidden',
              border: `1px solid ${hostedMember ? `${hostedMember.neon}30` : 'rgba(0,245,255,0.15)'}`,
              background: 'rgba(6,11,22,0.72)',
              boxShadow: `0 0 40px ${hostedMember ? `${hostedMember.neon}12` : 'rgba(0,245,255,0.06)'}`,
            }}>
              <HostedModule />
            </div>
          </div>
          <QuestLog commitments={commitments} suggestions={suggestions} onOpenModule={p => setView(p)} />
        </div>
      )}

      {/* ── FILES — Проводник inside Warren ── */}
      {view === 'files' && (
        <div style={{ flex: 1, overflow: 'hidden', padding: '16px 30px 22px', ...STAGE_BG }}>
          <FileBrowser path={filePath} onNavigate={setFilePath} />
        </div>
      )}

      {/* ── ALL PROGRAMS — full library ── */}
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

          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 34px 30px', ...STAGE_BG }}>
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
                  {groupApps.map(app => (
                    <AppTile key={app.path} app={app} onLaunch={launch} icon={icons[app.path]}
                      fav={favs.includes(app.path)} onToggleFav={handleToggleFav}
                      stat={stats[app.path]} running={isRunning(app.name, procs)} />
                  ))}
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
