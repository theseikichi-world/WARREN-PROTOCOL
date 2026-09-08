// ─── The main quest — one instrument at a time ────────────────────────────────
// A starting zone, in the Titan Quest sense: the game hands you one verb, waits
// until you've actually used it, then hands you the next. Nothing here asks you
// to configure a module — it asks you to *do* one small thing with it, and the
// module introduces itself in the doing.
//
// Objectives are read from data that already exists. A quest cannot be marked
// done by pressing a button; it completes because the record says so. But it is
// always ONE TAP from the doing: every quest names where it happens.
//
// STAGES. Quests are grouped by the level they belong to. Within a stage they
// are a checklist in any order; stages themselves are strictly sequential, and
// a stage must be cleared in full before the level curve is allowed past it.
// XP alone never advances you — see `xp.ts`.

import type { Task } from '../scrap7/types'
import { isBaseline } from '../scrap7/types'
import type { Goal } from './types'
import { nodeScore } from './chain'
import type { ModuleSummaries } from '../bigscreen/moduleStats'

export interface QuestContext {
  sums:  ModuleSummaries
  goals: Goal[]
  tasks: Task[]
}

export type Objective =
  | { kind: 'journal.entries';    need: number }
  | { kind: 'journal.streak';     need: number }
  | { kind: 'hydration.today';    need: number }  // % of the day's water target
  | { kind: 'baseline.installed'; need: number }  // LIFE SUPPORT habits running
  | { kind: 'uplink.created';     need: number }  // goals holding a bandwidth slot
  | { kind: 'routine.installed';  need: number }
  | { kind: 'routine.runs';       need: number }
  | { kind: 'routine.depth';      need: number }  // best automatism × 100
  | { kind: 'ardo.texts';         need: number }
  | { kind: 'vigilante.sessions'; need: number }  // sessions HELD, not started

/**
 * Where the quest actually happens. A brief that says "reach your water target"
 * and then leaves you to find the kitchen is a puzzle, not a starting zone.
 */
export type QuestTarget = 'journal' | 'solaris' | 'ardo' | 'log' | 'character' | 'scrap7' | 'uplink' | 'vigilante'

/**
 * A control the destination should highlight on arrival. Landing on SOLARIS
 * with "reach your water target" still leaves you looking at six panels, so a
 * screen that knows how points at the thing itself.
 */
export type Spotlight = 'life-support' | 'new-uplink' | 'install-routine'

export interface Quest {
  id:        string
  stage:     number          // the level this belongs to; cleared in full to leave it
  title:     string
  ru:        string
  brief:     string          // what the guild actually says to you
  briefRu:   string
  objective: Objective
  target:    QuestTarget     // one tap from the brief to the doing
  spotlight?: Spotlight      // ...and the destination points at the control
  xp:        number
  grants?:   string          // the instrument this quest puts in your hands
}

export interface QuestDestination {
  /** Route to navigate to; null means it isn't a route (an overlay, or right here). */
  path:  string | null
  label: string
  ru:    string
}

export const QUEST_DESTINATIONS: Record<QuestTarget, QuestDestination> = {
  journal:  { path: '/journal', label: 'OPEN THE JOURNAL',   ru: 'ОТКРЫТЬ ЖУРНАЛ' },
  solaris:  { path: '/solaris', label: 'OPEN THE KITCHEN',   ru: 'ОТКРЫТЬ КУХНЮ' },
  ardo:     { path: '/ardo',    label: 'OPEN A.R.D.O',       ru: 'ОТКРЫТЬ A.R.D.O' },
  // DREAMS is a hub card now, not a tab in UPLINKS. The card opens itself when
  // it sees the `new-uplink` spotlight arrive with you.
  log:      { path: '/',        label: 'OPEN YOUR DREAMS',   ru: 'ОТКРЫТЬ МЕЧТЫ' },
  // Both land on UPLINKS, but they want different tabs and different advice
  character:{ path: '/uplinks', label: 'OPEN YOUR CHARACTER',ru: 'ОТКРЫТЬ ПЕРСОНАЖА' },
  scrap7:   { path: '/scrap7',  label: 'OPEN ORBIT',          ru: 'ОТКРЫТЬ ORBIT' },
  uplink:   { path: '/uplinks', label: 'OPEN YOUR PROTOCOL', ru: 'ОТКРЫТЬ ПРОТОКОЛ' },
  vigilante:{ path: '/vigilante', label: 'OPEN VIGILANTE',   ru: 'ОТКРЫТЬ VIGILANTE' },
}

/**
 * The uplink quests read differently depending on what exists yet — "open your
 * protocol" is useless advice when you have none.
 */
export function questCta(quest: Quest, hasUplink: boolean): { en: string; ru: string } {
  const dest = QUEST_DESTINATIONS[quest.target]
  if (quest.target === 'uplink' && !hasUplink) {
    return { en: 'CREATE YOUR FIRST UPLINK', ru: 'СОЗДАТЬ ПЕРВЫЙ КАНАЛ' }
  }
  return { en: dest.label, ru: dest.ru }
}

/**
 * The line, in stages.
 *
 * NINE SMALL STEPS, NOT FIVE BIG ONES. The five-stage line paced the first month
 * by accident: stage 3 cleared on day 7 and stage 4 wanted a routine at 0.65,
 * which is twenty-two days of showing up. Thirteen days passed in which nothing
 * could possibly happen, and then four levels arrived at once when it lifted.
 *
 * What sets the pace is not the price of a level — it is HOW LONG AN OBJECTIVE
 * PHYSICALLY TAKES. So the objectives are chosen against a clock: a REFLEX
 * routine installed on day two reaches 0.30 on day ten, 0.55 on day nineteen and
 * 0.70 on day twenty-seven, and total runs accumulate at a knowable rate. The
 * stages land on days 1, 2, 4, 7, 10, 14, 19, 23 and 27 — gaps of 1, 2, 3, 3, 4,
 * 5, 4, 4, which is the shape a starting zone should have.
 *
 * Level ten is the end of it, and the end of being told what to do next.
 *
 * STAGE 1 is one thing and one thing only: the dream everything else serves.
 */
export const QUEST_LINE: Quest[] = [
  // ── Stage 1 · level 2 · day 1 ───────────────────────────────────────────────
  {
    id: 's1-first-uplink', stage: 1, title: 'CHOOSE ONE DREAM', ru: 'ВЫБЕРИТЕ ОДНУ МЕЧТУ',
    brief:   'Write a dream on the DREAMS tab, then promote it. Dreams are unlimited; bandwidth is two. That choice is the whole game.',
    briefRu: 'Запишите мечту во вкладке МЕЧТЫ и продвиньте её. Мечты бесконечны, каналов — два. Этот выбор и есть вся игра.',
    objective: { kind: 'uplink.created', need: 1 }, target: 'log', spotlight: 'new-uplink', xp: 120,
  },

  // ── Stage 2 · level 3 · day 2 ───────────────────────────────────────────────
  {
    id: 's1-life-support', stage: 2, title: 'KEEP YOURSELF RUNNING', ru: 'ОБЕСПЕЧЬТЕ СЕБЯ',
    brief:   'Add one life support habit on the character tab. The floor first — goals built on no sleep do not hold.',
    briefRu: 'Добавьте одну привычку жизнеобеспечения во вкладке персонажа. Сначала основа — цели на бессоннице не держатся.',
    objective: { kind: 'baseline.installed', need: 1 }, target: 'scrap7', spotlight: 'life-support', xp: 260,
  },

  // ── Stage 3 · level 4 · day 4 ───────────────────────────────────────────────
  {
    id: 'q3-first-routine', stage: 3, title: 'FIRST ROUTINE', ru: 'ПЕРВАЯ РУТИНА',
    brief:   'Open your protocol and install one routine. Pick the one you would do anyway.',
    briefRu: 'Откройте протокол и установите одну рутину. Выберите ту, что делали бы и так.',
    objective: { kind: 'routine.installed', need: 1 }, target: 'uplink', spotlight: 'install-routine', xp: 200,
  },
  {
    id: 'q2-water', stage: 3, title: 'WATER DISCIPLINE', ru: 'ДИСЦИПЛИНА ВОДЫ',
    brief:   'Reach your water target once. Ignore calories, ignore macros — the kitchen has one job today.',
    briefRu: 'Достигните нормы воды один раз. Забудьте о калориях и макросах — у кухни сегодня одна задача.',
    objective: { kind: 'hydration.today', need: 80 }, target: 'solaris', xp: 180, grants: 'solaris',
  },

  // ── Stage 4 · level 5 · day 7 ───────────────────────────────────────────────
  {
    id: 'q4-steady', stage: 4, title: 'STEADY HAND', ru: 'ТВЁРДАЯ РУКА',
    brief:   'Run your routines fourteen times. Not fourteen days — fourteen runs. Missing one is allowed.',
    briefRu: 'Выполните рутины четырнадцать раз. Не четырнадцать дней — четырнадцать выполнений. Пропуск допустим.',
    objective: { kind: 'routine.runs', need: 14 }, target: 'uplink', xp: 460,
  },

  // ── Stage 5 · level 6 · day 10 ──────────────────────────────────────────────
  // The journal arrives once there is something to write about: a week of
  // routines behind you rather than an empty first evening.
  {
    id: 's1-first-light', stage: 5, title: 'FIRST LIGHT', ru: 'ПЕРВЫЙ СВЕТ',
    brief:   'Open the log and write one entry. Any length. The owl reads everything and judges none of it.',
    briefRu: 'Откройте журнал и напишите одну запись. Любой длины. Сова читает всё и не судит.',
    objective: { kind: 'journal.entries', need: 1 }, target: 'journal', xp: 200, grants: 'journal',
  },
  {
    id: 'q9-first-depth', stage: 5, title: 'IT STARTS TO STICK', ru: 'НАЧИНАЕТ ПРИЛИПАТЬ',
    brief:   'Take one routine to 0.30 automatism. About ten days of showing up — the point where you stop having to remember it.',
    briefRu: 'Доведите одну рутину до автоматизма 0.30. Примерно десять дней — момент, когда о ней перестаёшь вспоминать.',
    objective: { kind: 'routine.depth', need: 30 }, target: 'uplink', xp: 360,
  },

  // ── Stage 6 · level 7 · day 14 ──────────────────────────────────────────────
  {
    id: 'q10-volume', stage: 6, title: 'FORTY-FIVE', ru: 'СОРОК ПЯТЬ',
    brief:   'Forty-five routine runs behind you. This is the stretch where it stops being new and has to be done anyway.',
    briefRu: 'Сорок пять выполнений рутин позади. Это отрезок, где новизна кончилась, а делать всё равно надо.',
    objective: { kind: 'routine.runs', need: 45 }, target: 'uplink', xp: 280,
  },
  {
    id: 'q5-record', stage: 6, title: 'THE RECORD', ru: 'ЛЕТОПИСЬ',
    brief:   'Keep the log three days running. This is the instrument that tells you what the numbers cannot.',
    briefRu: 'Ведите журнал три дня подряд. Этот инструмент скажет то, чего не скажут цифры.',
    objective: { kind: 'journal.streak', need: 3 }, target: 'journal', xp: 320,
  },

  // ── Stage 7 · level 8 · day 19 ──────────────────────────────────────────────
  {
    id: 'q7-hold', stage: 7, title: 'HOLD THE LINE', ru: 'ДЕРЖАТЬ ЛИНИЮ',
    brief:   'Take one routine past halfway — 0.55. Roughly three weeks, and the last stretch where it still costs you something.',
    briefRu: 'Проведите рутину за половину — 0.55. Около трёх недель, и это последний отрезок, где она ещё чего-то стоит.',
    objective: { kind: 'routine.depth', need: 55 }, target: 'uplink', xp: 400,
  },
  {
    id: 'q6-memory', stage: 7, title: 'COMMIT TO MEMORY', ru: 'ЗАПОМНИТЬ',
    brief:   'Load one text into A.R.D.O. A monologue, a poem, a paragraph you want to own.',
    briefRu: 'Загрузите один текст в A.R.D.O. Монолог, стих, абзац — то, чем хотите владеть.',
    objective: { kind: 'ardo.texts', need: 1 }, target: 'ardo', xp: 240, grants: 'ardo',
  },

  // ── Stage 8 · level 9 · day 23 ──────────────────────────────────────────────
  // VIGILANTE opened at level 5, so the door has been unlocked for four levels
  // by the time anything points at it (rule 29).
  {
    id: 'q11-mileage', stage: 8, title: 'NINETY', ru: 'ДЕВЯНОСТО',
    brief:   'Ninety runs. Nothing clever about this one — it is the number that separates a habit from an intention.',
    briefRu: 'Девяносто выполнений. Ничего хитрого — это число отделяет привычку от намерения.',
    objective: { kind: 'routine.runs', need: 90 }, target: 'uplink', xp: 420,
  },
  {
    id: 'q8-statics', stage: 8, title: 'TIME UNDER TENSION', ru: 'ВРЕМЯ ПОД НАГРУЗКОЙ',
    brief:   'Hold one full VIGILANTE session — every position, every round. One stage of the ladder is three of them.',
    briefRu: 'Выдержите одну полную сессию VIGILANTE — каждую позицию, каждый круг. Один этап лестницы — это три сессии.',
    objective: { kind: 'vigilante.sessions', need: 1 }, target: 'vigilante', xp: 440,
  },

  // ── Stage 9 · level 10 · day 27 · the end of the starting zone ──────────────
  {
    id: 'q12-automatic', stage: 9, title: 'AUTOMATIC', ru: 'НА АВТОМАТЕ',
    brief:   'Take one routine to 0.70. It stops costing you a decision, it hands back its training slot, and the app stops telling you what to do next.',
    briefRu: 'Доведите рутину до 0.70. Она перестаёт стоить решения, освобождает слот тренировки — и приложение перестаёт говорить, что делать дальше.',
    objective: { kind: 'routine.depth', need: 70 }, target: 'uplink', xp: 1020,
  },
]

/** The last level the quest line gates. Beyond it, XP alone carries you. */
export const LAST_GATED_STAGE = QUEST_LINE.reduce((m, q) => Math.max(m, q.stage), 0)

export const stageQuests = (stage: number): Quest[] => QUEST_LINE.filter(q => q.stage === stage)

/** Everything a stage pays out. The level curve is built from this — see xp.ts. */
export const stageXp = (stage: number): number =>
  stageQuests(stage).reduce((sum, q) => sum + q.xp, 0)

/** Current reading against an objective. */
export function measure(objective: Objective, ctx: QuestContext): number {
  const { sums, goals, tasks } = ctx
  const live = goals.filter(g => g.slot !== 'archived')
  const installed = live.flatMap(g => g.nodes.filter(n => n.scrapTaskId))

  switch (objective.kind) {
    case 'journal.entries':    return sums.journal?.entries ?? 0
    case 'journal.streak':     return sums.journal?.streak ?? 0
    case 'hydration.today':    return sums.solaris?.waterPct ?? 0
    case 'baseline.installed': return tasks.filter(t => t.taskType === 'habit' && isBaseline(t)).length
    case 'uplink.created':     return live.length
    case 'routine.installed':  return installed.length
    case 'routine.runs':
      return tasks
        .filter(t => t.origin === 'chain')
        .reduce((sum, t) => sum + (t.trackingHistory?.length ?? 0), 0)
    case 'routine.depth':
      return Math.round(Math.max(0, ...installed.map(n => nodeScore(n, tasks))) * 100)
    case 'ardo.texts':         return sums.ardo?.texts ?? 0
    // Finished, never started: a session you walked out of is not a session.
    case 'vigilante.sessions': return sums.vigilante?.finished ?? 0
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

// ─── Stages ───────────────────────────────────────────────────────────────────

const ledger = (completed: Record<string, string> | undefined): Record<string, string> => completed ?? {}

/** Every quest in the stage is cleared. An empty stage counts as cleared. */
/**
 * The XP the completed stages have already paid for — a floor under the bank.
 *
 * Quest rewards are banked once, at the moment the quest clears. Retune a
 * quest's XP afterwards and every existing save is short by the difference,
 * which is how a finished stage 1 ended up 20 short of the level it is supposed
 * to pay for exactly (rule 21). Routine and baseline XP land in the same total,
 * so this can only ever be a floor: it is never a reason to take XP away.
 */
export function questFloorXp(completed: Record<string, string> | undefined): number {
  const done = ledger(completed)
  return QUEST_LINE.filter(q => !!done[q.id]).reduce((sum, q) => sum + q.xp, 0)
}

export function stageComplete(stage: number, completed: Record<string, string> | undefined): boolean {
  const done = ledger(completed)
  return stageQuests(stage).every(q => !!done[q.id])
}

/** The stage you're working in: the first one not finished. Null when all are. */
export function activeStage(completed: Record<string, string> | undefined): number | null {
  for (let s = 1; s <= LAST_GATED_STAGE; s++) if (!stageComplete(s, completed)) return s
  return null
}

/**
 * The first unfinished quest of the active stage — for anywhere that only has
 * room to show one thing.
 */
export function activeQuest(completed: Record<string, string> | undefined): Quest | null {
  const stage = activeStage(completed)
  if (stage === null) return null
  const done = ledger(completed)
  return stageQuests(stage).find(q => !done[q.id]) ?? null
}

/**
 * What the current stage still wants, and how far through it you are.
 *
 * `level` caps which stage may be shown, and that cap is load-bearing rather
 * than cosmetic. Stage N's quests are meant to be worked at level N, and every
 * module they point at opens at level N or earlier (rule 29) — so showing
 * stage N to someone still at level N-1 hands them an objective behind a locked
 * door. That is exactly what happened when the quest ledger ran ahead of the XP
 * bank: setup was complete, so the active stage was 2, but the bank was short of
 * level 2, and WATER DISCIPLINE pointed at a kitchen that had not opened.
 *
 * The two can only diverge when banked XP no longer matches what the stages pay
 * — a retune of quest rewards does that to an existing save. `questFloorXp`
 * repairs the bank; this makes the panel safe even before it does.
 */
export function stageState(
  completed: Record<string, string> | undefined,
  ctx: QuestContext,
  level = Infinity,
): {
  stage:     number | null
  quests:    QuestProgress[]
  cleared:   number
  total:     number
  remaining: Quest[]
} {
  const active = activeStage(completed)
  const stage  = active === null ? null : Math.min(active, Math.max(1, level))
  const done   = ledger(completed)
  if (stage === null) return { stage: null, quests: [], cleared: 0, total: 0, remaining: [] }

  const quests = stageQuests(stage).map(q => questProgress(q, ctx))
  return {
    stage,
    quests,
    cleared:   quests.filter(q => !!done[q.quest.id]).length,
    total:     quests.length,
    remaining: quests.filter(q => !done[q.quest.id]).map(q => q.quest),
  }
}

/**
 * Clear any quest the record satisfies.
 *
 * Within a stage the quests are a checklist — all four of the setup steps are
 * live at once and clear in whatever order you do them. Between stages the
 * order is strict: nothing in stage 3 clears while stage 2 is outstanding, so a
 * later objective met early never skips the story.
 */
export function evaluateQuests(
  completed: Record<string, string> | undefined,
  ctx: QuestContext,
  now = new Date(),
): { completed: Record<string, string>; cleared: Quest[] } {
  const next: Record<string, string> = { ...ledger(completed) }
  const cleared: Quest[] = []

  for (let stage = 1; stage <= LAST_GATED_STAGE; stage++) {
    for (const quest of stageQuests(stage)) {
      if (next[quest.id]) continue
      if (!questProgress(quest, ctx).done) continue
      next[quest.id] = now.toISOString()
      cleared.push(quest)
    }
    // A stage still outstanding stops everything behind it
    if (!stageComplete(stage, next)) break
  }

  return { completed: next, cleared }
}
