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
    return { state, ctx }
  }, [])

  const [{ state, ctx }, setData] = useState(read)

  useEffect(() => {
    const refresh = () => { setData(read()); setTick(t => t + 1) }
    refresh()
    window.addEventListener('warren:sync', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('warren:sync', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [read])
  void tick

  const stage = stageState(state.quests, ctx)
  const lvl   = gatedLevel(state.xp, state.quests)
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
        <p style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 800, letterSpacing: '0.2em',
          color: `${GOLD}b0` }}>⚑ {tr('MAIN QUEST', 'ОСНОВНОЙ КВЕСТ')}</p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 9, color: 'rgba(230,242,255,0.85)', marginTop: 6 }}>
          {tr('The starting zone is behind you. Everything from here is your own line.',
              'Стартовая зона позади. Дальше — только ваша линия.')}
        </p>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 16, padding: '11px 13px', borderRadius: 10,
      background: `linear-gradient(140deg, ${GOLD}0e, rgba(6,14,26,0.5))`,
      border: `1px solid ${GOLD}35` }}>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 800, letterSpacing: '0.2em',
          color: `${GOLD}b0` }}>
          ⚑ {stage.stage === 1 ? tr('SETUP', 'НАСТРОЙКА') : tr('MAIN QUEST', 'ОСНОВНОЙ КВЕСТ')}
        </span>
        <span style={{ fontFamily: 'var(--font)', fontSize: 7, color: DIM }}>
          {tr('STAGE', 'ЭТАП')} {stage.stage}/{LAST_GATED_STAGE}
        </span>
        <span style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700, color: `${GOLD}c0`,
          marginLeft: 'auto' }}>{stage.cleared}/{stage.total}</span>
      </div>

      {/* What the stage is holding — stated, never implied by a stuck bar */}
      <p style={{ fontFamily: 'var(--font)', fontSize: 8, lineHeight: 1.6, marginTop: 6,
        color: lvl.capped ? `${GOLD}c0` : 'rgba(200,220,240,0.6)' }}>
        {lvl.capped
          ? tr(`Level ${lvl.level + 1} is held until this stage is clear — ${stage.total - stage.cleared} left. XP alone does not advance you.`,
               `Уровень ${lvl.level + 1} закрыт, пока этап не пройден — осталось ${stage.total - stage.cleared}. Один опыт не продвигает.`)
          : tr(`Finish all ${stage.total} to reach level ${lvl.level + 1}.`,
               `Пройдите все ${stage.total}, чтобы достичь уровня ${lvl.level + 1}.`)}
      </p>

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
                <span style={{ fontSize: 9, flexShrink: 0, color: cleared ? '#39ff14' : GOLD }}>
                  {cleared ? '✓' : '◈'}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font)', fontSize: 9,
                  fontWeight: 800, letterSpacing: '0.06em',
                  color: cleared ? 'rgba(148,163,184,0.6)' : GOLD,
                  textDecoration: cleared ? 'line-through' : 'none' }}>
                  {tr(p.quest.title, p.quest.ru)}
                </span>
                <span style={{ fontFamily: 'var(--font)', fontSize: 7, color: DIM, flexShrink: 0 }}>
                  {p.have}/{p.need}
                </span>
                <span style={{ fontFamily: 'var(--font)', fontSize: 6.5, color: `${GOLD}70`, flexShrink: 0 }}>
                  +{p.quest.xp}
                </span>
              </div>

              {!cleared && (
                <>
                  <p style={{ fontFamily: 'var(--font)', fontSize: 7.5, lineHeight: 1.6, marginTop: 5,
                    color: 'rgba(215,232,248,0.72)' }}>
                    {tr(p.quest.brief, p.quest.briefRu)}
                  </p>
                  <p style={{ fontFamily: 'var(--font)', fontSize: 7.5, fontWeight: 800,
                    letterSpacing: '0.12em', color: GOLD, marginTop: 6 }}>
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
