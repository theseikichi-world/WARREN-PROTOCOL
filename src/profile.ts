// ─── The operator's profile — who the numbers belong to ───────────────────────
// Collected once, on first run, and used for one thing above all: anchoring
// routines to a real day. "After morning coffee" is a fine cue for someone who
// wakes at 06:30 and useless for someone who wakes at 11 — a chain built on the
// wrong clock fails for a reason that has nothing to do with willpower.

export type Gender     = 'male' | 'female' | 'other' | ''
export type Chronotype = 'lark' | 'neutral' | 'owl' | 'unknown'

/** "07:30" → 450 minutes past midnight. Null when it isn't a time. */
export function parseHm(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim())
  if (!m) return null
  const h = Number(m[1]), min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

export const formatHm = (mins: number): string => {
  const m = ((mins % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Hours between lights-out and waking, wrapping midnight. */
export function sleepDuration(sleepTime: string, wakeTime: string): number | null {
  const sleep = parseHm(sleepTime), wake = parseHm(wakeTime)
  if (sleep === null || wake === null) return null
  return ((wake - sleep + 1440) % 1440) || 1440
}

/**
 * Mid-sleep: the midpoint of the night, and the standard way chronotype is
 * actually measured — far more honest than asking "are you a morning person?",
 * which measures what people wish were true.
 */
export function midsleep(sleepTime: string, wakeTime: string): number | null {
  const sleep = parseHm(sleepTime)
  const dur   = sleepDuration(sleepTime, wakeTime)
  if (sleep === null || dur === null) return null
  return (sleep + dur / 2) % 1440
}

const LARK_BEFORE = 3 * 60 + 30    // mid-sleep earlier than 03:30
const OWL_AFTER   = 5 * 60         // mid-sleep later than 05:00

export function chronotype(sleepTime: string, wakeTime: string): Chronotype {
  const ms = midsleep(sleepTime, wakeTime)
  if (ms === null) return 'unknown'
  if (ms < LARK_BEFORE) return 'lark'
  if (ms > OWL_AFTER)   return 'owl'
  return 'neutral'
}

export const CHRONOTYPE_LABEL: Record<Chronotype, { en: string; ru: string; note: string; noteRu: string }> = {
  lark:    { en: 'EARLY BIRD', ru: 'ЖАВОРОНОК',
             note: 'Your best hours are the first ones. Heavy work goes early.',
             noteRu: 'Лучшие часы — первые. Тяжёлое ставьте на утро.' },
  neutral: { en: 'MIDDLING',   ru: 'ПРОМЕЖУТОЧНЫЙ',
             note: 'No strong lean either way — anchor to events, not to the clock.',
             noteRu: 'Нет явного уклона — привязывайтесь к событиям, а не к часам.' },
  owl:     { en: 'NIGHT OWL',  ru: 'СОВА',
             note: 'Your best hours are late. A 6am routine is a plan to fail.',
             noteRu: 'Лучшие часы — поздние. Рутина в 6 утра — это план провалиться.' },
  unknown: { en: 'UNREAD',     ru: 'НЕ ИЗМЕРЕН',
             note: 'Set your hours and the chain can be anchored to a real day.',
             noteRu: 'Укажите часы — и цепь можно привязать к реальному дню.' },
}

export interface DayShape {
  wake:       string
  sleep:      string
  hours:      number | null
  chronotype: Chronotype
}

export function dayShape(sleepTime: string, wakeTime: string): DayShape {
  const dur = sleepDuration(sleepTime, wakeTime)
  return {
    wake:       wakeTime,
    sleep:      sleepTime,
    hours:      dur === null ? null : Math.round((dur / 60) * 10) / 10,
    chronotype: chronotype(sleepTime, wakeTime),
  }
}

/**
 * What the guide is told about the body it's writing a chain for. Kept short —
 * it's a constraint on cue placement, not a biography.
 */
export function profileBrief(shape: DayShape): string {
  if (shape.chronotype === 'unknown') return ''
  const label = CHRONOTYPE_LABEL[shape.chronotype].en
  return [
    `OPERATOR'S DAY: wakes ${shape.wake}, sleeps ${shape.sleep}` +
      (shape.hours === null ? '' : ` (${shape.hours}h)`) + ` — ${label}.`,
    'Anchor every cue inside those waking hours. Never place a cue before they wake or after they sleep,',
    shape.chronotype === 'owl'
      ? 'and do not build this chain on early mornings — they are at their worst then.'
      : shape.chronotype === 'lark'
        ? 'and put the hardest routines in the first hours, when they are sharpest.'
        : 'and prefer anchoring to existing events over pinning to a clock time.',
  ].join(' ')
}
