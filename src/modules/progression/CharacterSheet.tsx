import { t as tr } from '../../i18n'
import type { Task } from '../scrap7/types'
import type { Goal } from './types'
import { gatedLevel, nextGate, GATES, isUnlockedAt } from './xp'
import { deriveStats, overallRating, type Stat } from './stats'
import { nodeState } from './chain'
import type { ModuleSummaries } from '../bigscreen/moduleStats'
import { LifeSupportPanel } from './LifeSupportPanel'

const CYAN = '#00f5ff'
const GOLD = '#ffd700'
const DIM  = 'rgba(148,163,184,0.5)'

// ─── The character ────────────────────────────────────────────────────────────
// Nothing on this screen can be allocated. Every number is a reading off what
// you actually did, which is the only version of an RPG sheet that stays true
// when the character is a real person.

export function CharacterSheet({ goals, tasks, xp, sums, name, quests, life }: {
  goals:  Goal[]
  tasks:  Task[]
  xp:     number
  sums:   ModuleSummaries
  name:   string
  quests: Record<string, string>
  /** Life-support handlers — the character sheet owns the habits with no tree. */
  life:   Omit<Parameters<typeof LifeSupportPanel>[0], 'tasks'>
}) {
  const lvl    = gatedLevel(xp, quests)
  const stats  = deriveStats(goals, tasks, sums)
  const rating = overallRating(stats)
  const gate   = nextGate(lvl.level)

  const live = goals.filter(g => g.slot !== 'archived')
  const installed = live.flatMap(g => g.nodes.filter(n => n.scrapTaskId))
  const available = live.flatMap(g => g.nodes.filter(n => nodeState(n, tasks) === 'available'))

  return (
    <div>
      {/* Identity + level */}
      <div style={{ padding: '14px 15px', borderRadius: 12,
        background: `linear-gradient(140deg, ${CYAN}12, rgba(6,14,26,0.5))`,
        border: `1px solid ${CYAN}30` }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.2em', color: `${CYAN}80` }}>{tr('OPERATOR', 'ОПЕРАТОР')}</p>
            <p style={{ fontFamily: 'var(--font)', fontSize: 18, fontWeight: 900, marginTop: 3,
              color: 'rgba(235,248,255,0.95)', letterSpacing: '0.08em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name || tr('UNNAMED', 'БЕЗ ИМЕНИ')}
            </p>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontFamily: 'var(--font)', fontSize: 26, fontWeight: 900, lineHeight: 1,
              color: CYAN, textShadow: `0 0 16px ${CYAN}70` }}>{lvl.level}</p>
            <p style={{ fontFamily: 'var(--font)', fontSize: 11, letterSpacing: '0.18em',
              color: `${CYAN}70`, marginTop: 3 }}>{tr('LEVEL', 'УРОВЕНЬ')}</p>
          </div>
        </div>

        {/* XP bar */}
        <div style={{ height: 5, borderRadius: 3, marginTop: 11, overflow: 'hidden',
          background: 'rgba(255,255,255,0.07)' }}>
          <div style={{ height: '100%', width: `${Math.round(lvl.progress * 100)}%`, borderRadius: 3,
            background: `linear-gradient(90deg, ${CYAN}, #7cf9ff)`,
            boxShadow: `0 0 8px ${CYAN}80`, transition: 'width 0.6s ease' }} />
        </div>
        <div style={{ display: 'flex', marginTop: 5 }}>
          <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: DIM }}>
            {lvl.capped ? tr('XP BANKED', 'ОПЫТ НАКОПЛЕН') : `${lvl.intoNext} / ${lvl.needed} XP`}
          </span>
          {gate && (
            <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: `${GOLD}90`, marginLeft: 'auto' }}>
              {tr('LV', 'УР')}{gate.level} → {tr(gate.label, gate.ru)}
            </span>
          )}
        </div>

        {/* A full bar that does nothing needs to say why. The quest gate is the
            one thing XP cannot buy past, so it is named here rather than implied. */}
        {lvl.capped && (
          <p style={{ fontFamily: 'var(--font)', fontSize: 10, lineHeight: 1.6, marginTop: 7,
            color: `${GOLD}c0` }}>
            ⊘ {tr(`LEVEL ${lvl.level + 1} HELD — ${lvl.blocking.length} objective${lvl.blocking.length === 1 ? '' : 's'} left on the hub`,
                  `УРОВЕНЬ ${lvl.level + 1} ЗАКРЫТ — осталось задач: ${lvl.blocking.length}, они на хабе`)}
          </p>
        )}
      </div>

      {/* Standing — one honest headline */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <Cell value={rating === null ? '—' : String(rating)} label={tr('STANDING', 'ПОКАЗАТЕЛЬ')} color={GOLD} />
        <Cell value={String(installed.length)} label={tr('RUNNING', 'В РАБОТЕ')} color={CYAN} />
        <Cell value={String(available.length)} label={tr('AVAILABLE', 'ДОСТУПНО')} color={available.length ? '#39ff14' : DIM} />
      </div>

      {/* Life support — the habits that answer to no goal */}
      <LifeSupportPanel tasks={tasks} {...life} />

      {/* Attributes */}
      <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 800, letterSpacing: '0.2em',
        color: DIM, margin: '18px 0 9px' }}>{tr('ATTRIBUTES', 'ХАРАКТЕРИСТИКИ')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {stats.map(s => <StatRow key={s.key} stat={s} />)}
      </div>

      {/* What levels open — the Titan Quest promise, stated plainly */}
      <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 800, letterSpacing: '0.2em',
        color: DIM, margin: '20px 0 9px' }}>{tr('MILESTONES', 'РУБЕЖИ')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {GATES.map(g => {
          const open = isUnlockedAt(g.key, lvl.level)
          return (
            <div key={g.key} style={{ display: 'flex', alignItems: 'center', gap: 9,
              padding: '7px 10px', borderRadius: 7,
              background: open ? `${CYAN}08` : 'rgba(13,24,48,0.35)',
              border: `1px solid ${open ? `${CYAN}25` : 'rgba(255,255,255,0.05)'}` }}>
              <span style={{ fontFamily: 'var(--font)', fontSize: 10.5, fontWeight: 900, width: 28,
                color: open ? CYAN : 'rgba(148,163,184,0.4)' }}>{g.level}</span>
              <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font)', fontSize: 11,
                color: open ? 'rgba(220,238,252,0.85)' : 'rgba(148,163,184,0.5)' }}>
                {tr(g.label, g.ru)}
              </span>
              <span style={{ fontSize: 10.5, color: open ? CYAN : 'rgba(148,163,184,0.35)' }}>
                {open ? '✓' : '🔒'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Cell({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div style={{ flex: 1, padding: '10px 12px', borderRadius: 10, textAlign: 'center',
      background: 'rgba(13,24,48,0.45)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p style={{ fontFamily: 'var(--font)', fontSize: 19, fontWeight: 900, color, lineHeight: 1,
        textShadow: `0 0 10px ${color}50` }}>{value}</p>
      <p style={{ fontFamily: 'var(--font)', fontSize: 11, letterSpacing: '0.14em', color: DIM,
        marginTop: 5 }}>{label}</p>
    </div>
  )
}

function StatRow({ stat }: { stat: Stat }) {
  const idle = stat.value === null
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
          color: idle ? 'rgba(148,163,184,0.4)' : stat.color, width: 128, flexShrink: 0 }}>
          {tr(stat.label, stat.ru)}
        </span>
        <span style={{ fontFamily: 'var(--font)', fontSize: 12.5, fontWeight: 900,
          color: idle ? 'rgba(148,163,184,0.35)' : stat.color, width: 34, flexShrink: 0 }}>
          {idle ? '—' : stat.value}
        </span>
        <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: 'rgba(148,163,184,0.45)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stat.detail}</span>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${idle ? 0 : stat.value}%`, borderRadius: 2,
          background: stat.color, boxShadow: `0 0 6px ${stat.color}70`, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}
