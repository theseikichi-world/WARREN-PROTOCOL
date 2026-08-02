import { useEffect, useRef, useState } from 'react'
import { t as tr } from '../../i18n'
import { getHabitTier, isBaseline, isUnbound, type Task } from '../scrap7/types'
import { THRESHOLD_UNLOCK_AT } from './types'
import { useSpotlight } from './questNav'
import {
  offerTemplates, availableTemplates, templateForTask,
  lifeSupportSlots, nextSlotGate, type LifeSupportTemplate,
} from './lifeSupport'

// ─── LIFE SUPPORT, on the character sheet ─────────────────────────────────────
// A protocol is what you're chasing; this is the floor underneath it. It lives
// on the CHARACTER tab rather than in a tree because it isn't goal work — it's
// true whichever uplink happens to be loaded, and it stays true when both are
// frozen.
//
// Slots are the one gate. One at level 1, widening as the character levels:
// eight basics added on day one is a list you abandon by Thursday, not a floor.

const GREEN = '#4ade80'
const GOLD  = '#ffd700'
const DIM   = 'rgba(148,163,184,0.5)'

export function LifeSupportPanel({ tasks, level, onTrack, onInstall, onInstallCustom, onAdopt, onRelease }: {
  tasks:           Task[]
  level:           number
  onTrack:         (taskId: string) => void
  onInstall:       (template: LifeSupportTemplate) => void
  onInstallCustom: (title: string, target: number, unit: string) => void
  onAdopt:         (taskId: string) => void
  onRelease:       (taskId: string) => void
}) {
  const [picking, setPicking] = useState(false)
  const [offset, setOffset]   = useState(0)
  const [custom, setCustom]   = useState(false)
  const addRef = useRef<HTMLButtonElement>(null)

  // Arrived here from KEEP YOURSELF RUNNING — say which button, and open it
  const spotlit = useSpotlight('life-support')
  useEffect(() => {
    if (!spotlit) return
    addRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [spotlit])

  const habits    = tasks.filter(t => t.taskType === 'habit')
  const installed = habits.filter(isBaseline)
  const yours     = habits.filter(isUnbound)

  const slots    = lifeSupportSlots(level)
  const free     = Math.max(0, slots - installed.length)
  const nextGate = nextSlotGate(level)
  const pool     = availableTemplates(tasks.map(t => t.id))
  const offer    = offerTemplates(tasks.map(t => t.id), offset)

  const openPicker = () => {
    if (free <= 0) return
    setPicking(v => !v)
    setCustom(false)
  }

  return (
    <>
      {/* Header — this is a section of the sheet, not a footnote */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '22px 0 8px' }}>
        <span style={{ fontSize: 13 }}>🫀</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 900, letterSpacing: '0.16em',
            color: GREEN, textShadow: `0 0 10px ${GREEN}45` }}>
            {tr('LIFE SUPPORT', 'ЖИЗНЕОБЕСПЕЧЕНИЕ')}
          </p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: DIM, marginTop: 2 }}>
            {installed.length}/{slots} {tr('SLOTS USED', 'СЛОТОВ ЗАНЯТО')}
            {nextGate && ` · ${tr('LV', 'УР')}${nextGate.level} → ${nextGate.slots}`}
          </p>
        </div>
        <button ref={addRef} onClick={openPicker} disabled={free <= 0}
          style={{
            padding: '7px 14px', borderRadius: 7, flexShrink: 0,
            cursor: free > 0 ? 'pointer' : 'default',
            fontFamily: 'var(--font)', fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
            color: free <= 0 ? 'rgba(148,163,184,0.35)' : picking ? '#02121a' : GREEN,
            background: picking && free > 0 ? GREEN : 'transparent',
            border: `1px solid ${free > 0 ? GREEN : 'rgba(255,255,255,0.1)'}${picking ? '' : '55'}`,
            boxShadow: spotlit && !picking ? `0 0 0 2px ${GREEN}, 0 0 18px ${GREEN}80` : 'none',
            animation: spotlit && !picking ? 'pulse 1.4s ease-in-out infinite' : undefined,
          }}>
          {picking ? tr('CLOSE', 'ЗАКРЫТЬ') : `+ ${tr('ADD', 'ДОБАВИТЬ')}`}
        </button>
      </div>

      {/* The arrival hint — names the button rather than hoping you find it */}
      {spotlit && !picking && (
        <p style={{ fontFamily: 'var(--font)', fontSize: 8, fontWeight: 700, color: GREEN,
          marginBottom: 8, letterSpacing: '0.06em' }}>
          ▲ {tr('Tap + ADD up there and pick one. That clears the quest.',
                'Нажмите + ДОБАВИТЬ и выберите одну. Это закроет задание.')}
        </p>
      )}

      <p style={{ fontFamily: 'var(--font)', fontSize: 7.5, color: 'rgba(148,163,184,0.42)',
        lineHeight: 1.65, marginBottom: 10 }}>
        {free > 0
          ? tr('The floor under everything else. No tree, no unlocking — pick what you need. Worth a fraction of goal work, on purpose.',
               'Основа под всем остальным. Ни дерева, ни разблокировок — берите нужное. Стоит долю от работы над целью, и это намеренно.')
          : nextGate
            ? tr(`Every slot is full. The next one opens at level ${nextGate.level} — basics are meant to accumulate at the speed you actually absorb them.`,
                 `Все слоты заняты. Следующий откроется на уровне ${nextGate.level} — основы набираются со скоростью, с которой вы их усваиваете.`)
            : tr('Every slot is full, and that is the ceiling.', 'Все слоты заняты — это потолок.')}
      </p>

      {/* Picker */}
      {picking && free > 0 && (
        <div style={{ marginBottom: 11, padding: '10px 11px', borderRadius: 9,
          background: `${GREEN}08`, border: `1px solid ${GREEN}28` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 800,
              letterSpacing: '0.16em', color: `${GREEN}b0` }}>
              {custom ? tr('YOUR OWN BASIC', 'СВОЯ ОСНОВА') : tr('PICK ONE', 'ВЫБЕРИТЕ ОДНУ')}
            </span>
            <span style={{ fontFamily: 'var(--font)', fontSize: 7, color: DIM }}>
              {free} {tr('slot', 'слот')}{free === 1 ? '' : 's'}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
              {!custom && pool.length > offer.length && (
                <button onClick={() => setOffset(o => o + offer.length)}
                  style={{ padding: '3px 9px', borderRadius: 5, cursor: 'pointer',
                    fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700, letterSpacing: '0.1em',
                    color: DIM, background: 'transparent', border: '1px solid rgba(255,255,255,0.14)' }}>
                  ↻ {tr('OTHERS', 'ДРУГИЕ')}
                </button>
              )}
              <button onClick={() => setCustom(c => !c)}
                style={{ padding: '3px 9px', borderRadius: 5, cursor: 'pointer',
                  fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700, letterSpacing: '0.1em',
                  color: custom ? '#02121a' : GREEN,
                  background: custom ? GREEN : 'transparent',
                  border: `1px solid ${GREEN}${custom ? '' : '45'}` }}>
                {custom ? tr('BACK', 'НАЗАД') : `+ ${tr('ADD YOURS', 'СВОЯ')}`}
              </button>
            </div>
          </div>

          {custom
            ? <CustomBasic onAdd={(title, target, unit) => { onInstallCustom(title, target, unit); setCustom(false); setPicking(false) }} />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {offer.map(t => (
                  <button key={t.id} onClick={() => { onInstall(t); setPicking(false) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                      padding: '9px 10px', borderRadius: 7, cursor: 'pointer',
                      background: 'rgba(3,10,20,0.5)', border: `1px solid ${GREEN}22` }}>
                    <span style={{ fontSize: 13, flexShrink: 0 }}>{t.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: 'var(--font)', fontSize: 9.5, fontWeight: 700,
                        color: 'rgba(230,242,255,0.92)' }}>{tr(t.title, t.ru)}</p>
                      <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: DIM, marginTop: 3 }}>
                        ▸ {tr(t.cue, t.cueRu)} · {t.target} {tr(t.unit, t.unitRu)}
                      </p>
                    </div>
                    <span style={{ fontSize: 11, color: GREEN, flexShrink: 0 }}>+</span>
                  </button>
                ))}
                {offer.length === 0 && (
                  <p style={{ fontFamily: 'var(--font)', fontSize: 8, color: DIM }}>
                    {tr('Every template is already running. Add your own.',
                        'Все шаблоны уже запущены. Добавьте свою.')}
                  </p>
                )}
              </div>
            )}
        </div>
      )}

      {installed.length === 0 && !picking && (
        <p style={{ fontFamily: 'var(--font)', fontSize: 8.5, color: 'rgba(148,163,184,0.4)',
          padding: '12px 0', lineHeight: 1.6 }}>
          {tr('Nothing running. Add one — the basics cost almost nothing and hold up everything above them.',
              'Ничего не запущено. Добавьте одну — основы почти ничего не стоят и держат всё остальное.')}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
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
            {free > 0
              ? tr('Made by hand, so they belong to no protocol and earn nothing. Adopt one into life support and it starts counting.',
                   'Сделаны вручную, не принадлежат протоколу и ничего не приносят. Примите в жизнеобеспечение — и начнёт считаться.')
              : tr('Made by hand, so they earn nothing. No free slot to adopt one into right now.',
                   'Сделаны вручную и ничего не приносят. Свободного слота сейчас нет.')}
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
                <button onClick={() => free > 0 && onAdopt(task.id)} disabled={free <= 0} style={{
                  padding: '3px 8px', borderRadius: 5, flexShrink: 0,
                  cursor: free > 0 ? 'pointer' : 'default',
                  fontFamily: 'var(--font)', fontSize: 6.5, fontWeight: 700, letterSpacing: '0.1em',
                  color: free > 0 ? GREEN : 'rgba(148,163,184,0.3)', background: 'transparent',
                  border: `1px solid ${free > 0 ? `${GREEN}35` : 'rgba(255,255,255,0.07)'}`,
                }}>{tr('ADOPT', 'ПРИНЯТЬ')}</button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

// ─── Write your own ───────────────────────────────────────────────────────────

function CustomBasic({ onAdd }: { onAdd: (title: string, target: number, unit: string) => void }) {
  const [title, setTitle]   = useState('')
  const [target, setTarget] = useState('1')
  const [unit, setUnit]     = useState(tr('times', 'раз'))
  const ready = title.trim().length > 0

  const field: React.CSSProperties = {
    width: '100%', padding: '7px 9px', borderRadius: 6, boxSizing: 'border-box',
    background: 'rgba(2,8,16,0.7)', border: '1px solid rgba(255,255,255,0.1)',
    fontFamily: 'var(--font)', fontSize: 9, color: 'rgba(230,242,255,0.92)', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input value={title} onChange={e => setTitle(e.target.value)} autoFocus maxLength={60}
        placeholder={tr('e.g. Feed the cat before coffee', 'напр. Покормить кота до кофе')} style={field} />
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={target} onChange={e => setTarget(e.target.value.replace(/[^0-9]/g, ''))}
          inputMode="numeric" placeholder="1" style={{ ...field, width: 64, flexShrink: 0 }} />
        <input value={unit} onChange={e => setUnit(e.target.value)} maxLength={16}
          placeholder={tr('times', 'раз')} style={field} />
      </div>
      <button onClick={() => ready && onAdd(title, Number(target) || 1, unit.trim() || tr('times', 'раз'))}
        disabled={!ready}
        style={{ padding: '8px', borderRadius: 6, cursor: ready ? 'pointer' : 'default',
          fontFamily: 'var(--font)', fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em',
          color: ready ? '#02121a' : 'rgba(148,163,184,0.3)',
          background: ready ? GREEN : 'transparent',
          border: `1px solid ${ready ? GREEN : 'rgba(255,255,255,0.1)'}` }}>
        {tr('ADD IT', 'ДОБАВИТЬ')}
      </button>
    </div>
  )
}

// ─── One basic ────────────────────────────────────────────────────────────────

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
    <div style={{ padding: '9px 11px', borderRadius: 8,
      background: doneToday ? `${GREEN}0c` : 'rgba(13,24,48,0.45)',
      border: `1px solid ${doneToday ? `${GREEN}35` : 'rgba(255,255,255,0.07)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ fontSize: 12, flexShrink: 0, filter: automatic ? `drop-shadow(0 0 5px ${GOLD})` : 'none' }}>
          {template?.icon ?? '◆'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 9.5, fontWeight: 700,
            color: 'rgba(230,242,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap' }}>{task.text}</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: DIM, marginTop: 3 }}>
            {template ? `▸ ${tr(template.cue, template.cueRu)} · ` : ''}{count}/{target} {task.unit ?? ''}
          </p>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 900,
            color: automatic ? GOLD : tier.color }}>{score.toFixed(2)}</p>
          {(task.streak ?? 0) > 0 && (
            <p style={{ fontFamily: 'var(--font)', fontSize: 6, color: 'rgba(255,107,0,0.8)', marginTop: 1 }}>
              {task.streak} {tr('STREAK', 'СЕРИЯ')}
            </p>
          )}
        </div>

        <button onClick={onTrack} title={`${count}/${target}`} style={{
          width: 34, height: 30, borderRadius: 7, cursor: 'pointer', flexShrink: 0,
          fontFamily: 'var(--font)', fontSize: 10, fontWeight: 800,
          color: doneToday ? GREEN : '#02121a',
          background: doneToday ? 'transparent' : `linear-gradient(135deg, ${GREEN}, ${GREEN}b0)`,
          border: `1px solid ${doneToday ? `${GREEN}45` : 'transparent'}`,
        }}>{doneToday ? '✓' : '+1'}</button>

        <button onClick={() => setConfirmRelease(v => !v)} title={tr('remove from life support', 'убрать из жизнеобеспечения')}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0,
            color: 'rgba(148,163,184,0.35)', fontSize: 10, padding: '0 2px' }}>✕</button>
      </div>

      <div style={{ height: 3, borderRadius: 2, marginTop: 8, background: 'rgba(255,255,255,0.07)' }}>
        <div style={{ height: '100%', width: `${Math.round(score * 100)}%`, borderRadius: 2,
          background: automatic ? GOLD : tier.color, transition: 'width 0.5s' }} />
      </div>

      {confirmRelease && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ flex: 1, fontFamily: 'var(--font)', fontSize: 7, color: 'rgba(200,220,240,0.6)',
            lineHeight: 1.5 }}>
            {tr('Keeps the habit and its history, frees the slot — it just stops earning.',
                'Привычка и история останутся, слот освободится — просто перестанет приносить опыт.')}
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
