import { thisWeekDates, weeklyDoneSet, calcStreak, firstActiveDate, todayKey, type Task } from '../scrap7/types'
import { t as tr, plural } from '../../i18n'
import { upkeep, nextUpkeep } from './xp'

// ─── ON TRACK — the week behind you, on the hub ───────────────────────────────
// This used to sit above ORBIT's task list, which was the wrong room: that
// screen is for working through what's left, and a streak there reads as
// pressure. The hub is where you look to see where you stand, so it lives here
// now, next to everything else that answers "how am I doing".
//
// It counts a day where you did ANYTHING the app tracks — a routine, a basic, a
// task. Deliberately the most forgiving number in the app: it is the one that
// says you showed up, not the one that says you did enough.

const NEON = '#00b4ff'

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export function WeekStrip({ tasks }: { tasks: Task[] }) {
  const weekDates = thisWeekDates()
  const doneSet   = weeklyDoneSet(tasks)
  const streak    = calcStreak(tasks)
  const todayStr  = todayKey()
  const doneCnt   = weekDates.filter(d => doneSet.has(d)).length
  // Before your first tracked day there is nothing to have missed.
  const since     = firstActiveDate(tasks)
  // What the streak is currently worth, and what the next band would pay. The
  // number used to be decoration; it multiplies every award now — see `upkeep`.
  const mult      = upkeep(streak)
  const next      = nextUpkeep(streak)
  const live      = streak > 0

  return (
    <div style={{ padding: '10px 13px', borderRadius: 10, marginBottom: 16,
      background: 'rgba(13,24,48,0.5)', border: '1px solid rgba(255,255,255,0.05)',
      display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font)', fontSize: 20, fontWeight: 900,
          color: live ? '#ff6b00' : 'rgba(148,163,184,0.3)',
          textShadow: live ? '0 0 12px #ff6b0070' : 'none', lineHeight: 1 }}>{streak}</span>
        <span style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-2xs)',
          color: 'rgba(148,163,184,0.35)', letterSpacing: '0.06em' }}>
          {tr('UPTIME', `${plural(streak, 'день', 'дня', 'дней')} подряд`)}
        </span>
        {/* The bonus, or the one you are next in line for. At zero it says the
            cheapest true thing: the multiplier is back to nothing, and three
            days would change that. A streak with no consequence was decoration. */}
        {mult > 1 ? (
          <span title={tr('Multiplies everything you earn', 'Умножает всё, что вы зарабатываете')}
            style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-2xs)', fontWeight: 800,
              letterSpacing: '0.06em', color: '#ff6b00',
              padding: '1px 5px', borderRadius: 3,
              border: '1px solid rgba(255,107,0,0.35)', background: 'rgba(255,107,0,0.1)' }}>
            ×{mult.toFixed(2)}
          </span>
        ) : next && (
          <span className="weekstrip-count" style={{ fontFamily: 'var(--font)',
            fontSize: 'var(--fs-2xs)', color: 'rgba(148,163,184,0.3)', letterSpacing: '0.05em' }}>
            ×1.00 · {next.days}{tr('d', 'д')} → ×{next.mult.toFixed(2)}
          </span>
        )}
        {live && <span style={{ fontSize: 16.5 }}>🔥</span>}
      </div>
      {/* The seven cells share whatever is left rather than each demanding 24px.
          Fixed widths meant the row needed 192px come what may, and once the
          streak went above zero the flame pushed the last day past the card. */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 4, alignItems: 'center' }}>
        {weekDates.map((date, i) => {
          const done    = doneSet.has(date)
          const isToday = date === todayStr
          // A miss is a day you were here for and did nothing. A day before you
          // started is blank — the difference is the whole point of the strip.
          const missed  = date < todayStr && since !== null && date >= since && !done
          const isPast  = date < todayStr
          return (
            <div key={date} style={{ flex: '1 1 0', minWidth: 0, maxWidth: 24,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{
                width: '100%', aspectRatio: '1', borderRadius: 6,
                background: done ? `${NEON}25` : isToday ? 'rgba(255,255,255,0.06)' : 'transparent',
                border: `1px solid ${done ? NEON
                  : isToday ? 'rgba(255,255,255,0.15)'
                  : missed  ? 'rgba(255,0,51,0.22)'
                  : 'rgba(255,255,255,0.04)'}`,
                opacity: !done && !isToday && !missed && isPast ? 0.45 : 1,
                boxShadow: done ? `0 0 6px ${NEON}40` : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
              }}>
                {done && <div style={{ width: 8, height: 8, borderRadius: 3, background: NEON, boxShadow: `0 0 4px ${NEON}` }} />}
                {missed && <div style={{ width: 4, height: 4, borderRadius: 2, background: 'rgba(255,0,51,0.45)' }} />}
              </div>
              <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, letterSpacing: '0.04em',
                color: isToday ? NEON : done ? `${NEON}70` : 'rgba(148,163,184,0.22)',
                fontWeight: isToday ? 700 : 400 }}>{DAY_LABELS[i]}</span>
            </div>
          )
        })}
      </div>
      {/* Hidden on a phone (see index.css). The row needs ~376px to lay out and
          a 393px screen does not have it once the padding is paid; this is the
          part that says least, because the seven dots to its left already say
          it. */}
      <span className="weekstrip-count" style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-2xs)',
        color: doneCnt === 7 ? '#39ff14' : `${NEON}55`, flexShrink: 0 }}>{doneCnt}/7</span>
    </div>
  )
}
