import { t as tr } from '../../i18n'
import { Rite, type RiteLine } from './Initiation'

// ─── ASCENSION — the second and last time the app is theatrical ───────────────
// Level ten is the end of the starting zone: nine stages of the app naming what
// to do next, and then nothing left to unlock. Swapping the number on the hub
// for a standing without a moment between them would make it a settings change.
//
// The register is deliberately not triumphant. "You have walked a great path of
// becoming" is the right IDEA and the wrong voice — Warren says ALL SYSTEMS
// NOMINAL and nothing installs itself. What makes this land is what it admits,
// not how loudly it says it: the app is out of things to tell you.
//
// Gold rather than cyan, because it is the colour everything permanent already
// wears here — a cleared breach, a finished uplink, a routine at its top rung.

const GOLD = '#ffd700'

const script: RiteLine[] = [
  { text: 'THRESHOLD 10', ru: 'ПОРОГ 10',
    size: 9,  color: `${GOLD}70`, pause: 300 },
  { text: 'THE STARTING ZONE IS CLOSED', ru: 'СТАРТОВАЯ ЗОНА ЗАКРЫТА',
    size: 17, color: GOLD, pause: 520 },
  { text: 'Nine stages of being told what to do next.', ru: 'Девять этапов, где вам говорили, что делать дальше.',
    size: 9.5, color: 'rgba(200,222,240,0.75)', pause: 300 },
  { text: 'There is nothing left to unlock.', ru: 'Открывать больше нечего.',
    size: 9.5, color: 'rgba(200,222,240,0.75)', pause: 560 },
  { text: 'From here the number is not how far you came.', ru: 'Отсюда число — не то, сколько вы прошли.',
    size: 9.5, color: 'rgba(200,222,240,0.75)', pause: 340 },
  { text: 'It is what you are holding.', ru: 'Это то, что вы держите.',
    size: 15, color: GOLD, pause: 0 },
]

/** Plays once, at level ten, and never again — see `ascendedAt`. */
export function Ascension({ onDone }: { onDone: () => void }) {
  return <Rite script={script} accent={GOLD} cta={tr('ON YOUR OWN', 'ДАЛЬШЕ САМ')} onDone={onDone} />
}
