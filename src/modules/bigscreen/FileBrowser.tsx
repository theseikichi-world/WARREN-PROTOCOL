import { useState, useEffect, useCallback, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../../settings'
import { t as tr } from '../../i18n'
import {
  fileKind, fmtSize, breadcrumbs, parentPath, filterEntries, type FileEntry,
} from './files'

const NEON = '#00f5ff'
const GOLD = '#ffd700'

// ─── Проводник — your machine, in Warren's own hand ───────────────────────────
// "My Computer" lists quick places and drives; from there it's plain folder
// browsing, and clicking a file opens it with its default program.

export function FileBrowser({ path, onNavigate }: {
  path: string | null                    // null = the My Computer root
  onNavigate: (p: string | null) => void
}) {
  const [places, setPlaces]   = useState<FileEntry[]>([])
  const [drives, setDrives]   = useState<FileEntry[]>([])
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [query, setQuery]     = useState('')
  const [toast, setToast]     = useState('')

  // Roots, fetched once
  useEffect(() => {
    if (!isTauri()) return
    invoke<FileEntry[]>('quick_places').then(setPlaces).catch(() => {})
    invoke<FileEntry[]>('list_drives').then(setDrives).catch(() => {})
  }, [])

  // Folder contents, refetched on every navigation
  useEffect(() => {
    setQuery('')
    if (!isTauri() || path === null) { setEntries([]); setError(''); return }
    setLoading(true); setError('')
    invoke<FileEntry[]>('list_dir', { path })
      .then(setEntries)
      .catch(e => { setEntries([]); setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => setLoading(false))
  }, [path])

  const open = useCallback((entry: FileEntry) => {
    if (entry.is_dir) { onNavigate(entry.path); return }
    invoke('open_path', { path: entry.path })
      .then(() => { setToast(`▶ ${entry.name}`); setTimeout(() => setToast(''), 2200) })
      .catch(e => { setToast(`⚠ ${e instanceof Error ? e.message : String(e)}`); setTimeout(() => setToast(''), 3500) })
  }, [onNavigate])

  const crumbs   = useMemo(() => (path ? breadcrumbs(path) : []), [path])
  const parent   = path ? parentPath(path) : null
  const shown    = useMemo(() => filterEntries(entries, query), [entries, query])
  const folders  = shown.filter(e => e.is_dir).length

  if (!isTauri()) {
    return (
      <p style={{ fontFamily: 'var(--font)', fontSize: 13.5, color: 'rgba(148,163,184,0.55)',
        textAlign: 'center', padding: '60px 20px', lineHeight: 1.8 }}>
        {tr('Browsing your files needs the Warren desktop app.',
            'Просмотр файлов доступен в настольной версии Warren.')}</p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Path bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginBottom: 12,
        flexWrap: 'wrap' }}>
        <button onClick={() => onNavigate(parent)} disabled={path === null}
          title={tr('Up one level', 'На уровень вверх')}
          style={{
            width: 30, height: 30, borderRadius: 8, cursor: path === null ? 'default' : 'pointer',
            color: path === null ? 'rgba(148,163,184,0.25)' : NEON,
            border: `1px solid ${path === null ? 'rgba(255,255,255,0.06)' : 'rgba(0,245,255,0.3)'}`,
            background: path === null ? 'transparent' : 'rgba(0,245,255,0.06)',
            fontSize: 15.5, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>↑</button>

        <button onClick={() => onNavigate(null)} style={{
          padding: '7px 13px', borderRadius: 8, cursor: 'pointer',
          fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 800, letterSpacing: '0.1em',
          color: path === null ? NEON : 'rgba(148,163,184,0.6)',
          border: `1px solid ${path === null ? 'rgba(0,245,255,0.4)' : 'rgba(255,255,255,0.07)'}`,
          background: path === null ? 'rgba(0,245,255,0.08)' : 'transparent',
        }}>🖥 {tr('MY COMPUTER', 'МОЙ КОМПЬЮТЕР')}</button>

        {crumbs.map((c, i) => (
          <span key={c.path} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'rgba(0,245,255,0.25)', fontSize: 11.5 }}>›</span>
            <button onClick={() => onNavigate(c.path)} style={{
              padding: '6px 10px', borderRadius: 7, cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: i === crumbs.length - 1 ? 800 : 600,
              color: i === crumbs.length - 1 ? 'rgba(230,250,255,0.95)' : 'rgba(148,163,184,0.65)',
              border: '1px solid transparent', background: 'transparent', maxWidth: 200,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{c.name}</button>
          </span>
        ))}

        <div style={{ flex: 1 }} />
        {path !== null && (
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder={tr('🔍 Filter…', '🔍 Фильтр…')}
            style={{
              width: 180, padding: '7px 12px', borderRadius: 8,
              background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,245,255,0.18)',
              outline: 'none', fontFamily: 'var(--font)', fontSize: 12.5,
              color: 'rgba(225,250,255,0.9)', userSelect: 'text', WebkitUserSelect: 'text',
            }} />
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
        {/* My Computer root */}
        {path === null && (
          <>
            <Section label={tr('QUICK ACCESS', 'БЫСТРЫЙ ДОСТУП')} color={GOLD} />
            <div style={{ display: 'grid', gap: 10,
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {places.map(p => <PlaceCard key={p.path} entry={p} onOpen={() => onNavigate(p.path)} />)}
            </div>

            <Section label={tr('DRIVES', 'ДИСКИ')} color={NEON} />
            <div style={{ display: 'grid', gap: 10,
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {drives.map(d => (
                <PlaceCard key={d.path} entry={d} drive onOpen={() => onNavigate(d.path)} />
              ))}
            </div>
          </>
        )}

        {/* Folder listing */}
        {path !== null && (
          <>
            {loading && (
              <p className="pulse" style={{ fontFamily: 'var(--font)', fontSize: 12.5,
                color: 'rgba(0,245,255,0.5)', letterSpacing: '0.14em', textAlign: 'center', padding: '40px 0' }}>
                {tr('READING FOLDER…', 'ЧТЕНИЕ ПАПКИ…')}</p>
            )}
            {error && (
              <p style={{ fontFamily: 'var(--font)', fontSize: 12.5, color: '#ff5470',
                textAlign: 'center', padding: '30px 0' }}>⚠ {error}</p>
            )}
            {!loading && !error && shown.length === 0 && (
              <p style={{ fontFamily: 'var(--font)', fontSize: 12.5, color: 'rgba(148,163,184,0.45)',
                textAlign: 'center', padding: '40px 0' }}>
                {query ? tr('Nothing matches that filter', 'Ничего не найдено по фильтру')
                       : tr('This folder is empty', 'Эта папка пуста')}</p>
            )}
            {!loading && shown.length > 0 && (
              <>
                <p style={{ fontFamily: 'var(--font)', fontSize: 10, color: 'rgba(148,163,184,0.4)',
                  letterSpacing: '0.14em', marginBottom: 8 }}>
                  {folders} {tr('folders', 'папок')} · {shown.length - folders} {tr('files', 'файлов')}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {shown.map(e => <FileRow key={e.path} entry={e} onOpen={() => open(e)} />)}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 22px', borderRadius: 10, zIndex: 50,
          background: 'rgba(4,10,18,0.95)', border: '1px solid rgba(0,245,255,0.35)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.6), 0 0 16px rgba(0,245,255,0.15)' }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 12.5, fontWeight: 700,
            color: toast.startsWith('⚠') ? '#ff5470' : NEON, letterSpacing: '0.08em' }}>{toast}</p>
        </div>
      )}
    </div>
  )
}

function Section({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 12px' }}>
      <span style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 800,
        color: `${color}90`, letterSpacing: '0.22em' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: `${color}12` }} />
    </div>
  )
}

/** Big tile for a drive or a quick-access folder. */
function PlaceCard({ entry, onOpen, drive }: { entry: FileEntry; onOpen: () => void; drive?: boolean }) {
  const [hov, setHov] = useState(false)
  const color = drive ? NEON : GOLD
  const icon  = drive ? '💽' : PLACE_ICONS[entry.name] ?? '📁'
  return (
    <button onClick={onOpen}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', cursor: 'pointer',
        padding: '13px 14px', borderRadius: 12, minWidth: 0,
        background: hov ? `${color}12` : 'rgba(13,24,48,0.45)',
        border: `1px solid ${hov ? `${color}55` : `${color}1f`}`,
        boxShadow: hov ? `0 0 18px ${color}20` : 'none', transition: 'all 0.15s',
      }}>
      <span style={{ fontSize: 21, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontFamily: 'var(--font)', fontSize: 12.5, fontWeight: 700, minWidth: 0,
        color: hov ? 'rgba(235,250,255,0.95)' : 'rgba(210,230,245,0.8)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
    </button>
  )
}

const PLACE_ICONS: Record<string, string> = {
  Home: '🏠', Desktop: '🖥', Documents: '📄', Downloads: '⬇', Pictures: '🖼', Music: '🎵', Videos: '🎬',
}

/** One row in a folder listing. */
function FileRow({ entry, onOpen }: { entry: FileEntry; onOpen: () => void }) {
  const [hov, setHov] = useState(false)
  const kind = fileKind(entry)
  return (
    <button onClick={onOpen} onDoubleClick={onOpen}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      title={entry.path}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
        padding: '7px 11px', borderRadius: 8, cursor: 'pointer',
        background: hov ? `${kind.color}12` : 'transparent',
        border: `1px solid ${hov ? `${kind.color}35` : 'transparent'}`,
        transition: 'all 0.12s',
      }}>
      <span style={{ fontSize: 16.5, flexShrink: 0, width: 20, textAlign: 'center' }}>{kind.icon}</span>
      <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font)', fontSize: 12.5,
        fontWeight: entry.is_dir ? 700 : 500,
        color: entry.is_dir ? 'rgba(255,235,180,0.92)' : 'rgba(215,235,250,0.85)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
      {!entry.is_dir && (
        <span style={{ fontFamily: 'var(--font)', fontSize: 10, flexShrink: 0,
          color: `${kind.color}80`, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {entry.ext || kind.label}</span>
      )}
      <span style={{ fontFamily: 'var(--font)', fontSize: 10, flexShrink: 0, minWidth: 54,
        textAlign: 'right', color: 'rgba(148,163,184,0.45)' }}>
        {entry.is_dir ? '›' : fmtSize(entry.size)}</span>
    </button>
  )
}
