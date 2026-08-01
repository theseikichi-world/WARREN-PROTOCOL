import { useState, useEffect, useCallback } from 'react'
import { t as tr } from '../../i18n'
import {
  loadProgression, saveProgression, seedIfEmpty, syncChain,
  primaryGoal, secondaryGoal, archivedGoals, bandwidthUsed, bandwidthFull,
  cooldownRemaining, promoteSecondary, assignPrimary, assignSecondary, archiveGoal,
} from './store'
import { RoutineList } from './RoutineList'
import { loadState as loadScrap7 } from '../scrap7/store'
import type { Task } from '../scrap7/types'
import {
  TIER_META, SWAP_COOLDOWN_DAYS, SECONDARY_MAX_NODES,
  type Goal, type ProgressionState,
} from './types'

const CYAN = '#00f5ff'
const GOLD = '#ffd700'
const DIM  = 'rgba(148,163,184,0.55)'

// ─── BANDWIDTH — two uplinks, no more ─────────────────────────────────────────
// The cap is the product. The screen's job is to make holding two goals feel
// deliberate, and to show exactly what a third would cost.

export default function Uplinks() {
  const [state, setState] = useState<ProgressionState>(() => seedIfEmpty(loadProgression()))
  const [tasks, setTasks] = useState<Task[]>(() => loadScrap7().tasks)
  const [now, setNow]     = useState(() => new Date())

  // Seed, then bring SCRAP-7 in line with the chains. syncChain is idempotent,
  // so running it on every mount and every sync event is safe.
  const reconcile = useCallback(() => {
    setState(prev => {
      const next = syncChain(seedIfEmpty(prev))
      saveProgression(next)
      return next
    })
    setTasks(loadScrap7().tasks)
  }, [])

  useEffect(() => {
    reconcile()
    window.addEventListener('warren:sync', reconcile)
    window.addEventListener('focus', reconcile)
    return () => {
      window.removeEventListener('warren:sync', reconcile)
      window.removeEventListener('focus', reconcile)
    }
  }, [reconcile])
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)   // keeps the cooldown honest
    return () => clearInterval(id)
  }, [])

  const persist = useCallback((next: ProgressionState) => {
    const synced = syncChain(next)          // slot changes move routines live ⇄ frozen
    saveProgression(synced)
    setState(synced)
    setTasks(loadScrap7().tasks)
  }, [])

  const primary   = primaryGoal(state)
  const secondary = secondaryGoal(state)
  const archived  = archivedGoals(state)
  const cooldown  = cooldownRemaining(state, now)

  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', flexShrink: 0, borderBottom: `1px solid ${CYAN}14`,
        background: 'rgba(2,8,14,0.6)' }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 900, color: CYAN,
          letterSpacing: '0.22em', textShadow: `0 0 12px ${CYAN}` }}>UPLINKS</p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 6.5, color: `${CYAN}45`, letterSpacing: '0.12em', marginTop: 2 }}>
          {tr('BANDWIDTH', 'ПРОПУСКНАЯ СПОСОБНОСТЬ')}: {bandwidthUsed(state)}/2 {tr('ALLOCATED', 'ЗАНЯТО')}
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
        {/* Slots */}
        <SlotCard slot="primary" goal={primary} cooldown={cooldown} tasks={tasks}
          onPromote={() => {}} onDemote={() => persist(assignSecondary(state, primary!.id, now))}
          onArchive={() => persist(archiveGoal(state, primary!.id, now))} />

        <SlotCard slot="secondary" goal={secondary} cooldown={0} tasks={tasks}
          onPromote={() => persist(promoteSecondary(state, now))}
          onDemote={() => {}}
          onArchive={() => persist(archiveGoal(state, secondary!.id, now))} />

        {/* What a third uplink would cost */}
        {bandwidthFull(state) && (
          <div style={{ marginTop: 14, padding: '11px 13px', borderRadius: 9,
            background: 'rgba(255,107,0,0.05)', border: '1px solid rgba(255,107,0,0.22)' }}>
            <p style={{ fontFamily: 'var(--font)', fontSize: 8, fontWeight: 800, color: 'rgba(255,140,60,0.9)',
              letterSpacing: '0.16em' }}>{tr('INSUFFICIENT BANDWIDTH', 'НЕДОСТАТОЧНО ПОЛОСЫ')}</p>
            <p style={{ fontFamily: 'var(--font)', fontSize: 8.5, color: DIM, lineHeight: 1.7, marginTop: 6 }}>
              {tr('Both uplinks are allocated. A third needs one of these dropped first:',
                  'Оба канала заняты. Для третьего нужно освободить один из этих:')}
            </p>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {[primary, secondary].filter((g): g is Goal => !!g).map(g => (
                <span key={g.id} style={{ fontFamily: 'var(--font)', fontSize: 8, fontWeight: 700,
                  color: `${GOLD}c0`, padding: '3px 9px', borderRadius: 5,
                  border: `1px solid ${GOLD}30`, background: `${GOLD}08` }}>{g.title}</span>
              ))}
            </div>
          </div>
        )}

        {/* Archive — progress preserved, earning nothing */}
        {archived.length > 0 && (
          <>
            <p style={{ fontFamily: 'var(--font)', fontSize: 7.5, fontWeight: 800, color: DIM,
              letterSpacing: '0.2em', margin: '20px 0 8px' }}>
              {tr('FROZEN', 'ЗАМОРОЖЕНО')} · {archived.length}
            </p>
            {archived.map(g => (
              <div key={g.id} style={{ marginBottom: 6, padding: '10px 12px', borderRadius: 9,
                background: 'rgba(13,24,48,0.4)', border: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 800,
                    color: 'rgba(200,220,235,0.7)', letterSpacing: '0.08em' }}>{g.title}</p>
                  <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: DIM, marginTop: 3 }}>
                    {g.nodes.length} {tr('routines · progress preserved, earning nothing',
                                         'рутин · прогресс сохранён, начислений нет')}
                  </p>
                </div>
                <button
                  disabled={!!primary && cooldown > 0}
                  onClick={() => persist(!secondary ? assignSecondary(state, g.id, now) : assignPrimary(state, g.id, now))}
                  style={{
                    padding: '6px 11px', borderRadius: 6, fontFamily: 'var(--font)', fontSize: 8,
                    fontWeight: 700, letterSpacing: '0.08em', flexShrink: 0,
                    cursor: (!!primary && cooldown > 0) ? 'default' : 'pointer',
                    color: (!!primary && cooldown > 0) ? 'rgba(148,163,184,0.3)' : CYAN,
                    border: `1px solid ${(!!primary && cooldown > 0) ? 'rgba(255,255,255,0.06)' : `${CYAN}35`}`,
                    background: (!!primary && cooldown > 0) ? 'transparent' : `${CYAN}0c`,
                  }}>{tr('ALLOCATE', 'ПОДКЛЮЧИТЬ')}</button>
              </div>
            ))}
          </>
        )}

        {/* Why the cap exists — stated once, plainly */}
        <p style={{ fontFamily: 'var(--font)', fontSize: 7.5, color: 'rgba(148,163,184,0.4)',
          lineHeight: 1.8, marginTop: 22, letterSpacing: '0.03em' }}>
          {tr(`Two uplinks is the ceiling. The secondary runs at 0.6× and carries at most ${SECONDARY_MAX_NODES} active routines. Reassigning the primary costs a ${SWAP_COOLDOWN_DAYS}-day cooldown and freezes the outgoing chain — promoting the secondary is free, because nothing leaves.`,
              `Два канала — предел. Вторичный идёт на 0.6× и держит не больше ${SECONDARY_MAX_NODES} активных рутин. Смена основного стоит ${SWAP_COOLDOWN_DAYS} дней перезарядки и замораживает уходящую цепочку — повысить вторичный бесплатно, ничего не теряется.`)}
        </p>
      </div>
    </div>
  )
}

// ─── One slot ─────────────────────────────────────────────────────────────────
function SlotCard({ slot, goal, cooldown, tasks, onPromote, onDemote, onArchive }: {
  slot:      'primary' | 'secondary'
  goal:      Goal | null
  cooldown:  number
  tasks:     Task[]
  onPromote: () => void
  onDemote:  () => void
  onArchive: () => void
}) {
  const isPrimary = slot === 'primary'
  const accent    = isPrimary ? CYAN : GOLD
  const label     = isPrimary ? tr('PRIMARY UPLINK', 'ОСНОВНОЙ КАНАЛ') : tr('SECONDARY UPLINK', 'ВТОРИЧНЫЙ КАНАЛ')

  if (!goal) {
    return (
      <div style={{ marginBottom: 10, padding: '18px 14px', borderRadius: 11, textAlign: 'center',
        border: `1px dashed ${accent}28`, background: 'transparent' }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 7.5, fontWeight: 800, color: `${accent}70`,
          letterSpacing: '0.18em' }}>{label}</p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 8.5, color: DIM, marginTop: 6 }}>
          {tr('Unallocated', 'Не занят')}</p>
      </div>
    )
  }

  const nodes    = goal.nodes.length
  const chapters = goal.chapters.length
  const tiers    = goal.nodes.reduce<Record<number, number>>((acc, n) => {
    acc[n.tier] = (acc[n.tier] ?? 0) + 1; return acc
  }, {})

  return (
    <div style={{ marginBottom: 10, padding: '13px 14px', borderRadius: 11,
      background: `linear-gradient(140deg, ${accent}0e, rgba(13,24,48,0.4))`,
      border: `1px solid ${accent}30` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 800, color: `${accent}90`,
          letterSpacing: '0.18em' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font)', fontSize: 7, color: DIM, marginLeft: 'auto' }}>
          {isPrimary ? '1.0×' : '0.6×'} XP</span>
      </div>

      <p style={{ fontFamily: 'var(--font)', fontSize: 15, fontWeight: 900, color: accent,
        letterSpacing: '0.1em', textShadow: `0 0 12px ${accent}50`, marginTop: 7 }}>{goal.title}</p>

      <p style={{ fontFamily: 'var(--font)', fontSize: 7.5, color: DIM, marginTop: 5 }}>
        {chapters} {tr('chapters', 'глав')} · {nodes} {tr('routines', 'рутин')}
        {isPrimary ? '' : ` · ${tr('max', 'макс')} ${SECONDARY_MAX_NODES} ${tr('active', 'активных')}`}
      </p>

      {/* Tier spread — what this chain is actually made of */}
      <div style={{ display: 'flex', gap: 5, marginTop: 9, flexWrap: 'wrap' }}>
        {([1, 2, 3, 4] as const).filter(t => tiers[t]).map(t => (
          <span key={t} title={TIER_META[t].profile} style={{
            fontFamily: 'var(--font)', fontSize: 6.5, fontWeight: 700, letterSpacing: '0.08em',
            color: `${accent}a0`, padding: '2px 7px', borderRadius: 4,
            border: `1px solid ${accent}25`, background: `${accent}08`,
          }}>{TIER_META[t].name} ×{tiers[t]}</span>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginTop: 11, flexWrap: 'wrap' }}>
        {!isPrimary && (
          <Action label={tr('PROMOTE', 'ПОВЫСИТЬ')} color={CYAN} onClick={onPromote}
            hint={tr('free', 'бесплатно')} />
        )}
        {isPrimary && (
          <Action label={tr('DEMOTE', 'ПОНИЗИТЬ')} color={DIM} onClick={onDemote}
            disabled={cooldown > 0}
            hint={cooldown > 0 ? `${cooldown}${tr('d', 'д')}` : tr('costs a swap', 'считается сменой')} />
        )}
        <Action label={tr('FREEZE', 'ЗАМОРОЗИТЬ')} color={DIM} onClick={onArchive}
          hint={tr('keeps progress', 'сохраняет прогресс')} />
      </div>

      {isPrimary && cooldown > 0 && (
        <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: 'rgba(255,140,60,0.7)', marginTop: 8 }}>
          {tr('Reassignment available in', 'Смена доступна через')} {cooldown} {tr('days', 'дн.')}
        </p>
      )}

      {/* The chain itself */}
      <div style={{ marginTop: 13, paddingTop: 12, borderTop: `1px solid ${accent}18` }}>
        <RoutineList goal={goal} tasks={tasks} accent={accent} />
      </div>
    </div>
  )
}

function Action({ label, hint, color, onClick, disabled }: {
  label: string; hint?: string; color: string; onClick: () => void; disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={hint}
      style={{
        padding: '6px 11px', borderRadius: 6, cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'var(--font)', fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
        color: disabled ? 'rgba(148,163,184,0.3)' : color,
        border: `1px solid ${disabled ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)'}`,
        background: 'transparent', display: 'flex', alignItems: 'center', gap: 6,
      }}>
      {label}
      {hint && <span style={{ fontSize: 6.5, opacity: 0.6 }}>{hint}</span>}
    </button>
  )
}
