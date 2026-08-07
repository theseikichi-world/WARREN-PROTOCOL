import { useState } from 'react'
import type { Language } from './types'
import { suggestTwisters, warmupLang, EXERCISES, CORK_DRILL, type Twister } from './articulation'
import { t as tr } from '../../i18n'

const NEON     = '#00e4a0'
const NEON_DIM = 'rgba(0,228,160,0.1)'
const WINE      = '#c0392b'

function speak(text: string, lang: 'RU' | 'EN') {
  try {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang === 'RU' ? 'ru-RU' : 'en-US'
    u.rate = 0.9
    window.speechSynthesis.speak(u)
  } catch { /* TTS unavailable — silent */ }
}

/** Articulation warm-up: exercises + language-aware tongue twisters (+ cork drill). */
export default function ArticulationWorkout({ initialLang, onStartLearn, onClose }: {
  initialLang: Language
  onStartLearn?: () => void   // present when launched right before a Learn session
  onClose: () => void
}) {
  const [lang, setLang]         = useState<'RU' | 'EN'>(warmupLang(initialLang))
  const [twisters, setTwisters] = useState<Twister[]>(() => suggestTwisters(warmupLang(initialLang), 6))
  const [idx, setIdx]   = useState(0)
  const [cork, setCork] = useState(false)
  const [done, setDone] = useState<Set<number>>(new Set())

  const cur = twisters[idx] ?? twisters[0]

  const switchLang = (l: 'RU' | 'EN') => { setLang(l); setTwisters(suggestTwisters(l, 6)); setIdx(0) }
  const reshuffle  = () => { setTwisters(suggestTwisters(lang, 6)); setIdx(0) }
  const next = () => setIdx(i => (i + 1) % twisters.length)
  const prev = () => setIdx(i => (i - 1 + twisters.length) % twisters.length)

  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '8px 14px', flexShrink: 0, borderBottom: `1px solid ${NEON}14`,
        background: 'rgba(0,8,5,0.6)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onClose} style={{ fontFamily: 'var(--font)', fontSize: 13.5, color: `${NEON}60`,
          letterSpacing: '0.1em' }}>← {tr('BACK', 'НАЗАД')}</button>
        <div style={{ flex: 1 }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 12.5, fontWeight: 900, color: NEON,
            letterSpacing: '0.18em', textShadow: `0 0 10px ${NEON}` }}>🗣 {tr('ARTICULATION WARM-UP', 'РАЗМИНКА АРТИКУЛЯЦИИ')}</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11, color: `${NEON}45`, letterSpacing: '0.1em' }}>
            {tr('LOOSEN THE VOICE BEFORE YOU DRILL', 'РАЗОМНИТЕ ГОЛОС ПЕРЕД ОТРАБОТКОЙ')}
          </p>
        </div>
        {/* language toggle */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['RU', 'EN'] as const).map(l => (
            <button key={l} onClick={() => switchLang(l)} style={{
              padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 800, letterSpacing: '0.06em',
              color: lang === l ? NEON : 'rgba(148,163,184,0.4)',
              border: `1px solid ${lang === l ? `${NEON}55` : 'rgba(255,255,255,0.07)'}`,
              background: lang === l ? NEON_DIM : 'transparent' }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* ── Exercises ── */}
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 700, color: `${NEON}70`,
            letterSpacing: '0.14em', marginBottom: 7 }}>① {tr('LOOSEN UP', 'РАЗМИНКА')} · {done.size}/{EXERCISES.length}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {EXERCISES.map((ex, i) => {
              const on = done.has(i)
              return (
                <button key={ex.name} onClick={() => setDone(s => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 9, textAlign: 'left', cursor: 'pointer',
                    padding: '8px 10px', borderRadius: 8, transition: 'all 0.15s',
                    background: on ? 'rgba(0,228,160,0.06)' : 'rgba(0,12,8,0.4)',
                    border: `1px solid ${on ? `${NEON}40` : 'rgba(255,255,255,0.05)'}`, opacity: on ? 0.7 : 1 }}>
                  <span style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0, marginTop: 1,
                    border: `1.5px solid ${on ? NEON : `${NEON}45`}`, background: on ? `${NEON}22` : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, color: NEON }}>{on ? '✓' : ''}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 700,
                      color: 'rgba(225,255,245,0.9)' }}>{ex.name}
                      <span style={{ fontSize: 11.5, color: `${NEON}60`, marginLeft: 6 }}>~{ex.seconds}{tr('s', 'с')}</span></span>
                    <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, color: 'rgba(148,163,184,0.6)',
                      lineHeight: 1.5, marginTop: 2 }}>{ex.instruction}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Tongue twisters ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 7 }}>
            <p style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 700, color: `${NEON}70`,
              letterSpacing: '0.14em', flex: 1 }}>② {tr('TONGUE TWISTERS', 'СКОРОГОВОРКИ')}</p>
            <button onClick={reshuffle} title={tr('New set', 'Новый набор')} style={{ fontFamily: 'var(--font)', fontSize: 10,
              fontWeight: 700, color: `${NEON}90`, letterSpacing: '0.08em', cursor: 'pointer' }}>🔀 {tr('SHUFFLE', 'ПЕРЕМЕШАТЬ')}</button>
          </div>

          {cur && (
            <div style={{ borderRadius: 10, padding: '14px', background: 'rgba(0,14,9,0.55)',
              border: `1px solid ${NEON}22` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 800, letterSpacing: '0.1em',
                  color: `${NEON}80`, padding: '2px 6px', borderRadius: 4, border: `1px solid ${NEON}30` }}>
                  {cur.focus}</span>
                <span style={{ fontFamily: 'var(--font)', fontSize: 10.5, color: `${NEON}70` }}>
                  {'●'.repeat(cur.level)}{'○'.repeat(3 - cur.level)}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: 'rgba(148,163,184,0.4)' }}>
                  {idx + 1}/{twisters.length}</span>
              </div>

              <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-lg)', fontWeight: 700, lineHeight: 1.5,
                color: 'rgba(230,255,248,0.95)', textShadow: `0 0 16px ${NEON}30`, marginBottom: 6 }}>{cur.text}</p>

              <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, color: `${NEON}65`, letterSpacing: '0.04em',
                marginBottom: cork ? 10 : 12 }}>{tr('Say it 3× — slow → medium → fast, every sound crisp.', 'Скажите 3× — медленно → средне → быстро, каждый звук чётко.')}</p>

              {cork && (
                <div style={{ display: 'flex', gap: 8, padding: '8px 10px', borderRadius: 7, marginBottom: 12,
                  background: 'rgba(192,57,43,0.1)', border: `1px solid ${WINE}55` }}>
                  <span style={{ fontSize: 15.5 }}>🍷</span>
                  <p style={{ fontFamily: 'var(--font)', fontSize: 10, color: 'rgba(255,225,220,0.85)',
                    lineHeight: 1.5 }}>{CORK_DRILL}</p>
                </div>
              )}

              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={prev} style={navBtn}>‹</button>
                <button onClick={() => speak(cur.text, lang)} style={{ ...pill, flex: 1 }}>🔊 {tr('HEAR IT', 'ПРОСЛУШАТЬ')}</button>
                <button onClick={() => setCork(c => !c)} style={{ ...pill, flex: 1.4,
                  color: cork ? '#ff8a7a' : `${NEON}b0`, borderColor: cork ? `${WINE}70` : `${NEON}30`,
                  background: cork ? 'rgba(192,57,43,0.12)' : NEON_DIM }}>🍷 {tr('CORK', 'ПРОБКА')} {cork ? tr('ON', 'ВКЛ') : tr('MODE', 'РЕЖИМ')}</button>
                <button onClick={next} style={navBtn}>›</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 14px', flexShrink: 0, borderTop: `1px solid ${NEON}14` }}>
        <button onClick={onStartLearn ?? onClose} style={{
          width: '100%', padding: '12px', borderRadius: 8, cursor: 'pointer',
          fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 800, letterSpacing: '0.12em',
          color: NEON, border: `1px solid ${NEON}45`, background: NEON_DIM }}>
          {onStartLearn ? tr('✓ WARMED UP — START LEARNING →', '✓ РАЗМЯЛИСЬ — НАЧАТЬ УЧЁБУ →') : tr('✓ DONE', '✓ ГОТОВО')}</button>
      </div>
    </div>
  )
}

const pill: React.CSSProperties = {
  padding: '8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font)',
  fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.06em',
  color: `${NEON}b0`, border: `1px solid ${NEON}30`, background: NEON_DIM,
}
const navBtn: React.CSSProperties = {
  width: 34, borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 18, fontWeight: 700,
  color: `${NEON}90`, border: `1px solid ${NEON}22`, background: 'rgba(0,12,8,0.4)',
}
