import { useEffect, useRef, useState } from 'react'
import { t as tr } from '../../i18n'

// ─── ARRIVAL — the one time the app is allowed to be theatrical ───────────────
// Everywhere else the rule holds: rewards inform, never congratulate. This is
// the exception, and it earns the exception by being about the *stakes* rather
// than about you being wonderful. It plays once, before there is anything to be
// congratulated for, and it never plays again.
//
// The last line is the whole thesis of the app, so it lands alone.

const CYAN = '#00f5ff'

interface Line {
  text:  string
  ru:    string
  size:  number
  color: string
  pause: number     // ms held after this line finishes typing
}

const lines = (name: string): Line[] => [
  { text: 'ESTABLISHING UPLINK…', ru: 'УСТАНОВКА КАНАЛА…',
    size: 9,  color: `${CYAN}70`, pause: 260 },
  { text: 'PROTOCOL #1', ru: 'ПРОТОКОЛ №1',
    size: 12, color: `${CYAN}b0`, pause: 200 },
  { text: name, ru: name,
    size: 26, color: CYAN, pause: 460 },
  { text: 'Everything here is measured off what you actually do.', ru: 'Всё здесь измеряется тем, что вы действительно делаете.',
    size: 9.5, color: 'rgba(200,222,240,0.75)', pause: 340 },
  { text: 'Nothing installs itself. Nothing is awarded for showing up.', ru: 'Ничто не устанавливается само. Ничто не даётся за явку.',
    size: 9.5, color: 'rgba(200,222,240,0.75)', pause: 520 },
  { text: 'You are about to start building YOU.', ru: 'Вы начинаете строить СЕБЯ.',
    size: 15, color: CYAN, pause: 0 },
]

const CHAR_MS = 26

export function Initiation({ name, onDone }: { name: string; onDone: () => void }) {
  const script = lines(name || tr('OPERATOR', 'ОПЕРАТОР'))
  const [shown, setShown]   = useState<string[]>([])   // fully-typed lines
  const [typing, setTyping] = useState('')             // the line in progress
  const [done, setDone]     = useState(false)
  const timers = useRef<number[]>([])

  useEffect(() => {
    let cancelled = false
    const wait = (ms: number) => new Promise<void>(res => {
      timers.current.push(window.setTimeout(res, ms))
    })

    void (async () => {
      for (const line of script) {
        const full = tr(line.text, line.ru)
        for (let i = 1; i <= full.length; i++) {
          if (cancelled) return
          setTyping(full.slice(0, i))
          await wait(CHAR_MS)
        }
        if (cancelled) return
        setShown(prev => [...prev, full])
        setTyping('')
        await wait(line.pause)
      }
      if (!cancelled) setDone(true)
    })()

    return () => {
      cancelled = true
      timers.current.forEach(clearTimeout)
      timers.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Impatience is allowed: one click drops the rest of the script. */
  const skip = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setShown(script.map(l => tr(l.text, l.ru)))
    setTyping('')
    setDone(true)
  }

  return (
    <div onClick={done ? undefined : skip} style={{
      position: 'fixed', inset: 0, zIndex: 90,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 10, padding: '32px 26px', cursor: done ? 'default' : 'pointer',
      paddingTop: 'calc(32px + var(--sa-top))', paddingBottom: 'calc(32px + var(--sa-bottom))',
      background: 'radial-gradient(ellipse at 50% 45%, rgba(0,60,80,0.28), rgba(1,4,9,0.99) 70%)',
      backdropFilter: 'blur(8px)',
    }}>
      {/* Scanline wash — cheap, and it sells the terminal */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5,
        background: 'repeating-linear-gradient(0deg, rgba(0,245,255,0.035) 0px, rgba(0,245,255,0.035) 1px, transparent 1px, transparent 3px)' }} />

      <div style={{ width: '100%', maxWidth: 420, textAlign: 'center', position: 'relative' }}>
        {script.map((line, i) => {
          const complete = i < shown.length
          const active   = i === shown.length
          if (!complete && !active) return null
          return (
            <p key={i} style={{
              fontFamily: 'var(--font)', fontSize: line.size, fontWeight: line.size > 12 ? 900 : 700,
              color: line.color, letterSpacing: line.size > 12 ? '0.12em' : '0.06em',
              lineHeight: 1.65, margin: i === 0 ? 0 : '9px 0 0',
              textShadow: line.color === CYAN ? `0 0 14px ${CYAN}70` : 'none',
            }}>
              {complete ? shown[i] : typing}
              {active && <span className="pulse" style={{ color: CYAN }}>▌</span>}
            </p>
          )
        })}
      </div>

      {done ? (
        <button onClick={onDone} style={{
          marginTop: 18, padding: '10px 30px', borderRadius: 8, cursor: 'pointer',
          fontFamily: 'var(--font)', fontSize: 12.5, fontWeight: 900, letterSpacing: '0.22em',
          color: '#02121a', background: `linear-gradient(135deg, ${CYAN}, ${CYAN}b0)`,
          border: 'none', boxShadow: `0 0 22px ${CYAN}55`,
        }}>{tr('BEGIN', 'НАЧАТЬ')}</button>
      ) : (
        <p style={{ marginTop: 18, fontFamily: 'var(--font)', fontSize: 11.5,
          letterSpacing: '0.16em', color: 'rgba(148,163,184,0.3)' }}>
          {tr('click to skip', 'клик — пропустить')}
        </p>
      )}
    </div>
  )
}
