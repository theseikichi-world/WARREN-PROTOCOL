import { useState, useEffect, useCallback } from 'react'
import { t as tr } from '../../i18n'
import {
  loadProgression, saveProgression, seedIfEmpty, syncChain, installNode, recordRun, syncQuests,
  primaryGoal, secondaryGoal, archivedGoals, bandwidthUsed,
  cooldownRemaining, promoteSecondary, assignPrimary, assignSecondary, archiveGoal,
  trainingCount, hasCapacity,
} from './store'
import { SkillTree } from './SkillTree'
import { CharacterSheet } from './CharacterSheet'
import { nodeState } from './chain'
import { levelFor, isUnlockedAt } from './xp'
import { loadState as loadScrap7, saveState as saveScrap7, trackHabit } from '../scrap7/store'
import type { Task } from '../scrap7/types'
import { getModuleSummaries, type ModuleSummaries } from '../bigscreen/moduleStats'
import { loadSettings } from '../../settings'
import { SECONDARY_MAX_NODES, type Goal, type ProgressionState } from './types'

const CYAN = '#00f5ff'
const GOLD = '#ffd700'
const DIM  = 'rgba(148,163,184,0.55)'

// ─── UPLINKS — two goals, two trees ───────────────────────────────────────────

export default function Uplinks() {
  const [state, setState] = useState<ProgressionState>(() => seedIfEmpty(loadProgression()))
  const [tasks, setTasks] = useState<Task[]>(() => loadScrap7().tasks)
  const [now, setNow]     = useState(() => new Date())
  const [view, setView]   = useState<'character' | 'primary' | 'secondary'>('character')
  const [sums, setSums]   = useState<ModuleSummaries>(() => getModuleSummaries())
  const [toast, setToast] = useState('')

  const reconcile = useCallback(() => {
    const tasksNow = loadScrap7().tasks
    const sumsNow  = getModuleSummaries()
    setState(prev => {
      const chained = syncChain(seedIfEmpty(prev))
      const { state: next, cleared } = syncQuests(chained, { sums: sumsNow, goals: chained.goals, tasks: tasksNow })
      saveProgression(next)
      if (cleared.length) flash(`⚑ ${tr(cleared[0].title, cleared[0].ru)} — +${cleared[0].xp} XP`)
      return next
    })
    setTasks(tasksNow)
    setSums(sumsNow)
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
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const persist = useCallback((next: ProgressionState) => {
    const synced = syncChain(next)
    saveProgression(synced)
    setState(synced)
    setTasks(loadScrap7().tasks)
  }, [])

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2600) }

  const handleInstall = useCallback((nodeId: string) => {
    const res = installNode(state, nodeId)
    if (!res.ok) {
      flash(res.reason === 'capacity'
        ? tr(`Secondary uplink is training ${SECONDARY_MAX_NODES} routines already`,
             `Вторичный канал уже тренирует ${SECONDARY_MAX_NODES} рутины`)
        : tr('Not available yet', 'Пока недоступно'))
      return
    }
    saveProgression(res.state)
    setState(res.state)
    setTasks(loadScrap7().tasks)
    flash(tr('◆ ROUTINE INSTALLED', '◆ РУТИНА УСТАНОВЛЕНА'))
  }, [state])

  const handleTrack = useCallback((taskId: string) => {
    const s7     = loadScrap7()
    const before = s7.tasks.find(t => t.id === taskId)?.score ?? 0
    const { state: next } = trackHabit(s7, taskId, 1)
    saveScrap7(next)
    const after = next.tasks.find(t => t.id === taskId)?.score ?? 0

    setState(prev => {
      const reward = recordRun(prev, taskId, before, after)
      saveProgression(reward.state)
      if (reward.levelUp) flash(tr(`LEVEL ${reward.levelUp}`, `УРОВЕНЬ ${reward.levelUp}`))
      else if (reward.gained) flash(`+${reward.gained} XP`)
      return reward.state
    })
    setTasks(next.tasks)
    setSums(getModuleSummaries())
    window.dispatchEvent(new CustomEvent('warren:sync', { detail: { source: 'uplinks' } }))
    reconcile()
  }, [reconcile])

  const primary   = primaryGoal(state)
  const secondary = secondaryGoal(state)
  const archived  = archivedGoals(state)
  const cooldown  = cooldownRemaining(state, now)
  const shown     = view === 'primary' ? primary : view === 'secondary' ? secondary : null
  const accent    = view === 'primary' ? CYAN : GOLD
  const level     = levelFor(state.xp).level
  const secondaryOpen = isUnlockedAt('secondary', level)

  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '9px 14px', flexShrink: 0, borderBottom: `1px solid ${CYAN}14`,
        background: 'rgba(2,8,14,0.6)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 900, color: CYAN,
            letterSpacing: '0.22em', textShadow: `0 0 12px ${CYAN}` }}>UPLINKS</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 6.5, color: `${CYAN}45`, letterSpacing: '0.12em', marginTop: 2 }}>
            {tr('BANDWIDTH', 'ПОЛОСА')} {bandwidthUsed(state)}/2
          </p>
        </div>
      </div>

      {/* Character, then a tab per uplink */}
      <div style={{ display: 'flex', flexShrink: 0, borderBottom: `1px solid ${CYAN}10` }}>
        <button onClick={() => setView('character')} style={{
          flex: 0.8, padding: '9px 6px', cursor: 'pointer',
          background: view === 'character' ? `${CYAN}0c` : 'transparent',
          borderBottom: `2px solid ${view === 'character' ? CYAN : 'transparent'}`,
          fontFamily: 'var(--font)',
        }}>
          <p style={{ fontSize: 6.5, fontWeight: 700, letterSpacing: '0.14em',
            color: view === 'character' ? `${CYAN}b0` : 'rgba(148,163,184,0.35)' }}>
            {tr('LV', 'УР')} {level}
          </p>
          <p style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '0.08em', marginTop: 3,
            color: view === 'character' ? CYAN : 'rgba(148,163,184,0.5)',
            textShadow: view === 'character' ? `0 0 10px ${CYAN}50` : 'none' }}>
            {tr('CHARACTER', 'ПЕРСОНАЖ')}
          </p>
        </button>

        {(['primary', 'secondary'] as const).map(slot => {
          const g = slot === 'primary' ? primary : secondary
          const on = view === slot
          const c  = slot === 'primary' ? CYAN : GOLD
          const locked = slot === 'secondary' && !secondaryOpen
          return (
            <button key={slot} onClick={() => !locked && setView(slot)} style={{
              flex: 1, padding: '9px 6px', cursor: locked ? 'default' : 'pointer',
              background: on ? `${c}0c` : 'transparent',
              borderBottom: `2px solid ${on ? c : 'transparent'}`,
              fontFamily: 'var(--font)', opacity: locked ? 0.45 : 1,
            }}>
              <p style={{ fontSize: 6.5, fontWeight: 700, letterSpacing: '0.14em',
                color: on ? `${c}b0` : 'rgba(148,163,184,0.35)' }}>
                {slot === 'primary' ? tr('PRIMARY', 'ОСНОВНОЙ') : tr('SECONDARY', 'ВТОРИЧНЫЙ')}
                {slot === 'secondary' && g && secondaryOpen ? ` · ${trainingCount(g, tasks)}/${SECONDARY_MAX_NODES}` : ''}
              </p>
              <p style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '0.08em', marginTop: 3,
                color: on ? c : 'rgba(148,163,184,0.5)',
                textShadow: on ? `0 0 10px ${c}50` : 'none',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {locked ? `🔒 ${tr('LV', 'УР')} 5` : g ? g.title : tr('EMPTY', 'ПУСТО')}
              </p>
            </button>
          )
        })}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {view === 'character' && (
          <CharacterSheet goals={state.goals} tasks={tasks} xp={state.xp}
            sums={sums} name={loadSettings().displayName} quests={state.quests} />
        )}

        {view !== 'character' && shown ? (
          <>
            <SkillTree goal={shown} tasks={tasks} accent={accent}
              onInstall={handleInstall} onTrack={handleTrack} />

            <GoalActions goal={shown} view={view} cooldown={cooldown}
              canInstallMore={hasCapacity(shown, tasks)}
              onPromote={() => persist(promoteSecondary(state, now))}
              onDemote={() => persist(assignSecondary(state, shown.id, now))}
              onFreeze={() => persist(archiveGoal(state, shown.id, now))} />
          </>
        ) : view !== 'character' ? (
          <p style={{ fontFamily: 'var(--font)', fontSize: 9, color: DIM, textAlign: 'center', padding: '40px 12px' }}>
            {tr('This uplink is unallocated.', 'Этот канал свободен.')}
          </p>
        ) : null}

        {/* Frozen goals — recoverable, never deleted */}
        {archived.length > 0 && (
          <>
            <p style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 800, color: DIM,
              letterSpacing: '0.2em', margin: '18px 0 7px' }}>
              {tr('FROZEN', 'ЗАМОРОЖЕНО')} · {archived.length}
            </p>
            {archived.map(g => (
              <div key={g.id} style={{ marginBottom: 5, padding: '9px 11px', borderRadius: 8,
                background: 'rgba(13,24,48,0.4)', border: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font)', fontSize: 9.5,
                  fontWeight: 800, color: 'rgba(200,220,235,0.7)' }}>{g.title}</span>
                <button
                  disabled={!!primary && !!secondary}
                  onClick={() => persist(!secondary ? assignSecondary(state, g.id, now) : assignPrimary(state, g.id, now))}
                  style={{
                    padding: '5px 10px', borderRadius: 6, fontFamily: 'var(--font)', fontSize: 7.5,
                    fontWeight: 700, letterSpacing: '0.08em', flexShrink: 0,
                    cursor: (!!primary && !!secondary) ? 'default' : 'pointer',
                    color: (!!primary && !!secondary) ? 'rgba(148,163,184,0.3)' : CYAN,
                    border: `1px solid ${(!!primary && !!secondary) ? 'rgba(255,255,255,0.06)' : `${CYAN}35`}`,
                    background: 'transparent',
                  }}>{tr('ALLOCATE', 'ПОДКЛЮЧИТЬ')}</button>
              </div>
            ))}
          </>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '9px 20px', borderRadius: 9, zIndex: 60,
          background: 'rgba(4,10,18,0.96)', border: `1px solid ${CYAN}40`,
          boxShadow: `0 4px 22px rgba(0,0,0,0.6), 0 0 14px ${CYAN}20` }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 700, color: CYAN,
            letterSpacing: '0.08em' }}>{toast}</p>
        </div>
      )}
    </div>
  )
}

/** Slot actions, tucked under the tree where they don't compete with it. */
function GoalActions({ goal, view, cooldown, canInstallMore, onPromote, onDemote, onFreeze }: {
  goal: Goal; view: 'primary' | 'secondary'; cooldown: number; canInstallMore: boolean
  onPromote: () => void; onDemote: () => void; onFreeze: () => void
}) {
  const btn = (disabled: boolean): React.CSSProperties => ({
    padding: '5px 10px', borderRadius: 6, cursor: disabled ? 'default' : 'pointer',
    fontFamily: 'var(--font)', fontSize: 7.5, fontWeight: 700, letterSpacing: '0.08em',
    color: disabled ? 'rgba(148,163,184,0.3)' : DIM,
    border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
  })
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
      {view === 'secondary' && (
        <button onClick={onPromote} style={{ ...btn(false), color: CYAN, borderColor: `${CYAN}35` }}>
          ▲ {tr('PROMOTE', 'ПОВЫСИТЬ')}
        </button>
      )}
      {view === 'primary' && (
        <button onClick={onDemote} disabled={cooldown > 0} style={btn(cooldown > 0)}>
          ▼ {tr('DEMOTE', 'ПОНИЗИТЬ')}{cooldown > 0 ? ` ${cooldown}${tr('d', 'д')}` : ''}
        </button>
      )}
      <button onClick={onFreeze} style={btn(false)}>❄ {tr('FREEZE', 'ЗАМОРОЗИТЬ')}</button>
      {view === 'secondary' && !canInstallMore && (
        <span style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${GOLD}90`, marginLeft: 'auto' }}>
          {tr('training slots full', 'слоты тренировки заняты')}
        </span>
      )}
      <span style={{ fontFamily: 'var(--font)', fontSize: 7, color: 'rgba(148,163,184,0.3)', marginLeft: 'auto' }}>
        {goal.nodes.filter(n => nodeState(n, []) !== 'locked').length}/{goal.nodes.length}
      </span>
    </div>
  )
}
