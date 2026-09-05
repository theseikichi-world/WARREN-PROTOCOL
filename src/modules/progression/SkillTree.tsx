import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { t as tr } from '../../i18n'
import { getHabitTier, type Task } from '../scrap7/types'
import {
  nodeScore, unlockRequirements, nodeState, chapterState, activeChapter, type NodeState,
} from './chain'
import { layoutTree, fitScale, NODE_W, NODE_H, BAND_HEAD, type Placed } from './layout'
import { TIER_META, estimateDays, THRESHOLD_UNLOCK_AT, type ChainNode, type Goal } from './types'
import { bandColor, countdown, scheduleLine } from './deadline'

const DIM  = 'rgba(148,163,184,0.55)'
const GOLD = '#ffd700'

// ─── The tech tree ────────────────────────────────────────────────────────────
// A routine is an ability. It is LOCKED until its prerequisites are integrated,
// then AVAILABLE — glowing, waiting for you to spend the decision on it. Nothing
// installs itself. Once installed it TRAINS by use, not by points, and at 0.70
// it is INTEGRATED and stops competing for a training slot.

const STATE_GLYPH: Record<NodeState, string> = {
  locked: '🔒', available: '◈', training: '◆', integrated: '✦',
}

export function SkillTree({ goal, tasks, accent, onInstall, onTrack, onClearBreach }: {
  goal:      Goal
  tasks:     Task[]
  accent:    string
  onInstall: (nodeId: string) => void
  onTrack:   (taskId: string) => void
  /** The act's real-world event happened. See `clearBreach`. */
  onClearBreach: (chapterIndex: number) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  // The live tree draws its acts as bands too — the forge and the thing it
  // commits have to look like the same object, or the preview teaches nothing.
  const { placed, edges, bands, width, height } = useMemo(
    () => layoutTree(goal.nodes, goal.chapters), [goal.nodes, goal.chapters])

  // Fit to the panel. A protocol whose widest act is five routines is ~860px,
  // and this used to sit in an overflow-x box inside a much narrower column —
  // reading your own tree began with resizing the window.
  const frame = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState(0)
  useLayoutEffect(() => { setAvail(frame.current?.clientWidth ?? 0) }, [])
  useEffect(() => {
    const el = frame.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setAvail(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const scale = fitScale(width, avail)

  const sel     = goal.nodes.find(n => n.id === selected) ?? null
  const frozen  = goal.slot === 'archived'
  const stateOf = (n: ChainNode) => nodeState(n, tasks)

  return (
    <div>
      {/* Diagram */}
      <div ref={frame} style={{ paddingBottom: 4 }}>
        {/* Scrolls only when the fit hits its readability floor — an act five
            routines wide in a very narrow window. Shrinking past that would
            trade one unusable diagram for another (rule 38). */}
        <div style={{ height: height * scale, overflowX: 'auto', overflowY: 'hidden' }}>
        <div style={{ position: 'relative', width, height, opacity: frozen ? 0.6 : 1,
          transform: `scale(${scale})`, transformOrigin: 'top left',
          margin: scale === 1 ? '0 auto' : undefined }}>
          {/* Acts, as bands. The structure was always in the data. */}
          {bands.filter(b => b.title).map(b => (
            <div key={b.index} style={{
              position: 'absolute', left: 0, top: b.y, width, height: b.height,
              borderTop: `1px solid ${b.planned ? 'rgba(148,163,184,0.16)' : `${accent}22`}`,
              pointerEvents: 'none',
            }}>
              <span style={{ position: 'absolute', top: 4, left: 0, fontFamily: 'var(--font)',
                fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
                color: b.planned ? 'rgba(148,163,184,0.45)' : `${accent}85` }}>
                {String(b.index + 1).padStart(2, '0')} {b.title.toUpperCase()}
              </span>
              {b.planned && (
                <span style={{ position: 'absolute', top: BAND_HEAD + 8, left: 0,
                  fontFamily: 'var(--font)', fontSize: 10.5, letterSpacing: '0.08em',
                  color: 'rgba(148,163,184,0.4)' }}>
                  ⊘ {tr('OPENS WHEN YOU REACH IT', 'ОТКРОЕТСЯ, КОГДА ДОЙДЁТЕ')}
                </span>
              )}
            </div>
          ))}
          {/* Connectors, drawn under the nodes */}
          <svg width={width} height={height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {edges.map(({ from, to }, i) => {
              const lit = stateOf(to.node) !== 'locked'
              const midY = (from.y + NODE_H / 2 + to.y - NODE_H / 2) / 2
              return (
                <path key={i}
                  d={`M ${from.x} ${from.y + NODE_H / 2} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.y - NODE_H / 2}`}
                  fill="none"
                  stroke={lit ? accent : 'rgba(148,163,184,0.25)'}
                  strokeWidth={lit ? 1.6 : 1}
                  strokeDasharray={lit ? undefined : '3 3'}
                  style={{ filter: lit ? `drop-shadow(0 0 3px ${accent}70)` : undefined }} />
              )
            })}
          </svg>

          {placed.map(p => (
            <TreeNode key={p.node.id} placed={p} state={stateOf(p.node)} accent={accent}
              score={nodeScore(p.node, tasks)}
              selected={selected === p.node.id}
              onSelect={() => setSelected(selected === p.node.id ? null : p.node.id)} />
          ))}
        </div>
        </div>
      </div>

      {/* Dated breaches. Outside the scaled diagram on purpose: the tree shrinks
          to fit, and a schedule warning rendered at 0.6x is a warning nobody
          reads. This is also the first place an ACT is legible as a thing — the
          band labels name them, but the middle layer was never on screen. */}
      <Breaches goal={goal} tasks={tasks} accent={accent} onClear={onClearBreach} />

      {/* Detail panel — the perk description, only when you ask for it */}
      {sel && (
        <NodeDetail node={sel} goal={goal} tasks={tasks} accent={accent} frozen={frozen}
          state={stateOf(sel)} onInstall={onInstall} onTrack={onTrack} />
      )}
      {!sel && (
        <p style={{ fontFamily: 'var(--font)', fontSize: 10, color: 'rgba(148,163,184,0.35)',
          textAlign: 'center', marginTop: 8 }}>
          {tr('select a node', 'выберите узел')}
        </p>
      )}
    </div>
  )
}

/**
 * THE BREACHES — every act that ends on a real external event.
 *
 * This used to list only the DATED ones, which quietly hid the middle layer of
 * the whole system: most breaches carry no date, so most goals showed no acts
 * at all, and the only thing on screen was a grid of routines. An act is the
 * unit a goal is actually made of, so all of them are here.
 *
 * Each row carries the three things that decide what to do next — is the
 * preparation done, how long is left, and what will not be ready in time — and
 * the one action that was missing from the app entirely.
 *
 * It reports; it never blocks. A routine that cannot mature in time is still
 * installed, still trained and still worth XP: which one to drop, and whether to
 * move the date instead, is a judgement about the goal.
 */
function Breaches({ goal, tasks, accent, onClear }: {
  goal:    Goal
  tasks:   Task[]
  accent:  string
  onClear: (chapterIndex: number) => void
}) {
  const withBoss = goal.chapters.filter(c => c.boss)
  if (withBoss.length === 0) return null

  // Every act is listed, because seeing what is coming is the point of naming
  // the whole story up front. Only the act you are IN can be cleared: act four's
  // event has not happened on day one, and offering the button there is a
  // 300-XP misclick dressed as an affordance. Same rule as writing an act.
  const current = activeChapter(goal, tasks)

  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {withBoss.map(c => {
        const boss    = c.boss!
        const cleared = boss.completedAt !== null
        const count   = boss.due ? countdown(boss.due) : null
        const late    = scheduleLine(c, goal, tasks)
        const st      = chapterState(c, goal, tasks)
        const here    = current?.index === c.index
        const color   = cleared ? GOLD : count ? bandColor(count.band) : DIM

        return (
          <div key={c.index} style={{ padding: '7px 9px', borderRadius: 8,
            background: cleared ? `${GOLD}0c` : 'rgba(8,16,28,0.45)',
            border: `1px solid ${color}2e` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 800,
                letterSpacing: '0.16em', color: `${accent}85`, flexShrink: 0 }}>
                {String(c.index).padStart(2, '0')}
              </span>
              <span style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 700,
                color: cleared ? GOLD : 'rgba(230,242,255,0.88)', flex: 1, minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                ⚑ {boss.title}
              </span>
              {count && !cleared && (
                <span style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 800,
                  letterSpacing: '0.1em', color, flexShrink: 0 }}>
                  {tr(count.en, count.ru)}
                </span>
              )}
            </div>

            {/* A cleared breach has no schedule left to miss and nothing left to
                prepare — it says what happened and when, and stops. */}
            {cleared ? (
              <p style={{ fontFamily: 'var(--font)', fontSize: 10, letterSpacing: '0.1em',
                color: GOLD, margin: '5px 0 0' }}>
                ✦ {tr('CLEARED', 'ПРОЙДЕН')} · {boss.completedAt!.slice(0, 10)}
              </p>
            ) : (
              <>
                {late && (
                  <p style={{ fontFamily: 'var(--font)', fontSize: 10, lineHeight: 1.55,
                    color: 'rgba(148,163,184,0.7)', margin: '5px 0 0' }}>
                    ⚠ {tr(late.en, late.ru)}
                  </p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 6 }}>
                  {/* Readiness informs, it does not gate — see `clearBreach`. */}
                  <span style={{ fontFamily: 'var(--font)', fontSize: 9.5, letterSpacing: '0.08em',
                    color: here && st.breachReady ? accent : 'rgba(148,163,184,0.55)',
                    flex: 1, minWidth: 0 }}>
                    {!here
                      ? tr('AHEAD OF YOU', 'ВПЕРЕДИ')
                      : st.breachReady
                        ? tr('PREPARED', 'ПОДГОТОВЛЕН')
                        : tr(`${st.atThreshold}/${st.total} routines at ${st.minScore.toFixed(2)}`,
                             `${st.atThreshold}/${st.total} рутин на ${st.minScore.toFixed(2)}`)}
                  </span>
                  {here && (
                    <button onClick={() => onClear(c.index)}
                      title={tr('mark this event as having happened', 'отметить, что событие состоялось')}
                      style={{ fontFamily: 'var(--font)', fontSize: 9.5, fontWeight: 800,
                        letterSpacing: '0.14em', padding: '4px 10px', borderRadius: 5,
                        cursor: 'pointer', flexShrink: 0, color: GOLD,
                        background: `${GOLD}12`, border: `1px solid ${GOLD}45` }}>
                      {tr('IT HAPPENED', 'ЭТО СЛУЧИЛОСЬ')}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

function TreeNode({ placed, state, accent, score, selected, onSelect }: {
  placed:   Placed
  state:    NodeState
  accent:   string
  score:    number
  selected: boolean
  onSelect: () => void
}) {
  const { node, x, y } = placed
  const locked     = state === 'locked'
  const available  = state === 'available'
  const integrated = state === 'integrated'
  const color      = integrated ? GOLD : locked ? 'rgba(148,163,184,0.45)' : accent

  return (
    <button onClick={onSelect} title={node.title}
      style={{
        position: 'absolute', left: x - NODE_W / 2, top: y - NODE_H / 2,
        width: NODE_W, height: NODE_H, borderRadius: 10, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, padding: '6px 8px', textAlign: 'center',
        background: integrated ? `${GOLD}14` : locked ? 'rgba(13,24,48,0.4)' : `${accent}12`,
        border: `1px ${locked ? 'dashed' : 'solid'} ${selected ? color : `${color}${locked ? '30' : '55'}`}`,
        boxShadow: selected ? `0 0 16px ${color}55`
          : available ? `0 0 12px ${accent}35` : 'none',
        animation: available ? 'pulse 2.6s ease-in-out infinite' : undefined,
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}>
      <span style={{ fontSize: 14.5, lineHeight: 1, filter: locked ? 'grayscale(1)' : `drop-shadow(0 0 5px ${color})` }}>
        {STATE_GLYPH[state]}
      </span>
      <span style={{
        fontFamily: 'var(--font)', fontSize: 10.5, fontWeight: 700, lineHeight: 1.25,
        color: locked ? 'rgba(148,163,184,0.6)' : 'rgba(230,242,255,0.92)',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>{node.title}</span>

      {/* Integration ring — a bar, because a bar is readable at this size */}
      {(state === 'training' || integrated) && (
        <div style={{ width: '80%', height: 2.5, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
          <div style={{ height: '100%', width: `${Math.round(score * 100)}%`, borderRadius: 2,
            background: color, boxShadow: `0 0 5px ${color}` }} />
        </div>
      )}
      {available && (
        <span style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 800, letterSpacing: '0.14em',
          color: accent }}>{tr('AVAILABLE', 'ДОСТУПНО')}</span>
      )}
    </button>
  )
}

function NodeDetail({ node, goal, tasks, accent, state, frozen, onInstall, onTrack }: {
  node:      ChainNode
  goal:      Goal
  tasks:     Task[]
  accent:    string
  state:     NodeState
  frozen:    boolean
  onInstall: (id: string) => void
  onTrack:   (taskId: string) => void
}) {
  const score = nodeScore(node, tasks)
  const task  = tasks.find(t => t.id === node.scrapTaskId)
  const tier  = TIER_META[node.tier]
  const hTier = getHabitTier(score)
  const reqs  = unlockRequirements(node, goal, tasks)
  const doneToday = (task?.todayCount ?? 0) >= (task?.target ?? 1)

  return (
    <div style={{ marginTop: 10, padding: '11px 13px', borderRadius: 10,
      background: 'rgba(6,14,26,0.6)', border: `1px solid ${accent}30` }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14.5 }}>{STATE_GLYPH[state]}</span>
        <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font)', fontSize: 13.5, fontWeight: 800,
          color: 'rgba(235,246,255,0.95)', letterSpacing: '0.04em' }}>{node.title}</span>
        <span title={tier.profile} style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.1em', color: `${accent}b0`, padding: '2px 7px', borderRadius: 4,
          border: `1px solid ${accent}30` }}>{tier.name}</span>
      </div>

      {/* What you actually do */}
      <p style={{ fontFamily: 'var(--font)', fontSize: 11, color: 'rgba(200,220,240,0.75)', marginTop: 7 }}>
        ▸ {node.cue} — <span style={{ color: accent }}>{node.thresholds[node.thresholdIndex]}</span>
      </p>

      {/* State-specific body */}
      {state === 'locked' && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {reqs.map(r => (
            <p key={r.nodeId} style={{ fontFamily: 'var(--font)', fontSize: 10.5,
              color: r.met ? 'rgba(74,222,128,0.85)' : DIM }}>
              {r.met ? '✓' : '⊘'} {r.title} @ {r.need.toFixed(2)} — {tr('now', 'сейчас')} {r.have.toFixed(2)}
            </p>
          ))}
        </div>
      )}

      {state === 'available' && (
        <>
          <p style={{ fontFamily: 'var(--font)', fontSize: 10, color: DIM, marginTop: 8, lineHeight: 1.6 }}>
            {tr(`Unlocked. Installing adds it to your daily routines — roughly ${tier.baselineDays} days to automatic at this tier.`,
                `Открыто. Установка добавит рутину в ежедневные — примерно ${tier.baselineDays} дней до автоматизма на этом тире.`)}
          </p>
          <button onClick={() => onInstall(node.id)} disabled={frozen} style={{
            width: '100%', marginTop: 9, padding: '9px', borderRadius: 8,
            cursor: frozen ? 'default' : 'pointer',
            fontFamily: 'var(--font)', fontSize: 12, fontWeight: 800, letterSpacing: '0.14em',
            color: frozen ? DIM : '#02121a',
            background: frozen ? 'transparent' : `linear-gradient(135deg, ${accent}, ${accent}b0)`,
            border: `1px solid ${accent}${frozen ? '30' : '00'}`,
            boxShadow: frozen ? 'none' : `0 0 16px ${accent}45`,
          }}>⊕ {tr('INSTALL ROUTINE', 'УСТАНОВИТЬ РУТИНУ')}</button>
        </>
      )}

      {(state === 'training' || state === 'integrated') && task && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 9 }}>
            <span style={{ fontFamily: 'var(--font)', fontSize: 15.5, fontWeight: 900, color: hTier.color }}>
              {score.toFixed(2)}
            </span>
            <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.12em',
              color: hTier.color, textTransform: 'uppercase' }}>{hTier.label}</span>
            {(task.streak ?? 0) > 0 && (
              <span style={{ fontFamily: 'var(--font)', fontSize: 10, color: 'rgba(255,107,0,0.85)' }}>
                {task.streak} {tr('STREAK', 'СЕРИЯ')}
              </span>
            )}
            <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: DIM, marginLeft: 'auto' }}>
              {frozen ? tr('frozen · half decay', 'заморожено · полураспад')
                : score >= THRESHOLD_UNLOCK_AT ? tr('automatic', 'на автомате')
                : `≈${estimateDays(score, node.tier)}${tr('d left', 'д осталось')}`}
            </span>
          </div>

          <div style={{ position: 'relative', height: 4, borderRadius: 2, marginTop: 6,
            background: 'rgba(255,255,255,0.07)' }}>
            <div style={{ height: '100%', width: `${Math.round(score * 100)}%`, borderRadius: 2,
              background: hTier.color, boxShadow: `0 0 6px ${hTier.color}80`, transition: 'width 0.5s' }} />
            <span style={{ position: 'absolute', left: '70%', top: -2, width: 1, height: 8,
              background: `${GOLD}90` }} title="0.70" />
          </div>

          <button onClick={() => onTrack(task.id)} style={{
            width: '100%', marginTop: 10, padding: '9px', borderRadius: 8, cursor: 'pointer',
            fontFamily: 'var(--font)', fontSize: 12, fontWeight: 800, letterSpacing: '0.12em',
            color: doneToday ? '#39ff14' : '#02121a',
            background: doneToday ? 'rgba(57,255,20,0.1)' : `linear-gradient(135deg, ${accent}, ${accent}b0)`,
            border: `1px solid ${doneToday ? 'rgba(57,255,20,0.4)' : 'transparent'}`,
            boxShadow: doneToday ? 'none' : `0 0 14px ${accent}40`,
          }}>
            {doneToday ? `✓ ${tr('LOGGED TODAY', 'ОТМЕЧЕНО СЕГОДНЯ')}` : `+1 ${tr('RUN IT', 'ВЫПОЛНИТЬ')}`}
          </button>
        </>
      )}
    </div>
  )
}
