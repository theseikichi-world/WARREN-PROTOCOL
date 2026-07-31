import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadLib } from './types'
import { buildRadar, countdown, type RadarItem } from './radar'
import { t } from '../../i18n'

// ─── RELEASE RADAR — dashboard strip over the PICTURES library ────────────────
// Ungated on purpose: leisure that costs progression stops being leisure.
// Pure read of data the module already stores — no API calls here.

const ORANGE = '#ff6b00'

const KIND_LABEL: Record<RadarItem['kind'], () => string> = {
  episode: () => t('EP', 'ЭП'),
  cinema:  () => t('FILM', 'ФИЛЬМ'),
  game:    () => t('GAME', 'ИГРА'),
}

function Row({ item, onOpen }: { item: RadarItem; onOpen: () => void }) {
  const [hov, setHov] = useState(false)
  const { text, hot } = countdown(item.days)
  const accent = item.isNew ? '#4ade80' : hot ? ORANGE : 'rgba(148,163,184,0.75)'

  return (
    <button onClick={onOpen}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      title={`${item.title} · ${item.date}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
        padding: '6px 8px', borderRadius: 7, cursor: 'pointer',
        background: hov ? 'rgba(255,107,0,0.08)' : 'transparent',
        border: `1px solid ${hov ? 'rgba(255,107,0,0.28)' : 'transparent'}`,
        transition: 'all 0.12s',
      }}>
      <span style={{ fontSize: 12, flexShrink: 0 }}>{item.emoji}</span>
      <span style={{
        flex: 1, minWidth: 0, fontSize: 9.5, fontWeight: 600,
        color: 'rgba(230,240,250,0.88)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{item.title}</span>
      {item.isNew && (
        <span style={{
          fontSize: 6.5, fontWeight: 800, letterSpacing: '0.1em', flexShrink: 0,
          color: '#4ade80', padding: '1px 5px', borderRadius: 3,
          border: '1px solid rgba(74,222,128,0.35)', background: 'rgba(74,222,128,0.08)',
        }}>{t('NEW', 'НОВОЕ')}</span>
      )}
      <span style={{
        fontSize: 6.5, fontWeight: 700, letterSpacing: '0.08em', flexShrink: 0,
        color: 'rgba(148,163,184,0.45)',
      }}>{KIND_LABEL[item.kind]()}</span>
      <span style={{
        fontSize: 8, fontWeight: 700, flexShrink: 0, minWidth: 52, textAlign: 'right',
        color: accent, letterSpacing: '0.04em',
      }}>{text}</span>
    </button>
  )
}

export function ReleaseRadar() {
  const navigate = useNavigate()
  const [lib, setLib] = useState(() => loadLib())

  // The library is local — re-read when another module syncs or the window returns
  useEffect(() => {
    const refresh = () => setLib(loadLib())
    window.addEventListener('warren:sync', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('warren:sync', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  const { upcoming, recent } = useMemo(() => buildRadar(lib, new Date(), 3), [lib])
  const rows = [...recent, ...upcoming].slice(0, 4)

  if (rows.length === 0) return null   // nothing tracked → no dead panel

  return (
    <div style={{
      marginBottom: 16, padding: '10px 12px', borderRadius: 10,
      background: 'linear-gradient(135deg, rgba(255,107,0,0.07), rgba(13,24,48,0.35))',
      border: '1px solid rgba(255,107,0,0.2)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: 11 }}>📡</span>
        <span style={{
          flex: 1, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.18em',
          color: 'rgba(255,107,0,0.75)',
        }}>{t('RELEASE RADAR', 'РАДАР РЕЛИЗОВ')}</span>
        <button onClick={() => navigate('/pictures')} style={{
          fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer',
          color: 'rgba(255,107,0,0.6)', background: 'none', border: 'none',
        }}>{t('ALL →', 'ВСЕ →')}</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {rows.map(item => (
          <Row key={`${item.id}-${item.date}`} item={item} onOpen={() => navigate('/pictures')} />
        ))}
      </div>
    </div>
  )
}
