// ─── The main quest — one instrument at a time ────────────────────────────────
// A starting zone, in the Titan Quest sense: the game hands you one verb, waits
// until you've actually used it, then hands you the next. Nothing here asks you
// to configure a module — it asks you to *do* one small thing with it, and the
// module introduces itself in the doing.
//
// Objectives are read from data that already exists. A quest cannot be marked
// done by pressing a button; it completes because the record says so.

import type { Task } from '../scrap7/types'
import type { Goal } from './types'
import { nodeScore } from './chain'
import type { ModuleSummaries } from '../bigscreen/moduleStats'

export interface QuestContext {
  sums:  ModuleSummaries
  goals: Goal[]
  tasks: Task[]
}

export type Objective =
  | { kind: 'journal.entries';  need: number }
  | { kind: 'journal.streak';   need: number }
  | { kind: 'hydration.today';  need: number }   // % of the day's water target
  | { kind: 'routine.installed'; need: number }
  | { kind: 'routine.runs';     need: number }
  | { kind: 'routine.depth';    need: number }   // best integration × 100
  | { kind: 'ardo.texts';       need: number }

export interface Quest {
  id:        string
  title:     string
  ru:        string
  brief:     string          // what the guild actually says to you
  briefRu:   string
  objective: Objective
  xp:        number
  grants?:   string          // the instrument this quest puts in your hands
}

/**
 * The line. Order matters: each quest is offered only once the previous is
 * cleared, so the app never presents six modules at once.
 */
export const QUEST_LINE: Quest[] = [
  {
    id: 'q1-first-light', title: 'FIRST LIGHT', ru: 'ПЕРВЫЙ СВЕТ',
    brief:   'Open the log and write one entry. Any length. The owl reads everything and judges none of it.',
    briefRu: 'Откройте журнал и напишите одну запись. Любой длины. Сова читает всё и не судит.',
    objective: { kind: 'journal.entries', need: 1 }, xp: 40, grants: 'journal',
  },
  {
    id: 'q2-water', title: 'WATER DISCIPLINE', ru: 'ДИСЦИПЛИНА ВОДЫ',
    brief:   'Reach your water target once. Ignore calories, ignore macros — the kitchen has one job today.',
    briefRu: 'Достигните нормы воды один раз. Забудьте о калориях и макросах — у кухни сегодня одна задача.',
    objective: { kind: 'hydration.today', need: 80 }, xp: 50, grants: 'solaris',
  },
  {
    id: 'q3-first-routine', title: 'FIRST ROUTINE', ru: 'ПЕРВАЯ РУТИНА',
    brief:   'Open your uplink and install one routine. Pick the one you would do anyway.',
    briefRu: 'Откройте канал и установите одну рутину. Выберите ту, что делали бы и так.',
    objective: { kind: 'routine.installed', need: 1 }, xp: 60,
  },
  {
    id: 'q4-steady', title: 'STEADY HAND', ru: 'ТВЁРДАЯ РУКА',
    brief:   'Run your routines seven times. Not seven days — seven runs. Missing one is allowed.',
    briefRu: 'Выполните рутины семь раз. Не семь дней — семь выполнений. Пропуск допустим.',
    objective: { kind: 'routine.runs', need: 7 }, xp: 100,
  },
  {
    id: 'q5-record', title: 'THE RECORD', ru: 'ЛЕТОПИСЬ',
    brief:   'Keep the log seven days running. This is the instrument that tells you what the numbers cannot.',
    briefRu: 'Ведите журнал семь дней подряд. Этот инструмент скажет то, чего не скажут цифры.',
    objective: { kind: 'journal.streak', need: 7 }, xp: 120,
  },
  {
    id: 'q6-memory', title: 'COMMIT TO MEMORY', ru: 'ЗАПОМНИТЬ',
    brief:   'Load one text into A.R.D.O. A monologue, a poem, a paragraph you want to own.',
    briefRu: 'Загрузите один текст в A.R.D.O. Монолог, стих, абзац — то, чем хотите владеть.',
    objective: { kind: 'ardo.texts', need: 1 }, xp: 80, grants: 'ardo',
  },
  {
    id: 'q7-hold', title: 'HOLD THE LINE', ru: 'ДЕРЖАТЬ ЛИНИЮ',
    brief:   'Take one routine to strong. Roughly a month of showing up — the point where it stops costing you.',
    briefRu: 'Доведите одну рутину до «прочно». Примерно месяц регулярности — точка, где она перестаёт стоить усилий.',
    objective: { kind: 'routine.depth', need: 65 }, xp: 200,
  },
]

/** Current reading against an objective. */
export function measure(objective: Objective, ctx: QuestContext): number {
  const { sums, goals, tasks } = ctx
  const live = goals.filter(g => g.slot !== 'archived')
  const installed = live.flatMap(g => g.nodes.filter(n => n.scrapTaskId))

  switch (objective.kind) {
    case 'journal.entries':   return sums.journal?.entries ?? 0
    case 'journal.streak':    return sums.journal?.streak ?? 0
    case 'hydration.today':   return sums.solaris?.waterPct ?? 0
    case 'routine.installed': return installed.length
    case 'routine.runs':
      return tasks
        .filter(t => t.origin === 'chain')
        .reduce((sum, t) => sum + (t.trackingHistory?.length ?? 0), 0)
    case 'routine.depth':
      return Math.round(Math.max(0, ...installed.map(n => nodeScore(n, tasks))) * 100)
    case 'ardo.texts':        return sums.ardo?.texts ?? 0
  }
}

export interface QuestProgress {
  quest: Quest
  have:  number
  need:  number
  ratio: number
  done:  boolean
}

export function questProgress(quest: Quest, ctx: QuestContext): QuestProgress {
  const need = quest.objective.need
  const have = measure(quest.objective, ctx)
  return { quest, have, need, ratio: need > 0 ? Math.min(1, have / need) : 1, done: have >= need }
}

/**
 * The quest you're on: the first one not yet cleared. Returns null when the
 * whole line is done — the starting zone is finite by design.
 */
export function activeQuest(completed: Record<string, string> | undefined): Quest | null {
  const done = completed ?? {}
  return QUEST_LINE.find(q => !done[q.id]) ?? null
}

/**
 * Clear any quest whose objective the record satisfies. Only ever advances the
 * front of the line, so a later objective met early doesn't skip the story.
 */
export function evaluateQuests(
  completed: Record<string, string> | undefined,
  ctx: QuestContext,
  now = new Date(),
): { completed: Record<string, string>; cleared: Quest[] } {
  // A state persisted before quests existed has no ledger — treat it as empty
  // rather than letting an undefined map take the screen down.
  const next: Record<string, string> = { ...(completed ?? {}) }
  const cleared: Quest[] = []

  for (const quest of QUEST_LINE) {
    if (next[quest.id]) continue
    if (!questProgress(quest, ctx).done) break     // stop at the first unmet — order holds
    next[quest.id] = now.toISOString()
    cleared.push(quest)
  }

  return { completed: next, cleared }
}
