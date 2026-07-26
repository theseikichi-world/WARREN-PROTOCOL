import { useState, useEffect, useMemo, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri } from '../../settings'
import { t as tr } from '../../i18n'
import { filterApps, monogram, tileNeon, groupByLetter, type AppEntry } from './apps'

const NEON = '#00f5ff'

// ─── Clock ────────────────────────────────────────────────────────────────────
function BigClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{ textAlign: 'right', lineHeight: 1 }}>
      <p style={{ fontFamily: 'var(--font)', fontSize: 30, fontWeight: 900, color: '#fff',
        textShadow: '0 0 18px rgba(0,245,255,0.5)' }}>
        {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
      </p>
      <p style={{ fontFamily: 'var(--font)', fontSize: 9, color: 'rgba(0,245,255,0.55)',
        letterSpacing: '0.14em', marginTop: 5, textTransform: 'uppercase' }}>
        {now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' })}
      </p>
    </div>
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

// ─── Big Screen — fullscreen launcher (Warren OS mode, phase 1) ───────────────
export default function BigScreen({ onExit }: { onExit: () => void }) {
  const [apps, setApps]     = useState<AppEntry[]>([])
  const [query, setQuery]   = useState('')
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(true)
  const [toast, setToast]   = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // Load the Start Menu scan once
  useEffect(() => {
    if (!isTauri()) { setLoading(false); return }
    invoke<AppEntry[]>('list_apps')
      .then(list => setApps(list))
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  // Esc always exits — the escape hatch is sacred
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onExit() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  const launch = (app: AppEntry) => {
    invoke('launch_app', { path: app.path })
      .then(() => {
        setToast(`▶ ${app.name}`)
        setTimeout(() => setToast(''), 2500)
        // Leave fullscreen so the launched app takes the stage
        if (isTauri()) void getCurrentWindow().setFullscreen(false)
      })
      .catch(e => {
        setToast(`⚠ ${e instanceof Error ? e.message : String(e)}`)
        setTimeout(() => setToast(''), 4000)
      })
  }

  const filtered = useMemo(() => filterApps(apps, query), [apps, query])
  const groups   = useMemo(() => groupByLetter(filtered), [filtered])

  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', background: 'rgba(4,8,16,0.97)' }}>

      {/* Header */}
      <div style={{ padding: '26px 34px 18px', flexShrink: 0, display: 'flex',
        alignItems: 'center', gap: 20, borderBottom: '1px solid rgba(0,245,255,0.12)' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 11,
          background: 'linear-gradient(135deg, rgba(0,245,255,0.18), rgba(0,245,255,0.04))',
          border: '1px solid rgba(0,245,255,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font)', fontSize: 19, fontWeight: 900, color: NEON,
          textShadow: `0 0 14px ${NEON}`, boxShadow: '0 0 18px rgba(0,245,255,0.18)',
        }}>W</div>
        <div style={{ flex: 1 }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 17, fontWeight: 900,
            letterSpacing: '0.26em', color: NEON, textShadow: `0 0 16px ${NEON}` }}>
            WARREN OS</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 8, color: 'rgba(0,245,255,0.4)',
            letterSpacing: '0.18em', marginTop: 3 }}>
            {tr('BIG SCREEN · YOUR MACHINE, GUILD-THEMED', 'БОЛЬШОЙ ЭКРАН · ВАША МАШИНА В СТИЛЕ ГИЛЬДИИ')}</p>
        </div>
        <BigClock />
        {/* The escape hatch — always visible, always works */}
        <button onClick={onExit} title={tr('Exit Big Screen (Esc)', 'Выйти из Большого экрана (Esc)')} style={{
          padding: '11px 20px', borderRadius: 9, cursor: 'pointer',
          fontFamily: 'var(--font)', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
          color: 'rgba(255,120,120,0.85)', border: '1px solid rgba(255,68,68,0.35)',
          background: 'rgba(255,68,68,0.07)', transition: 'all 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,68,68,0.15)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,68,68,0.07)'}>
          ⏏ {tr('EXIT TO WINDOWS', 'ВЫЙТИ В WINDOWS')}</button>
      </div>

      {/* Search */}
      <div style={{ padding: '16px 34px 4px', flexShrink: 0 }}>
        <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} autoFocus
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

      {/* App grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 34px 30px' }}>
        {!isTauri() && (
          <p style={{ fontFamily: 'var(--font)', fontSize: 11, color: 'rgba(148,163,184,0.55)',
            textAlign: 'center', padding: '60px 20px', lineHeight: 1.8 }}>
            {tr('Big Screen launches your installed programs — that needs the Warren desktop app.',
                'Большой экран запускает установленные программы — для этого нужна настольная версия Warren.')}</p>
        )}
        {loading && isTauri() && (
          <p style={{ fontFamily: 'var(--font)', fontSize: 10, color: 'rgba(0,245,255,0.5)',
            letterSpacing: '0.14em', textAlign: 'center', padding: '50px 0' }}
            className="pulse">{tr('SCANNING INSTALLED PROGRAMS…', 'СКАНИРОВАНИЕ УСТАНОВЛЕННЫХ ПРОГРАММ…')}</p>
        )}
        {error && (
          <p style={{ fontFamily: 'var(--font)', fontSize: 10, color: '#ff5470',
            textAlign: 'center', padding: '30px 0' }}>⚠ {error}</p>
        )}
        {!loading && !error && isTauri() && filtered.length === 0 && (
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
