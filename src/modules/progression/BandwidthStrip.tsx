import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { t } from '../../i18n'
import { loadProgression, seedIfEmpty, saveProgression, primaryGoal, secondaryGoal, bandwidthUsed } from './store'
import type { Goal, ProgressionState } from './types'

const CYAN = '#00f5ff'
const GOLD = '#ffd700'

// ─── BANDWIDTH — the hub's read on both uplinks ───────────────────────────────
// Deliberately just a readout: what's allocated, and what it's carrying.

export function BandwidthStrip() {
  const navigate = useNavigate()
  const [state, setState] = useState<ProgressionState>(() => loadProgression())

  // Install the reference uplinks the first time the hub is seen
  useEffect(() => {
    const seeded = seedIfEmpty(loadProgression())
    saveProgression(seeded)
    setState(seeded)
    const refresh = () => setState(loadProgression())
    window.addEventListener('warren:sync', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('warren:sync', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  const primary   = primaryGoal(state)
  const secondary = secondaryGoal(state)

  // Nothing allocated yet. This used to render null, which left a labelled hole
  // in the hub — and the guided tour dutifully pointed at it. An empty slot is
  // worth saying out loud, as long as it also says what to do about it.
  if (!primary && !secondary) {
    return (
      <button onClick={() => navigate('/log')} style={{
        width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 16,
        padding: '11px 13px', borderRadius: 10,
        background: `linear-gradient(135deg, ${CYAN}0a, rgba(13,24,48,0.3))`,
        border: `1px dashed ${CYAN}35`, transition: 'border-color 0.15s',
      }}
        onMouseEnter={e => e.currentTarget.style.borderColor = `${CYAN}70`}
        onMouseLeave={e => e.currentTarget.style.borderColor = `${CYAN}35`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 7.5, fontWeight: 800, letterSpacing: '0.18em', color: `${CYAN}b0` }}>
            {t('BANDWIDTH', 'ПРОПУСКНАЯ СПОСОБНОСТЬ')}
          </span>
          <span style={{ fontSize: 7.5, fontWeight: 800, color: `${CYAN}70`, marginLeft: 'auto' }}>
            0/2 {t('ALLOCATED', 'ЗАНЯТО')}
          </span>
        </div>
        <p style={{ fontSize: 9, color: 'rgba(215,232,248,0.72)', lineHeight: 1.6, marginTop: 7 }}>
          {t('Both slots are open. A goal starts as a dream — write one in PATHFINDER and promote it.',
             'Оба слота свободны. Цель начинается с мечты — запишите её в PATHFINDER и продвиньте.')}
        </p>
        <p style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', color: CYAN, marginTop: 8 }}>
          {t('OPEN PATHFINDER', 'ОТКРЫТЬ PATHFINDER')} →
        </p>
      </button>
    )
  }

  return (
    <button onClick={() => navigate('/uplinks')} style={{
      width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 16,
      padding: '11px 13px', borderRadius: 10,
      background: `linear-gradient(135deg, ${CYAN}12, rgba(13,24,48,0.35))`,
      border: `1px solid ${CYAN}28`, transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = `${CYAN}55`}
      onMouseLeave={e => e.currentTarget.style.borderColor = `${CYAN}28`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
        <span style={{ fontSize: 7.5, fontWeight: 800, letterSpacing: '0.18em', color: `${CYAN}b0` }}>
          {t('BANDWIDTH', 'ПРОПУСКНАЯ СПОСОБНОСТЬ')}
        </span>
        <span style={{ fontSize: 7.5, fontWeight: 800, color: `${CYAN}70`, marginLeft: 'auto' }}>
          {bandwidthUsed(state)}/2 {t('ALLOCATED', 'ЗАНЯТО')}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <SlotLine goal={primary} accent={CYAN}
          label={t('PRIMARY', 'ОСНОВНОЙ')} rate="1.0×" />
        <SlotLine goal={secondary} accent={GOLD}
          label={t('SECONDARY', 'ВТОРИЧНЫЙ')} rate="0.6×" />
      </div>
    </button>
  )
}

function SlotLine({ goal, accent, label, rate }: {
  goal: Goal | null; accent: string; label: string; rate: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
        background: goal ? accent : 'rgba(148,163,184,0.25)',
        boxShadow: goal ? `0 0 6px ${accent}` : 'none',
      }} />
      <span style={{ fontSize: 6.5, fontWeight: 700, letterSpacing: '0.14em',
        color: 'rgba(148,163,184,0.5)', width: 62, flexShrink: 0 }}>{label}</span>
      <span style={{
        flex: 1, minWidth: 0, fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
        color: goal ? accent : 'rgba(148,163,184,0.35)',
        textShadow: goal ? `0 0 8px ${accent}45` : 'none',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{goal ? goal.title : t('unallocated', 'не занят')}</span>
      {goal && (
        <>
          <span style={{ fontSize: 7, color: 'rgba(148,163,184,0.45)', flexShrink: 0 }}>
            {goal.nodes.length} {t('routines', 'рутин')}
          </span>
          <span style={{ fontSize: 7, color: `${accent}80`, flexShrink: 0, width: 24, textAlign: 'right' }}>{rate}</span>
        </>
      )}
    </div>
  )
}
