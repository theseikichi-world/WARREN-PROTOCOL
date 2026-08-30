import { useEffect, useRef, useState } from 'react'
import { t as tr } from '../../i18n'
import {
  loadLogState, saveLogState, createDream, updateDream, deleteDream, moveDream,
  migrateAnalyses, type LogState,
} from '../log/store'
import type { Dream } from '../log/types'

// ─── DREAMS — the inbox, now inside UPLINKS ───────────────────────────────────
// PATHFINDER was a module whose entire job was to be the door an uplink comes
// through (rule 17). A door is not a room. Writing a dream and planning a goal
// is one intention, and splitting it across two modules meant leaving the goal
// screen to write the thing the goal screen is about.
//
// So a dream lives here, one tab away from the protocol it becomes, and it is
// deliberately SMALL: a title, why it matters, and PROMOTE. Nothing else.
//
// The mission/task hierarchy that used to sit under a dream is gone from this
// surface. ACTS do that job now and do it better — they are ordered, they carry
// pressure, and their shelf is wired to progression, which missions never were.
// Nothing is deleted: `log/Log.tsx` still holds it, unrouted, per rule 12.

const NEON = '#c084fc'
const DIM  = 'rgba(148,163,184,0.5)'

export function DreamsPanel({ onPromote, promotedIds }: {
  onPromote:   (d: Dream) => void
  /** Dreams that already drive an uplink — they cannot be promoted twice. */
  promotedIds: Set<string>
}) {
  const [state, setState] = useState<LogState>(() => {
    const loaded   = loadLogState()
    const migrated = migrateAnalyses(loaded)
    if (migrated !== loaded) saveLogState(migrated)
    return migrated
  })
  const [modal, setModal] = useState<Dream | 'new' | null>(null)

  useEffect(() => {
    const refresh = () => setState(loadLogState())
    window.addEventListener('warren:sync', refresh)
    return () => window.removeEventListener('warren:sync', refresh)
  }, [])

  const persist = (s: LogState) => { saveLogState(s); setState(s) }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 800,
          letterSpacing: '0.2em', color: `${NEON}b0` }}>{tr('DREAMS', 'МЕЧТЫ')}</p>
        <span style={{ flex: 1, height: 1, background: `${NEON}18` }} />
        <span style={{ fontFamily: 'var(--font)', fontSize: 11, color: DIM }}>
          {state.dreams.length} · {tr('BANDWIDTH IS TWO', 'КАНАЛОВ ДВА')}
        </span>
      </div>

      <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, lineHeight: 1.7, color: DIM,
        marginBottom: 12 }}>
        {tr('Write as many as you like. Two become uplinks — that choice is the whole game.',
            'Пишите сколько хотите. Двум суждено стать каналами — этот выбор и есть вся игра.')}
      </p>

      {state.dreams.length === 0 && (
        <div style={{ textAlign: 'center', padding: '26px 12px' }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: DIM }}>
            {tr('Nothing written yet.', 'Пока ничего не записано.')}
          </p>
        </div>
      )}

      {state.dreams.map((d, i) => {
        const promoted = promotedIds.has(d.id)
        return (
          <div key={d.id} style={{
            marginBottom: 8, borderRadius: 10, overflow: 'hidden',
            background: 'rgba(10,4,26,0.5)',
            border: `1px solid ${promoted ? `${NEON}30` : 'rgba(255,255,255,0.06)'}`,
          }}>
            <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 9 }}>
              {/* Order is priority, and it is yours to set. */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                <button onClick={() => persist(moveDream(state, d.id, -1))} disabled={i === 0}
                  title={tr('Raise', 'Выше')} style={arrow(i === 0)}>▲</button>
                <span style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 900,
                  color: i === 0 ? '#ff6b00' : NEON }}>#{i + 1}</span>
                <button onClick={() => persist(moveDream(state, d.id, 1))} disabled={i === state.dreams.length - 1}
                  title={tr('Lower', 'Ниже')} style={arrow(i === state.dreams.length - 1)}>▼</button>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: 'var(--font)', fontSize: 13, fontWeight: 800,
                  color: 'rgba(230,220,255,0.92)', letterSpacing: '0.04em',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</p>
                {d.category && (
                  <p style={{ fontFamily: 'var(--font)', fontSize: 11, color: `${NEON}60`,
                    letterSpacing: '0.1em', marginTop: 2 }}>{d.category}</p>
                )}
                {d.description && (
                  <p style={{ fontFamily: 'var(--font)', fontSize: 11, lineHeight: 1.65, marginTop: 6,
                    color: 'rgba(200,190,240,0.5)',
                    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden' }}>{d.description}</p>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                <button onClick={() => setModal(d)} title={tr('Edit', 'Правка')} style={icon()}>✎</button>
                <button onClick={() => {
                  if (window.confirm(tr(`Delete "${d.title}"?`, `Удалить «${d.title}»?`))) persist(deleteDream(state, d.id))
                }} title={tr('Delete', 'Удалить')} style={icon('#ff0033')}>×</button>
              </div>
            </div>

            <button onClick={() => !promoted && onPromote(d)} disabled={promoted} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 12px', cursor: promoted ? 'default' : 'pointer',
              background: promoted ? 'rgba(0,245,255,0.04)' : 'rgba(0,245,255,0.07)',
              borderTop: `1px solid rgba(0,245,255,${promoted ? 0.12 : 0.25})`,
              border: 'none', opacity: promoted ? 0.65 : 1,
            }}>
              <span style={{ fontSize: 14, filter: 'drop-shadow(0 0 4px #00f5ff)' }}>◈</span>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <p style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 800,
                  color: '#00f5ff', letterSpacing: '0.15em' }}>
                  {promoted ? tr('ALREADY AN UPLINK', 'УЖЕ КАНАЛ') : tr('PROMOTE TO UPLINK', 'ПРОДВИНУТЬ В КАНАЛ')}
                </p>
                <p style={{ fontFamily: 'var(--font)', fontSize: 11, marginTop: 1,
                  color: 'rgba(0,245,255,0.45)', letterSpacing: '0.05em' }}>
                  {promoted
                    ? tr('Its protocol is a tab away', 'Его протокол — в соседней вкладке')
                    : tr('The guide asks, then writes the acts — you edit every routine',
                         'Гид спросит и напишет акты — вы правите каждую рутину')}
                </p>
              </div>
            </button>
          </div>
        )
      })}

      <button onClick={() => setModal('new')} style={{
        width: '100%', marginTop: 4, padding: '9px', borderRadius: 8, cursor: 'pointer',
        background: 'transparent', border: `1px dashed ${NEON}35`,
        fontFamily: 'var(--font)', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.14em', color: `${NEON}90`,
      }}>+ {tr('WRITE A DREAM', 'ЗАПИСАТЬ МЕЧТУ')}</button>

      {modal && (
        <DreamModal
          initial={modal === 'new' ? undefined : modal}
          onCancel={() => setModal(null)}
          onSave={(title, desc) => {
            persist(modal === 'new'
              ? createDream(state, title, desc, modal === 'new' ? '' : '')
              : updateDream(state, modal.id, { title, description: desc }))
            setModal(null)
          }} />
      )}
    </div>
  )
}

const arrow = (off: boolean): React.CSSProperties => ({
  fontSize: 10, lineHeight: 1, padding: '1px 3px',
  cursor: off ? 'default' : 'pointer',
  color: off ? 'rgba(192,132,252,0.15)' : `${NEON}70`,
  background: 'transparent', border: 'none',
})

const icon = (color = 'rgba(148,163,184,0.4)'): React.CSSProperties => ({
  fontSize: 13, lineHeight: 1, padding: '2px 4px', cursor: 'pointer',
  color, background: 'transparent', border: 'none',
})

/**
 * Two questions: what it is, and why it matters.
 *
 * No category picker — the read infers it (rule 50). No missions, no tasks: an
 * act with a shelf does that job, and it does it attached to progression.
 */
function DreamModal({ initial, onSave, onCancel }: {
  initial?: Dream
  onSave:   (title: string, desc: string) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [desc,  setDesc]  = useState(initial?.description ?? '')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { const id = setTimeout(() => ref.current?.focus(), 60); return () => clearTimeout(id) }, [])

  const field: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 6,
    background: 'rgba(0,0,0,0.5)', border: `1px solid ${NEON}25`, outline: 'none',
    fontFamily: 'var(--font)', fontSize: 12, color: 'rgba(220,210,255,0.9)',
    userSelect: 'text', WebkitUserSelect: 'text',
  }

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', padding: 16, background: 'rgba(8,3,22,0.98)',
        borderTop: `1px solid ${NEON}40`, backdropFilter: 'blur(20px)',
        display: 'flex', flexDirection: 'column', gap: 9, maxHeight: '70%', overflowY: 'auto',
      }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 700,
          color: NEON, letterSpacing: '0.2em' }}>
          {initial ? tr('UPDATE DREAM', 'ОБНОВИТЬ МЕЧТУ') : tr('✧ NEW DREAM', '✧ НОВАЯ МЕЧТА')}
        </p>

        <input ref={ref} value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
          placeholder={tr('Your dream, in a few words', 'Ваша мечта, в двух словах')} style={field} />

        <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={5}
          placeholder={tr('Why does it matter? What have you got already? The more you write, the sharper the guide can be.',
                          'Почему это важно? Что уже есть? Чем больше напишете, тем точнее будет гид.')}
          style={{ ...field, resize: 'none', lineHeight: 1.6 }} />

        <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, color: DIM, lineHeight: 1.5 }}>
          {tr('The guide works out the area, the acts and what to do first when it reads this.',
              'Гид определит область, акты и первые шаги, когда прочитает это.')}
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { if (title.trim()) onSave(title.trim(), desc.trim()) }} style={{
            flex: 1, padding: '10px', borderRadius: 6, cursor: 'pointer',
            fontFamily: 'var(--font)', fontSize: 12, fontWeight: 800, letterSpacing: '0.12em',
            color: NEON, background: `${NEON}18`, border: `1px solid ${NEON}40`,
          }}>{tr('PLANT THE STAR', 'ЗАЖЕЧЬ ЗВЕЗДУ')}</button>
          <button onClick={onCancel} style={{
            padding: '10px 16px', borderRadius: 6, cursor: 'pointer',
            fontFamily: 'var(--font)', fontSize: 12, color: DIM,
            background: 'transparent', border: '1px solid rgba(255,255,255,0.07)',
          }}>{tr('ABORT', 'ОТМЕНА')}</button>
        </div>
      </div>
    </div>
  )
}
