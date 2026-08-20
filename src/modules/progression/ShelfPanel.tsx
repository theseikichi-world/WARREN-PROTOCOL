import { useState } from 'react'
import { t as tr } from '../../i18n'
import { loadLogState } from '../log/store'
import { loadProgression, saveProgression, syncChain } from './store'
import {
  PRESSURE_COLOR, PRESSURE_LABEL, KIND_LABEL, KIND_DEST,
  type Candidate, type DreamRead,
} from './spine'
import { shelfContext, deployState, applyToGoal, deployToDay, blockText } from './shelf'
import type { Goal } from './types'

// ─── THE SHELF — everything the read found, in the place the goal lives ───────
// This used to be a second panel on the dream card, behind a second button. The
// operator's objection was the right one: writing a dream and planning a goal
// were one intention split across two screens and three presses. PATHFINDER is
// the inbox — you write there. PROMOTE runs the read, the forge shapes the
// routines, and everything the protocol could not hold ends up HERE, next to
// the tree it serves.
//
// A protocol takes routines and nothing else. The rest of what a goal needs —
// the bookings, the gear, the basics it stands on, the datable proofs — has
// nowhere in a tech tree and is exactly what used to evaporate. It waits here
// and is deployed on your say-so, never automatically.

const KIND_COLOR: Record<Candidate['kind'], string> = {
  routine: '#00f5ff',   // the protocol's colour — this one is scored
  task:    '#00b4ff',   // ORBIT
  basic:   '#7dd3a0',   // life support
  proof:   '#ffd700',   // a breach
}

function ShelfRow({ c, deploy, accent, onDeploy }: {
  c:        Candidate
  deploy:   ReturnType<typeof deployState>
  accent:   string
  onDeploy: () => void
}) {
  const done    = deploy.kind === 'done'
  const blocked = deploy.kind === 'blocked'
  const dest    = KIND_DEST[c.kind]
  const block   = deploy.kind === 'blocked' ? blockText(deploy.reason) : null

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0',
      opacity: done ? 0.45 : blocked ? 0.62 : 1, transition: 'opacity 0.2s' }}>
      <button
        onClick={onDeploy}
        disabled={done || blocked}
        title={done ? tr('Deployed', 'Развёрнуто') : blocked ? '' : `→ ${tr(dest.en, dest.ru)}`}
        style={{
          width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1,
          cursor: done || blocked ? 'default' : 'pointer',
          border: `1.5px solid ${done ? `${accent}30` : blocked ? 'rgba(148,163,184,0.25)' : `${accent}60`}`,
          background: done ? `${accent}12` : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12.5, color: done ? accent : blocked ? 'rgba(148,163,184,0.4)' : `${accent}80`,
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (!done && !blocked) e.currentTarget.style.background = `${accent}12` }}
        onMouseLeave={e => { if (!done && !blocked) e.currentTarget.style.background = 'transparent' }}
      >{done ? '✓' : blocked ? '⊘' : '+'}</button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <p style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font)', fontSize: 11.5,
            color: done ? 'rgba(148,163,184,0.35)' : 'rgba(230,242,255,0.88)', letterSpacing: '0.02em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            textDecoration: done ? 'line-through' : 'none' }}>{c.title}</p>
          <span style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 700,
            color: KIND_COLOR[c.kind], letterSpacing: '0.1em', flexShrink: 0,
            padding: '1px 5px', borderRadius: 3,
            border: `1px solid ${KIND_COLOR[c.kind]}30`, background: `${KIND_COLOR[c.kind]}08` }}>
            {KIND_LABEL[c.kind]}
          </span>
        </div>

        {/* Where it goes, said before it is pressed. A deploy that surprises you
            is the bug this whole panel exists to stop. */}
        <p style={{ fontFamily: 'var(--font)', fontSize: 11, marginTop: 2, lineHeight: 1.5,
          letterSpacing: '0.04em',
          color: block ? 'rgba(255,107,0,0.75)' : 'rgba(148,163,184,0.45)' }}>
          {block ? `⊘ ${tr(block.en, block.ru)}` : `→ ${tr(dest.en, dest.ru)}`}
        </p>

        {c.why && !done && (
          <p style={{ fontFamily: 'var(--font)', fontSize: 11, marginTop: 2, lineHeight: 1.55,
            color: 'rgba(200,215,240,0.42)', fontStyle: 'italic' }}>{c.why}</p>
        )}
        {(c.kind === 'routine' || c.kind === 'basic') && c.cue && !done && (
          <p style={{ fontFamily: 'var(--font)', fontSize: 11, marginTop: 2,
            color: `${accent}55`, letterSpacing: '0.04em' }}>⌁ {c.cue}</p>
        )}
      </div>
    </div>
  )
}

/** The read behind a goal, if the dream it came from still holds one. */
function readForGoal(goal: Goal): { read: DreamRead; dreamId: string; dreamTitle: string } | null {
  if (!goal.sourceDreamId) return null
  const dream = loadLogState().dreams.find(d => d.id === goal.sourceDreamId)
  return dream?.read ? { read: dream.read, dreamId: dream.id, dreamTitle: dream.title } : null
}

export function ShelfPanel({ goal, accent, onChanged }: {
  goal:      Goal
  accent:    string
  /** Deploys write outside this component; the screen re-reads on this. */
  onChanged: () => void
}) {
  const [tick, setTick] = useState(0)
  const found = readForGoal(goal)
  if (!found) return null
  const { read, dreamId, dreamTitle } = found

  const ctx = shelfContext(dreamId, goal)

  const deploy = (c: Candidate) => {
    if (c.kind === 'routine' || c.kind === 'proof') {
      // Read the uplink fresh rather than folding into the one captured at
      // render: two deploys inside a single frame both applied to the same
      // snapshot, and the second silently discarded the first.
      const s    = loadProgression()
      const live = s.goals.find(g => g.id === goal.id)
      if (!live) return
      const next = applyToGoal(live, c)
      if (!next) return
      saveProgression(syncChain({ ...s, goals: s.goals.map(g => g.id === next.id ? next : g) }))
    } else {
      deployToDay(c, ctx, dreamTitle)
    }
    window.dispatchEvent(new CustomEvent('warren:sync', { detail: { source: 'shelf' } }))
    setTick(t => t + 1)
    onChanged()
  }

  const open = read.shelf.filter(c => deployState(c, ctx).kind === 'ready').length

  return (
    <div key={tick} style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 800,
          color: `${accent}90`, letterSpacing: '0.2em' }}>{tr('THE SHELF', 'ПОЛКА')}</p>
        <span style={{ flex: 1, height: 1, background: `${accent}18` }} />
        <span style={{ fontFamily: 'var(--font)', fontSize: 11, color: 'rgba(148,163,184,0.5)',
          letterSpacing: '0.1em' }}>
          {open} {tr('READY', 'ГОТОВО')} · {read.shelf.length}
        </span>
      </div>

      {read.verdict && (
        <p style={{ fontFamily: 'var(--font)', fontSize: 11, lineHeight: 1.7,
          color: 'rgba(200,215,240,0.55)', fontStyle: 'italic',
          borderLeft: `2px solid ${accent}30`, paddingLeft: 8, marginBottom: 10 }}>
          {read.verdict}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {read.acts.map((act, ai) => {
          const pColor = PRESSURE_COLOR[act.pressure]
          const mine   = read.shelf.filter(c => c.act === act.key)
          const states = mine.map(c => deployState(c, ctx))
          const done   = states.filter(s => s.kind === 'done').length

          return (
            <div key={act.key} style={{
              borderRadius: 8, overflow: 'hidden',
              background: 'rgba(8,16,28,0.45)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderLeft: `2px solid ${pColor}`,
            }}>
              <div style={{ padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 8,
                borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: pColor,
                  boxShadow: `0 0 5px ${pColor}`, flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 900,
                  color: 'rgba(148,163,184,0.5)', letterSpacing: '0.14em', flexShrink: 0 }}>
                  {String(ai + 1).padStart(2, '0')}
                </span>
                <p style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font)', fontSize: 11.5,
                  fontWeight: 700, color: 'rgba(230,242,255,0.88)', letterSpacing: '0.06em',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{act.title}</p>
                <span style={{ fontFamily: 'var(--font)', fontSize: 11, color: pColor,
                  fontWeight: 700, letterSpacing: '0.1em', flexShrink: 0 }}>
                  {PRESSURE_LABEL[act.pressure]}
                </span>
                {mine.length > 0 && (
                  <span style={{ fontFamily: 'var(--font)', fontSize: 11,
                    color: 'rgba(148,163,184,0.45)', flexShrink: 0 }}>{done}/{mine.length}</span>
                )}
              </div>

              {(act.intent || act.boss) && (
                <div style={{ padding: '6px 10px 0' }}>
                  {act.intent && (
                    <p style={{ fontFamily: 'var(--font)', fontSize: 11, lineHeight: 1.55,
                      color: 'rgba(200,215,240,0.45)' }}>{act.intent}</p>
                  )}
                  {act.boss && (
                    <p style={{ fontFamily: 'var(--font)', fontSize: 11, marginTop: 3,
                      color: 'rgba(255,215,0,0.6)', letterSpacing: '0.05em' }}>⚑ {act.boss}</p>
                  )}
                </div>
              )}

              <div style={{ padding: '2px 10px 6px' }}>
                {mine.length === 0 && (
                  <p style={{ fontFamily: 'var(--font)', fontSize: 11, padding: '6px 0',
                    color: 'rgba(148,163,184,0.35)', letterSpacing: '0.06em' }}>
                    ⊘ {tr('nothing to deploy yet — this act is written when you reach it',
                          'пока нечего разворачивать — акт пишется, когда вы дойдёте')}
                  </p>
                )}
                {mine.map((c, i) => (
                  <ShelfRow key={c.key} c={c} deploy={states[i]} accent={accent}
                    onDeploy={() => deploy(c)} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
