import { t as tr } from '../../i18n'
import { getHabitTier, type Task } from '../scrap7/types'
import { nodeScore, isUnlocked, unlockRequirements, chapterState } from './chain'
import { TIER_META, estimateDays, type ChainNode, type Goal } from './types'

const DIM  = 'rgba(148,163,184,0.55)'
const GOLD = '#ffd700'

// ─── PROTOCOL — the chain, chapter by chapter ─────────────────────────────────
// A locked routine states its condition and the live reading against it. An
// empty 0/100 bar on something you cannot act on reads as failure; a stated
// requirement reads as a door.

export function RoutineList({ goal, tasks, accent }: {
  goal:   Goal
  tasks:  Task[]
  accent: string
}) {
  const frozen = goal.slot === 'archived'

  return (
    <div style={{ opacity: frozen ? 0.65 : 1 }}>
      {goal.chapters.map(ch => {
        const st    = chapterState(ch, goal, tasks)
        const nodes = ch.nodeIds
          .map(id => goal.nodes.find(n => n.id === id))
          .filter((n): n is ChainNode => !!n)

        return (
          <div key={ch.index} style={{ marginBottom: 16 }}>
            {/* Chapter header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 800,
                color: `${accent}70`, letterSpacing: '0.18em' }}>
                {tr('CH', 'ГЛ')}{ch.index}
              </span>
              <span style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 700,
                color: 'rgba(220,235,250,0.8)', letterSpacing: '0.06em' }}>{ch.title}</span>
              <span style={{ fontFamily: 'var(--font)', fontSize: 7, color: DIM, marginLeft: 'auto' }}>
                {st.atThreshold}/{st.total} @ {st.minScore.toFixed(2)}
              </span>
            </div>

            {/* Routines */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {nodes.map(n => (
                <Routine key={n.id} node={n} goal={goal} tasks={tasks} accent={accent} frozen={frozen} />
              ))}
            </div>

            {/* Breach — only where a real, datable event exists */}
            {ch.boss && (
              <div style={{
                marginTop: 6, padding: '8px 11px', borderRadius: 8,
                background: st.breachReady ? 'rgba(255,215,0,0.07)' : 'rgba(13,24,48,0.4)',
                border: `1px solid ${st.breachReady ? `${GOLD}45` : 'rgba(255,255,255,0.06)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10 }}>{ch.boss.completedAt ? '✓' : st.breachReady ? '⚑' : '⚑'}</span>
                  <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font)', fontSize: 8.5,
                    fontWeight: 700, letterSpacing: '0.04em',
                    color: st.breachReady ? GOLD : 'rgba(148,163,184,0.6)',
                    textDecoration: ch.boss.completedAt ? 'line-through' : 'none' }}>
                    {tr('BREACH', 'ПРОРЫВ')}: {ch.boss.title}
                  </span>
                </div>
                <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: DIM, marginTop: 4 }}>
                  {ch.boss.completedAt
                    ? tr('cleared', 'пройдено')
                    : st.breachReady
                      ? tr('every routine is at threshold — this is now a date to pick',
                           'все рутины на пороге — осталось назначить дату')
                      : `${tr('opens when all', 'откроется, когда все')} ${st.total} ${tr('routines reach', 'рутин достигнут')} ${st.minScore.toFixed(2)}`}
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Routine({ node, goal, tasks, accent, frozen }: {
  node:   ChainNode
  goal:   Goal
  tasks:  Task[]
  accent: string
  frozen: boolean
}) {
  const open  = isUnlocked(node)
  const task  = tasks.find(t => t.id === node.scrapTaskId)
  const score = nodeScore(node, tasks)
  const tier  = TIER_META[node.tier]

  // Not yet instantiated: open, but the secondary uplink is already carrying its
  // limit of active routines. Say so rather than showing a dead zero.
  const waiting = open && !node.scrapTaskId

  return (
    <div style={{
      padding: '9px 11px', borderRadius: 8,
      background: open ? `${accent}09` : 'rgba(13,24,48,0.35)',
      border: `1px solid ${open ? `${accent}22` : 'rgba(255,255,255,0.05)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 9, flexShrink: 0, color: open ? accent : 'rgba(148,163,184,0.4)' }}>
          {open ? '◇' : '🔒'}
        </span>
        <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font)', fontSize: 10, fontWeight: 700,
          color: open ? 'rgba(230,242,255,0.92)' : 'rgba(148,163,184,0.6)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.title}
        </span>
        <span title={tier.profile} style={{ fontFamily: 'var(--font)', fontSize: 6.5, fontWeight: 700,
          letterSpacing: '0.08em', flexShrink: 0, color: `${accent}90`,
          padding: '2px 6px', borderRadius: 4, border: `1px solid ${accent}25` }}>
          {tier.name}
        </span>
      </div>

      {/* Cue + current threshold — what you actually do */}
      <p style={{ fontFamily: 'var(--font)', fontSize: 7.5, color: DIM, marginTop: 5 }}>
        ▸ {node.cue} · {node.thresholds[node.thresholdIndex]}
      </p>

      {/* State */}
      {!open ? (
        <LockedState node={node} goal={goal} tasks={tasks} />
      ) : waiting ? (
        <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${GOLD}90`, marginTop: 6 }}>
          {tr('WAITING — the secondary uplink is carrying its limit of active routines',
              'ОЖИДАНИЕ — вторичный канал уже несёт максимум активных рутин')}
        </p>
      ) : (
        <IntegrationBar score={score} tier={node.tier} accent={accent} frozen={frozen} streak={task?.streak ?? 0} />
      )}
    </div>
  )
}

/** "REQUIRES: Reading aloud @ 0.60 — currently 0.41" */
function LockedState({ node, goal, tasks }: { node: ChainNode; goal: Goal; tasks: Task[] }) {
  const reqs = unlockRequirements(node, goal, tasks)
  return (
    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {reqs.map(r => (
        <p key={r.nodeId} style={{ fontFamily: 'var(--font)', fontSize: 7.5,
          color: r.met ? 'rgba(74,222,128,0.8)' : 'rgba(148,163,184,0.6)' }}>
          {r.met ? '✓' : '⊘'} {tr('REQUIRES', 'ТРЕБУЕТ')}: {r.title} @ {r.need.toFixed(2)}
          {' — '}
          <span style={{ color: r.met ? 'rgba(74,222,128,0.9)' : 'rgba(200,215,235,0.75)' }}>
            {tr('currently', 'сейчас')} {r.have.toFixed(2)}
          </span>
        </p>
      ))}
    </div>
  )
}

function IntegrationBar({ score, tier, accent, frozen, streak }: {
  score: number; tier: ChainNode['tier']; accent: string; frozen: boolean; streak: number
}) {
  const habitTier = getHabitTier(score)
  const days      = estimateDays(score, tier)

  return (
    <div style={{ marginTop: 7 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 900, color: habitTier.color }}>
          {score.toFixed(2)}
        </span>
        <span style={{ fontFamily: 'var(--font)', fontSize: 6.5, fontWeight: 700, letterSpacing: '0.12em',
          color: habitTier.color, textTransform: 'uppercase' }}>{habitTier.label}</span>
        {streak > 0 && (
          <span style={{ fontFamily: 'var(--font)', fontSize: 7, color: 'rgba(255,107,0,0.8)' }}>
            {streak} {tr('UPTIME', 'АПТАЙМ')}
          </span>
        )}
        <span style={{ fontFamily: 'var(--font)', fontSize: 6.5, color: DIM, marginLeft: 'auto' }}>
          {frozen
            ? tr('frozen · half decay', 'заморожено · полураспад')
            : days > 0 ? `≈${days}${tr('d to automatic', 'д до автоматизма')}` : tr('automatic', 'автоматизм')}
        </span>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.round(score * 100)}%`, borderRadius: 2,
          background: habitTier.color, boxShadow: `0 0 6px ${habitTier.color}70`,
          transition: 'width 0.5s ease' }} />
      </div>
      <div style={{ height: 3, marginTop: 2, position: 'relative' }}>
        {/* threshold marker at 0.70 */}
        <span style={{ position: 'absolute', left: '70%', top: -1, width: 1, height: 5,
          background: `${accent}55` }} />
      </div>
    </div>
  )
}
