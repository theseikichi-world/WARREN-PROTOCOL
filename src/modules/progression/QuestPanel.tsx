import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { t as tr } from '../../i18n'
import { loadState as loadScrap7 } from '../scrap7/store'
import { getModuleSummaries } from '../bigscreen/moduleStats'
import { loadProgression, saveProgression, syncQuests } from './store'
import { gatedLevel } from './xp'
import {
  stageState, questCta, QUEST_DESTINATIONS, LAST_GATED_STAGE,
  type Quest, type QuestContext,
} from './quests'
import { questNav } from './questNav'
import { play as playCue } from '../../sound'

// ─── The quest log, on the hub ────────────────────────────────────────────────
// Quests live where navigation lives. Every objective is one tap from the thing
// it asks for, and the stage states plainly what is holding the next level —
// XP alone never advances you, so a full bar with no explanation would be the
// worst screen in the app.

const GOLD = '#ffd700'
const DIM  = 'rgba(148,163,184,0.5)'

export function QuestPanel() {
  const navigate = useNavigate()
  const [tick, setTick] = useState(0)

  const read = useCallback(() => {
    const tasks = loadScrap7().tasks
    const sums  = getModuleSummaries()
    const base  = loadProgression()
    const ctx: QuestContext = { sums, goals: base.goals, tasks }

    // Clear anything the record now satisfies, here as well as in UPLINKS —
    // the hub is where most people will see a quest complete.
    const { state, cleared } = syncQuests(base, ctx)
    if (cleared.length) saveProgression(state)
    return { state, ctx, cleared }
  }, [])

  const [{ state, ctx }, setData] = useState(read)
  /** The quest that just cleared, held long enough to be seen. */
  const [celebrating, setCelebrating] = useState<Quest | null>(null)

  useEffect(() => {
    const refresh = () => {
      const next = read()
      setData(next)
      setTick(t => t + 1)
      // A quest clearing silently was the flattest moment in the loop: real work
      // landed and the only trace was a number changing somewhere off-screen.
      if (next.cleared.length) { setCelebrating(next.cleared[next.cleared.length - 1]); playCue('quest') }
    }
    refresh()
    window.addEventListener('warren:sync', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('warren:sync', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [read])
  void tick

  useEffect(() => {
    if (!celebrating) return
    const id = setTimeout(() => setCelebrating(null), 4200)
    return () => clearTimeout(id)
  }, [celebrating])

  const lvl   = gatedLevel(state.xp, state.quests)
  // The level caps which stage may be shown — a stage ahead of your level points
  // at modules that have not opened yet. See `stageState`.
  const stage = stageState(state.quests, ctx, lvl.level)
  const hasUplink = state.goals.some(g => g.slot !== 'archived')

  /**
   * Travel with the quest. The brief rides along so the destination can restate
   * it, and a spotlight tells a screen which control to point at — landing on a
   * whole module and being left to hunt is the failure this replaces.
   */
  const go = (quest: Quest) => {
    // The uplink steps resolve against what exists: with no goal at all,
    // "install a routine" belongs at the door a goal comes through, not on an
    // empty tree.
    if (quest.target === 'uplink' && !hasUplink) {
      navigate('/log', { state: questNav(quest) })
      return
    }
    const path = QUEST_DESTINATIONS[quest.target].path
    if (!path) return
    navigate(path, { state: questNav(quest, quest.spotlight) })
  }

  // The starting zone is finite by design
  if (stage.stage === null) {
    return (
      <div style={{ marginBottom: 16, padding: '11px 13px', borderRadius: 10,
        background: `${GOLD}08`, border: `1px solid ${GOLD}28` }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 800, letterSpacing: '0.2em',
          color: `${GOLD}b0` }}>⚑ {tr('MAIN QUEST', 'ОСНОВНОЙ КВЕСТ')}</p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: 'rgba(230,242,255,0.85)', marginTop: 6 }}>
          {tr('The starting zone is behind you. Everything from here is your own line.',
              'Стартовая зона позади. Дальше — только ваша линия.')}
        </p>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 16, padding: '11px 13px', borderRadius: 10, position: 'relative',
      background: `linear-gradient(140deg, ${GOLD}0e, rgba(6,14,26,0.5))`,
      border: `1px solid ${GOLD}35` }}>

      {celebrating && <QuestCleared quest={celebrating} />}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 800, letterSpacing: '0.2em',
          color: `${GOLD}b0` }}>
          ⚑ {stage.stage === 1 ? tr('SETUP', 'НАСТРОЙКА') : tr('MAIN QUEST', 'ОСНОВНОЙ КВЕСТ')}
        </span>
        <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: DIM }}>
          {tr('STAGE', 'ЭТАП')} {stage.stage}/{LAST_GATED_STAGE}
        </span>
        <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 700, color: `${GOLD}c0`,
          marginLeft: 'auto' }}>{stage.cleared}/{stage.total}</span>
      </div>

      {/* What the stage is holding — stated, never implied by a stuck bar */}
      <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, lineHeight: 1.6, marginTop: 6,
        color: lvl.capped ? `${GOLD}c0` : 'rgba(200,220,240,0.6)' }}>
        {lvl.capped
          ? tr(`Level ${lvl.level + 1} is held until this stage is clear — ${stage.total - stage.cleared} left. XP alone does not advance you.`,
               `Уровень ${lvl.level + 1} закрыт, пока этап не пройден — осталось ${stage.total - stage.cleared}. Один опыт не продвигает.`)
          : tr(`Finish all ${stage.total} to reach level ${lvl.level + 1}.`,
               `Пройдите все ${stage.total}, чтобы достичь уровня ${lvl.level + 1}.`)}
      </p>

      {/* The bar that the stage actually fills. A gated level costs exactly what
          its stage pays, so this reaching the end and the stage finishing are the
          same event — worth showing rather than leaving to arithmetic. */}
      <div style={{ height: 5, borderRadius: 3, marginTop: 8, overflow: 'hidden',
        background: 'rgba(255,255,255,0.07)' }}>
        <div style={{ height: '100%', borderRadius: 3,
          width: `${Math.round((lvl.capped ? stage.cleared / Math.max(1, stage.total) : lvl.progress) * 100)}%`,
          background: `linear-gradient(90deg, ${GOLD}, #ffe98a)`,
          boxShadow: `0 0 10px ${GOLD}90`, transition: 'width 0.8s cubic-bezier(0.2,0.8,0.2,1)' }} />
      </div>
      <div style={{ display: 'flex', marginTop: 4 }}>
        <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: DIM }}>
          {lvl.capped ? `${stage.cleared}/${stage.total} ${tr('objectives', 'задач')}` : `${lvl.intoNext} / ${lvl.needed} XP`}
        </span>
        <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: `${GOLD}90`, marginLeft: 'auto' }}>
          {tr('LEVEL', 'УРОВЕНЬ')} {lvl.level} → {lvl.level + 1}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 9 }}>
        {stage.quests.map(p => {
          const cleared = !!state.quests[p.quest.id]
          const cta = questCta(p.quest, hasUplink)
          return (
            <button key={p.quest.id} onClick={() => !cleared && go(p.quest)}
              title={tr(p.quest.brief, p.quest.briefRu)}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 7,
                cursor: cleared ? 'default' : 'pointer',
                background: cleared ? 'rgba(57,255,20,0.05)' : 'rgba(13,24,48,0.45)',
                border: `1px solid ${cleared ? 'rgba(57,255,20,0.25)' : 'rgba(255,255,255,0.07)'}`,
                opacity: cleared ? 0.65 : 1,
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11.5, flexShrink: 0, width: 12, textAlign: 'center',
                  color: cleared ? '#39ff14' : GOLD }}>
                  {cleared ? '✓' : '◈'}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font)', fontSize: 11.5,
                  fontWeight: 800, letterSpacing: '0.06em',
                  color: cleared ? 'rgba(148,163,184,0.6)' : GOLD,
                  textDecoration: cleared ? 'line-through' : 'none' }}>
                  {tr(p.quest.title, p.quest.ru)}
                </span>
<span style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: DIM, flexShrink: 0,
                  width: 34, textAlign: 'right' }}>
                  {p.have}/{p.need}
                </span>
                <span style={{ fontFamily: 'var(--font)', fontSize: 11, color: `${GOLD}70`, flexShrink: 0,
                  width: 34, textAlign: 'right' }}>
                  +{p.quest.xp}
                </span>
              </div>

              {!cleared && (
                <>
                  <p style={{ fontFamily: 'var(--font)', fontSize: 10, lineHeight: 1.6, marginTop: 5,
                    marginLeft: 20, color: 'rgba(215,232,248,0.72)' }}>
                    {tr(p.quest.brief, p.quest.briefRu)}
                  </p>
                  <p style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 800,
                    letterSpacing: '0.12em', color: GOLD, marginTop: 6, marginLeft: 20 }}>
                    {tr(cta.en, cta.ru)} →
                  </p>
                </>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── A quest clearing, made impossible to miss ────────────────────────────────

function QuestCleared({ quest }: { quest: Quest }) {
  return (
    <div style={{
      position: 'absolute', inset: -1, zIndex: 5, borderRadius: 10,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 4, padding: '14px 16px', textAlign: 'center',
      background: 'radial-gradient(ellipse at 50% 50%, rgba(255,215,0,0.18), rgba(6,14,26,0.97) 72%)',
      border: `1px solid ${GOLD}`, boxShadow: `0 0 30px ${GOLD}45, inset 0 0 40px ${GOLD}12`,
      animation: 'fadeIn 0.25s ease',
    }}>
      <span style={{ fontSize: 20, animation: 'pulse 1.1s ease-in-out infinite',
        filter: `drop-shadow(0 0 10px ${GOLD})` }}>⚑</span>
      <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.24em',
        color: `${GOLD}c0`, animation: 'slideUp 0.3s ease' }}>
        {tr('OBJECTIVE CLEARED', 'ЗАДАЧА ВЫПОЛНЕНА')}
      </p>
      <p style={{ fontFamily: 'var(--font)', fontSize: 15.5, fontWeight: 900, letterSpacing: '0.08em',
        color: GOLD, textShadow: `0 0 16px ${GOLD}80`, animation: 'slideUp 0.36s ease' }}>
        {tr(quest.title, quest.ru)}
      </p>
      <p style={{ fontFamily: 'var(--font)', fontSize: 17.5, fontWeight: 900, color: '#ffe98a',
        textShadow: `0 0 18px ${GOLD}`, marginTop: 2, animation: 'slideUp 0.44s ease' }}>
        +{quest.xp} XP
      </p>
    </div>
  )
}
