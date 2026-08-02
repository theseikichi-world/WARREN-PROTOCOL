// ─── LIFE SUPPORT — the basics of being a person ──────────────────────────────
// A goal chain is what you're chasing. This is the floor underneath it: the
// handful of things that, missing, make every other number worse.
//
// Deliberately unlike a PROTOCOL in every structural way. No tree, no
// prerequisites, no gating, no chapters, no threshold ladder — you don't earn
// the right to brush your teeth. You pick from a list, it appears, and it pays
// a fraction of what goal work pays.
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

export const LIFE_SUPPORT: LifeSupportTemplate[] = [
  {
    id: 'sleep', title: 'Lights out before midnight', ru: 'Отбой до полуночи',
    cue: 'when the clock hits 23:30', cueRu: 'когда часы показывают 23:30',
    icon: '🌙', target: 1, unit: 'night', unitRu: 'ночь',
  },
  {
    id: 'daylight', title: 'Get outside', ru: 'Выйти на улицу',
    cue: 'before the light goes', cueRu: 'пока не стемнело',
    icon: '☀', target: 20, unit: 'minutes', unitRu: 'минут',
  },
  {
    id: 'move', title: 'Move the body', ru: 'Размять тело',
    cue: 'after getting up', cueRu: 'после подъёма',
    icon: '⚡', target: 15, unit: 'minutes', unitRu: 'минут',
  },
  {
    id: 'stretch', title: 'Stretch', ru: 'Растяжка',
    cue: 'last thing before bed', cueRu: 'последнее перед сном',
    icon: '◇', target: 5, unit: 'minutes', unitRu: 'минут',
  },
  {
    id: 'teeth', title: 'Teeth, twice', ru: 'Зубы, дважды',
    cue: 'morning and night', cueRu: 'утром и вечером',
    icon: '✦', target: 2, unit: 'times', unitRu: 'раза',
  },
  {
    id: 'tidy', title: 'Reset one surface', ru: 'Убрать одну поверхность',
    cue: 'before sitting down for the evening', cueRu: 'перед тем как сесть вечером',
    icon: '▣', target: 10, unit: 'minutes', unitRu: 'минут',
  },
  {
    id: 'nophone', title: 'No phone for the first hour', ru: 'Без телефона первый час',
    cue: 'from the moment you wake', cueRu: 'с момента пробуждения',
    icon: '⊘', target: 1, unit: 'morning', unitRu: 'утро',
  },
  {
    id: 'meds', title: 'Vitamins / medication', ru: 'Витамины / лекарства',
    cue: 'with breakfast', cueRu: 'с завтраком',
    icon: '⊕', target: 1, unit: 'dose', unitRu: 'доза',
  },
]

export const findTemplate = (id: string): LifeSupportTemplate | null =>
  LIFE_SUPPORT.find(t => t.id === id) ?? null

/** The template behind a live habit, when it came from one. */
export function templateForTask(taskId: string): LifeSupportTemplate | null {
  return taskId.startsWith('life:') ? findTemplate(taskId.slice(5)) : null
}

/** Templates not yet installed, given the habit ids that already exist. */
export function availableTemplates(existingIds: Iterable<string>): LifeSupportTemplate[] {
  const have = new Set(existingIds)
  return LIFE_SUPPORT.filter(t => !have.has(baselineTaskId(t.id)))
}
