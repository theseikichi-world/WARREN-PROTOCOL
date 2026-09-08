import { useEffect, useRef, useState } from 'react'
import { t as tr } from '../../i18n'

// ─── RITES — the two times the app is allowed to be theatrical ────────────────
// Everywhere else the rule holds: rewards inform, never congratulate. These earn
// the exception by being about the *stakes* rather than about you being
// wonderful, and each plays exactly once in the life of a save.
//
// There are two. ARRIVAL, below, before there is anything to be congratulated
// for. And ASCENSION at level ten, when there is nothing left to unlock and the
// scale hands over to what you are actually holding — see `Ascension.tsx`.
//
// The machinery is shared because they are one ceremony in two acts, and a
// second copy of a typewriter would drift from the first inside a month.

const CYAN = '#00f5ff'

export interface RiteLine {
  text:  string
  ru:    string
  size:  number
  color: string
  pause: number     // ms held after this line finishes typing
}

const arrival = (name: string): RiteLine[] => [
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

/** The arrival. Plays before the first dream exists — see `initiatedAt`. */
export function Initiation({ name, onDone }: { name: string; onDone: () => void }) {
  return (
    <Rite script={arrival(name || tr('OPERATOR', 'ОПЕРАТОР'))} accent={CYAN}
      cta={tr('BEGIN', 'НАЧАТЬ')} onDone={onDone} />
  )
}

/**
 * A script, typed out, skippable, with one button at the end.
 *
 * `accent` is what makes the two rites feel like the same object at different
 * points of a life: the arrival is cyan, the ascension gold, and nothing else
 * about them differs.
 */
export function Rite({ script, accent, cta, onDone }: {
  script: RiteLine[]
  accent: string
  cta:    string
  onDone: () => void
}) {
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
      background: `radial-gradient(ellipse at 50% 45%, ${accent}22, rgba(1,4,9,0.99) 70%)`,
      backdropFilter: 'blur(8px)',
    }}>
      {/* Scanline wash — cheap, and it sells the terminal */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5,
        background: `repeating-linear-gradient(0deg, ${accent}09 0px, ${accent}09 1px, transparent 1px, transparent 3px)` }} />

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
              textShadow: line.color === accent ? `0 0 14px ${accent}70` : 'none',
            }}>
              {complete ? shown[i] : typing}
              {active && <span className="pulse" style={{ color: accent }}>▌</span>}
            </p>
          )
        })}
      </div>

      {done ? (
        <button onClick={onDone} style={{
          marginTop: 18, padding: '10px 30px', borderRadius: 8, cursor: 'pointer',
          fontFamily: 'var(--font)', fontSize: 12.5, fontWeight: 900, letterSpacing: '0.22em',
          color: '#02121a', background: `linear-gradient(135deg, ${accent}, ${accent}b0)`,
          border: 'none', boxShadow: `0 0 22px ${accent}55`,
        }}>{cta}</button>
      ) : (
        <p style={{ marginTop: 18, fontFamily: 'var(--font)', fontSize: 11.5,
          letterSpacing: '0.16em', color: 'rgba(148,163,184,0.3)' }}>
          {tr('click to skip', 'клик — пропустить')}
        </p>
      )}
    </div>
  )
}
