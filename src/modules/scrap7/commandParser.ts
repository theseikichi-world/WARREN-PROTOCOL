/**
 * ORBIT Command Parser — Tier 1 (instant, no AI needed).
 * Handles: greetings, complete/track, delete, list, count, next,
 *          and NATURAL LANGUAGE task creation — directly, no modal.
 * Supports EN + RU.
 */

import type { Task, TaskType, TimeOfDay } from './types'
import { fuzzyMatchTask, todayScheduledDailies, taskSummaryStats } from './store'

export interface ParseResult {
  text:    string
  actions: Action[]
  tier:    1
}

export interface Action {
  type:        'complete_task' | 'track_habit' | 'delete_task' | 'open_task_modal' | 'create_direct'
  task_id?:    string
  suggestion?: string
  // For create_direct:
  taskType?:   TaskType
  timeOfDay?:  TimeOfDay | null
  recurrence?: 'everyday' | 'weekly' | 'once'
  recurDays?:  string[]
  category?:   string
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

// ─── Greeting / thanks ────────────────────────────────────────────────────────
const GREET_EN = /^(hi|hey|hello|yo|sup|what'?s up|howdy|good\s*(morning|afternoon|evening|night)|greetings)\s*[!.?]*$/i
const GREET_RU = /^(привет|здравствуй|хей|хай|доброе утро|добрый день|добрый вечер|здарова|йо|салам)\s*[!.?]*$/i
const THANKS_EN = /^(thanks|thank you|thx|ty|cheers|appreciated)\s*[!.?]*$/i
const THANKS_RU = /^(спасибо|спс|благодарю|мерси)\s*[!.?]*$/i

const GREET_REPLY_EN = ["Online. What's the mission?", "Running. Give me a task.", "Systems up. Ready."]
const GREET_REPLY_RU = ["ORBIT на связи. Задача?", "В сети. Что делаем?", "Работаю. Жду команды."]
const THANKS_REPLY_EN = ["Acknowledged.", "That's what I'm here for.", "Proceed."]
const THANKS_REPLY_RU = ["Принято.", "Это моя работа.", "Продолжай."]

// ─── Complete / track ─────────────────────────────────────────────────────────
const COMPLETE_EN = [
  /^(?:i\s+)?(?:did|done|finished|completed|just did)\s+(?:my\s+)?(.+?)[\s!.?]*$/i,
  /^(?:mark|check|complete)\s+(?:off\s+)?["']?(.+?)["']?\s*(?:as\s+(?:done|completed?))?\s*[!.?]*$/i,
  /^["']?(.+?)["']?\s+(?:is\s+)?(?:done|finished|completed)\s*[!.?]*$/i,
]
const COMPLETE_RU = [
  /^(?:я\s+)?(?:сделал[аи]?|закончил[аи]?|выполнил[аи]?|готово)\s+(.+?)[\s!.?]*$/i,
  /^(?:отметь|выполни)\s+["']?(.+?)["']?\s*$/i,
]

// ─── Delete ───────────────────────────────────────────────────────────────────
const DELETE_EN = /^(?:delete|remove|drop)\s+(?:task|habit|daily)?\s*["']?(.+?)["']?\s*[!.?]*$/i
const DELETE_RU = /^(?:удали|убери)\s+(?:задачу?\s+|привычку?\s+)?["']?(.+?)["']?\s*$/i

// ─── List ─────────────────────────────────────────────────────────────────────
const LIST_EN = /^(?:show|list|what are|what'?s)\s+(?:my\s+)?(?:tasks?|to\s*do|dailies|habits?|plan)\s*(?:for\s+today)?\s*[!.?]*$/i
const LIST_RU = /^(?:покажи|какие|что)\s+(?:мои\s+)?(?:задачи|дела|план|привычки)\s*(?:на\s+сегодня)?\s*[!.?]*$/i
const NEXT_EN  = /^what(?:'?s)?\s+(?:next|should\s+i\s+do)\s*[?!.]*$/i
const NEXT_RU  = /^что\s+(?:дальше|делать)\s*(?:сейчас)?\s*[?!.]*$/i
const COUNT_EN = /^how\s+many\s+(?:tasks?|things?|to\s*dos?|dailies|habits?)\s+(?:do\s+)?i\s+have\s*(?:today|left)?\s*[?!.]*$/i
const COUNT_RU = /^сколько\s+(?:у\s+меня\s+)?(?:задач|дел|привычек)\s*(?:на\s+сегодня|осталось)?\s*[?!.]*$/i

// ─── Natural language task creation ──────────────────────────────────────────
// These patterns detect intent to ADD something and extract the task title directly.

interface NLCreate {
  title:      string
  taskType:   TaskType
  timeOfDay:  TimeOfDay | null
  recurrence: 'everyday' | 'weekly' | 'once'
  recurDays:  string[]
  category:   string
}

function detectTimeOfDay(text: string): TimeOfDay | null {
  if (/\b(morning|утром|утро|am|wake up|wake-up)\b/i.test(text))  return 'morning'
  if (/\b(evening|night|вечером|вечер|ночью|pm|after work|before bed)\b/i.test(text)) return 'evening'
  if (/\b(afternoon|day|noon|днём|днем)\b/i.test(text))            return 'day'
  if (/\b(daily|каждый день|everyday|every day)\b/i.test(text))    return 'daily'
  return null
}

function detectCategory(text: string): string {
  if (/\b(workout|exercise|gym|sport|run|swim|yoga|fitness|body|stretch|физ|спорт|трен)\b/i.test(text))  return 'Health'
  if (/\b(water|drink|eat|food|meal|diet|nutrition|вода|пить|есть|еда)\b/i.test(text))                   return 'Health'
  if (/\b(work|task|email|meeting|report|code|project|работа|задача|письмо)\b/i.test(text))              return 'Work'
  if (/\b(study|learn|read|book|course|lesson|учёба|учиться|читать|книга)\b/i.test(text))               return 'Study'
  if (/\b(meditat|breath|mind|focus|sleep|rest|медит|дыхание|сон)\b/i.test(text))                       return 'Mindset'
  return 'Health'
}

// Weekday name → short key
const WEEKDAY_MAP: Record<string, string> = {
  monday: 'mon', tuesday: 'tue', wednesday: 'wed',
  thursday: 'thu', friday: 'fri', saturday: 'sat', sunday: 'sun',
  mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat', sun: 'sun',
  // RU
  понедельник: 'mon', вторник: 'tue', среда: 'wed',
  четверг: 'thu', пятница: 'fri', суббота: 'sat', воскресенье: 'sun',
}

function extractWeekdays(text: string): string[] {
  const lower = text.toLowerCase()
  return Object.keys(WEEKDAY_MAP).filter(k => lower.includes(k)).map(k => WEEKDAY_MAP[k])
}

/**
 * Tries to parse free-form natural language as a task creation intent.
 * Returns NLCreate if confident, null if not.
 */
function parseNaturalCreate(text: string): NLCreate | null {
  const t = text.trim()

  // ── "Every Sunday / Monday / Wednesday..." ───────────────────────────────
  const everyDayMatch = t.match(
    /^(?:every|each|каждый|каждую|каждое)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье)(?:\s+and\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))?\s+(.+)/i
  )
  if (everyDayMatch) {
    let title = everyDayMatch[2].trim()
    title = title.charAt(0).toUpperCase() + title.slice(1)
    const days = extractWeekdays(t)
    return {
      title,
      taskType: 'daily',
      timeOfDay: detectTimeOfDay(t),
      recurrence: 'weekly',
      recurDays: days,
      category: detectCategory(title + ' ' + t),
    }
  }

  // ── Explicit "add/create/remind" prefix patterns ──────────────────────────
  const addPatterns: [RegExp, TaskType][] = [
    [/^(?:add|create|new|добавь|создай|напомни)\s+(?:a\s+)?(?:every\s+)?(?:morning|evening|daily|day|утром|вечером|каждый день)\s+(.+)/i, 'habit'],
    [/^(?:add|create|добавь|создай)\s+(?:a\s+)?habit\s+(.+)/i,           'habit'],
    [/^(?:add|create|добавь|создай)\s+(?:a\s+)?daily\s+(.+)/i,           'daily'],
    [/^(?:add|create|добавь|создай)\s+(?:a\s+)?(?:todo|task|to-do|задачу?)\s+(.+)/i, 'todo'],
    // "add X to/as habit/daily/todo" (tolerates common typos: habbits, habbit)
    [/^(?:add|create|добавь|создай)\s+(.+?)\s+(?:to|as|in|как)\s+(?:a\s+|my\s+)?(?:habb?its?|привычк\w*)/i,  'habit'],
    [/^(?:add|create|добавь|создай)\s+(.+?)\s+(?:to|as|in|как)\s+(?:a\s+|my\s+)?(?:daily|ежедневн\w*)/i, 'daily'],
    [/^(?:add|create|добавь|создай)\s+(.+?)\s+(?:to|as|in|как)\s+(?:a\s+|my\s+)?(?:todo|task|to-do|задач\w*)/i, 'todo'],
    [/^(?:remind\s+me\s+to|напомни\s+мне?)\s+(.+)/i,                     'daily'],
    // bare "add X" fallback — opens modal so user picks type
    [/^(?:add|create|добавь|создай)\s+(?:a\s+|new\s+)?(.+)/i,            'todo'],
  ]

  for (const [pattern, defaultType] of addPatterns) {
    const m = t.match(pattern)
    if (m?.[1]) {
      let title = m[1]
        .replace(/\b(every\s+)?(morning|evening|day|daily|night|afternoon|утром|вечером|каждый день)\b/gi, '')
        .replace(/\b(every|each|a|to|my)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()

      if (title.length < 2) continue
      title = title.charAt(0).toUpperCase() + title.slice(1)

      const timeOfDay = detectTimeOfDay(t)
      let taskType = defaultType
      if (/\b(every|each|daily|каждый)\b/i.test(t) && taskType === 'todo') taskType = 'habit'
      if (/\b(remind|reminder|напомни)\b/i.test(t)) taskType = 'daily'

      return {
        title, taskType, timeOfDay,
        recurrence: 'everyday', recurDays: [],
        category: detectCategory(title + ' ' + t),
      }
    }
  }

  return null
}

// ─── Main parser ──────────────────────────────────────────────────────────────
export function parseCommand(text: string, tasks: Task[]): ParseResult | null {
  const t     = text.trim()
  if (!t) return null

  const isRu  = /[а-яА-ЯЁё]/.test(t)
  const stats = taskSummaryStats(tasks)

  // 1. Greetings
  if ((isRu ? GREET_RU : GREET_EN).test(t)) {
    let reply = pick(isRu ? GREET_REPLY_RU : GREET_REPLY_EN)
    if (stats.dailiesPending > 0)
      reply += isRu ? ` ${stats.dailiesPending} ежедневных ждут.` : ` ${stats.dailiesPending} dailies pending.`
    else if (stats.todosPending > 0)
      reply += isRu ? ` ${stats.todosPending} дел в очереди.` : ` ${stats.todosPending} to-do's queued.`
    else reply += isRu ? ' Очередь пуста.' : ' Queue clear.'
    return { text: reply, actions: [], tier: 1 }
  }

  // 2. Thanks
  if ((isRu ? THANKS_RU : THANKS_EN).test(t))
    return { text: pick(isRu ? THANKS_REPLY_RU : THANKS_REPLY_EN), actions: [], tier: 1 }

  // 3. Complete/track
  for (const pat of (isRu ? COMPLETE_RU : COMPLETE_EN)) {
    const m = t.match(pat)
    if (m?.[1]) {
      const incomplete = tasks.filter(tk => !tk.completed && (tk.taskType === 'daily' || tk.taskType === 'todo'))
      const match = fuzzyMatchTask(incomplete, m[1])
      if (match) {
        const next = todayScheduledDailies(tasks.filter(tk => tk.id !== match.id)).find(tk => !tk.completed)
        let reply = isRu ? `"${match.text}" — выполнено.` : `"${match.text}" — done.`
        if ((match.streak ?? 0) > 0)
          reply += isRu ? ` Серия: ${(match.streak ?? 0) + 1} 🔥` : ` Streak: ${(match.streak ?? 0) + 1} 🔥`
        if (next) reply += isRu ? ` Следующее: "${next.text}".` : ` Next: "${next.text}".`
        return { text: reply, actions: [{ type: 'complete_task', task_id: match.id }], tier: 1 }
      }
      // Habits
      const hm = fuzzyMatchTask(tasks.filter(tk => tk.taskType === 'habit'), m[1])
      if (hm) {
        return { text: isRu ? `+1 к "${hm.text}" 🔥` : `+1 to "${hm.text}" 🔥`, actions: [{ type: 'track_habit', task_id: hm.id }], tier: 1 }
      }
      return null
    }
  }

  // 4. Delete
  for (const pat of [DELETE_EN, DELETE_RU]) {
    const m = t.match(pat)
    if (m?.[1]) {
      const match = fuzzyMatchTask(tasks, m[1])
      if (match)
        return { text: isRu ? `Удалено: "${match.text}".` : `Deleted: "${match.text}".`, actions: [{ type: 'delete_task', task_id: match.id }], tier: 1 }
      return null
    }
  }

  // 5. List
  if ((isRu ? LIST_RU : LIST_EN).test(t)) {
    const dailies = todayScheduledDailies(tasks).filter(tk => !tk.completed)
    const habits  = tasks.filter(tk => tk.taskType === 'habit')
    const todos   = tasks.filter(tk => tk.taskType === 'todo' && !tk.completed)
    const lines: string[] = []
    if (habits.length) { lines.push(isRu ? 'ПРИВЫЧКИ:' : 'HABITS:'); habits.forEach(h => lines.push(`  ${h.direction === 'negative' ? '➖' : '➕'} ${h.text} 🔥${h.streak ?? 0}`)) }
    if (dailies.length) { lines.push(isRu ? 'ЕЖЕДНЕВНЫЕ:' : 'DAILIES:'); dailies.forEach(d => lines.push(`  ○ ${d.text}`)) }
    if (todos.length) { lines.push(isRu ? 'ДЕЛА:' : "TO-DO'S:"); todos.forEach(td => lines.push(`  • ${td.text}`)) }
    if (!lines.length) return { text: isRu ? 'Всё выполнено.' : 'Queue empty. Good work.', actions: [], tier: 1 }
    return { text: lines.join('\n'), actions: [], tier: 1 }
  }

  // 6. Count
  if ((isRu ? COUNT_RU : COUNT_EN).test(t)) {
    return {
      text: isRu
        ? `Привычки: ${stats.habits}. Ежедневные: ${stats.dailiesPending} осталось. Дела: ${stats.todosPending}.`
        : `Habits: ${stats.habits}. Dailies: ${stats.dailiesPending} left. To-do's: ${stats.todosPending}.`,
      actions: [], tier: 1,
    }
  }

  // 7. Next
  if ((isRu ? NEXT_RU : NEXT_EN).test(t)) {
    const next = todayScheduledDailies(tasks).find(tk => !tk.completed) ?? tasks.find(tk => tk.taskType === 'todo' && !tk.completed)
    return { text: next ? (isRu ? `Следующее: "${next.text}".` : `Next: "${next.text}".`) : (isRu ? 'Очередь пуста.' : 'Queue empty.'), actions: [], tier: 1 }
  }

  // 8. Natural language task creation
  const nlc = parseNaturalCreate(t)
  if (nlc) {
    const typeLabel = isRu
      ? (nlc.taskType === 'habit' ? 'привычка' : nlc.taskType === 'daily' ? 'ежедневное' : 'задача')
      : nlc.taskType

    // Bare "add X" (no type keyword) → open modal so user picks type
    const isBareAdd = /^(?:add|create|добавь|создай)\s+(?:a\s+|new\s+)?/i.test(t) &&
      !/\b(habb?its?|daily|todo|task|every|morning|evening|день|утром|вечером|remind|привычк|ежедневн|задач)\b/i.test(t)

    if (isBareAdd) {
      return {
        text: isRu ? `Открываю форму для "${nlc.title}".` : `Opening form for "${nlc.title}".`,
        actions: [{ type: 'open_task_modal', suggestion: nlc.title }],
        tier: 1,
      }
    }

    const timeLabel = nlc.timeOfDay ? ` (${nlc.timeOfDay})` : ''
    const reply = isRu
      ? `Добавляю ${typeLabel}: "${nlc.title}"${timeLabel}.`
      : `Adding ${typeLabel}: "${nlc.title}"${timeLabel}.`

    return {
      text: reply,
      actions: [{
        type:       'create_direct',
        suggestion: nlc.title,
        taskType:   nlc.taskType,
        timeOfDay:  nlc.timeOfDay,
        recurrence: nlc.recurrence as 'everyday' | 'once',
        category:   nlc.category,
      }],
      tier: 1,
    }
  }

  // No match — fall through to AI
  return null
}
