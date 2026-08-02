// ─── LIFE SUPPORT — the basics of being a person ──────────────────────────────
// A goal chain is what you're chasing. This is the floor underneath it: the
// handful of things that, missing, make every other number worse.
//
// Deliberately unlike a PROTOCOL in every structural way. No tree, no
// prerequisites, no gating by score, no chapters, no threshold ladder — you
// don't earn the right to brush your teeth.
//
// It IS capped, though, and that cap is the design. One slot at level 1: a
// person who adds eight basics on day one is not building a floor, they're
// building a list they'll abandon by Thursday. Slots open as the character
// levels, which is the only place life support touches progression at all.
//
// Nothing here duplicates an instrument: water and food belong to SOLARIS, and
// writing belongs to the JOURNAL, so none of them are templates.

export interface LifeSupportTemplate {
  id:     string
  title:  string
  ru:     string
  cue:    string
  cueRu:  string
  icon:   string
  target: number
  unit:   string
  unitRu: string
}

/** The habit id carrying a life-support template — the idempotency key. */
export const baselineTaskId = (templateId: string): string => `life:${templateId}`

/** A habit you wrote yourself. Same prefix so it lives by the same rules. */
export const customTaskId = (slug: string): string => `life:own-${slug}`

export const LIFE_SUPPORT: LifeSupportTemplate[] = [
  { id: 'sleep', title: 'Lights out before midnight', ru: 'Отбой до полуночи',
    cue: 'when the clock hits 23:30', cueRu: 'когда часы показывают 23:30',
    icon: '🌙', target: 1, unit: 'night', unitRu: 'ночь' },
  { id: 'daylight', title: 'Get outside', ru: 'Выйти на улицу',
    cue: 'before the light goes', cueRu: 'пока не стемнело',
    icon: '☀', target: 20, unit: 'minutes', unitRu: 'минут' },
  { id: 'move', title: 'Move the body', ru: 'Размять тело',
    cue: 'after getting up', cueRu: 'после подъёма',
    icon: '⚡', target: 15, unit: 'minutes', unitRu: 'минут' },
  { id: 'stretch', title: 'Stretch', ru: 'Растяжка',
    cue: 'last thing before bed', cueRu: 'последнее перед сном',
    icon: '◇', target: 5, unit: 'minutes', unitRu: 'минут' },
  { id: 'teeth', title: 'Teeth, twice', ru: 'Зубы, дважды',
    cue: 'morning and night', cueRu: 'утром и вечером',
    icon: '✦', target: 2, unit: 'times', unitRu: 'раза' },
  { id: 'tidy', title: 'Reset one surface', ru: 'Убрать одну поверхность',
    cue: 'before sitting down for the evening', cueRu: 'перед тем как сесть вечером',
    icon: '▣', target: 10, unit: 'minutes', unitRu: 'минут' },
  { id: 'nophone', title: 'No phone for the first hour', ru: 'Без телефона первый час',
    cue: 'from the moment you wake', cueRu: 'с момента пробуждения',
    icon: '⊘', target: 1, unit: 'morning', unitRu: 'утро' },
  { id: 'meds', title: 'Vitamins / medication', ru: 'Витамины / лекарства',
    cue: 'with breakfast', cueRu: 'с завтраком',
    icon: '⊕', target: 1, unit: 'dose', unitRu: 'доза' },
  { id: 'walk', title: 'Walk', ru: 'Прогулка',
    cue: 'after lunch', cueRu: 'после обеда',
    icon: '➤', target: 30, unit: 'minutes', unitRu: 'минут' },
  { id: 'steps', title: 'Take the stairs', ru: 'Подниматься по лестнице',
    cue: 'every time there is a lift', cueRu: 'каждый раз вместо лифта',
    icon: '⇈', target: 1, unit: 'day', unitRu: 'день' },
  { id: 'posture', title: 'Stand up and reset', ru: 'Встать и размяться',
    cue: 'every hour at the desk', cueRu: 'каждый час за столом',
    icon: '⌶', target: 4, unit: 'times', unitRu: 'раза' },
  { id: 'eyes', title: 'Look at something far away', ru: 'Посмотреть вдаль',
    cue: 'every screen break', cueRu: 'в каждый перерыв от экрана',
    icon: '◉', target: 3, unit: 'times', unitRu: 'раза' },
  { id: 'breathe', title: 'Slow breathing', ru: 'Медленное дыхание',
    cue: 'when you notice you are wound up', cueRu: 'когда замечаете напряжение',
    icon: '≋', target: 3, unit: 'minutes', unitRu: 'минуты' },
  { id: 'quiet', title: 'Ten minutes of nothing', ru: 'Десять минут тишины',
    cue: 'before the evening starts', cueRu: 'перед началом вечера',
    icon: '○', target: 10, unit: 'minutes', unitRu: 'минут' },
  { id: 'noscroll', title: 'No scrolling in bed', ru: 'Без ленты в постели',
    cue: 'once you are under the covers', cueRu: 'как только легли',
    icon: '⊗', target: 1, unit: 'night', unitRu: 'ночь' },
  { id: 'plan', title: 'Set tomorrow up', ru: 'Подготовить завтра',
    cue: 'last thing at the desk', cueRu: 'последнее за столом',
    icon: '▷', target: 1, unit: 'time', unitRu: 'раз' },
  { id: 'dishes', title: 'Empty the sink', ru: 'Опустошить раковину',
    cue: 'after dinner', cueRu: 'после ужина',
    icon: '▽', target: 1, unit: 'time', unitRu: 'раз' },
  { id: 'laundry', title: 'Clothes away, not on the chair', ru: 'Одежда на место, не на стул',
    cue: 'when you change', cueRu: 'когда переодеваетесь',
    icon: '⊞', target: 1, unit: 'time', unitRu: 'раз' },
  { id: 'reach-out', title: 'Message one person', ru: 'Написать одному человеку',
    cue: 'when you first sit down', cueRu: 'когда впервые садитесь',
    icon: '✉', target: 1, unit: 'person', unitRu: 'человек' },
  { id: 'shower', title: 'Cold finish to the shower', ru: 'Холодный финал душа',
    cue: 'the last thirty seconds', cueRu: 'последние тридцать секунд',
    icon: '❄', target: 30, unit: 'seconds', unitRu: 'секунд' },
]

// ─── Slots ────────────────────────────────────────────────────────────────────
// One at level 1, then a slot at each of the in-between levels. The basics are
// meant to accumulate at the speed a person actually absorbs them.

export const SLOT_GATES: { level: number; slots: number }[] = [
  { level: 1,  slots: 1 },
  { level: 2,  slots: 2 },
  { level: 4,  slots: 3 },
  { level: 6,  slots: 4 },
  { level: 8,  slots: 6 },
  { level: 12, slots: 8 },
]

export function lifeSupportSlots(level: number): number {
  let slots = 0
  for (const gate of SLOT_GATES) {
    if (level < gate.level) break
    slots = gate.slots
  }
  return slots
}

/** The next level that widens the floor, and by how much. Null at the ceiling. */
export function nextSlotGate(level: number): { level: number; slots: number } | null {
  return SLOT_GATES.find(g => g.level > level) ?? null
}

// ─── Lookups ──────────────────────────────────────────────────────────────────

export const findTemplate = (id: string): LifeSupportTemplate | null =>
  LIFE_SUPPORT.find(t => t.id === id) ?? null

/** The template behind a live habit, when it came from one. */
export function templateForTask(taskId: string): LifeSupportTemplate | null {
  return taskId.startsWith('life:') ? findTemplate(taskId.slice(5)) : null
}

/** Templates with no habit yet — what the picker is allowed to offer. */
export function availableTemplates(existingIds: Iterable<string>): LifeSupportTemplate[] {
  const have = new Set(existingIds)
  return LIFE_SUPPORT.filter(t => !have.has(baselineTaskId(t.id)))
}

/**
 * A window onto the available templates, so the picker shows a handful rather
 * than a wall of twenty. `offset` walks the list — that's the REFRESH button —
 * and it wraps, so refreshing forever always finds something.
 */
export function offerTemplates(
  existingIds: Iterable<string>, offset: number, count = 4,
): LifeSupportTemplate[] {
  const pool = availableTemplates(existingIds)
  if (pool.length === 0) return []
  const start = ((offset % pool.length) + pool.length) % pool.length
  return Array.from({ length: Math.min(count, pool.length) }, (_, i) => pool[(start + i) % pool.length])
}
