import { useEffect, useState } from 'react'
import { t as tr } from '../../i18n'
import { levelReward, rewardIsBare } from './xp'

// ─── LEVEL REACHED ────────────────────────────────────────────────────────────
// The same shape as the arrival, on purpose: a full-screen beat, typed in, that
// the app earns by using it rarely. A level-up that slid past as a toast was the
// single least legible moment in the loop — you had done a stage of real work
// and the app whispered a number at you.
//
// It says what CHANGED, not "well done". Capacity opened, the floor widened, the
// quests that just became reachable. Rewards inform; that rule holds even here,
// which is why nothing on this screen congratulates you for showing up.

const CYAN = '#00f5ff'
const GOLD = '#ffd700'
const DIM  = 'rgba(148,163,184,0.5)'

export function LevelUp({ level, onDone }: { level: number; onDone: () => void }) {
  const reward = levelReward(level)
  const [shown, setShown] = useState(0)   // how many reward lines have landed

  const lines = [
    ...reward.gates.map(g => ({ icon: '⊕', en: tr(g.label, g.ru), tone: CYAN })),
    ...(reward.slots !== null
      ? [{ icon: '🫀', en: tr(`Life support widens to ${reward.slots} slots`,
                             `Жизнеобеспечение расширено до ${reward.slots} слотов`), tone: '#4ade80' }]
      : []),
    ...reward.quests.map(q => ({ icon: '⚑', en: tr(q.title, q.ru), tone: GOLD })),
  ]

  // Land them one at a time so the eye has somewhere to go
  useEffect(() => {
    if (shown >= lines.length) return
    const id = setTimeout(() => setShown(n => n + 1), 260)
    return () => clearTimeout(id)
  }, [shown, lines.length])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 92,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '30px 24px',
      background: 'radial-gradient(ellipse at 50% 42%, rgba(0,70,90,0.32), rgba(1,4,9,0.99) 70%)',
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5,
        background: 'repeating-linear-gradient(0deg, rgba(0,245,255,0.035) 0px, rgba(0,245,255,0.035) 1px, transparent 1px, transparent 3px)' }} />

      <div style={{ position: 'relative', width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 8, fontWeight: 800, letterSpacing: '0.26em',
          color: `${CYAN}70`, animation: 'fadeIn 0.4s ease' }}>
          {tr('THRESHOLD CROSSED', 'ПОРОГ ПРОЙДЕН')}
        </p>

        <p style={{ fontFamily: 'var(--font)', fontSize: 58, fontWeight: 900, lineHeight: 1,
          color: CYAN, textShadow: `0 0 30px ${CYAN}90, 0 0 60px ${CYAN}40`,
          margin: '10px 0 2px', animation: 'slideUp 0.45s ease' }}>
          {level}
        </p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 800, letterSpacing: '0.28em',
          color: `${CYAN}b0` }}>{tr('LEVEL', 'УРОВЕНЬ')}</p>

        <div style={{ height: 1, margin: '18px 0', background:
          `linear-gradient(90deg, transparent, ${CYAN}55, transparent)` }} />

        {rewardIsBare(reward) ? (
          <p style={{ fontFamily: 'var(--font)', fontSize: 9, lineHeight: 1.7, color: 'rgba(200,222,240,0.72)' }}>
            {tr('No new capacity at this one — just a deeper record. The curve keeps going whether or not it hands you a button.',
                'Новых возможностей здесь нет — только более глубокая запись. Кривая идёт дальше, даже когда не выдаёт кнопку.')}
          </p>
        ) : (
          <>
            <p style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 800, letterSpacing: '0.2em',
              color: DIM, marginBottom: 10 }}>{tr('WHAT OPENED', 'ЧТО ОТКРЫЛОСЬ')}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {lines.slice(0, shown).map((l, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                  padding: '9px 12px', borderRadius: 8,
                  background: `${l.tone}0d`, border: `1px solid ${l.tone}35`,
                  animation: 'slideUp 0.32s ease',
                }}>
                  <span style={{ fontSize: 12, flexShrink: 0 }}>{l.icon}</span>
                  <span style={{ fontFamily: 'var(--font)', fontSize: 9.5, fontWeight: 700,
                    color: 'rgba(232,244,255,0.92)' }}>{l.en}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <button onClick={onDone} style={{
          width: '100%', marginTop: 20, padding: '11px', borderRadius: 9, cursor: 'pointer',
          fontFamily: 'var(--font)', fontSize: 10, fontWeight: 900, letterSpacing: '0.2em',
          color: '#02121a', background: `linear-gradient(135deg, ${CYAN}, ${CYAN}b0)`,
          border: 'none', boxShadow: `0 0 22px ${CYAN}50`,
        }}>{tr('CONTINUE', 'ПРОДОЛЖИТЬ')}</button>
      </div>
    </div>
  )
}
