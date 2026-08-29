import { useState } from 'react'
import { t as tr } from './i18n'
import { type Settings } from './settings'
import { chronotype, sleepDuration, CHRONOTYPE_LABEL, type Gender } from './profile'

// ─── FIRST CONTACT — four questions, once ─────────────────────────────────────
// This used to be a quest ("identify yourself"), which was the wrong shape: a
// quest is something you do inside a working app, and none of this app works
// properly until it knows whose day it is measuring.
//
// The hours are the point. Every routine in every chain gets anchored to a cue,
// and "after morning coffee" is a fine anchor for someone who wakes at 06:30 and
// useless for someone who wakes at 11. A chain built on the wrong clock fails
// for a reason that has nothing to do with willpower.

const CYAN = '#00f5ff'
const DIM  = 'rgba(148,163,184,0.55)'

const GENDERS: { value: Gender; en: string; ru: string }[] = [
  { value: 'male',   en: 'MALE',   ru: 'МУЖСКОЙ' },
  { value: 'female', en: 'FEMALE', ru: 'ЖЕНСКИЙ' },
  { value: 'other',  en: 'OTHER',  ru: 'ДРУГОЕ' },
]

const field: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: 'rgba(2,8,16,0.8)', border: `1px solid ${CYAN}30`,
  fontFamily: 'var(--font)', fontSize: 14.5, color: 'rgba(230,242,255,0.95)',
  letterSpacing: '0.06em', outline: 'none', boxSizing: 'border-box',
}

const label: React.CSSProperties = {
  fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 800,
  letterSpacing: '0.2em', color: `${CYAN}80`, marginBottom: 7,
}

export function Onboarding({ settings, onDone }: {
  settings: Settings
  onDone: (patch: Partial<Settings>) => void
}) {
  const [name,  setName]  = useState(settings.displayName)
  const [gender, setGender] = useState<Gender>(settings.gender)
  const [wake,  setWake]  = useState(settings.wakeTime  || '07:00')
  const [sleep, setSleep] = useState(settings.sleepTime || '23:00')

  const type  = chronotype(sleep, wake)
  const hours = sleepDuration(sleep, wake)
  const ready = name.trim().length > 0

  const chip = (on: boolean): React.CSSProperties => ({
    flex: 1, padding: '8px 6px', borderRadius: 7, cursor: 'pointer',
    fontFamily: 'var(--font)', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em',
    color: on ? '#02121a' : DIM,
    background: on ? CYAN : 'transparent',
    border: `1px solid ${on ? CYAN : 'rgba(255,255,255,0.12)'}`,
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 95, overflowY: 'auto',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px 22px',
      paddingTop: 'calc(28px + var(--sa-top))', paddingBottom: 'calc(28px + var(--sa-bottom))',
      background: 'radial-gradient(ellipse at 50% 40%, rgba(0,60,80,0.3), rgba(1,4,9,0.99) 70%)',
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5,
        background: 'repeating-linear-gradient(0deg, rgba(0,245,255,0.03) 0px, rgba(0,245,255,0.03) 1px, transparent 1px, transparent 3px)' }} />

      <div style={{ position: 'relative', width: '100%', maxWidth: 380 }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.24em',
          color: `${CYAN}70` }}>{tr('FIRST CONTACT', 'ПЕРВЫЙ КОНТАКТ')}</p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 17.5, fontWeight: 900, letterSpacing: '0.08em',
          color: CYAN, textShadow: `0 0 14px ${CYAN}60`, marginTop: 5 }}>
          {tr('WHO IS THIS FOR?', 'ДЛЯ КОГО ЭТО?')}
        </p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 11, lineHeight: 1.7, color: 'rgba(200,222,240,0.7)',
          marginTop: 8 }}>
          {tr('Four questions, once. Everything here is measured off one specific person, and the hours decide where your routines can actually sit.',
              'Четыре вопроса, один раз. Всё здесь измеряет одного конкретного человека, а часы решают, куда вообще можно поставить рутины.')}
        </p>

        <div style={{ marginTop: 20 }}>
          <p style={label}>{tr('NAME', 'ИМЯ')}</p>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={32} autoFocus
            placeholder={tr('what should it call you?', 'как к вам обращаться?')} style={field} />
        </div>

        <div style={{ marginTop: 16 }}>
          <p style={label}>{tr('GENDER', 'ПОЛ')}</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {GENDERS.map(g => (
              <button key={g.value} onClick={() => setGender(gender === g.value ? '' : g.value)}
                style={chip(gender === g.value)}>{tr(g.en, g.ru)}</button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <p style={label}>{tr('I WAKE AT', 'ПОДЪЁМ В')}</p>
            <input type="time" value={wake} onChange={e => setWake(e.target.value)} style={field} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={label}>{tr('I SLEEP AT', 'ОТБОЙ В')}</p>
            <input type="time" value={sleep} onChange={e => setSleep(e.target.value)} style={field} />
          </div>
        </div>

        {/* The reading, live — it's the reason the question is being asked */}
        <div style={{ marginTop: 14, padding: '11px 13px', borderRadius: 9,
          background: `${CYAN}0a`, border: `1px solid ${CYAN}28` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font)', fontSize: 12.5, fontWeight: 900,
              letterSpacing: '0.14em', color: CYAN }}>
              {tr(CHRONOTYPE_LABEL[type].en, CHRONOTYPE_LABEL[type].ru)}
            </span>
            {hours !== null && (
              <span style={{ fontFamily: 'var(--font)', fontSize: 10.5, color: DIM, marginLeft: 'auto' }}>
                {Math.round(hours / 6) / 10}{tr('h in bed', 'ч в постели')}
              </span>
            )}
          </div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, lineHeight: 1.6, color: 'rgba(200,222,240,0.7)',
            marginTop: 5 }}>
            {tr(CHRONOTYPE_LABEL[type].note, CHRONOTYPE_LABEL[type].noteRu)}
          </p>
        </div>

        <button
          onClick={() => ready && onDone({
            displayName: name.trim(), gender, wakeTime: wake, sleepTime: sleep,
            onboardedAt: new Date().toISOString(),
          })}
          disabled={!ready}
          style={{
            width: '100%', marginTop: 18, padding: '11px', borderRadius: 9,
            cursor: ready ? 'pointer' : 'default',
            fontFamily: 'var(--font)', fontSize: 12.5, fontWeight: 900, letterSpacing: '0.2em',
            color: ready ? '#02121a' : 'rgba(148,163,184,0.35)',
            background: ready ? `linear-gradient(135deg, ${CYAN}, ${CYAN}b0)` : 'transparent',
            border: `1px solid ${ready ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
            boxShadow: ready ? `0 0 20px ${CYAN}45` : 'none',
          }}>
          {ready ? tr('BEGIN', 'НАЧАТЬ') : tr('YOUR NAME FIRST', 'СНАЧАЛА ИМЯ')}
        </button>

        <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: 'rgba(148,163,184,0.35)',
          textAlign: 'center', marginTop: 9, lineHeight: 1.6 }}>
          {tr('All of it stays on this machine, and all of it is editable later in Settings.',
              'Всё остаётся на этой машине и в любой момент правится в настройках.')}
        </p>
      </div>
    </div>
  )
}
