import { useState } from 'react'
import { t as tr } from '../../i18n'
import { getHabitTier, isBaseline, isUnbound, type Task } from '../scrap7/types'
import { THRESHOLD_UNLOCK_AT } from './types'
import {
  LIFE_SUPPORT, availableTemplates, templateForTask, type LifeSupportTemplate,
} from './lifeSupport'

// ─── LIFE SUPPORT, on the character sheet ─────────────────────────────────────
// A protocol is what you're chasing; this is the floor underneath it. It lives
// on the CHARACTER tab rather than in a tree because it isn't goal work — it's
// true whichever uplink happens to be loaded, and it stays true when both are
// frozen.
//
// Below it: habits you made yourself. They belong to no system, so they earn
// nothing — but they're listed rather than hidden, and one press adopts a good
// one into life support.

const GREEN = '#4ade80'
const GOLD  = '#ffd700'
const DIM   = 'rgba(148,163,184,0.5)'

export function LifeSupportPanel({ tasks, onTrack, onInstall, onAdopt, onRelease }: {
  tasks:     Task[]
  onTrack:   (taskId: string) => void
  onInstall: (template: LifeSupportTemplate) => void
  onAdopt:   (taskId: string) => void
  onRelease: (taskId: string) => void
}) {
  const [picking, setPicking] = useState(false)

  const habits    = tasks.filter(t => t.taskType === 'habit')
  const installed = habits.filter(isBaseline)
  const yours     = habits.filter(isUnbound)
  const offer     = availableTemplates(tasks.map(t => t.id))

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '20px 0 4px' }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 800, letterSpacing: '0.2em',
          color: DIM }}>{tr('LIFE SUPPORT', 'ЖИЗНЕОБЕСПЕЧЕНИЕ')}</p>
        <span style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${GREEN}80` }}>
          {installed.length}/{LIFE_SUPPORT.length}
        </span>
        {offer.length > 0 && (
          <button onClick={() => setPicking(v => !v)} style={{
            marginLeft: 'auto', padding: '3px 9px', borderRadius: 5, cursor: 'pointer',
            fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700, letterSpacing: '0.1em',
            color: picking ? '#02121a' : GREEN,
            background: picking ? GREEN : 'transparent',
            border: `1px solid ${GREEN}${picking ? '' : '40'}`,
          }}>{picking ? tr('CLOSE', 'ЗАКРЫТЬ') : `+ ${tr('ADD', 'ДОБАВИТЬ')}`}</button>
        )}
      </div>

      <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: 'rgba(148,163,184,0.38)',
        lineHeight: 1.6, marginBottom: 9 }}>
        {tr('The floor under everything else. No tree, no unlocking — pick what you need. Worth a fraction of goal work, on purpose.',
            'Основа под всем остальным. Ни дерева, ни разблокировок — берите нужное. Стоит долю от работы над целью, и это намеренно.')}
      </p>

      {/* Template picker */}
      {picking && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 10 }}>
          {offer.map(t => (
            <button key={t.id} onClick={() => { onInstall(t); if (offer.length === 1) setPicking(false) }}
              style={{ textAlign: 'left', padding: '8px 9px', borderRadius: 7, cursor: 'pointer',
                background: `${GREEN}0a`, border: `1px solid ${GREEN}30` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10 }}>{t.icon}</span>
                <span style={{ fontFamily: 'var(--font)', fontSize: 8.5, fontWeight: 700,
                  color: 'rgba(230,242,255,0.9)', lineHeight: 1.3 }}>{tr(t.title, t.ru)}</span>
              </div>
              <p style={{ fontFamily: 'var(--font)', fontSize: 6.5, color: DIM, marginTop: 4 }}>
                ▸ {tr(t.cue, t.cueRu)}
              </p>
            </button>
          ))}
        </div>
      )}

      {installed.length === 0 && !picking && (
        <p style={{ fontFamily: 'var(--font)', fontSize: 8, color: 'rgba(148,163,184,0.35)',
          padding: '10px 0' }}>
          {tr('Nothing running. Add one — the basics cost almost nothing and hold up everything above them.',
              'Ничего не запущено. Добавьте одну — основы почти ничего не стоят и держат всё остальное.')}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {installed.map(task => (
          <BaselineRow key={task.id} task={task}
            onTrack={() => onTrack(task.id)} onRelease={() => onRelease(task.id)} />
        ))}
      </div>

      {/* Habits you made yourself — no system owns them, so they earn nothing */}
      {yours.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '18px 0 4px' }}>
            <p style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 800, letterSpacing: '0.2em',
              color: DIM }}>{tr('YOUR OWN HABITS', 'ВАШИ СОБСТВЕННЫЕ')}</p>
            <span style={{ fontFamily: 'var(--font)', fontSize: 7, color: DIM }}>{yours.length}</span>
          </div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: 'rgba(148,163,184,0.38)',
            lineHeight: 1.6, marginBottom: 8 }}>
            {tr('Made by hand, so they belong to no protocol and earn nothing. Adopt one into life support and it starts counting.',
                'Сделаны вручную, не принадлежат протоколу и ничего не приносят. Примите в жизнеобеспечение — и начнёт считаться.')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {yours.map(task => (
              <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', borderRadius: 7,
                background: 'rgba(13,24,48,0.35)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font)', fontSize: 8.5,
                  color: 'rgba(200,220,240,0.75)', overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap' }}>{task.text}</span>
                <span style={{ fontFamily: 'var(--font)', fontSize: 7, color: DIM, flexShrink: 0 }}>
                  {(task.score ?? 0).toFixed(2)}
                </span>
                <button onClick={() => onAdopt(task.id)} style={{
                  padding: '3px 8px', borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                  fontFamily: 'var(--font)', fontSize: 6.5, fontWeight: 700, letterSpacing: '0.1em',
                  color: GREEN, background: 'transparent', border: `1px solid ${GREEN}35`,
                }}>{tr('ADOPT', 'ПРИНЯТЬ')}</button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

function BaselineRow({ task, onTrack, onRelease }: {
  task: Task; onTrack: () => void; onRelease: () => void
}) {
  const [confirmRelease, setConfirmRelease] = useState(false)
  const template = templateForTask(task.id)
  const score = task.score ?? 0
  const tier  = getHabitTier(score)
  const target = task.target ?? 1
  const count  = task.todayCount ?? 0
  const doneToday = count >= target
  const automatic = score >= THRESHOLD_UNLOCK_AT

  return (
    <div style={{ padding: '8px 10px', borderRadius: 7,
      background: doneToday ? `${GREEN}0a` : 'rgba(13,24,48,0.4)',
      border: `1px solid ${doneToday ? `${GREEN}30` : 'rgba(255,255,255,0.06)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, flexShrink: 0, filter: automatic ? `drop-shadow(0 0 5px ${GOLD})` : 'none' }}>
          {template?.icon ?? '◆'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 8.5, fontWeight: 700,
            color: 'rgba(230,242,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap' }}>{task.text}</p>
          {template && (
            <p style={{ fontFamily: 'var(--font)', fontSize: 6.5, color: DIM, marginTop: 2 }}>
              ▸ {tr(template.cue, template.cueRu)}
            </p>
          )}
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 900,
            color: automatic ? GOLD : tier.color }}>{score.toFixed(2)}</p>
          {(task.streak ?? 0) > 0 && (
            <p style={{ fontFamily: 'var(--font)', fontSize: 6, color: 'rgba(255,107,0,0.8)', marginTop: 1 }}>
              {task.streak} {tr('STREAK', 'СЕРИЯ')}
            </p>
          )}
        </div>

        <button onClick={onTrack} title={`${count}/${target}`} style={{
          width: 30, height: 26, borderRadius: 6, cursor: 'pointer', flexShrink: 0,
          fontFamily: 'var(--font)', fontSize: 9, fontWeight: 800,
          color: doneToday ? GREEN : '#02121a',
          background: doneToday ? 'transparent' : `linear-gradient(135deg, ${GREEN}, ${GREEN}b0)`,
          border: `1px solid ${doneToday ? `${GREEN}45` : 'transparent'}`,
        }}>{doneToday ? '✓' : '+1'}</button>

        <button onClick={() => setConfirmRelease(v => !v)} title={tr('remove from life support', 'убрать из жизнеобеспечения')}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0,
            color: 'rgba(148,163,184,0.35)', fontSize: 10, padding: '0 2px' }}>✕</button>
      </div>

      <div style={{ height: 2.5, borderRadius: 2, marginTop: 7, background: 'rgba(255,255,255,0.07)' }}>
        <div style={{ height: '100%', width: `${Math.round(score * 100)}%`, borderRadius: 2,
          background: automatic ? GOLD : tier.color, transition: 'width 0.5s' }} />
      </div>

      {confirmRelease && (
        <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ flex: 1, fontFamily: 'var(--font)', fontSize: 7, color: 'rgba(200,220,240,0.6)',
            lineHeight: 1.5 }}>
            {tr('Keeps the habit and its history — it just stops earning.',
                'Привычка и её история останутся — просто перестанет приносить опыт.')}
          </span>
          <button onClick={onRelease} style={{
            padding: '3px 8px', borderRadius: 5, cursor: 'pointer', flexShrink: 0,
            fontFamily: 'var(--font)', fontSize: 6.5, fontWeight: 700, letterSpacing: '0.1em',
            color: '#ff6b00', background: 'transparent', border: '1px solid rgba(255,107,0,0.4)',
          }}>{tr('REMOVE', 'УБРАТЬ')}</button>
        </div>
      )}
    </div>
  )
}
